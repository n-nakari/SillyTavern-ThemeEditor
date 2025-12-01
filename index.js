import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;

// 上一次解析的 CSS 内容哈希或长度，用于避免重复渲染
let lastCssContent = "";

// 颜色匹配正则 (增强版：支持 hex, rgb, rgba, hsl, hsla, transparent, 英文名)
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/**
 * 核心工具：将任意 CSS 颜色字符串转换为 #RRGGBB 格式
 * 解决了 "rgba/name 显示为黑色" 的问题
 */
function getColorHex(str) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = str;
    let computed = ctx.fillStyle; // 浏览器会尝试转换为 hex 或 rgba

    // 如果已经是 #RRGGBB
    if (computed.startsWith('#') && computed.length === 7) {
        return computed;
    }
    
    // 如果是 #RGB (3位)，转换为 6位
    if (computed.startsWith('#') && computed.length === 4) {
        return '#' + computed[1] + computed[1] + computed[2] + computed[2] + computed[3] + computed[3];
    }

    // 如果是 rgba(r, g, b, a) 或 rgb(r, g, b)
    if (computed.startsWith('rgb')) {
        const parts = computed.match(/[\d.]+/g);
        if (!parts || parts.length < 3) return '#000000'; // 转换失败回退

        const r = parseInt(parts[0]).toString(16).padStart(2, '0');
        const g = parseInt(parts[1]).toString(16).padStart(2, '0');
        const b = parseInt(parts[2]).toString(16).padStart(2, '0');
        
        return `#${r}${g}${b}`;
    }

    return '#000000'; // 实在无法识别
}

/**
 * 解析CSS字符串
 */
function parseCssColors(cssString) {
    const blocks = [];
    const ruleRegex = /(?:((?:\/\*[\s\S]*?\*\/[\s\r\n]*)+))?([^{}]+)\{([^}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const rawComments = match[1];
        const selector = match[2].trim();
        const content = match[3];
        
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
        
        const properties = [];
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2].trim();
            
            if (propName.startsWith('--')) continue;
            if (propValue.includes('var(')) continue;

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
    // 防止重复创建
    if ($('.css-tuner-container').length > 0) return;

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

    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-title"><i class="fa-solid fa-palette"></i> 调色板</div>
                <div class="tuner-controls">
                    <div class="tools-btn" id="tuner-refresh" title="刷新列表 (重新读取CSS)"><i class="fa-solid fa-sync-alt"></i></div>
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

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function saveSettings() {
    // 触发 input 事件以通知 ST 变量变动
    cssTextArea.trigger('input');
    
    // 尝试点击系统保存/更新按钮
    const systemUpdateBtn = $('#ui-preset-update-button');
    if (systemUpdateBtn.length && systemUpdateBtn.is(':visible')) {
        systemUpdateBtn.click();
        toastr.success("主题文件已更新", "CSS Color Tuner");
    } else {
        saveSettingsDebounced();
        toastr.success("全局配置已保存", "CSS Color Tuner");
    }
}

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
        let count = 0;

        for (let i = 0; i < lines.length; i++) {
            if (count > 100) break;
            const line = lines[i];
            if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({ lineIndex: i, content: line.trim() });
                count++;
            }
        }

        if (results.length > 0) {
            results.forEach(res => {
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

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            resultsContainer.removeClass('active');
        }
    });

    $('#css-top-save, #tuner-save').on('click', saveSettings);

    $('#css-top-up').on('click', function() {
        cssTextArea[0].scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 调色板刷新按钮
    $('#tuner-refresh').on('click', function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        // 强制刷新，忽略缓存检查
        refreshTuner(true);
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

    $('#tuner-search').on('input', function() {
        const query = $(this).val().toLowerCase();
        contentArea.find('.tuner-card').each(function() {
            const block = $(this);
            const text = block.find('.tuner-card-header').text().toLowerCase();
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
    const totalLines = lines.length;
    const scrollHeight = el.scrollHeight;
    const avgLineHeight = totalLines > 0 ? scrollHeight / totalLines : 20;
    el.scrollTo({ top: lineIndex * avgLineHeight, behavior: 'smooth' });
}

// 刷新逻辑 (读取文本域 -> 解析 -> 渲染)
function refreshTuner(force = false) {
    if (!cssTextArea || !cssTextArea.length) {
        cssTextArea = $('#customCSS');
    }
    
    const cssText = cssTextArea.val();
    
    // 如果内容没变且不是强制刷新，则跳过
    if (!force && cssText === lastCssContent) return;
    
    lastCssContent = cssText;
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
                const colorVal = colorObj.value; // 可能是 "red", "rgba(...)"
                
                // 关键修正：计算初始的 HEX 值给选择器
                const hexForPicker = getColorHex(colorVal);

                const group = $(`<div class="tuner-input-group"></div>`);
                
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                const picker = $(`<input type="color" class="tuner-picker" value="${hexForPicker}" title="点击取色">`);
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="输入颜色值 (支持 rgba/hex/name)">`);

                // 初始化选择器背景色，让它看起来也是该颜色
                try { picker.css('background-color', colorVal); } catch(e) {}

                // 事件：选择器变动 -> 更新文本框
                picker.on('input', function() {
                    const pickedHex = this.value; // #RRGGBB
                    textInput.val(pickedHex).trigger('input');
                    // 更新自己的背景色以便预览
                    $(this).css('background-color', pickedHex);
                });

                // 事件：文本框变动 -> 更新选择器 (并尝试转换)
                textInput.on('input', function() {
                    const newValue = $(this).val();
                    const newHex = getColorHex(newValue);
                    
                    // 更新选择器视觉
                    picker.val(newHex);
                    try { picker.css('background-color', newValue); } catch(e) {}
                    
                    // 更新 CSS 源码
                    updateCssContent(block.selector, prop.name, index, newValue);
                });

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
    
    // 定位到具体的 CSS 块
    const blockRegex = new RegExp(`(?:(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)+)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    let match = blockRegex.exec(originalCss);
    
    if (match) {
        const fullBlockMatch = match[0];
        const blockContent = match[2];
        
        // 定位到具体的属性
        const propRegex = new RegExp(`(${propName})\\s*:\\s*([^;]+);`, 'g');
        
        const newBlockContent = blockContent.replace(propRegex, (fullPropMatch, pName, pValue) => {
            let currentColorIndex = 0;
            // 使用完全一致的正则替换第N个颜色
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
        
        // 只替换发生变化的那一部分
        const newCss = originalCss.replace(fullBlockMatch, newFullBlock);
        
        // 更新缓存，避免触发不必要的重绘
        lastCssContent = newCss; 
        
        // 写入 Textarea
        // 注意：不调用 refreshTuner()，否则会导致输入焦点丢失，
        // 这里只修改文本域，保留输入框焦点在当前元素上
        cssTextArea.val(newCss);
        cssTextArea.trigger('input'); 
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

$(document).ready(function() {
    // 1. 等待 Textarea 出现
    const checkExist = setInterval(function() {
        if ($('#CustomCSS-textAreaBlock').length) {
            console.log(extensionName + " Loaded");
            clearInterval(checkExist);
            
            // 初始化界面
            createTunerUI();
            
            // 初始读取一次
            setTimeout(() => refreshTuner(true), 300);
        }
    }, 1000);

    // 2. 监听 SillyTavern 设置更新事件 (用于捕捉主题切换)
    // 当用户选择不同的 UI Preset 时，ST 会触发此事件
    eventSource.on(event_types.SETTINGS_UPDATED, function() {
        // 设置更新后，Textarea 的值可能已经被 ST 替换了
        // 我们延迟一点时间来读取新值
        setTimeout(() => {
            // 检查当前 Textarea 是否存在（防止页面切换导致丢失）
            if ($('#customCSS').length) {
                console.log(extensionName + ": Theme changed detected, refreshing tuner...");
                refreshTuner(true); // 强制刷新
            }
        }, 500);
    });
});
