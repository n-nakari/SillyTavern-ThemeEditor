import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;
let tunerBody = null;

// 上一次解析的 CSS 内容
let lastCssContent = "";
let currentParsedBlocks = [];
let scrollDirection = 'bottom'; 

// 颜色匹配正则 (保持不变，支持多种格式)
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/**
 * 核心工具：将任意 CSS 颜色解析为 RGBA 对象
 */
function getColorRgba(str) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.clearRect(0,0,1,1);
    ctx.fillStyle = str;
    // 获取计算后的值 (canvas会转为 hex 或 rgba)
    const computed = ctx.fillStyle;

    let r = 0, g = 0, b = 0, a = 1;

    // 解析 Canvas 返回的颜色格式
    if (computed.startsWith('#')) {
        let hex = computed;
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
    
    // 生成6位Hex供原生取色器使用
    const toHex = (c) => c.toString(16).padStart(2, '0');
    const hexFull = `#${toHex(r)}${toHex(g)}${toHex(b)}`;

    return { r, g, b, a, hex: hexFull };
}

function toRgbaString(r, g, b, a) {
    // 限制小数位，避免过长
    const alpha = Math.round(a * 100) / 100;
    if (alpha === 1) {
        // 如果是1，也可以输出 rgb，但为了统一这里输出 rgba 或者 hex 都可以
        // 这里根据需求输出 rgba 以便统一格式
        return `rgba(${r}, ${g}, ${b}, 1)`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 解析CSS字符串
 * 修改点：严格处理注释，只取最后一个，去除标点
 */
function parseCssColors(cssString) {
    const blocks = [];
    // 正则：捕获前面的所有注释块(group 1) 和 选择器(group 2) 和 内容(group 3)
    const ruleRegex = /(?:((?:\/\*[\s\S]*?\*\/[\s\r\n]*)+))?([^{}]+)\{([^}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const rawComments = match[1];
        const selector = match[2].trim();
        const content = match[3];
        
        let finalComment = "";
        
        if (rawComments) {
            // 1. 以 */ 分割，因为可能有多个注释块连在一起
            // 例子: /* A */ \n /* B */ -> ["/* A ", " \n /* B ", ""]
            const commentParts = rawComments.split('*/');
            
            // 2. 过滤掉空字符串，只留有内容的
            const validParts = commentParts.filter(p => p.trim().length > 0);
            
            if (validParts.length > 0) {
                // 3. 只取最后一个（紧挨着选择器的那个）
                let lastRaw = validParts[validParts.length - 1];
                
                // 4. 去掉开头的 /* 和任何空白
                let cleanContent = lastRaw.replace(/^\s*\/\*/, '').trim();
                
                // 5. 去除标点符号 (保留空格、文字、数字、下划线、中文)
                // 使用排除法：把所有标点替换为空
                // 常见的标点: ! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~
                // 以及中文标点
                finalComment = cleanContent.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~，。！？；：“”‘’（）【】《》、]/g, '');
                
                finalComment = finalComment.trim();
            }
        }
        
        const properties = [];
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2].trim();
            
            if (propName.startsWith('--')) continue; // 暂不处理变量定义
            
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
                    <input type="text" id="tuner-search" placeholder="搜索..." autocomplete="off">
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
    // ... 原有的搜索逻辑保持不变 ...
    const topSearchInput = $('#css-top-search');
    const topResultsContainer = $('#css-search-results');
    topSearchInput.on('input', function() {
        // (保持原有的代码搜索逻辑，略微省略以节省篇幅，逻辑未变)
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
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-code fa-xs"></i> ${escapeHtml(res.content)}</div>`);
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

    tunerSearchInput.on('input', function() {
        const query = $(this).val().toLowerCase();
        
        // 实时过滤卡片
        contentArea.find('.tuner-card').each(function() {
            const block = $(this);
            const text = block.text().toLowerCase();
            if (text.includes(query)) block.show();
            else block.hide();
        });

        tunerResultsContainer.empty().removeClass('active');
        if (!query) return;

        const results = currentParsedBlocks.filter(b => 
            (b.comment && b.comment.toLowerCase().includes(query)) || 
            (b.selector && b.selector.toLowerCase().includes(query))
        ).slice(0, 10); 

        if (results.length > 0) {
            results.forEach(block => {
                let displayText = block.selector;
                if (block.comment) displayText = `${block.comment} | ${block.selector}`;
                const item = $(`<div class="css-search-item">${escapeHtml(displayText)}</div>`);
                item.on('click', () => {
                    const targetCard = $(`#${block.id}`);
                    if (targetCard.length) {
                        targetCard.show(); 
                        contentArea[0].scrollTo({
                            top: targetCard[0].offsetTop - contentArea[0].offsetTop - 10,
                            behavior: 'smooth'
                        });
                        // 高亮闪烁一下
                        targetCard.css('transition', 'box-shadow 0.2s').css('box-shadow', '0 0 15px var(--tuner-accent)');
                        setTimeout(() => targetCard.css('box-shadow', ''), 600);
                    }
                    tunerResultsContainer.removeClass('active');
                });
                tunerResultsContainer.append(item);
            });
            setTimeout(() => tunerResultsContainer.addClass('active'), 10);
        }
    });

    // 点击外部关闭搜索下拉
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            topResultsContainer.removeClass('active');
        }
        if (!$(e.target).closest('.tuner-sub-header').length) {
            tunerResultsContainer.removeClass('active');
        }
    });

    $('#css-top-save, #tuner-save').on('click', saveSettings);
    
    $('#css-top-scroll').on('click', function() {
        const el = cssTextArea[0];
        const icon = $(this).find('i');
        if (scrollDirection === 'bottom') {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
            scrollDirection = 'top';
        } else {
            el.scrollTo({ top: 0, behavior: 'smooth' });
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
            scrollDirection = 'bottom';
        }
    });

    $('#tuner-refresh').on('click', function() {
        const icon = $(this).find('i');
        icon.addClass('fa-spin');
        refreshTuner(true);
        setTimeout(() => icon.removeClass('fa-spin'), 600);
    });

    $('#tuner-up').on('click', () => contentArea[0].scrollTo({ top: 0, behavior: 'smooth' }));

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

// 核心：渲染块 (修改为新的RGBA UI)
function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub); opacity:0.7;">未检测到可编辑颜色</div>');
        return;
    }

    blocks.forEach(block => {
        // --- 标题格式化：注释 | 选择器 ---
        let titleHtml = '';
        if (block.comment) {
            titleHtml = `<span class="tuner-comment-text">${escapeHtml(block.comment)}</span><span style="opacity:0.3; margin: 0 8px;">|</span><span class="tuner-header-selector">${escapeHtml(block.selector)}</span>`;
        } else {
            titleHtml = `<span class="tuner-header-selector" style="opacity:1">${escapeHtml(block.selector)}</span>`;
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
                const rgba = getColorRgba(colorVal); // {r,g,b,a, hex}

                // 1. 组容器
                const group = $(`<div class="tuner-input-group"></div>`);
                
                // 2. 颜色预览球 + 原生取色器 (隐藏覆盖)
                const previewWrapper = $(`<div class="tuner-preview-wrapper"></div>`);
                const previewColor = $(`<div class="tuner-color-preview" style="background-color: ${colorVal}"></div>`);
                const nativePicker = $(`<input type="color" class="tuner-native-picker" value="${rgba.hex}">`);
                
                previewWrapper.append(previewColor).append(nativePicker);
                
                // 3. 吸管按钮 (如果支持)
                const eyeDropperBtn = $(`<div class="tuner-eye-dropper" title="吸管"><i class="fa-solid fa-eye-dropper"></i></div>`);
                
                // 4. RGBA 四个输入框
                const rgbaContainer = $(`<div class="tuner-rgba-inputs"></div>`);
                
                const createBox = (cls, val, label) => `
                    <div class="tuner-rgba-box">
                        <input type="number" class="rgba-val ${cls}" value="${val}" min="${label==='A'?0:0}" max="${label==='A'?1:255}" step="${label==='A'?0.01:1}">
                        <span class="tuner-rgba-label">${label}</span>
                    </div>`;

                const inputR = $(createBox('r-val', rgba.r, 'R'));
                const inputG = $(createBox('g-val', rgba.g, 'G'));
                const inputB = $(createBox('b-val', rgba.b, 'B'));
                const inputA = $(createBox('a-val', rgba.a, 'A'));

                rgbaContainer.append(inputR, inputG, inputB, inputA);

                // --- 事件绑定 ---

                // 更新函数：根据当前输入框的值更新CSS
                const updateAll = () => {
                    const r = parseInt(inputR.find('input').val()) || 0;
                    const g = parseInt(inputG.find('input').val()) || 0;
                    const b = parseInt(inputB.find('input').val()) || 0;
                    let a = parseFloat(inputA.find('input').val());
                    if (isNaN(a)) a = 1;
                    
                    const newColorStr = toRgbaString(r, g, b, a);
                    
                    // 更新预览颜色
                    previewColor.css('background-color', newColorStr);
                    
                    // 只有当Alpha为1时，原生取色器才能完全同步（因为它不支持Alpha）
                    // 但我们还是尽量同步RGB部分
                    const toHex = (c) => c.toString(16).padStart(2, '0');
                    nativePicker.val(`#${toHex(r)}${toHex(g)}${toHex(b)}`);

                    updateCssContent(block.selector, prop.name, index, newColorStr);
                };

                // 原生取色器变更 -> 更新 R, G, B (不改变 A)
                nativePicker.on('input', function() {
                    const hex = this.value; // #RRGGBB
                    const r = parseInt(hex.substr(1,2), 16);
                    const g = parseInt(hex.substr(3,2), 16);
                    const b = parseInt(hex.substr(5,2), 16);
                    
                    inputR.find('input').val(r);
                    inputG.find('input').val(g);
                    inputB.find('input').val(b);
                    
                    updateAll();
                });

                // RGBA 输入框变更
                rgbaContainer.find('input').on('input', updateAll);

                // 吸管点击
                eyeDropperBtn.on('click', () => {
                    if (!window.EyeDropper) {
                        toastr.warning("您的浏览器不支持原生吸管工具", "CSS Tuner");
                        return;
                    }
                    const ed = new EyeDropper();
                    ed.open().then(result => {
                        const sRGBHex = result.sRGBHex;
                        const parsed = getColorRgba(sRGBHex);
                        
                        inputR.find('input').val(parsed.r);
                        inputG.find('input').val(parsed.g);
                        inputB.find('input').val(parsed.b);
                        // 吸管通常吸取不带透明度的屏幕颜色，这里保持原有透明度还是重置为1？
                        // 通常吸取屏幕颜色 alpha 都是 1
                        inputA.find('input').val(1);
                        
                        updateAll();
                    }).catch(e => {
                        console.log(e);
                    });
                });

                group.append(previewWrapper);
                group.append(rgbaContainer);
                group.append(eyeDropperBtn); // 放在最后或中间看喜好
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
    
    // 重新定位块，确保正则没问题
    const blockRegex = new RegExp(`(?:(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)+)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    // 这里其实有瑕疵，如果同一个selector出现多次。
    // 但在这个简单工具里，我们假设它匹配第一个找到的。
    // 如果想更严谨，需要记录在 parseCssColors 里的 index 位置。
    
    // 为了简单且不破坏原逻辑太多，我们遍历匹配
    let match;
    let newCss = originalCss;
    
    // 简单的替换策略：找到所有匹配块，替换其中的属性
    // 实际上应该用唯一的ID或位置来替换，但JS正则替换特定位置比较麻烦。
    // 既然我们只是替换颜色，我们可以尝试用更精确的替换。
    
    // 方案：利用 parseCssColors 阶段其实可以记录 start/end index。
    // 现在的方案是重新正则查找，对于简单的CSS文件通常没问题。
    
    const propRegex = new RegExp(`(${propName})\\s*:\\s*([^;]+);`, 'g');
    
    // 我们只处理第一个匹配到的选择器块 (简单起见)
    match = blockRegex.exec(originalCss);
    if (match) {
        const fullBlockMatch = match[0]; // 整个块包括注释
        const blockContent = match[2];   // 花括号内的内容
        
        // 在 blockContent 中查找属性
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
        newCss = originalCss.replace(fullBlockMatch, newFullBlock);
        
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
