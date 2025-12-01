import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;
let bodyWrapper = null;
let lastCssContent = "";

// 颜色匹配正则
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/**
 * 核心工具：解析颜色，返回 { hex, alpha }
 * 用于将 rgba(0,0,0,0.5) 解析为 hex=#000000, alpha=0.5
 */
function getHexAndAlpha(str) {
    const ctx = document.createElement('canvas').getContext('2d');
    
    // 1. 处理 transparent 特例
    if (str === 'transparent') {
        return { hex: '#000000', alpha: 0 };
    }

    ctx.fillStyle = str;
    let computed = ctx.fillStyle; 

    let hex = '#000000';
    let alpha = 1;

    // 解析浏览器计算出的颜色
    if (computed.startsWith('#')) {
        // Hex 格式 (#rrggbb)
        if (computed.length === 7) {
            hex = computed;
        } else if (computed.length === 9) {
            // Hex8 (#rrggbbaa) - 虽然 canvas fillStyle 通常不返回这个，但以防万一
            hex = computed.substring(0, 7);
            const aVal = parseInt(computed.substring(7), 16);
            alpha = parseFloat((aVal / 255).toFixed(2));
        } else if (computed.length === 4) {
             hex = '#' + computed[1] + computed[1] + computed[2] + computed[2] + computed[3] + computed[3];
        }
    } else if (computed.startsWith('rgba')) {
        // rgba(r, g, b, a)
        const parts = computed.match(/[\d.]+/g);
        if (parts && parts.length >= 4) {
            const r = parseInt(parts[0]).toString(16).padStart(2, '0');
            const g = parseInt(parts[1]).toString(16).padStart(2, '0');
            const b = parseInt(parts[2]).toString(16).padStart(2, '0');
            hex = `#${r}${g}${b}`;
            alpha = parseFloat(parts[3]);
        }
    } else if (computed.startsWith('rgb')) {
        // rgb(r, g, b)
        const parts = computed.match(/[\d.]+/g);
        if (parts && parts.length >= 3) {
            const r = parseInt(parts[0]).toString(16).padStart(2, '0');
            const g = parseInt(parts[1]).toString(16).padStart(2, '0');
            const b = parseInt(parts[2]).toString(16).padStart(2, '0');
            hex = `#${r}${g}${b}`;
        }
    }

    return { hex, alpha };
}

/**
 * 辅助：将 hex + alpha 合并为 rgba 字符串
 */
function hexToRgba(hex, alpha) {
    if (alpha == 0) return 'transparent'; // 可选：如果你想显示 transparent 字样
    
    // 也可以是 rgba(0,0,0,0)
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    
    if (alpha >= 1) {
        return hex; // 不透明直接返回 Hex
    }
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    if ($('.css-tuner-container').length > 0) return;

    // 顶部工具栏
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

    // 调色板容器 (修改了header布局，增加了body-wrapper)
    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-controls">
                    <div class="tools-btn" id="tuner-refresh" title="刷新列表"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="tools-btn" id="tuner-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                    <div class="tools-btn" id="tuner-scroll-toggle" title="滚动到底部/顶部"><i class="fa-solid fa-arrow-down"></i></div>
                    <div class="tools-btn" id="tuner-collapse" title="折叠"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
            </div>
            <div class="tuner-body-wrapper" id="tuner-body-wrapper">
                <div class="tuner-sub-header">
                    <input type="text" id="tuner-search" placeholder="搜索类名、属性或注释..." autocomplete="off">
                    <div class="css-search-dropdown" id="tuner-search-dropdown"></div>
                </div>
                <div class="tuner-content" id="tuner-content-area"></div>
            </div>
        </div>
    `);

    const textAreaBlock = $('#CustomCSS-textAreaBlock');
    topBar.insertBefore(textAreaBlock);
    container.insertAfter(textAreaBlock);
    
    contentArea = $('#tuner-content-area');
    bodyWrapper = $('#tuner-body-wrapper');
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
    const topSearchInput = $('#css-top-search');
    const topResults = $('#css-search-results');

    // 1. 顶部搜索逻辑
    topSearchInput.on('input', function() {
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
                const escapedQuery = escapeRegExp(query);
                const highlightRegex = new RegExp(`(${escapedQuery})`, 'gi');
                const highlightedContent = escapeHtml(res.content).replace(highlightRegex, '<span class="search-highlight">$1</span>');
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-code fa-xs" style="opacity:0.5"></i> ${highlightedContent}</div>`);
                item.on('click', () => {
                    jumpToLine(res.lineIndex);
                    topResults.removeClass('active');
                });
                topResults.append(item);
            });
            setTimeout(() => topResults.addClass('active'), 10);
        }
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            topResults.removeClass('active');
        }
        if (!$(e.target).closest('.tuner-sub-header').length) {
            $('#tuner-search-dropdown').removeClass('active');
        }
    });

    // 2. 按钮事件
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

    // 双向滚动按钮
    $('#tuner-scroll-toggle').on('click', function() {
        const el = contentArea[0];
        const icon = $(this).find('i');
        
        // 简单判断：如果离顶部很近，就去底部；否则去顶部
        if (el.scrollTop < 50) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            // 下次点击变成向上
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else {
            el.scrollTo({ top: 0, behavior: 'smooth' });
            // 下次点击变成向下
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
        }
    });

    // 监听滚动来动态更新箭头图标
    contentArea.on('scroll', function() {
        const el = this;
        const btnIcon = $('#tuner-scroll-toggle i');
        // 接近底部时显示向上，接近顶部时显示向下
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
             btnIcon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else if (el.scrollTop < 50) {
             btnIcon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
        }
    });

    $('#tuner-collapse').on('click', function() {
        bodyWrapper.toggleClass('collapsed');
        const icon = $(this).find('i');
        if (bodyWrapper.hasClass('collapsed')) {
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // 3. 扩展面板内搜索（带下拉）
    const tunerSearchInput = $('#tuner-search');
    const tunerDropdown = $('#tuner-search-dropdown');

    tunerSearchInput.on('input', function() {
        const query = $(this).val().toLowerCase();
        tunerDropdown.empty().removeClass('active');

        // 同时进行过滤和生成下拉列表
        const cards = contentArea.find('.tuner-card');
        const matches = [];

        cards.each(function() {
            const block = $(this);
            const text = block.find('.tuner-card-header').text().toLowerCase();
            const props = block.find('.tuner-prop-name').text().toLowerCase();
            
            // 过滤显示
            if (text.includes(query) || props.includes(query)) {
                block.show();
                if (query.length > 0) {
                    // 添加到下拉列表 (只添加前20个防止卡顿)
                    if (matches.length < 20) {
                        // 提取纯文本标题用于列表展示
                        const cleanTitle = block.find('.tuner-card-header').text().replace(/\s+/g, ' ').trim();
                        matches.push({ el: block, title: cleanTitle });
                    }
                }
            } else {
                block.hide();
            }
        });

        // 渲染下拉
        if (matches.length > 0) {
            matches.forEach(m => {
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-palette fa-xs" style="opacity:0.5"></i> ${escapeHtml(m.title)}</div>`);
                item.on('click', () => {
                    // 滚动到该卡片
                    m.el[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 高亮一下
                    m.el.css('transition', '0.2s').css('transform', 'scale(1.02)');
                    setTimeout(() => m.el.css('transform', 'scale(1)'), 200);
                    tunerDropdown.removeClass('active');
                });
                tunerDropdown.append(item);
            });
            setTimeout(() => tunerDropdown.addClass('active'), 10);
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
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色<br><small>仅读取标准属性中的颜色值</small></div>');
        return;
    }

    blocks.forEach(block => {
        // 标题格式： "注释 | .selector"
        let titleHtml = '';
        if (block.comment) {
            titleHtml = `<span class="tuner-comment-part">${escapeHtml(block.comment)}</span> <span class="tuner-selector-part">| ${escapeHtml(block.selector)}</span>`;
        } else {
            titleHtml = `<span class="tuner-comment-part">${escapeHtml(block.selector)}</span>`;
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
                
                // 1. 解析初始颜色和透明度
                const { hex, alpha } = getHexAndAlpha(colorVal);

                const group = $(`<div class="tuner-input-group"></div>`);
                
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // 2. 创建组件
                const picker = $(`<input type="color" class="tuner-picker" value="${hex}" title="选择基色">`);
                const alphaSlider = $(`<input type="range" class="tuner-alpha-slider" min="0" max="1" step="0.01" value="${alpha}" title="调整透明度">`);
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="最终颜色值">`);

                // 初始化背景色
                try { picker.css('background-color', colorVal); } catch(e) {}

                // 3. 联动逻辑
                
                // A. 颜色选择器变动 -> 更新文本框 (保持当前透明度)
                picker.on('input', function() {
                    const currentHex = this.value;
                    const currentAlpha = alphaSlider.val();
                    const newRgba = hexToRgba(currentHex, currentAlpha);
                    
                    textInput.val(newRgba).trigger('input');
                    $(this).css('background-color', currentHex); // 视觉反馈
                });

                // B. 透明度滑条变动 -> 更新文本框 (保持当前基色)
                alphaSlider.on('input', function() {
                    const currentHex = picker.val();
                    const currentAlpha = this.value;
                    const newRgba = hexToRgba(currentHex, currentAlpha);
                    
                    textInput.val(newRgba).trigger('input');
                });

                // C. 文本框手动输入 -> 解析并更新 Picker 和 Slider
                textInput.on('input', function() {
                    const newValue = $(this).val();
                    const parsed = getHexAndAlpha(newValue);
                    
                    // 更新控件状态
                    picker.val(parsed.hex);
                    alphaSlider.val(parsed.alpha);
                    
                    // 更新 Picker 视觉背景
                    try { picker.css('background-color', newValue); } catch(e) {}
                    
                    // 保存到 CSS
                    updateCssContent(block.selector, prop.name, index, newValue);
                });

                group.append(picker);
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
    
    // 寻找块
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
