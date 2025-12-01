import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;

// 上一次解析的 CSS 内容哈希或长度
let lastCssContent = "";

// 颜色匹配正则
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

// 缓存解析后的块，用于内部搜索
let currentParsedBlocks = [];

/**
 * 核心工具：将任意 CSS 颜色解析为 RGBA 对象
 * 返回: { r: 0-255, g: 0-255, b: 0-255, a: 0-1, hex: "#rrggbb" }
 */
function getColorRgba(str) {
    const ctx = document.createElement('canvas').getContext('2d');
    // 设置透明背景，防止干扰
    ctx.clearRect(0,0,1,1);
    ctx.fillStyle = str;
    const computed = ctx.fillStyle; // 浏览器通常返回 #RRGGBB 或 rgba(r,g,b,a)

    // 默认黑色
    let r = 0, g = 0, b = 0, a = 1;

    if (computed.startsWith('#')) {
        let hex = computed;
        // 扩展短hex
        if (hex.length === 4) {
            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
        a = 1;
    } else if (computed.startsWith('rgba') || computed.startsWith('rgb')) {
        const parts = computed.match(/[\d.]+/g);
        if (parts && parts.length >= 3) {
            r = parseInt(parts[0]);
            g = parseInt(parts[1]);
            b = parseInt(parts[2]);
            if (parts.length >= 4) {
                a = parseFloat(parts[3]);
            }
        }
    }
    
    // 生成一个纯 hex 用于 <input type="color"> (忽略alpha)
    const toHex = (c) => c.toString(16).padStart(2, '0');
    const hexFull = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

    return { r, g, b, a, hex: hexFull };
}

/**
 * 将 rgba 分量转换为字符串
 */
function toRgbaString(r, g, b, a) {
    // 精度控制，避免 0.300000004
    const alpha = Math.round(a * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 解析CSS字符串
 */
function parseCssColors(cssString) {
    const blocks = [];
    // 捕获注释组和规则内容
    const ruleRegex = /(?:((?:\/\*[\s\S]*?\*\/[\s\r\n]*)+))?([^{}]+)\{([^}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const rawComments = match[1];
        const selector = match[2].trim();
        const content = match[3];
        
        let finalComment = "";
        
        // 专门的注释解析逻辑
        if (rawComments) {
            // 按 */ 分割，过滤空串
            const commentParts = rawComments.split('*/');
            // 找出包含 /* 的有效片段
            const validComments = commentParts
                .map(c => c.trim())
                .filter(c => c.includes('/*'));
            
            if (validComments.length > 0) {
                // 取最后一个（最靠近选择器的）
                let lastRaw = validComments[validComments.length - 1];
                // 去掉开头的 /*，再去掉两端空格
                finalComment = lastRaw.replace(/^\/\*/, '').trim();
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
            // 生成用于显示的 ID
            const uniqueId = `tuner-block-${blocks.length}`;
            blocks.push({
                id: uniqueId,
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

    // 注意：在这里添加了 tuner-search-results 下拉栏
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
    // ---------------- 全局搜索 ----------------
    const topSearchInput = $('#css-top-search');
    const topResultsContainer = $('#css-search-results');

    topSearchInput.on('input', function() {
        const query = $(this).val();
        topResultsContainer.empty().removeClass('active');
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
                    topResultsContainer.removeClass('active');
                });
                topResultsContainer.append(item);
            });
            setTimeout(() => topResultsContainer.addClass('active'), 10);
        }
    });

    // ---------------- 内部搜索 (下拉栏 + 筛选) ----------------
    const tunerSearchInput = $('#tuner-search');
    const tunerResultsContainer = $('#tuner-search-results');

    tunerSearchInput.on('input', function() {
        const query = $(this).val().toLowerCase();
        
        // 1. 实时筛选卡片显示 (保留原功能)
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

        // 2. 下拉推荐栏 (新功能)
        tunerResultsContainer.empty().removeClass('active');
        if (!query) return;

        const results = currentParsedBlocks.filter(b => 
            (b.comment && b.comment.toLowerCase().includes(query)) || 
            (b.selector && b.selector.toLowerCase().includes(query))
        ).slice(0, 15); // 限制显示数量

        if (results.length > 0) {
            results.forEach(block => {
                // 格式：注释 | .class
                let displayText = block.selector;
                if (block.comment) {
                    displayText = `${block.comment} | ${block.selector}`;
                }

                // 高亮
                const escapedQuery = escapeRegExp(query);
                const highlightRegex = new RegExp(`(${escapedQuery})`, 'gi');
                const highlightedContent = escapeHtml(displayText).replace(highlightRegex, '<span class="search-highlight">$1</span>');

                const item = $(`<div class="css-search-item">${highlightedContent}</div>`);
                item.on('click', () => {
                    // 滚动到该卡片
                    const targetCard = $(`#${block.id}`);
                    if (targetCard.length) {
                        targetCard.show(); // 确保它是显示的
                        contentArea[0].scrollTo({
                            top: targetCard[0].offsetTop - contentArea[0].offsetTop - 10,
                            behavior: 'smooth'
                        });
                        // 闪烁一下提示
                        targetCard.css('transition', 'background 0.2s').css('background', 'var(--tuner-card-hover)');
                        setTimeout(() => targetCard.css('background', ''), 400);
                    }
                    tunerResultsContainer.removeClass('active');
                });
                tunerResultsContainer.append(item);
            });
            setTimeout(() => tunerResultsContainer.addClass('active'), 10);
        }
    });

    // 关闭下拉菜单
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            topResultsContainer.removeClass('active');
        }
        if (!$(e.target).closest('.tuner-sub-header').length) {
            tunerResultsContainer.removeClass('active');
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
        icon.toggleClass('fa-chevron-up fa-chevron-down');
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
    const avgLineHeight = el.scrollHeight / lines.length || 20;
    el.scrollTo({ top: lineIndex * avgLineHeight, behavior: 'smooth' });
}

function refreshTuner(force = false) {
    if (!cssTextArea || !cssTextArea.length) cssTextArea = $('#customCSS');
    const cssText = cssTextArea.val();
    if (!force && cssText === lastCssContent) return;
    
    lastCssContent = cssText;
    currentParsedBlocks = parseCssColors(cssText); // 更新全局数据
    renderTunerBlocks(currentParsedBlocks);
}

function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色</div>');
        return;
    }

    blocks.forEach(block => {
        // 格式化标题： 注释 | .class
        let titleHtml = '';
        if (block.comment) {
            titleHtml = `<span class="tuner-header-comment">${escapeHtml(block.comment)}</span> <span style="opacity:0.3; margin:0 4px;">|</span> <span class="tuner-header-selector">${escapeHtml(block.selector)}</span>`;
        } else {
            titleHtml = `<span class="tuner-header-comment">${escapeHtml(block.selector)}</span>`;
        }

        const blockEl = $(`<div class="tuner-card" id="${block.id}">
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
                
                // 1. 初始解析颜色 (得到 r,g,b,a, hex)
                const rgba = getColorRgba(colorVal);

                const group = $(`<div class="tuner-input-group"></div>`);
                
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // 2. 创建三个控件
                // A. 原生取色器 (仅RGB) - 带有吸管功能
                const colorPicker = $(`<input type="color" class="tuner-picker" value="${rgba.hex}" title="选取基色 (吸管)">`);
                
                // B. 透明度滑条 (Alpha)
                const alphaSlider = $(`<input type="range" class="tuner-alpha-slider" min="0" max="1" step="0.01" value="${rgba.a}" title="透明度: ${rgba.a}">`);
                
                // C. 文本框
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="颜色值">`);

                // 为了闭包状态管理，保存当前 RGB 和 Alpha
                let currentRgbHex = rgba.hex;
                let currentAlpha = rgba.a;

                // --- 辅助函数：合成并更新 ---
                const syncAll = (triggerType) => {
                    // triggerType: 'picker' | 'slider' | 'text'
                    
                    // 将 hex (#rrggbb) 转为十进制 rgb
                    const r = parseInt(currentRgbHex.substr(1,2), 16);
                    const g = parseInt(currentRgbHex.substr(3,2), 16);
                    const b = parseInt(currentRgbHex.substr(5,2), 16);

                    // 合成 rgba 字符串
                    const newValue = toRgbaString(r, g, b, currentAlpha);

                    // 更新 UI (不更新触发源，防止跳动)
                    if (triggerType !== 'text') {
                        textInput.val(newValue);
                    }
                    if (triggerType !== 'picker') {
                        colorPicker.val(currentRgbHex);
                    }
                    if (triggerType !== 'slider') {
                        alphaSlider.val(currentAlpha);
                    }
                    
                    // 更新滑条和选择器的视觉反馈 (背景色)
                    try { 
                        colorPicker.css('background-color', newValue); 
                    } catch(e) {}

                    // 写入 CSS
                    updateCssContent(block.selector, prop.name, index, newValue);
                };

                // 初始化背景
                colorPicker.css('background-color', colorVal);

                // --- 事件绑定 ---

                // 1. 取色器变动 (RGB 变, Alpha 不变)
                colorPicker.on('input', function() {
                    currentRgbHex = this.value; // #RRGGBB
                    syncAll('picker');
                });

                // 2. 滑条变动 (Alpha 变, RGB 不变)
                alphaSlider.on('input', function() {
                    currentAlpha = parseFloat(this.value);
                    $(this).attr('title', `透明度: ${currentAlpha}`);
                    syncAll('slider');
                });

                // 3. 文本框变动 (尝试解析并反向更新 RGB 和 Alpha)
                textInput.on('input', function() {
                    const val = $(this).val();
                    const parsed = getColorRgba(val);
                    
                    // 更新内部状态
                    currentRgbHex = parsed.hex;
                    currentAlpha = parsed.a;
                    
                    // 更新控件 (Picker 和 Slider)
                    colorPicker.val(currentRgbHex);
                    alphaSlider.val(currentAlpha);
                    try { colorPicker.css('background-color', val); } catch(e) {}
                    
                    // 写入 CSS (直接写入用户输入的字符串，或者标准化后的字符串? 
                    // 最好写入用户输入的，但为了保持逻辑一致，这里依然调用 updateCssContent)
                    updateCssContent(block.selector, prop.name, index, val);
                });

                group.append(colorPicker);
                group.append(alphaSlider);
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
