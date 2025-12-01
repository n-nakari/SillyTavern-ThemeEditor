import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;

// 颜色匹配正则
// 匹配: #hex, rgb(), rgba(), hsl(), hsla(), transparent, 以及常见的颜色英文名
const colorRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)/gi;

/**
 * 核心功能：解析CSS字符串
 * 返回结构: Array of Objects
 * {
 *   selector: ".class",
 *   comment: "注释",
 *   fullBlock: "完整CSS块",
 *   properties: [
 *     { prop: "background", colors: [ { value: "#fff", index: 12 }, ... ] }
 *   ]
 * }
 */
function parseCssColors(cssString) {
    const blocks = [];
    // 移除所有换行符以便正则匹配，但要小心行号定位（这里为了简化逻辑，后续更新使用全文替换）
    // 为了更准确，我们按 `}` 分割，然后向前查找 `{`
    
    // 正则策略：
    // 1. 查找注释(可选) + 选择器 + { 内容 }
    const ruleRegex = /(?:\/\*([\s\S]*?)\*\/[\s\r\n]*)?([^{]+)\{([^}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const comment = match[1] ? match[1].trim() : "";
        const selector = match[2].trim();
        const content = match[3];
        const fullBlock = match[0];
        
        // 解析属性
        const properties = [];
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2];
            
            // 在属性值中查找颜色
            const colors = [];
            let colorMatch;
            // 重置正则索引
            colorRegex.lastIndex = 0;
            
            while ((colorMatch = colorRegex.exec(propValue)) !== null) {
                colors.push({
                    value: colorMatch[0],
                    // 注意：这个index是相对于propValue的
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
                comment,
                properties
            });
        }
    }
    
    return blocks;
}

// UI 构建函数
function createTunerUI() {
    // 1. CSS框上方工具栏
    const topBar = $(`
        <div class="css-tools-bar">
            <div class="css-tools-search-wrapper">
                <input type="text" class="text_pole textarea_compact width100p" placeholder="搜索 CSS 内容..." id="css-top-search">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
            <div class="menu_button menu_button_icon" id="css-top-save" title="保存 CSS"><i class="fa-solid fa-save"></i></div>
            <div class="menu_button menu_button_icon" id="css-top-up" title="回到顶部"><i class="fa-solid fa-arrow-up"></i></div>
        </div>
    `);

    // 2. 调色板主容器
    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-title"><i class="fa-solid fa-palette"></i> 调色板</div>
                <div class="tuner-controls">
                    <div class="menu_button menu_button_icon" id="tuner-refresh" title="刷新"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="menu_button menu_button_icon" id="tuner-save" title="保存"><i class="fa-solid fa-save"></i></div>
                    <div class="menu_button menu_button_icon" id="tuner-up" title="扩展回顶"><i class="fa-solid fa-arrow-up"></i></div>
                    <div class="menu_button menu_button_icon" id="tuner-collapse" title="折叠/展开"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
            </div>
            <div class="tuner-sub-header">
                <input type="text" class="text_pole textarea_compact width100p" placeholder="搜索调色板 (类名/注释)..." id="tuner-search">
            </div>
            <div class="tuner-content" id="tuner-content-area">
                <!-- 动态生成内容 -->
            </div>
        </div>
    `);

    // 插入到 DOM
    // 找到 "Custom CSS" 标题和 textarea
    const textAreaBlock = $('#CustomCSS-textAreaBlock');
    const cssTitle = textAreaBlock.prev('h4'); // 假设 h4 在 textareaBlock 之前

    topBar.insertBefore(textAreaBlock);
    container.insertAfter(textAreaBlock);
    
    contentArea = $('#tuner-content-area');
    cssTextArea = $('#customCSS');

    bindEvents();
}

// 绑定所有事件
function bindEvents() {
    // ---------------- CSS框上方功能 ----------------
    
    // 1. 搜索 CSS 内容
    $('#css-top-search').on('input', function() {
        const query = $(this).val().toLowerCase();
        const resultsContainer = $('#css-search-results');
        resultsContainer.empty().hide();
        
        if (!query) return;

        const text = cssTextArea.val();
        const lines = text.split('\n');
        const results = [];

        lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query)) {
                results.push({ lineIndex: index, content: line.trim() });
            }
        });

        if (results.length > 0) {
            results.forEach(res => {
                const item = $(`<div class="css-search-item">Line ${res.lineIndex + 1}: ${escapeHtml(res.content)}</div>`);
                item.on('click', () => jumpToLine(res.lineIndex));
                resultsContainer.append(item);
            });
            resultsContainer.show();
        }
    });

    // 点击外部关闭搜索下拉
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            $('#css-search-results').hide();
        }
    });

    // 2. 保存 (联动系统保存)
    $('#css-top-save, #tuner-save').on('click', function() {
        // 触发 SillyTavern 的保存机制
        // 通常触发 input 事件会让 ST 知道数据变了，然后我们可以调用 saveSettingsDebounced
        cssTextArea.trigger('input');
        saveSettingsDebounced();
        toastr.success("CSS 已保存", "CSS Color Tuner");
    });

    // 3. 回顶 CSS
    $('#css-top-up').on('click', function() {
        cssTextArea[0].scrollTop = 0;
    });

    // ---------------- 调色板功能 ----------------

    // 4. 刷新调色板
    $('#tuner-refresh').on('click', refreshTuner);

    // 5. 扩展回顶
    $('#tuner-up').on('click', function() {
        contentArea[0].scrollTop = 0;
    });

    // 6. 折叠/展开
    $('#tuner-collapse').on('click', function() {
        contentArea.toggleClass('collapsed');
        const icon = $(this).find('i');
        if (contentArea.hasClass('collapsed')) {
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // 7. 调色板搜索
    $('#tuner-search').on('input', function() {
        const query = $(this).val().toLowerCase();
        $('.tuner-block').each(function() {
            const text = $(this).text().toLowerCase();
            $(this).toggle(text.includes(query));
        });
    });
}

// 跳转到 Textarea 指定行
function jumpToLine(lineIndex) {
    const el = cssTextArea[0];
    const text = el.value;
    const lines = text.split('\n');
    
    // 计算字符位置
    let charIndex = 0;
    for (let i = 0; i < lineIndex; i++) {
        charIndex += lines[i].length + 1; // +1 for newline
    }

    el.focus();
    el.setSelectionRange(charIndex, charIndex);
    
    // 尽可能滚动到顶部 (通过计算行高估算滚动位置)
    const lineHeight = parseInt(getComputedStyle(el).lineHeight);
    el.scrollTop = lineIndex * lineHeight;
    
    $('#css-search-results').hide();
}

// 刷新调色板逻辑
function refreshTuner() {
    const cssText = cssTextArea.val();
    const blocks = parseCssColors(cssText);
    renderTunerBlocks(blocks);
}

// 渲染调色板 DOM
function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:20px; color:#888;">未检测到颜色属性</div>');
        return;
    }

    blocks.forEach(block => {
        // 标题显示逻辑：有注释则显示 "注释 / 类名"，否则只显示 "类名"
        // 如果注释是多行的，取最后一行可能更贴切，或者显示全部。这里简化处理，只取注释。
        let titleHtml = '';
        if (block.comment) {
            // 处理可能的多个注释，取最靠近的一个
            const comments = block.comment.split('*/');
            const lastComment = comments[comments.length - 1].replace(/\/\*|[\r\n]/g, '').trim();
            titleHtml = `<span class="tuner-block-comment">${escapeHtml(lastComment)}</span> / ${escapeHtml(block.selector)}`;
        } else {
            titleHtml = escapeHtml(block.selector);
        }

        const blockEl = $(`<div class="tuner-block">
            <div class="tuner-block-header">${titleHtml}</div>
        </div>`);

        block.properties.forEach(prop => {
            const row = $(`<div class="tuner-property-row">
                <div class="tuner-property-name">${escapeHtml(prop.name)}</div>
                <div class="tuner-color-inputs"></div>
            </div>`);

            const inputsContainer = row.find('.tuner-color-inputs');

            prop.colors.forEach((colorObj, index) => {
                const colorVal = colorObj.value;
                const isTransparent = colorVal === 'transparent';
                
                // 为了让 input[type=color] 工作，必须是 hex。
                // 如果是 rgb/hsl/name，我们需要转换或者让用户在文本框编辑。
                // 这里的策略：如果是简单的hex，同步到color picker。否则只提供文本框，或者转换。
                // 为了简单且兼容性好，我们提供一个 颜色选择器 (辅助) + 文本框 (主控)
                
                let hexForPicker = "#000000";
                if (colorVal.startsWith('#') && (colorVal.length === 7 || colorVal.length === 4)) {
                    hexForPicker = colorVal;
                }
                
                const wrapper = $(`<div class="tuner-color-wrapper"></div>`);
                
                if (prop.colors.length > 1) {
                    wrapper.append(`<span class="tuner-color-index">#${index + 1}</span>`);
                }

                // 颜色选择器 (隐藏的助手)
                const picker = $(`<input type="color" class="tuner-picker" value="${hexForPicker}">`);
                // 文本输入框 (实际值)
                const textInput = $(`<input type="text" class="tuner-text-input" value="${colorVal}">`);

                // 联动逻辑
                picker.on('input', function() {
                    textInput.val(this.value).trigger('input');
                });

                // 核心：修改颜色
                textInput.on('input', function() {
                    const newValue = $(this).val();
                    // 更新 picker 颜色 (如果是有效hex)
                    if (newValue.startsWith('#') && newValue.length === 7) {
                        picker.val(newValue);
                    }
                    // 更新 picker 背景预览 (如果是 transparent 或其他)
                    picker.css('background-color', newValue);

                    // *** 实时更新 CSS Textarea ***
                    updateCssContent(block.selector, prop.name, index, newValue);
                });

                // 如果初始值是 transparent 或复杂颜色，设置 picker 背景以便预览
                picker.css('background-color', colorVal);

                wrapper.append(picker);
                wrapper.append(textInput);
                inputsContainer.append(wrapper);
            });

            blockEl.append(row);
        });

        contentArea.append(blockEl);
    });
}

/**
 * 核心功能：实时更新 CSS 字符串
 * 难点：如何精准定位要修改的颜色？
 * 策略：重新在全文中找到该选择器块，然后找到该属性，然后替换第N个颜色匹配。
 */
function updateCssContent(selector, propName, colorIndex, newColorValue) {
    const originalCss = cssTextArea.val();
    
    // 构建查找该选择器块的正则 (需要非常小心转义)
    // 简化处理：查找 selector + { ... }
    const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 匹配: 注释(可选) + 选择器 + { 内容 }
    const blockRegex = new RegExp(`(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    let newCss = originalCss;
    
    // 我们必须遍历找到匹配的那个块 (因为可能存在同名选择器被分散写的情况，这里假设修改第一个匹配的，或者通过更复杂的逻辑定位)
    // 既然 parseCssColors 是按顺序解析的，我们这里其实只要能定位到唯一的块即可。
    // 为防万一，我们只处理找到的第一个匹配项。
    
    const match = blockRegex.exec(originalCss);
    if (match) {
        const fullBlockMatch = match[0]; // 整个块
        const blockContent = match[2]; // 花括号内的内容
        
        // 在 blockContent 中查找属性
        // propName : propValue ;
        const propRegex = new RegExp(`(${propName})\\s*:\\s*([^;]+);`, 'g');
        let propMatch;
        let propFound = false;
        
        // 可能会有多个同名属性（例如浏览器前缀），这里简单处理，假设修改所有或者第一个
        // 这里的逻辑：在 blockContent 中替换属性值
        
        const newBlockContent = blockContent.replace(propRegex, (fullPropMatch, pName, pValue) => {
            // 找到了属性行，现在要替换里面的第 colorIndex 个颜色
            let currentColorIndex = 0;
            
            // 使用回调函数进行替换，只替换计数器等于 colorIndex 的那个
            const newPropValue = pValue.replace(colorRegex, (match) => {
                if (currentColorIndex === colorIndex) {
                    currentColorIndex++;
                    return newColorValue;
                }
                currentColorIndex++;
                return match;
            });
            
            return `${pName}: ${newPropValue};`;
        });
        
        // 替换整个块的内容
        const newFullBlock = fullBlockMatch.replace(blockContent, newBlockContent);
        newCss = originalCss.replace(fullBlockMatch, newFullBlock);
        
        // 更新 Textarea
        // 注意：val() 改变不会触发 input 事件，需要手动触发以应用样式
        // 获取当前光标位置，防止输入时跳动 (虽然是在下方面板操作，但保持好习惯)
        // const cursorPos = cssTextArea[0].selectionStart; 
        cssTextArea.val(newCss);
        // cssTextArea[0].setSelectionRange(cursorPos, cursorPos);
        
        // 触发 SillyTavern 的监听器，使其应用样式到页面
        cssTextArea.trigger('input'); 
    }
}

// 辅助：HTML转义
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 初始化入口
$(document).ready(function() {
    // 简单检查是否已加载设置页面元素
    const checkExist = setInterval(function() {
        if ($('#CustomCSS-textAreaBlock').length) {
            console.log(extensionName + " Loaded");
            clearInterval(checkExist);
            createTunerUI();
            
            // 初次加载数据
            setTimeout(refreshTuner, 500); // 稍作延迟确保CSS框已有内容
        }
    }, 1000);
});
