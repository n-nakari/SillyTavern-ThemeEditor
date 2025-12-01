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
 * 辅助：将 hex 转换为 rgb 对象
 */
function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

/**
 * 核心工具：解析颜色，返回 hex (用于input[color]) 和 alpha (用于input[range])
 */
function parseColorComponents(str) {
    // 利用 Canvas 转换标准格式
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = str;
    let computed = ctx.fillStyle; // 浏览器会尝试转换为 hex 或 rgba(r,g,b,a)

    let hex = "#000000";
    let alpha = 1;

    // 1. 如果是 Hex (#RRGGBB)
    if (computed.startsWith('#') && computed.length === 7) {
        hex = computed;
        alpha = 1;
    }
    // 2. 如果是 RGBA (rgba(r, g, b, a))
    else if (computed.startsWith('rgba')) {
        const parts = computed.match(/[\d.]+/g);
        if (parts && parts.length >= 4) {
            const r = parseInt(parts[0]).toString(16).padStart(2, '0');
            const g = parseInt(parts[1]).toString(16).padStart(2, '0');
            const b = parseInt(parts[2]).toString(16).padStart(2, '0');
            hex = `#${r}${g}${b}`;
            alpha = parseFloat(parts[3]);
        }
    }
    // 3. 如果是 RGB (rgb(r, g, b))
    else if (computed.startsWith('rgb')) {
        const parts = computed.match(/[\d.]+/g);
        if (parts && parts.length >= 3) {
            const r = parseInt(parts[0]).toString(16).padStart(2, '0');
            const g = parseInt(parts[1]).toString(16).padStart(2, '0');
            const b = parseInt(parts[2]).toString(16).padStart(2, '0');
            hex = `#${r}${g}${b}`;
            alpha = 1;
        }
    }
    // 4. 特殊处理：如果原始字符串里显式写了透明度 (因为 computed 可能会把 rgba(0,0,0,0) 转为 rgba(0,0,0,0))
    // 尝试匹配原始 rgba 字符串来获取更精确的 alpha
    if (str.includes('rgba') || str.includes('hsla')) {
        // 简单提取最后一个数字
        const rawParts = str.match(/[\d.]+/g);
        if (rawParts && rawParts.length >= 4) {
             // 这种简单的提取不一定在 HSLA 下准确，但对 RGBA 足够。
             // 依赖 Canvas 的 computed 结果通常是最稳的，
             // 只有当 alpha 是 0 时，Canvas 可能会有一些不同行为，但通常足够。
        }
    }

    return { hex, alpha };
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
        
        // --- 核心修改：注释解析逻辑 ---
        let finalComment = "";
        if (rawComments) {
            // 1. 按 */ 分割
            const commentParts = rawComments.split('*/');
            // 2. 过滤掉空项，保留包含 /* 的项
            const validComments = [];
            for (let part of commentParts) {
                if (part.trim().includes('/*')) {
                    // 去掉开头的 /* 和空白
                    let clean = part.replace(/^[\s\r\n]*\/\*[\s\r\n]*/, '').trim();
                    if (clean) validComments.push(clean);
                }
            }
            
            // 3. 只取最后一个
            if (validComments.length > 0) {
                finalComment = validComments[validComments.length - 1];
            }
        }
        // -----------------------------
        
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

    // 顶部工具栏
    const topBar = $(`
        <div class="css-tools-bar">
            <div class="css-tools-search-wrapper">
                <input type="text" id="css-top-search" placeholder="全局搜索 CSS 代码..." autocomplete="off">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
            <div class="tools-btn-group">
                <div class="tools-btn" id="css-top-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                <div class="tools-btn" id="css-top-up" title="回到代码顶部"><i class="fa-solid fa-arrow-up"></i></div>
            </div>
        </div>
    `);

    // 调色板容器 (注意：内部搜索栏下方增加了 dropdown)
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
                <input type="text" id="tuner-search" placeholder="筛选卡片 (类名、注释、属性)..." autocomplete="off">
                <div class="css-search-dropdown" id="tuner-search-results"></div>
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

function bindEvents() {
    // --- 全局搜索 (代码跳转) ---
    const topSearch = $('#css-top-search');
    const topResults = $('#css-search-results');

    topSearch.on('input', function() {
        const query = $(this).val();
        topResults.empty().removeClass('active');
        if (!query) return;

        const text = cssTextArea.val();
        const lines = text.split('\n');
        const results = [];
        let count = 0;

        for (let i = 0; i < lines.length; i++) {
            if (count > 50) break;
            if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                results.push({ lineIndex: i, content: lines[i].trim() });
                count++;
            }
        }

        if (results.length > 0) {
            results.forEach(res => {
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-code fa-xs" style="opacity:0.5"></i> ${escapeHtml(res.content)}</div>`);
                item.on('click', () => {
                    jumpToLine(res.lineIndex);
                    topResults.removeClass('active');
                });
                topResults.append(item);
            });
            setTimeout(() => topResults.addClass('active'), 10);
        }
    });

    // --- 内部搜索 (下拉 + 筛选) ---
    const innerSearch = $('#tuner-search');
    const innerResults = $('#tuner-search-results');

    innerSearch.on('input', function() {
        const query = $(this).val().toLowerCase();
        
        // 1. 筛选可见性 (原功能)
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

        // 2. 下拉推荐 (新功能)
        innerResults.empty().removeClass('active');
        if (!query) return;

        const cards = contentArea.find('.tuner-card');
        let count = 0;

        cards.each(function() {
            if (count > 20) return;
            const card = $(this);
            if (card.is(':visible')) {
                const headerText = card.find('.tuner-card-header').text();
                // 简单的列表项
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-paint-brush fa-xs" style="opacity:0.5"></i> ${escapeHtml(headerText)}</div>`);
                item.on('click', () => {
                    // 滚动到该卡片
                    contentArea[0].scrollTo({
                        top: card[0].offsetTop - contentArea[0].offsetTop - 10,
                        behavior: 'smooth'
                    });
                    // 高亮一下
                    card.css('border-color', 'var(--tuner-accent)');
                    setTimeout(() => card.css('border-color', ''), 1000);
                    
                    innerResults.removeClass('active');
                });
                innerResults.append(item);
                count++;
            }
        });

        if (count > 0) {
             setTimeout(() => innerResults.addClass('active'), 10);
        }
    });

    // 点击外部关闭下拉
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper, .tuner-sub-header').length) {
            topResults.removeClass('active');
            innerResults.removeClass('active');
        }
    });

    $('#css-top-save, #tuner-save').on('click', saveSettings);
    $('#css-top-up').on('click', () => cssTextArea[0].scrollTo({ top: 0, behavior: 'smooth' }));

    $('#tuner-refresh').on('click', function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        refreshTuner(true);
        setTimeout(() => icon.removeClass('fa-spin'), 600);
    });

    $('#tuner-up').on('click', () => contentArea[0].scrollTo({ top: 0, behavior: 'smooth' }));

    $('#tuner-collapse').on('click', function() {
        contentArea.toggleClass('collapsed');
        const icon = $(this).find('i');
        icon.attr('class', contentArea.hasClass('collapsed') ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up');
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
    const avgLineHeight = el.scrollHeight / lines.length;
    el.scrollTo({ top: lineIndex * avgLineHeight, behavior: 'smooth' });
}

function refreshTuner(force = false) {
    if (!cssTextArea || !cssTextArea.length) cssTextArea = $('#customCSS');
    const cssText = cssTextArea.val();
    if (!force && cssText === lastCssContent) return;
    lastCssContent = cssText;
    const blocks = parseCssColors(cssText);
    renderTunerBlocks(blocks);
}

function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色</div>');
        return;
    }

    blocks.forEach(block => {
        // --- 标题格式修改：Comment | Selector ---
        let titleText = escapeHtml(block.selector);
        if (block.comment) {
            titleText = `<span style="opacity:0.8">${escapeHtml(block.comment)}</span> | ${escapeHtml(block.selector)}`;
        }
        
        const blockEl = $(`<div class="tuner-card">
            <div class="tuner-card-header">${titleText}</div>
        </div>`);

        block.properties.forEach(prop => {
            const row = $(`<div class="tuner-prop-row">
                <div class="tuner-prop-name">${escapeHtml(prop.name)}</div>
                <div class="tuner-inputs-container"></div>
            </div>`);

            const inputsContainer = row.find('.tuner-inputs-container');

            prop.colors.forEach((colorObj, index) => {
                const colorVal = colorObj.value; 
                
                // 解析初始颜色组件
                const comp = parseColorComponents(colorVal); // { hex: '#rrggb', alpha: 0.5 }

                const group = $(`<div class="tuner-input-group"></div>`);
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // 1. 原生取色器 (仅RGB)
                const picker = $(`<input type="color" class="tuner-picker" value="${comp.hex}" title="调整颜色 (RGB)">`);
                
                // 2. 透明度滑块 (0-1)
                const alphaSlider = $(`<input type="range" class="tuner-alpha-slider" min="0" max="1" step="0.01" value="${comp.alpha}" title="调整透明度 (Alpha)">`);
                
                // 3. 结果文本框
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="输入颜色值">`);

                // 统一更新逻辑：根据 Picker 和 Slider 合成 RGBA 字符串
                const syncToText = () => {
                    const hex = picker.val();
                    const alpha = parseFloat(alphaSlider.val());
                    const rgb = hexToRgb(hex);

                    let newVal = '';
                    if (alpha < 1) {
                         // 必须用 rgba 形式
                         newVal = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
                    } else {
                         // alpha 为 1 时，优先保持 hex 格式，或者如果用户想要强制 rgba(...,1) 也可以
                         // 但通常 hex 更短更常用。这里使用 hex 方便。
                         // 但如果用户之前的输入是 rgba(..., 1)，这里转成 hex 可能会改变原意？
                         // 为了满足"颜色选择器换成rgba的形式"，我们可以始终输出 rgba
                         // 但为了兼容性和简洁性，如果 alpha=1，使用 hex 是最安全的默认 CSS 行为。
                         // 如果一定要 "rgba形式"，可以解开下面的注释：
                         // newVal = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
                         newVal = hex; 
                    }
                    
                    // 更新文本框
                    textInput.val(newVal);
                    // 更新选择器背景预览
                    try { picker.css('background-color', newVal); } catch(e) {}
                    // 更新 CSS 源码
                    updateCssContent(block.selector, prop.name, index, newVal);
                };

                // 事件绑定
                picker.on('input', syncToText);
                alphaSlider.on('input', syncToText);

                // 文本框反向同步
                textInput.on('input', function() {
                    const val = $(this).val();
                    const newComp = parseColorComponents(val);
                    
                    // 更新 UI 控件状态，但不触发 input 事件防止循环
                    picker.val(newComp.hex);
                    alphaSlider.val(newComp.alpha);
                    try { picker.css('background-color', val); } catch(e) {}

                    updateCssContent(block.selector, prop.name, index, val);
                });

                // 初始化背景
                try { picker.css('background-color', colorVal); } catch(e) {}

                group.append(picker);
                group.append(alphaSlider); // 加入滑块
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
    
    // 寻找块
    const blockRegex = new RegExp(`(?:(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)+)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    let match = blockRegex.exec(originalCss);
    if (match) {
        const fullBlockMatch = match[0];
        const blockContent = match[2];
        
        // 寻找属性
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
                console.log(extensionName + ": Theme changed, refreshing...");
                refreshTuner(true);
            }
        }, 500);
    });
});
