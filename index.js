import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;
let tunerBody = null; // 新增：用于折叠的包裹层

// 上一次解析的 CSS 内容哈希或长度
let lastCssContent = "";

// 颜色匹配正则
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

// 缓存解析后的块
let currentParsedBlocks = [];

// 滚动按钮状态 (top 或 bottom)
let scrollDirection = 'bottom'; 

/**
 * 解析CSS字符串
 * 逻辑：如果有多个注释块，只取紧邻选择器的最后一个，并去除所有标点符号
 */
function parseCssColors(cssString) {
    const blocks = [];
    // 匹配规则： (可选的注释块) (选择器) { (内容) }
    // 注释块可能包含多个 /* ... */
    const ruleRegex = /(?:((?:\/\*[\s\S]*?\*\/[\s\r\n]*)+))?([^{}]+)\{([^}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const rawCommentBlock = match[1]; // 获取整个注释区域
        const selector = match[2].trim();
        const content = match[3];
        
        let finalComment = "";
        
        if (rawCommentBlock) {
            // 提取所有独立的注释 /* ... */
            const comments = rawCommentBlock.match(/\/\*[\s\S]*?\*\//g);
            
            if (comments && comments.length > 0) {
                // 只取最后一个注释 (紧邻选择器)
                let lastComment = comments[comments.length - 1];
                
                // 1. 去除首尾的 /* 和 */
                let innerText = lastComment.replace(/^\/\*|\*\/$/g, '').trim();
                
                // 2. 去除所有标点符号 (保留中文、英文、数字、空格)
                // 这里的正则涵盖了常见的中文和英文标点符号
                let cleanText = innerText.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~，。！？；：“”‘’（）【】《》、]/g, '');
                
                finalComment = cleanText.trim();
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

    // 1. 顶部工具栏
    const topBar = $(`
        <div class="css-tools-bar">
            <div class="css-tools-search-wrapper">
                <input type="text" id="css-top-search" placeholder="搜索 CSS 代码..." autocomplete="off">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
            <div class="tools-btn-group">
                <div class="tools-btn" id="css-top-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                <div class="tools-btn" id="css-top-scroll" title="滚动到底部/顶部"><i class="fa-solid fa-arrow-down"></i></div>
            </div>
        </div>
    `);

    // 2. 调色板容器
    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-controls">
                    <div class="tools-btn" id="tuner-refresh" title="刷新列表"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="tools-btn" id="tuner-save" title="保存并更新"><i class="fa-solid fa-save"></i></div>
                    <div class="tools-btn" id="tuner-up" title="回到顶部"><i class="fa-solid fa-arrow-up"></i></div>
                    <div class="tools-btn" id="tuner-collapse" title="折叠/展开"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
            </div>
            
            <div class="tuner-body">
                <div class="tuner-sub-header">
                    <input type="text" id="tuner-search" placeholder="搜索类名、属性或注释..." autocomplete="off">
                    <div class="css-search-dropdown" id="tuner-search-results"></div>
                </div>
                <div class="tuner-content" id="tuner-content-area"></div>
            </div>
        </div>
    `);

    const textAreaBlock = $('#CustomCSS-textAreaBlock');
    topBar.insertBefore(textAreaBlock);
    container.insertAfter(textAreaBlock);
    
    contentArea = $('#tuner-content-area');
    tunerBody = container.find('.tuner-body');
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
    const topResultsContainer = $('#css-search-results');

    // CSS代码搜索
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

    const tunerSearchInput = $('#tuner-search');
    const tunerResultsContainer = $('#tuner-search-results');

    // 内部搜索
    tunerSearchInput.on('input', function() {
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

        tunerResultsContainer.empty().removeClass('active');
        if (!query) return;

        const results = currentParsedBlocks.filter(b => 
            (b.comment && b.comment.toLowerCase().includes(query)) || 
            (b.selector && b.selector.toLowerCase().includes(query))
        ).slice(0, 15); 

        if (results.length > 0) {
            results.forEach(block => {
                let displayText = block.selector;
                if (block.comment) {
                    displayText = `${block.comment} | ${block.selector}`;
                }

                const escapedQuery = escapeRegExp(query);
                const highlightRegex = new RegExp(`(${escapedQuery})`, 'gi');
                const highlightedContent = escapeHtml(displayText).replace(highlightRegex, '<span class="search-highlight">$1</span>');

                const item = $(`<div class="css-search-item">${highlightedContent}</div>`);
                item.on('click', () => {
                    const targetCard = $(`#${block.id}`);
                    if (targetCard.length) {
                        targetCard.show(); 
                        contentArea[0].scrollTo({
                            top: targetCard[0].offsetTop - contentArea[0].offsetTop - 10,
                            behavior: 'smooth'
                        });
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

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            topResultsContainer.removeClass('active');
        }
        if (!$(e.target).closest('.tuner-sub-header').length) {
            tunerResultsContainer.removeClass('active');
        }
    });

    $('#css-top-save, #tuner-save').on('click', saveSettings);
    
    // CSS框 滚动到底部/顶部
    $('#css-top-scroll').on('click', function() {
        const el = cssTextArea[0];
        const icon = $(this).find('i');
        
        if (scrollDirection === 'bottom') {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
            scrollDirection = 'top';
            $(this).attr('title', '回到顶部');
        } else {
            el.scrollTo({ top: 0, behavior: 'smooth' });
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
            scrollDirection = 'bottom';
            $(this).attr('title', '滚动到底部');
        }
    });

    $('#tuner-refresh').on('click', function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        refreshTuner(true);
        setTimeout(() => icon.removeClass('fa-spin'), 600);
    });

    $('#tuner-up').on('click', () => contentArea[0].scrollTo({ top: 0, behavior: 'smooth' }));

    // 折叠逻辑
    $('#tuner-collapse').on('click', function() {
        tunerBody.toggleClass('collapsed');
        const icon = $(this).find('i');
        if (tunerBody.hasClass('collapsed')) {
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
    const avgLineHeight = el.scrollHeight / lines.length || 20;
    el.scrollTo({ top: lineIndex * avgLineHeight, behavior: 'smooth' });
}

function refreshTuner(force = false) {
    if (!cssTextArea || !cssTextArea.length) cssTextArea = $('#customCSS');
    const cssText = cssTextArea.val();
    if (!force && cssText === lastCssContent) return;
    
    lastCssContent = cssText;
    currentParsedBlocks = parseCssColors(cssText);
    renderTunerBlocks(currentParsedBlocks);
}

/**
 * 渲染 Tuner 块的核心逻辑
 * 格式：[注释] | 选择器
 */
function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色</div>');
        return;
    }

    blocks.forEach(block => {
        // --- 标题渲染: [注释] | 选择器 ---
        let titleHtml = '';
        if (block.comment) {
            // 注意：tuner-comment-tag 是代码风格的标签
            titleHtml = `
                <code class="tuner-comment-tag">${escapeHtml(block.comment)}</code>
                <span class="tuner-header-divider">|</span>
                <span class="tuner-header-selector">${escapeHtml(block.selector)}</span>
            `;
        } else {
            // 没有注释则只显示选择器
            titleHtml = `<span class="tuner-header-selector">${escapeHtml(block.selector)}</span>`;
        }

        const blockEl = $(`<div class="tuner-card" id="${block.id}">
            <div class="tuner-card-header">${titleHtml}</div>
        </div>`);

        block.properties.forEach(prop => {
            // 属性名作为副标题
            const row = $(`<div class="tuner-prop-row">
                <div class="tuner-prop-name">${escapeHtml(prop.name)}</div>
                <div class="tuner-inputs-container"></div>
            </div>`);

            const inputsContainer = row.find('.tuner-inputs-container');

            prop.colors.forEach((colorObj, index) => {
                const colorVal = colorObj.value;

                const group = $(`<div class="tuner-input-group"></div>`);
                
                if (prop.colors.length > 1) {
                    group.append(`<span class="tuner-color-idx">${index + 1}</span>`);
                }

                // 创建 toolcool-color-picker 元素
                const toolcoolPicker = $('<toolcool-color-picker></toolcool-color-picker>')
                    .addClass('tuner-toolcool')
                    .attr({
                        color: colorVal,
                    });

                // 创建同步显示的文本框
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}" title="颜色值">`);

                // 1. 监听 Picker 变化 -> 更新文本框 & 更新 CSS
                toolcoolPicker.on('change', (evt) => {
                    const newColor = evt.detail.rgba; // 使用 rgba 格式，兼容透明度
                    textInput.val(newColor);
                    updateCssContent(block.selector, prop.name, index, newColor);
                });

                // 2. 监听 文本框 变化 -> 更新 Picker 颜色 & 更新 CSS
                textInput.on('change', function() {
                    const val = $(this).val();
                    toolcoolPicker.attr('color', val); // toolcool 会自动解析合法颜色字符串
                    // 只有当颜色合法时才更新CSS，这里依赖 toolcool 的内部解析，或者直接写入
                    updateCssContent(block.selector, prop.name, index, val);
                });

                group.append(toolcoolPicker);
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
    
    // 重新构造正则以匹配对应的块
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
