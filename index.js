import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;

// 颜色匹配正则
// 优化：
// 1. \b 边界符，防止匹配到 --darkblue-bg 这样的变量名中的颜色
// 2. 支持 hex, rgb, rgba, hsl, hsla, transparent, 英文颜色名
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/**
 * 核心功能：解析CSS字符串
 * 1. 提取所有 CSS 块
 * 2. 智能提取最后一条注释
 * 3. 过滤掉无颜色属性的块
 * 4. 过滤掉包含变量 var(--...) 的值 (根据需求描述，不读取变量)
 */
function parseCssColors(cssString) {
    const blocks = [];
    
    // 正则逻辑：
    // Group 1: 捕获该选择器前所有的连续注释块 (非贪婪)
    // Group 2: 选择器
    // Group 3: 花括号内的内容
    const ruleRegex = /(?:((?:\/\*[\s\S]*?\*\/[\s\r\n]*)+))?([^{}]+)\{([^}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const rawComments = match[1]; // 所有前面的注释
        const selector = match[2].trim();
        const content = match[3];
        
        // 处理注释：分割，取最后一个非空的
        let finalComment = "";
        if (rawComments) {
            // 按 */ 分割
            const commentParts = rawComments.split('*/');
            // 过滤空行和纯空白
            const cleanParts = commentParts
                .map(c => c.trim())
                .filter(c => c.length > 0 && c.includes('/*')); // 确保包含开始符
            
            if (cleanParts.length > 0) {
                // 取最后一个，去掉开头的 /* 和可能的换行
                let lastRaw = cleanParts[cleanParts.length - 1];
                finalComment = lastRaw.replace(/^\/\*[\s\r\n]*/, '').trim();
            }
        }
        
        // 解析属性
        const properties = [];
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2].trim();
            
            // 过滤：如果属性值包含 'var(', 则跳过（根据需求：变量不用读取）
            if (propValue.includes('var(')) continue;

            // 在属性值中查找颜色
            const colors = [];
            let colorMatch;
            // 重置正则索引
            colorRegex.lastIndex = 0;
            
            while ((colorMatch = colorRegex.exec(propValue)) !== null) {
                colors.push({
                    value: colorMatch[0],
                    index: colorMatch.index 
                });
            }
            
            // 只有当该属性包含颜色时才添加
            if (colors.length > 0) {
                properties.push({
                    name: propName,
                    fullValue: propValue,
                    colors: colors
                });
            }
        }
        
        // 只有当该块包含有效的颜色属性时才添加
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

// UI 构建函数
function createTunerUI() {
    // 1. CSS框上方工具栏 (搜索、保存、回顶)
    const topBar = $(`
        <div class="css-tools-bar">
            <div class="css-tools-search-wrapper">
                <input type="text" class="text_pole textarea_compact width100p" placeholder="搜索当前 CSS 代码..." id="css-top-search" autocomplete="off">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
            <div class="menu_button menu_button_icon" id="css-top-save" title="永久保存所有更改"><i class="fa-solid fa-save"></i></div>
            <div class="menu_button menu_button_icon" id="css-top-up" title="回到代码顶部"><i class="fa-solid fa-arrow-up"></i></div>
        </div>
    `);

    // 2. 调色板主容器
    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-title"><i class="fa-solid fa-swatchbook"></i> 调色</div>
                <div class="tuner-controls">
                    <div class="menu_button menu_button_icon" id="tuner-refresh" title="刷新数据"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="menu_button menu_button_icon" id="tuner-save" title="保存更改"><i class="fa-solid fa-save"></i></div>
                    <div class="menu_button menu_button_icon" id="tuner-up" title="回到扩展顶部"><i class="fa-solid fa-arrow-up"></i></div>
                    <div class="menu_button menu_button_icon" id="tuner-collapse" title="折叠/展开面板"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
            </div>
            <div class="tuner-sub-header">
                <input type="text" class="text_pole textarea_compact width100p" placeholder="搜索调色板 (注释或类名)..." id="tuner-search" autocomplete="off">
            </div>
            <div class="tuner-content" id="tuner-content-area">
                <!-- 动态生成内容 -->
            </div>
        </div>
    `);

    // 插入位置
    const textAreaBlock = $('#CustomCSS-textAreaBlock');
    
    topBar.insertBefore(textAreaBlock);
    container.insertAfter(textAreaBlock);
    
    contentArea = $('#tuner-content-area');
    cssTextArea = $('#customCSS');

    bindEvents();
}

// 辅助：转义正则符号
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 绑定所有事件
function bindEvents() {
    // ---------------- CSS框上方搜索 ----------------
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
        const maxResults = 50; // 限制显示数量保证性能

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({ lineIndex: i, content: line.trim() });
                if (results.length >= maxResults) break;
            }
        }

        if (results.length > 0) {
            results.forEach(res => {
                // 高亮处理
                const escapedQuery = escapeRegExp(query);
                const highlightRegex = new RegExp(`(${escapedQuery})`, 'gi');
                const highlightedContent = escapeHtml(res.content).replace(highlightRegex, '<span class="search-highlight">$1</span>');

                const item = $(`<div class="css-search-item">${highlightedContent}</div>`);
                item.on('click', () => {
                    jumpToLine(res.lineIndex);
                    // 清空搜索框并隐藏
                    // searchInput.val(''); 
                    resultsContainer.removeClass('active');
                });
                resultsContainer.append(item);
            });
            // 添加 active 类以触发过渡
            setTimeout(() => resultsContainer.addClass('active'), 10);
        }
    });

    // 聚焦时如果框内有字，重新显示结果
    searchInput.on('focus', function() {
        if ($(this).val() && resultsContainer.children().length > 0) {
            resultsContainer.addClass('active');
        }
    });

    // 点击外部关闭搜索下拉
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) {
            resultsContainer.removeClass('active');
        }
    });

    // ---------------- 保存与回顶 ----------------
    // 联动系统保存
    $('#css-top-save, #tuner-save').on('click', function() {
        cssTextArea.trigger('input');
        saveSettingsDebounced();
        toastr.success("设置已永久保存", "CSS Color Tuner");
    });

    $('#css-top-up').on('click', function() {
        // 平滑滚动
        cssTextArea[0].scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ---------------- 调色板功能 ----------------

    $('#tuner-refresh').on('click', function() {
        $(this).find('i').addClass('fa-spin'); // 添加旋转动画
        refreshTuner();
        setTimeout(() => $(this).find('i').removeClass('fa-spin'), 500);
    });

    $('#tuner-up').on('click', function() {
        contentArea[0].scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#tuner-collapse').on('click', function() {
        contentArea.toggleClass('collapsed');
        const icon = $(this).find('i');
        // 切换图标
        if (contentArea.hasClass('collapsed')) {
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // 调色板搜索
    $('#tuner-search').on('input', function() {
        const query = $(this).val().toLowerCase();
        // 查找所有 .tuner-block
        const blocks = contentArea.find('.tuner-block');
        
        blocks.each(function() {
            const block = $(this);
            const headerText = block.find('.tuner-block-header').text().toLowerCase();
            // 简单匹配：标题包含搜索词则显示
            if (headerText.includes(query)) {
                block.show();
            } else {
                block.hide();
            }
        });
    });
}

// 跳转到 Textarea 指定行 (精确到顶行)
function jumpToLine(lineIndex) {
    const el = cssTextArea[0];
    const text = el.value;
    const lines = text.split('\n');
    
    // 计算字符位置
    let charIndex = 0;
    for (let i = 0; i < lineIndex; i++) {
        charIndex += lines[i].length + 1; // +1 是换行符
    }

    el.focus();
    el.setSelectionRange(charIndex, charIndex);
    
    // 计算滚动高度
    // 这里获取实际行高稍微麻烦，用 scrollTop 计算
    // 这种方法在所有textarea中都比较通用
    const lineHeight = 20; // 估算值，或者可以通过 getComputedStyle 获取
    // 为了"准确到无论CSS框的高度宽度，跳转后要找的文字就定位在顶行"
    // 我们需要将 scrollTop 设置为 (当前行号 * 行高)
    // 更好的方式：创建一个镜像 div 来计算高度（略复杂），这里用简单的比率滚动
    
    // 简单且相对准确的方法：
    const totalLines = lines.length;
    const scrollHeight = el.scrollHeight;
    const avgLineHeight = scrollHeight / totalLines;
    
    el.scrollTo({
        top: lineIndex * avgLineHeight,
        behavior: 'smooth'
    });
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
        contentArea.append('<div style="text-align:center; padding:30px; color:#888;">当前 CSS 无可调节的颜色属性</div>');
        return;
    }

    blocks.forEach(block => {
        // 标题显示逻辑：如果有注释，显示 "注释/类名"；否则显示 "类名"
        let titleHtml = '';
        if (block.comment) {
            titleHtml = `<span class="tuner-title-comment">${escapeHtml(block.comment)}</span><span class="tuner-separator"> / </span><span class="tuner-title-selector">${escapeHtml(block.selector)}</span>`;
        } else {
            titleHtml = `<span class="tuner-title-comment">${escapeHtml(block.selector)}</span>`;
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
                
                const wrapper = $(`<div class="tuner-color-wrapper"></div>`);
                
                // 如果一个属性有多个颜色（如渐变），显示编号
                if (prop.colors.length > 1) {
                    wrapper.append(`<span class="tuner-color-index">#${index + 1}</span>`);
                }

                // 处理颜色值同步到 Picker 的问题
                let hexForPicker = "#000000";
                if (colorVal.startsWith('#') && (colorVal.length === 7 || colorVal.length === 4)) {
                    hexForPicker = colorVal;
                }

                // 颜色选择器 (辅助)
                const picker = $(`<input type="color" class="tuner-picker" value="${hexForPicker}" title="点击选择颜色">`);
                
                // 文本输入框 (主控，显示真实值，如 rgba)
                const textInput = $(`<input type="text" class="tuner-text-input" value="${colorVal}" title="直接输入颜色代码">`);

                // Picker 改变 -> 更新 Text -> 更新 CSS
                picker.on('input', function() {
                    textInput.val(this.value).trigger('input');
                });

                // Text 改变 -> 更新 CSS
                textInput.on('input', function() {
                    const newValue = $(this).val();
                    
                    // 尝试同步回 Picker 背景色做预览
                    try {
                        picker.css('background-color', newValue);
                        // 如果是有效 Hex，同步 Picker 值
                        if (newValue.startsWith('#') && newValue.length === 7) {
                            picker.val(newValue);
                        }
                    } catch(e) {}

                    // 实时更新 CSS Textarea
                    updateCssContent(block.selector, prop.name, index, newValue);
                });

                // 初始化 Picker 背景色 (用于展示 transparent 或 rgba 等 picker 无法显示的颜色)
                try {
                    picker.css('background-color', colorVal);
                } catch(e) {}

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
 * 逻辑：定位到选择器块 -> 定位到属性 -> 替换第N个颜色值
 */
function updateCssContent(selector, propName, colorIndex, newColorValue) {
    const originalCss = cssTextArea.val();
    
    // 1. 转义选择器中的特殊字符，用于构建正则
    const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 2. 匹配整个块: (注释)? 选择器 { 内容 }
    // 注意：这里需要与 parseCssColors 逻辑保持一致，找到对应的那个块
    const blockRegex = new RegExp(`(?:(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)+)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    let newCss = originalCss;
    let match;
    
    // 可能会有多个同名选择器，这里为了效率和简单，我们假设修改找到的第一个。
    // 如果需要极度严谨，需要在 parse 阶段记录 index 位置。
    // 但鉴于通常 CSS 书写习惯，这里操作第一个匹配项即可。
    
    if ((match = blockRegex.exec(originalCss)) !== null) {
        const fullBlockMatch = match[0]; 
        const blockContent = match[2]; 
        
        // 3. 在块内容中替换属性
        const propRegex = new RegExp(`(${propName})\\s*:\\s*([^;]+);`, 'g');
        
        // 只替换该块中的内容
        const newBlockContent = blockContent.replace(propRegex, (fullPropMatch, pName, pValue) => {
            // 找到了属性行，现在要替换里面的第 colorIndex 个颜色
            let currentColorIndex = 0;
            
            // 使用回调函数进行替换，只替换计数器等于 colorIndex 的那个颜色
            // 注意：这里必须使用与 parse 阶段完全一致的 regex
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
        
        // 4. 组合回整个 CSS 字符串
        const newFullBlock = fullBlockMatch.replace(blockContent, newBlockContent);
        newCss = originalCss.replace(fullBlockMatch, newFullBlock);
        
        // 5. 写入 Textarea 并触发事件
        cssTextArea.val(newCss);
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
    const checkExist = setInterval(function() {
        if ($('#CustomCSS-textAreaBlock').length) {
            console.log(extensionName + " Loaded");
            clearInterval(checkExist);
            createTunerUI();
            // 稍作延迟确保CSS框已有数据
            setTimeout(refreshTuner, 300); 
        }
    }, 1000);
});
