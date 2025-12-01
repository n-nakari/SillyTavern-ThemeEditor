import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;

// 颜色匹配正则 (增强版：支持 hex, rgb, rgba, hsl, hsla, transparent, 英文名)
// 使用 \b 边界防止匹配到变量名中的单词
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/**
 * 解析CSS字符串
 * 1. 过滤变量定义 (--variable: ...)
 * 2. 智能提取最后一条注释
 */
function parseCssColors(cssString) {
    const blocks = [];
    
    // 正则：提取 (注释)? 选择器 { 内容 }
    const ruleRegex = /(?:((?:\/\*[\s\S]*?\*\/[\s\r\n]*)+))?([^{}]+)\{([^}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const rawComments = match[1];
        const selector = match[2].trim();
        const content = match[3];
        
        // 提取最后一条注释
        let finalComment = "";
        if (rawComments) {
            const commentParts = rawComments.split('*/');
            const cleanParts = commentParts
                .map(c => c.trim())
                .filter(c => c.length > 0 && c.includes('/*')); 
            
            if (cleanParts.length > 0) {
                let lastRaw = cleanParts[cleanParts.length - 1];
                finalComment = lastRaw.replace(/^\/\*[\s\r\n]*/, '').trim();
            }
        }
        
        // 解析属性
        const properties = [];
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2].trim();
            
            // 过滤 CSS 变量定义 (以 -- 开头)
            if (propName.startsWith('--')) continue;
            // 过滤包含 var() 的值
            if (propValue.includes('var(')) continue;

            // 查找颜色
            const colors = [];
            let colorMatch;
            colorRegex.lastIndex = 0;
            
            while ((colorMatch = colorRegex.exec(propValue)) !== null) {
                colors.push({
                    value: colorMatch[0],
                    index: colorMatch.index 
                });
            }
            
            if (colors.length > 0) {
                properties.push({
                    name: propName,
                    fullValue: propValue,
                    colors: colors
                });
            }
        }
        
        if (properties.length > 0) {
            blocks.push({
                selector,
                comment: finalComment,
                properties
            });
        }
    }
    
    return blocks;
}

// UI 构建
function createTunerUI() {
    // 1. 顶部工具栏
    const topBar = $(`
        <div class="css-tools-bar">
            <div class="css-tools-search-wrapper">
                <input type="text" id="css-top-search" placeholder="搜索 CSS 代码..." autocomplete="off">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
            <div class="tools-btn-group">
                <div class="tools-btn" id="css-top-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                <div class="tools-btn" id="css-top-up" title="回到代码顶部"><i class="fa-solid fa-arrow-up"></i></div>
            </div>
        </div>
    `);

    // 2. 调色板容器
    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-title"><i class="fa-solid fa-palette"></i> 调色板</div>
                <div class="tuner-controls">
                    <div class="tools-btn" id="tuner-refresh" title="刷新列表"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="tools-btn" id="tuner-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                    <div class="tools-btn" id="tuner-up" title="回到扩展顶部"><i class="fa-solid fa-arrow-up"></i></div>
                    <div class="tools-btn" id="tuner-collapse" title="折叠"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
            </div>
            <div class="tuner-sub-header">
                <input type="text" id="tuner-search" placeholder="搜索类名、属性或注释..." autocomplete="off">
            </div>
            <div class="tuner-content" id="tuner-content-area"></div>
        </div>
    `);

    const textAreaBlock = $('#CustomCSS-textAreaBlock');
    topBar.insertBefore(textAreaBlock);
    container.insertAfter(textAreaBlock);
    
    contentArea = $('#tuner-content-area');
    cssTextArea = $('#customCSS');

    bindEvents();
}

// 辅助：转义正则
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 核心：保存设置（持久化修复）
function saveSettings() {
    // 1. 触发 Textarea 的 Input 事件，通知 SillyTavern 变量已变
    cssTextArea.trigger('input');
    
    // 2. 尝试点击原生 "更新主题" 按钮 (如果有)
    // 这是关键：只有这样才会写入 .json 文件，而不是只存在于内存或临时配置
    const systemUpdateBtn = $('#ui-preset-update-button');
    if (systemUpdateBtn.length && systemUpdateBtn.is(':visible')) {
        systemUpdateBtn.click();
        toastr.success("主题文件已更新", "CSS Color Tuner");
    } else {
        // 如果没有选中主题，或者是默认主题（不能更新），则保存全局配置
        saveSettingsDebounced();
        toastr.success("全局配置已保存", "CSS Color Tuner");
    }
}

// 绑定事件
function bindEvents() {
    const searchInput = $('#css-top-search');
    const resultsContainer = $('#css-search-results');

    // 搜索逻辑
    searchInput.on('input', function() {
        const query = $(this).val();
        resultsContainer.empty().removeClass('active');
        
        if (!query) return;

        const text = cssTextArea.val();
        const lines = text.split('\n');
        const results = [];
        
        // 限制结果数量，防止卡顿
        let count = 0;
        for (let i = 0; i < lines.length; i++) {
            if (count > 100) break;
            const line = lines[i];
            // 不区分大小写匹配
            if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({ lineIndex: i, content: line.trim() });
                count++;
            }
        }

        if (results.length > 0) {
            results.forEach(res => {
                // 高亮处理
                const escapedQuery = escapeRegExp(query);
                const highlightRegex = new RegExp(`(${escapedQuery})`, 'gi');
                const highlightedContent = escapeHtml(res.content).replace(highlightRegex, '<span class="search-highlight">$1</span>');

                const item = $(`<div class="css-search-item"><i class="fa-solid fa-code fa-xs" style="opacity:0.5"></i> ${highlightedContent}</div>`);
                item.on('click', () => {
                    jumpToLine(res.lineIndex);
                    resultsContainer.removeClass('active');
                });
                resultsContainer.append(item);
            });
            setTimeout(() => resultsContainer.addClass('active'), 10);
        }
    });

    // 点击外部关闭搜索
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            resultsContainer.removeClass('active');
        }
    });

    // 保存与回顶
    $('#css-top-save, #tuner-save').on('click', saveSettings);

    $('#css-top-up').on('click', function() {
        cssTextArea[0].scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 调色板功能
    $('#tuner-refresh').on('click', function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        // 确保从 DOM 读取最新值
        refreshTuner();
        setTimeout(() => icon.removeClass('fa-spin'), 600);
    });

    $('#tuner-up').on('click', function() {
        contentArea[0].scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#tuner-collapse').on('click', function() {
        contentArea.toggleClass('collapsed');
        const icon = $(this).find('i');
        if (contentArea.hasClass('collapsed')) {
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // 面板内搜索
    $('#tuner-search').on('input', function() {
        const query = $(this).val().toLowerCase();
        contentArea.find('.tuner-card').each(function() {
            const block = $(this);
            // 搜索 标题(注释) 和 副标题(选择器)
            const text = block.find('.tuner-card-header').text().toLowerCase();
            // 也搜索属性名
            const props = block.find('.tuner-prop-name').text().toLowerCase();
            
            if (text.includes(query) || props.includes(query)) {
                block.show();
            } else {
                block.hide();
            }
        });
    });
}

function jumpToLine(lineIndex) {
    const el = cssTextArea[0];
    const text = el.value;
    const lines = text.split('\n');
    
    let charIndex = 0;
    for (let i = 0; i < lineIndex; i++) {
        charIndex += lines[i].length + 1; 
    }

    el.focus();
    el.setSelectionRange(charIndex, charIndex);
    
    // 估算行高滚动
    const totalLines = lines.length;
    const scrollHeight = el.scrollHeight;
    const avgLineHeight = totalLines > 0 ? scrollHeight / totalLines : 20;
    
    el.scrollTo({
        top: lineIndex * avgLineHeight,
        behavior: 'smooth'
    });
}

// 刷新逻辑
function refreshTuner() {
    // 显式获取 Textarea 的值，防止缓存
    const cssText = cssTextArea.val();
    const blocks = parseCssColors(cssText);
    renderTunerBlocks(blocks);
}

// 渲染 DOM
function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色<br><small>仅读取标准属性中的颜色值</small></div>');
        return;
    }

    blocks.forEach(block => {
        // 标题逻辑：有注释显注释，无注释显类名
        let titleHtml = '';
        if (block.comment) {
            titleHtml = `
                <div class="tuner-card-comment">${escapeHtml(block.comment)}</div>
                <div class="tuner-card-selector">/${escapeHtml(block.selector)}</div>
            `;
        } else {
            titleHtml = `<div class="tuner-card-comment">${escapeHtml(block.selector)}</div>`;
        }

        const blockEl = $(`<div class="tuner-card">
            <div class="tuner-card-header">${titleHtml}</div>
        </div>`);

        block.properties.forEach(prop => {
            const row = $(`<div class="tuner-prop-row">
                <div class="tuner-prop-name">${escapeHtml(prop.name)}</div>
                <div class="tuner-inputs-container"></div>
            </div>`);

            const inputsContainer = row.find('.tuner-inputs-container');

            prop.colors.forEach((colorObj, index) => {
                const colorVal = colorObj.value;
                const group = $(`<div class="tuner-input-group"></div>`);
                
                // 序号
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // 辅助颜色选择器 (Hex only)
                let hexForPicker = "#000000";
                // 简单的Hex检测
                if (colorVal.startsWith('#') && (colorVal.length === 7 || colorVal.length === 4)) {
                    hexForPicker = colorVal;
                }

                const picker = $(`<input type="color" class="tuner-picker" value="${hexForPicker}" title="点击取色">`);
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="输入颜色值 (支持 rgba/hex/name)">`);

                // 联动
                picker.on('input', function() {
                    textInput.val(this.value).trigger('input');
                });

                textInput.on('input', function() {
                    const newValue = $(this).val();
                    try {
                        picker.css('background-color', newValue);
                        if (newValue.startsWith('#') && newValue.length === 7) {
                            picker.val(newValue);
                        }
                    } catch(e) {}
                    updateCssContent(block.selector, prop.name, index, newValue);
                });

                // 初始化 Picker 背景
                try { picker.css('background-color', colorVal); } catch(e) {}

                group.append(picker);
                group.append(textInput);
                inputsContainer.append(group);
            });

            blockEl.append(row);
        });

        contentArea.append(blockEl);
    });
}

function updateCssContent(selector, propName, colorIndex, newColorValue) {
    const originalCss = cssTextArea.val();
    const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 正则：找到那个块
    const blockRegex = new RegExp(`(?:(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)+)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    let match = blockRegex.exec(originalCss);
    
    if (match) {
        const fullBlockMatch = match[0];
        const blockContent = match[2];
        
        // 找到属性 (加边界符防止匹配到 background-image 当找 background 时)
        // 但CSS属性很多带有-，直接用 propName + \s*: 比较稳妥
        const propRegex = new RegExp(`(${propName})\\s*:\\s*([^;]+);`, 'g');
        
        const newBlockContent = blockContent.replace(propRegex, (fullPropMatch, pName, pValue) => {
            let currentColorIndex = 0;
            // 必须使用完全相同的 colorRegex 来确保索引一致
            const newPropValue = pValue.replace(colorRegex, (matchedColor) => {
                if (currentColorIndex === colorIndex) {
                    currentColorIndex++;
                    return newColorValue;
                }
                currentColorIndex++;
                return matchedColor;
            });
            return `${pName}: ${newPropValue};`;
        });
        
        const newFullBlock = fullBlockMatch.replace(blockContent, newBlockContent);
        const newCss = originalCss.replace(fullBlockMatch, newFullBlock);
        
        cssTextArea.val(newCss);
        cssTextArea.trigger('input'); 
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

$(document).ready(function() {
    const checkExist = setInterval(function() {
        if ($('#CustomCSS-textAreaBlock').length) {
            console.log(extensionName + " Loaded");
            clearInterval(checkExist);
            createTunerUI();
            setTimeout(refreshTuner, 300);
        }
    }, 1000);
});
