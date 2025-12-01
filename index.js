import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;

// 上一次解析的 CSS 内容哈希或长度，用于避免重复渲染
let lastCssContent = "";

// 颜色匹配正则
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/**
 * 颜色转换工具集
 */
const ColorUtils = {
    // 任意颜色转 HEX (6位)
    toHex: (str) => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = str;
        let computed = ctx.fillStyle;
        if (computed.startsWith('#') && computed.length === 7) return computed;
        if (computed.startsWith('#') && computed.length === 4) {
            return '#' + computed[1] + computed[1] + computed[2] + computed[2] + computed[3] + computed[3];
        }
        if (computed.startsWith('rgb')) {
            const parts = computed.match(/[\d.]+/g);
            if (!parts || parts.length < 3) return '#000000';
            const r = parseInt(parts[0]).toString(16).padStart(2, '0');
            const g = parseInt(parts[1]).toString(16).padStart(2, '0');
            const b = parseInt(parts[2]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    },

    // 任意颜色提取透明度 (0-1)
    getAlpha: (str) => {
        // 如果是 rgba(...)
        if (str.toLowerCase().startsWith('rgba')) {
            const parts = str.match(/[\d.]+/g);
            if (parts && parts.length >= 4) return parseFloat(parts[3]);
        }
        // 如果是 transparent
        if (str.toLowerCase() === 'transparent') return 0;
        // 默认为 1
        return 1;
    },

    // 合并 HEX 和 Alpha 成为 RGBA 字符串
    merge: (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        // 如果 alpha 是 1，返回 rgb 还是 rgba？为了统一，如果用户之前是rgba建议返回rgba，
        // 但为了简单，这里根据 alpha 值：如果 < 1 则返回 rgba，否则返回 hex 或 rgb
        if (alpha < 1) {
            // 保留3位小数
            const a = Math.round(alpha * 1000) / 1000;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        } else {
            return hex; // 不透明时优先使用 hex
        }
    }
};

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
            // 分割多个注释块
            const commentParts = rawComments.split('*/');
            const cleanParts = commentParts
                .map(c => c.trim())
                .filter(c => c.length > 0 && c.includes('/*')); 
            
            if (cleanParts.length > 0) {
                let lastRaw = cleanParts[cleanParts.length - 1];
                // 移除开头的 /* 和可能得换行
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
    if ($('.css-tuner-container').length > 0) return;

    // 顶部工具栏 (含双向滚动按钮)
    const topBar = $(`
        <div class="css-tools-bar">
            <div class="tools-btn-group">
                <div class="tools-btn" id="css-top-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                <div class="tools-btn" id="css-scroll-btn" title="滚动选项">
                    <i class="fa-solid fa-arrows-v"></i>
                    <div class="scroll-dropdown-menu" id="css-scroll-menu">
                        <div class="scroll-option" data-action="top"><i class="fa-solid fa-arrow-up"></i> 回到顶部</div>
                        <div class="scroll-option" data-action="bottom"><i class="fa-solid fa-arrow-down"></i> 跳到底部</div>
                    </div>
                </div>
            </div>
            <div class="css-tools-search-wrapper">
                <input type="text" id="css-top-search" placeholder="搜索 CSS 代码..." autocomplete="off">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
        </div>
    `);

    // 调色板容器 (修改了 Header 结构)
    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-controls">
                    <div class="tools-btn" id="tuner-refresh" title="刷新列表"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="tools-btn" id="tuner-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                    <div class="tools-btn" id="tuner-up" title="回到扩展顶部"><i class="fa-solid fa-arrow-up"></i></div>
                    <div class="tools-btn" id="tuner-collapse" title="折叠面板"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
            </div>
            <div class="tuner-sub-header">
                <div class="css-tools-search-wrapper">
                    <input type="text" id="tuner-search" placeholder="搜索类名、属性或注释..." autocomplete="off">
                    <div class="css-search-dropdown" id="tuner-search-results"></div>
                </div>
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
    cssTextArea.trigger('input');
    const systemUpdateBtn = $('#ui-preset-update-button');
    if (systemUpdateBtn.length && systemUpdateBtn.is(':visible')) {
        systemUpdateBtn.click();
        toastr.success("主题文件已更新", "CSS Color Tuner");
    } else {
        saveSettingsDebounced();
        toastr.success("全局配置已保存", "CSS Color Tuner");
    }
}

// 绑定搜索框逻辑
function bindSearchLogic(input, resultContainer, getLinesCallback, clickCallback) {
    input.on('input', function() {
        const query = $(this).val();
        resultContainer.empty().removeClass('active');
        if (!query) return;

        const results = getLinesCallback(query);

        if (results.length > 0) {
            results.forEach(res => {
                const escapedQuery = escapeRegExp(query);
                const highlightRegex = new RegExp(`(${escapedQuery})`, 'gi');
                const highlightedContent = escapeHtml(res.content).replace(highlightRegex, '<span class="search-highlight">$1</span>');
                
                const item = $(`<div class="css-search-item">
                    ${res.icon ? res.icon : '<i class="fa-solid fa-code fa-xs" style="opacity:0.5"></i>'} 
                    ${highlightedContent}
                </div>`);
                
                item.on('click', () => {
                    clickCallback(res);
                    resultContainer.removeClass('active');
                });
                resultContainer.append(item);
            });
            setTimeout(() => resultContainer.addClass('active'), 10);
        }
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            resultContainer.removeClass('active');
        }
    });
}

function bindEvents() {
    // 1. 顶部代码搜索
    bindSearchLogic(
        $('#css-top-search'),
        $('#css-search-results'),
        (query) => {
            const text = cssTextArea.val();
            const lines = text.split('\n');
            const res = [];
            let count = 0;
            for (let i = 0; i < lines.length; i++) {
                if (count > 50) break;
                if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                    res.push({ index: i, content: lines[i].trim() });
                    count++;
                }
            }
            return res;
        },
        (item) => jumpToLine(item.index)
    );

    // 2. 面板内部搜索 (含下拉)
    bindSearchLogic(
        $('#tuner-search'),
        $('#tuner-search-results'),
        (query) => {
            const q = query.toLowerCase();
            const res = [];
            // 搜索已渲染的卡片 DOM 数据会更准确
            contentArea.find('.tuner-card').each(function() {
                if (res.length > 50) return;
                const card = $(this);
                const title = card.find('.tuner-card-header').text();
                // 搜索属性
                const props = card.find('.tuner-prop-name').map((_, el) => $(el).text()).get().join(' ');
                
                if (title.toLowerCase().includes(q) || props.toLowerCase().includes(q)) {
                    res.push({ 
                        element: card, 
                        content: title.replace(/\s+/g, ' ').trim(),
                        icon: '<i class="fa-solid fa-palette fa-xs" style="opacity:0.5"></i>'
                    });
                }
            });
            return res;
        },
        (item) => {
            // 滚动到该卡片
            item.element[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            // 添加闪烁效果
            item.element.css('outline', '2px solid var(--tuner-accent)');
            setTimeout(() => item.element.css('outline', 'none'), 1000);
        }
    );

    // 3. 面板内搜索框的普通过滤功能 (保留)
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

    // 4. 双向滚动按钮逻辑
    const scrollBtn = $('#css-scroll-btn');
    const scrollMenu = $('#css-scroll-menu');
    
    scrollBtn.on('click', function(e) {
        e.stopPropagation();
        scrollMenu.toggleClass('active');
    });

    // 点击菜单选项
    scrollMenu.on('click', '.scroll-option', function(e) {
        e.stopPropagation();
        const action = $(this).data('action');
        const el = cssTextArea[0];
        if (action === 'top') {
            el.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
        scrollMenu.removeClass('active');
    });

    // 点击外部关闭菜单
    $(document).on('click', function() {
        scrollMenu.removeClass('active');
    });

    // 保存与基础按钮
    $('#css-top-save, #tuner-save').on('click', saveSettings);

    $('#tuner-refresh').on('click', function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        refreshTuner(true);
        setTimeout(() => icon.removeClass('fa-spin'), 600);
    });

    $('#tuner-up').on('click', function() {
        contentArea[0].scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#tuner-collapse').on('click', function() {
        container.toggleClass('collapsed');
        const icon = $(this).find('i');
        if (container.hasClass('collapsed')) {
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
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

function refreshTuner(force = false) {
    if (!cssTextArea || !cssTextArea.length) {
        cssTextArea = $('#customCSS');
    }
    const cssText = cssTextArea.val();
    if (!force && cssText === lastCssContent) return;
    lastCssContent = cssText;
    const blocks = parseCssColors(cssText);
    renderTunerBlocks(blocks);
}

function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色<br><small>仅读取标准属性中的颜色值</small></div>');
        return;
    }

    blocks.forEach(block => {
        // 标题格式： 注释 | 类名
        let titleHtml = '';
        if (block.comment) {
            titleHtml = `
                <span class="comment">${escapeHtml(block.comment)}</span>
                <span class="divider">|</span>
                <span class="selector">${escapeHtml(block.selector)}</span>
            `;
        } else {
            titleHtml = `<span class="selector">${escapeHtml(block.selector)}</span>`;
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
                
                // 计算初始状态
                const initialHex = ColorUtils.toHex(colorVal);
                const initialAlpha = ColorUtils.getAlpha(colorVal);

                const group = $(`<div class="tuner-input-group"></div>`);
                
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // 1. 颜色选择器 (Hex only)
                const picker = $(`<input type="color" class="tuner-picker" value="${initialHex}" title="选择基色">`);
                
                // 2. 透明度滑块
                const slider = $(`<input type="range" class="alpha-slider" min="0" max="1" step="0.01" value="${initialAlpha}" title="透明度: ${initialAlpha}">`);
                
                // 3. 文本框
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="最终颜色值 (RGBA)">`);

                // 辅助：初始化背景色
                const updatePickerVisual = (val) => {
                     try { picker.css('background-color', val); } catch(e) {}
                };
                updatePickerVisual(colorVal);

                // --- 事件联动 ---

                // A. Picker 变动 (改变 HEX, 保持当前 Alpha)
                picker.on('input', function() {
                    const currentAlpha = parseFloat(slider.val());
                    const newRgba = ColorUtils.merge(this.value, currentAlpha);
                    
                    textInput.val(newRgba).trigger('input');
                    updatePickerVisual(newRgba);
                });

                // B. Slider 变动 (改变 Alpha, 保持当前 HEX)
                slider.on('input', function() {
                    const currentHex = picker.val();
                    const currentAlpha = parseFloat(this.value);
                    const newRgba = ColorUtils.merge(currentHex, currentAlpha);
                    
                    $(this).attr('title', `透明度: ${currentAlpha}`);
                    textInput.val(newRgba).trigger('input');
                    updatePickerVisual(newRgba);
                });

                // C. Text 变动 (反向解析)
                textInput.on('input', function() {
                    const val = $(this).val();
                    
                    // 尝试更新 Picker (获取 hex)
                    const newHex = ColorUtils.toHex(val);
                    if (newHex !== '#000000' || val.includes('000000') || val.includes('black')) {
                        picker.val(newHex);
                    }

                    // 尝试更新 Slider (获取 alpha)
                    const newAlpha = ColorUtils.getAlpha(val);
                    slider.val(newAlpha);
                    slider.attr('title', `透明度: ${newAlpha}`);

                    updatePickerVisual(val);

                    // 写入 CSS
                    updateCssContent(block.selector, prop.name, index, val);
                });

                group.append(picker);
                group.append(slider);
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
    const blockRegex = new RegExp(`(?:(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)+)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    let match = blockRegex.exec(originalCss);
    
    if (match) {
        const fullBlockMatch = match[0];
        const blockContent = match[2];
        const propRegex = new RegExp(`(${propName})\\s*:\\s*([^;]+);`, 'g');
        
        const newBlockContent = blockContent.replace(propRegex, (fullPropMatch, pName, pValue) => {
            let currentColorIndex = 0;
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
        
        lastCssContent = newCss; 
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
            setTimeout(() => refreshTuner(true), 300);
        }
    }, 1000);

    eventSource.on(event_types.SETTINGS_UPDATED, function() {
        setTimeout(() => {
            if ($('#customCSS').length) {
                console.log(extensionName + ": Theme changed detected");
                refreshTuner(true);
            }
        }, 500);
    });
});
