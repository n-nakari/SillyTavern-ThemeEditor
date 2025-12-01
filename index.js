import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;

// 上一次解析的 CSS 内容，避免重复渲染
let lastCssContent = "";

// 颜色匹配正则 (支持 hex, rgb, rgba, hsl, hsla, transparent, 英文名)
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/**
 * 颜色转换工具类
 */
const ColorUtils = {
    // 任意颜色 -> Hex (RRGGBB)
    toHex: (str) => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = str;
        let computed = ctx.fillStyle; 

        if (computed.startsWith('#')) {
            if (computed.length === 7) return computed;
            if (computed.length === 4) return '#' + computed[1] + computed[1] + computed[2] + computed[2] + computed[3] + computed[3];
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

    // 任意颜色 -> Alpha (0-1)
    getAlpha: (str) => {
        // 创建临时元素计算 rgba
        const div = document.createElement('div');
        div.style.color = str;
        document.body.appendChild(div);
        const rgba = window.getComputedStyle(div).color;
        document.body.removeChild(div);
        
        if (rgba.startsWith('rgba')) {
            const parts = rgba.match(/[\d.]+/g);
            return parts && parts.length > 3 ? parseFloat(parts[3]) : 1;
        }
        return 1; // rgb, hex 默认为 1
    },

    // Hex + Alpha -> rgba/hex string
    combine: (hex, alpha) => {
        alpha = parseFloat(alpha);
        if (alpha >= 1) return hex; // 如果不透明，优先返回 Hex
        
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
};

/**
 * 解析CSS字符串
 */
function parseCssColors(cssString) {
    const blocks = [];
    // 捕获 (所有注释)? 选择器 { 内容 }
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
            // 过滤空行，找到倒数第一个包含 /* 的部分
            const cleanParts = commentParts
                .map(c => c.trim())
                .filter(c => c.length > 0 && c.includes('/*')); 
            
            if (cleanParts.length > 0) {
                let lastRaw = cleanParts[cleanParts.length - 1];
                // 移除开头的 /* 和可能的换行
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

    // 1. 顶部工具栏 (CSS框上方)
    const topBar = $(`
        <div class="css-tools-bar">
            <div class="css-tools-search-wrapper">
                <input type="text" id="css-top-search" placeholder="搜索 CSS 代码..." autocomplete="off">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
            <div class="tools-btn-group">
                <div class="tools-btn" id="css-top-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                <!-- 回顶按钮改成选择按钮 -->
                <div class="tools-btn" id="css-scroll-btn" title="滚动跳转">
                    <i class="fa-solid fa-sort"></i>
                    <div class="scroll-menu-dropdown">
                        <div class="scroll-menu-item" id="css-scroll-top">回到顶部</div>
                        <div class="scroll-menu-item" id="css-scroll-bottom">跳到底部</div>
                    </div>
                </div>
            </div>
        </div>
    `);

    // 2. 调色板容器
    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <!-- 按钮组移到左侧 -->
                <div class="tuner-controls">
                    <div class="tools-btn" id="tuner-refresh" title="刷新列表"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="tools-btn" id="tuner-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                    <div class="tools-btn" id="tuner-up" title="回到扩展顶部"><i class="fa-solid fa-arrow-up"></i></div>
                    <div class="tools-btn" id="tuner-collapse" title="折叠/展开"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
                <!-- 删除了 .tuner-title -->
            </div>
            <div class="tuner-sub-header">
                <input type="text" id="tuner-search" placeholder="搜索扩展内容..." autocomplete="off">
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
    // ----------------------
    // 顶部搜索 & 滚动
    // ----------------------
    setupSearch('#css-top-search', '#css-search-results', (idx) => jumpToLine(idx));

    $('#css-top-save, #tuner-save').on('click', saveSettings);

    $('#css-scroll-top').on('click', function(e) {
        e.stopPropagation();
        cssTextArea[0].scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#css-scroll-bottom').on('click', function(e) {
        e.stopPropagation();
        const el = cssTextArea[0];
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });

    // ----------------------
    // 调色板按钮
    // ----------------------
    $('#tuner-refresh').on('click', function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        refreshTuner(true);
        setTimeout(() => icon.removeClass('fa-spin'), 600);
    });

    $('#tuner-up').on('click', function() {
        // 回到扩展容器顶部
        container[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#tuner-collapse').on('click', function() {
        container.toggleClass('tuner-collapsed');
        const icon = $(this).find('i');
        if (container.hasClass('tuner-collapsed')) {
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // ----------------------
    // 扩展内搜索 (带下拉栏)
    // ----------------------
    setupTunerInternalSearch();
}

// 顶部 CSS 搜索逻辑封装
function setupSearch(inputId, resultId, onSelect) {
    const searchInput = $(inputId);
    const resultsContainer = $(resultId);

    searchInput.on('input', function() {
        const query = $(this).val();
        resultsContainer.empty().removeClass('active');
        if (!query) return;

        const text = cssTextArea.val();
        const lines = text.split('\n');
        let count = 0;

        for (let i = 0; i < lines.length; i++) {
            if (count > 50) break;
            const line = lines[i];
            if (line.toLowerCase().includes(query.toLowerCase())) {
                const escapedQuery = escapeRegExp(query);
                const highlightRegex = new RegExp(`(${escapedQuery})`, 'gi');
                const contentHtml = escapeHtml(line.trim()).replace(highlightRegex, '<span class="search-highlight">$1</span>');
                
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-code fa-xs" style="opacity:0.5"></i> ${contentHtml}</div>`);
                item.on('click', () => {
                    onSelect(i);
                    resultsContainer.removeClass('active');
                });
                resultsContainer.append(item);
                count++;
            }
        }
        if (count > 0) setTimeout(() => resultsContainer.addClass('active'), 10);
    });

    // 点击外部关闭
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length && !$(e.target).closest('.tuner-sub-header').length) {
            $('.css-search-dropdown').removeClass('active');
        }
    });
}

// 面板内搜索逻辑 (筛选卡片 + 下拉栏)
function setupTunerInternalSearch() {
    const input = $('#tuner-search');
    const dropdown = $('#tuner-search-results');

    input.on('input', function() {
        const query = $(this).val().toLowerCase();
        
        // 1. 实时筛选卡片显示
        contentArea.find('.tuner-card').each(function() {
            const block = $(this);
            const text = block.text().toLowerCase();
            block.toggle(text.includes(query));
        });

        // 2. 生成下拉提示
        dropdown.empty().removeClass('active');
        if (!query) return;

        const matches = [];
        contentArea.find('.tuner-card:visible').each(function() {
            if (matches.length > 20) return;
            const card = $(this);
            // 获取标题文本
            const title = card.find('.tuner-card-header').text().trim();
            matches.push({ el: card, text: title });
        });

        if (matches.length > 0) {
            matches.forEach(m => {
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-palette fa-xs" style="opacity:0.5"></i> ${escapeHtml(m.text)}</div>`);
                item.on('click', () => {
                    m.el[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 稍微闪烁一下以提示
                    m.el.css('border-color', 'var(--tuner-accent)');
                    setTimeout(() => m.el.css('border-color', ''), 1000);
                    dropdown.removeClass('active');
                });
                dropdown.append(item);
            });
            setTimeout(() => dropdown.addClass('active'), 10);
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
    const avgLineHeight = el.scrollHeight / (totalLines || 1);
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

// 渲染 DOM
function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色</div>');
        return;
    }

    blocks.forEach(block => {
        // 标题格式化：注释 | 类名
        let titleText = block.selector;
        if (block.comment) {
            titleText = `${block.comment} | ${block.selector}`;
        }

        const blockEl = $(`<div class="tuner-card">
            <div class="tuner-card-header">${escapeHtml(titleText)}</div>
        </div>`);

        block.properties.forEach(prop => {
            const row = $(`<div class="tuner-prop-row">
                <div class="tuner-prop-name">${escapeHtml(prop.name)}</div>
                <div class="tuner-inputs-container"></div>
            </div>`);

            const inputsContainer = row.find('.tuner-inputs-container');

            prop.colors.forEach((colorObj, index) => {
                const originalVal = colorObj.value;
                
                // 计算初始值
                const hexVal = ColorUtils.toHex(originalVal);
                const alphaVal = ColorUtils.getAlpha(originalVal);

                const group = $(`<div class="tuner-input-group"></div>`);
                
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // 1. 颜色选择器 (控制 RGB)
                const picker = $(`<input type="color" class="tuner-picker" value="${hexVal}" title="选择基色 (Hex)">`);
                
                // 2. 透明度滑块 (控制 Alpha)
                const slider = $(`<input type="range" class="tuner-alpha-slider" min="0" max="1" step="0.01" value="${alphaVal}" title="透明度: ${alphaVal}">`);

                // 3. 文本框 (显示最终结果)
                const textInput = $(`<input type="text" class="tuner-text" value="${originalVal}" title="输入颜色值">`);

                // 初始化背景预览
                try { picker.css('background-color', originalVal); } catch(e) {}

                // --- 交互逻辑 ---

                // Helper: 更新所有状态
                const updateAll = (h, a) => {
                    const newVal = ColorUtils.combine(h, a);
                    // 更新文本框
                    textInput.val(newVal);
                    // 更新 Picker 背景预览
                    picker.css('background-color', newVal);
                    // 更新 Slider title
                    slider.attr('title', `透明度: ${a}`);
                    // 更新 CSS 源码
                    updateCssContent(block.selector, prop.name, index, newVal);
                };

                // Picker 变动 -> 更新 RGB
                picker.on('input', function() {
                    updateAll(this.value, slider.val());
                });

                // Slider 变动 -> 更新 Alpha
                slider.on('input', function() {
                    updateAll(picker.val(), this.value);
                });

                // 文本框变动 -> 反向解析
                textInput.on('input', function() {
                    const val = $(this).val();
                    const newHex = ColorUtils.toHex(val);
                    const newAlpha = ColorUtils.getAlpha(val);
                    
                    picker.val(newHex);
                    slider.val(newAlpha);
                    try { picker.css('background-color', val); } catch(e) {}
                    
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
