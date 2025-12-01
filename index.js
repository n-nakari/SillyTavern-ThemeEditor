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

// 注入必要的补充样式 (用于RGBA滑块和弹出层)
function injectStyles() {
    if ($('#css-tuner-extra-style').length) return;
    const style = `
    <style id="css-tuner-extra-style">
        /* 颜色预览块 */
        .tuner-color-preview-btn {
            width: 28px; height: 28px; border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.3);
            cursor: pointer; position: relative;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%);
            background-size: 10px 10px;
            background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
        }
        .tuner-color-preview-inner {
            width: 100%; height: 100%; border-radius: 50%;
            box-shadow: inset 0 0 2px rgba(0,0,0,0.5);
        }
        /* 弹出层 */
        .tuner-popover {
            position: absolute; top: 36px; left: 0;
            background: #2b2b2b; border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px; padding: 10px;
            z-index: 9999; display: none;
            box-shadow: 0 5px 15px rgba(0,0,0,0.5);
            width: 160px;
        }
        .tuner-popover.active { display: block; }
        /* 弹出层内的控件 */
        .tuner-popover-row { margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 5px; }
        .tuner-popover-row:last-child { margin-bottom: 0; }
        .tuner-popover label { font-size: 12px; color: #aaa; width: 20px; }
        .tuner-native-picker { width: 100%; height: 30px; cursor: pointer; border: none; padding: 0; background: none; }
        .tuner-alpha-slider { flex: 1; cursor: pointer; }
        
        /* 内部搜索的下拉栏 */
        .tuner-search-wrapper { position: relative; width: 100%; }
        .tuner-internal-dropdown {
            position: absolute; top: 100%; left: 0; right: 0;
            background: #1e1e1e; border: 1px solid rgba(255,255,255,0.1);
            border-radius: 0 0 8px 8px; max-height: 200px;
            overflow-y: auto; z-index: 100; display: none;
        }
        .tuner-internal-dropdown.active { display: block; }
        .tuner-internal-item {
            padding: 8px 12px; font-size: 0.85em; color: #ccc; cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between;
        }
        .tuner-internal-item:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .tuner-internal-item .item-sel { font-family: monospace; opacity: 0.6; font-size: 0.8em; }
    </style>
    `;
    $('head').append(style);
}

/**
 * 颜色转换工具集
 */
const ColorUtils = {
    // 任意颜色转 HEX (用于给原生 input type=color 赋值)
    toHex: (str) => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = str;
        let c = ctx.fillStyle;
        if (c.startsWith('#')) {
            if (c.length === 9) return c.substring(0, 7); // 去掉 Hex8 的 alpha
            return c;
        }
        if (c.startsWith('rgba')) {
            const p = c.match(/[\d.]+/g);
            if (!p) return '#000000';
            const r = parseInt(p[0]).toString(16).padStart(2,'0');
            const g = parseInt(p[1]).toString(16).padStart(2,'0');
            const b = parseInt(p[2]).toString(16).padStart(2,'0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    },
    // 任意颜色获取 Alpha (0-1)
    getAlpha: (str) => {
        // 创建临时元素计算样式，因为 canvas 有时会简化 alpha
        const div = document.createElement('div');
        div.style.color = str;
        document.body.appendChild(div);
        const computed = window.getComputedStyle(div).color; // returns rgb() or rgba()
        document.body.removeChild(div);

        if (computed.startsWith('rgba')) {
            const p = computed.match(/[\d.]+/g);
            return p && p[3] ? parseFloat(p[3]) : 1;
        }
        // transparent 特殊处理
        if (str.toLowerCase() === 'transparent') return 0;
        return 1;
    },
    // Hex + Alpha -> Rgba 字符串
    hexAlphaToRgba: (hex, alpha) => {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt("0x" + hex[1] + hex[1]);
            g = parseInt("0x" + hex[2] + hex[2]);
            b = parseInt("0x" + hex[3] + hex[3]);
        } else if (hex.length === 7) {
            r = parseInt("0x" + hex[1] + hex[2]);
            g = parseInt("0x" + hex[3] + hex[4]);
            b = parseInt("0x" + hex[5] + hex[6]);
        }
        // 如果 alpha 是 1，返回 hex 还是 rgb？为了保持一致性，返回 rgb/rgba
        if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
        // 保留3位小数
        const a = Math.round(alpha * 1000) / 1000;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
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
        
        // --- 核心修改：标题格式化逻辑 ---
        let finalComment = "";
        if (rawComments) {
            const commentParts = rawComments.split('*/');
            // 过滤空项，找出有效的注释部分
            const cleanParts = commentParts
                .map(c => c.trim())
                .filter(c => c.length > 0 && c.includes('/*')); 
            
            if (cleanParts.length > 0) {
                // 只取最后一个注释
                let lastRaw = cleanParts[cleanParts.length - 1];
                // 去掉开头的 /* 和换行符
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
                comment: finalComment, // 传递清洗后的注释
                properties
            });
        }
    }
    return blocks;
}

// UI 构建
function createTunerUI() {
    if ($('.css-tuner-container').length > 0) return;
    injectStyles();

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

    // 注意：这里在 search input 下面加了 tuner-internal-dropdown
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
                <div class="tuner-search-wrapper">
                    <input type="text" id="tuner-search" placeholder="搜索类名、属性或注释..." autocomplete="off">
                    <div class="tuner-internal-dropdown" id="tuner-internal-results"></div>
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

function bindEvents() {
    const searchInput = $('#css-top-search');
    const resultsContainer = $('#css-search-results');
    
    // 顶部搜索逻辑
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
        contentArea.toggleClass('collapsed');
        const icon = $(this).find('i');
        if (contentArea.hasClass('collapsed')) {
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // --- 修改：内部搜索逻辑 (添加下拉栏) ---
    const innerSearchInput = $('#tuner-search');
    const innerDropdown = $('#tuner-internal-results');

    innerSearchInput.on('input', function() {
        const query = $(this).val().toLowerCase();
        innerDropdown.empty().removeClass('active');

        // 1. 过滤卡片显示
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

        if (!query) return;

        // 2. 填充下拉推荐
        const matches = [];
        contentArea.find('.tuner-card:visible').each(function() {
            const el = $(this);
            const comment = el.find('.tuner-card-comment').text();
            const sel = el.find('.tuner-card-selector').text();
            // 限制数量防止卡顿
            if (matches.length < 15) {
                matches.push({ comment, sel, el });
            }
        });

        if (matches.length > 0) {
            matches.forEach(m => {
                const item = $(`
                    <div class="tuner-internal-item">
                        <span>${escapeHtml(m.comment)}</span>
                        <span class="item-sel">${escapeHtml(m.sel)}</span>
                    </div>
                `);
                item.on('click', function() {
                    // 滚动到该卡片
                    contentArea[0].scrollTo({
                        top: m.el[0].offsetTop - contentArea[0].offsetTop - 10,
                        behavior: 'smooth'
                    });
                    // 高亮一下
                    m.el.css('border-color', 'var(--tuner-accent)');
                    setTimeout(() => m.el.css('border-color', ''), 1000);
                    innerDropdown.removeClass('active');
                });
                innerDropdown.append(item);
            });
            innerDropdown.addClass('active');
        }
    });

    // 关闭内部下拉
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.tuner-search-wrapper').length) {
            innerDropdown.removeClass('active');
        }
        // 关闭颜色弹窗
        if (!$(e.target).closest('.tuner-input-group').length) {
            $('.tuner-popover').removeClass('active');
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

// 渲染 DOM
function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色</div>');
        return;
    }

    blocks.forEach(block => {
        // --- 核心修改：标题显示逻辑 ---
        // 格式: "注释 | .选择器" 或 ".选择器"
        let titleHtml = '';
        if (block.comment) {
            // 注：有注释时，同时显示注释和选择器，中间用 | 隔开，且不加标点
            titleHtml = `
                <span class="tuner-card-comment">${escapeHtml(block.comment)}</span>
                <span style="opacity:0.5; margin:0 8px;">|</span>
                <span class="tuner-card-selector">${escapeHtml(block.selector)}</span>
            `;
        } else {
            // 没注释，把选择器当主标题
            titleHtml = `<span class="tuner-card-comment">${escapeHtml(block.selector)}</span><span class="tuner-card-selector" style="display:none"></span>`;
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
                
                // 解析初始状态
                let currentHex = ColorUtils.toHex(colorVal);
                let currentAlpha = ColorUtils.getAlpha(colorVal);

                const group = $(`<div class="tuner-input-group" style="position:relative;"></div>`);
                
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // --- 核心修改：自定义 RGBA 选择器 UI ---
                // 1. 预览球 (作为触发器)
                const previewBtn = $(`
                    <div class="tuner-color-preview-btn" title="点击调整颜色/透明度">
                        <div class="tuner-color-preview-inner" style="background-color: ${colorVal}"></div>
                    </div>
                `);

                // 2. 文本框
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="输入颜色值">`);

                // 3. 弹出面板 (包含原生颜色选择器 + 透明度滑块)
                const popover = $(`
                    <div class="tuner-popover">
                        <div class="tuner-popover-row">
                            <label>色</label>
                            <!-- 原生选择器，保留吸管 -->
                            <input type="color" class="tuner-native-picker" value="${currentHex}">
                        </div>
                        <div class="tuner-popover-row">
                            <label>透</label>
                            <input type="range" class="tuner-alpha-slider" min="0" max="1" step="0.01" value="${currentAlpha}" title="透明度: ${Math.round(currentAlpha*100)}%">
                        </div>
                    </div>
                `);

                const nativePicker = popover.find('.tuner-native-picker');
                const alphaSlider = popover.find('.tuner-alpha-slider');
                const previewInner = previewBtn.find('.tuner-color-preview-inner');

                // 点击预览球切换弹窗
                previewBtn.on('click', function(e) {
                    e.stopPropagation();
                    // 关闭其他弹窗
                    $('.tuner-popover').not(popover).removeClass('active');
                    popover.toggleClass('active');
                });
                
                // 防止点击弹窗内部关闭
                popover.on('click', function(e){ e.stopPropagation(); });

                // --- 联动逻辑 ---
                
                // A. 原生选择器 (Hex) 变化 -> 更新 RGBA
                nativePicker.on('input', function() {
                    currentHex = this.value;
                    updateColor();
                });

                // B. 滑块 (Alpha) 变化 -> 更新 RGBA
                alphaSlider.on('input', function() {
                    currentAlpha = parseFloat(this.value);
                    $(this).attr('title', `透明度: ${Math.round(currentAlpha*100)}%`);
                    updateColor();
                });

                // C. 文本框变化 -> 解析并反向更新控件
                textInput.on('input', function() {
                    const val = $(this).val();
                    // 更新预览
                    previewInner.css('background-color', val);
                    
                    // 尝试更新控件状态
                    const hex = ColorUtils.toHex(val);
                    const alpha = ColorUtils.getAlpha(val);
                    
                    if (hex !== '#000000' || val.includes('000') || val.includes('black')) {
                         nativePicker.val(hex);
                         currentHex = hex;
                    }
                    alphaSlider.val(alpha);
                    currentAlpha = alpha;

                    updateCssContent(block.selector, prop.name, index, val);
                });

                // 统一更新函数
                function updateColor() {
                    const newRgba = ColorUtils.hexAlphaToRgba(currentHex, currentAlpha);
                    
                    // 更新 UI
                    previewInner.css('background-color', newRgba);
                    textInput.val(newRgba);
                    
                    // 更新 CSS
                    updateCssContent(block.selector, prop.name, index, newRgba);
                }

                group.append(previewBtn);
                group.append(popover); // 弹窗放入 group
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
                console.log(extensionName + ": Theme changed detected, refreshing tuner...");
                refreshTuner(true);
            }
        }, 500);
    });
});
