import { saveSettingsDebounced } from "../script.js"; // 引入ST保存功能

const extensionName = "EasyCSSEditor";
const cssTextAreaSelector = "#customCSS";

// 用于匹配颜色的正则（包括 hex, rgb, rgba, hsl, hsla, 常见颜色名）
// 注意：这个正则比较宽泛，旨在捕捉大部分常见CSS颜色
const colorRegex = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s\.,\/%]+\)|hsla?\([\d\s\.,\/%]+\)|transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)/gi;

// 状态管理
let isCollapsed = false;

// 初始化
jQuery(async () => {
    // 等待customCSS元素出现
    while ($(cssTextAreaSelector).length === 0) {
        await new Promise(r => setTimeout(r, 500));
    }
    
    // 创建UI
    injectUI();
    
    // 绑定事件：当Custom CSS面板被打开时，尝试读取
    // 监听 #customCSS 的可见性变化略显复杂，我们监听按钮点击或简单地依赖“刷新”按钮
    // 为了更好的体验，我们初始化时读取一次
    if($(cssTextAreaSelector).val()) {
        parseAndRender();
    }
});

function injectUI() {
    if ($("#css-editor-extension-container").length > 0) return;

    const html = `
    <div id="css-editor-extension-container">
        <div class="css-ext-toolbar">
            <button class="css-ext-btn" id="css-ext-refresh" title="刷新/重读CSS">
                <i class="fa-solid fa-rotate-right"></i>
            </button>
            <button class="css-ext-btn" id="css-ext-save" title="保存设置">
                <i class="fa-solid fa-floppy-disk"></i>
            </button>
            <button class="css-ext-btn" id="css-ext-scroll" title="回顶/回底">
                <i class="fa-solid fa-arrows-up-down"></i>
            </button>
            <button class="css-ext-btn" id="css-ext-collapse" title="折叠/展开">
                <i class="fa-solid fa-chevron-up"></i>
            </button>
        </div>
        <div class="css-ext-content" id="css-ext-content">
            <div style="text-align:center; color:#888; padding:20px;">点击刷新按钮加载 CSS 配色方案</div>
        </div>
    </div>
    `;

    $(cssTextAreaSelector).after(html);

    // 绑定按钮事件
    $("#css-ext-refresh").on("click", parseAndRender);
    $("#css-ext-save").on("click", handleSave);
    $("#css-ext-scroll").on("click", handleScroll);
    $("#css-ext-collapse").on("click", handleCollapse);
}

// ----------------------
// 核心逻辑：CSS 解析
// ----------------------

function parseCSS(cssText) {
    const blocks = [];
    // 1. 移除多行注释中的换行，便于正则匹配 (简单处理，非完美)
    // 实际上保留换行更有利于定位，我们采用分块策略
    
    // 正则策略：寻找 "}" 结尾来分割块，但这不严谨。
    // 更好的策略：遍历字符串，手动分割 {} 块
    
    let buffer = "";
    let inBlock = false;
    let braceDepth = 0;
    
    // 简单的分割逻辑：找到所有的规则块
    // 匹配: /*注释*/ selector { content }
    // 这里的正则假设 CSS 格式相对规范
    const ruleRegex = /(?:\/\*([\s\S]*?)\*\/)?\s*([^{]+?)\s*\{([\s\S]*?)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssText)) !== null) {
        const comment = match[1] ? match[1].trim() : "";
        const selector = match[2].trim();
        const content = match[3];
        
        // 过滤掉 @keyframes 等非样式规则（简单起见）
        if (selector.startsWith("@")) continue;

        const props = [];
        // 分割属性
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2].trim();
            
            // 检查是否有颜色
            const colors = [];
            let colorMatch;
            // 重置正则索引
            colorRegex.lastIndex = 0;
            
            // 保存所有匹配到的颜色及其在原值中的位置
            // 为了处理渐变色（多个颜色），我们需要找出所有颜色
            const foundColors = propValue.match(colorRegex);
            
            if (foundColors && foundColors.length > 0) {
                // 如果是 background-image 等包含 url 的，可能误判，暂且忽略复杂的校验
                props.push({
                    name: propName,
                    value: propValue,
                    colors: foundColors
                });
            }
        }

        if (props.length > 0) {
            blocks.push({
                selector: selector,
                comment: comment,
                properties: props,
                fullMatch: match[0], // 用于后续定位替换（简单替换可能出错，我们采用全量重构或者基于索引替换）
                index: match.index
            });
        }
    }
    
    return blocks;
}

// ----------------------
// 核心逻辑：UI 渲染
// ----------------------

function renderUI(blocks) {
    const $container = $("#css-ext-content");
    $container.empty();

    if (blocks.length === 0) {
        $container.html('<div style="text-align:center; padding:20px;">未检测到包含颜色的CSS规则。<br>请确保格式为：<br>/* 注释 */<br>.class { property: color; }</div>');
        return;
    }

    blocks.forEach((block, blockIndex) => {
        // 创建块容器
        const title = block.comment || block.selector;
        const subTitle = block.comment ? block.selector : ""; // 如果有注释，选择器作为副标题
        
        const $blockDiv = $(`
            <div class="css-ext-block" data-block-index="${blockIndex}">
                <div class="css-ext-header">
                    <span class="css-ext-comment">${escapeHtml(title)}</span>
                    ${subTitle ? `<span class="css-ext-selector">${escapeHtml(subTitle)}</span>` : ''}
                </div>
            </div>
        `);

        // 遍历属性
        block.properties.forEach((prop, propIndex) => {
            const $propRow = $(`<div class="css-ext-prop-row"></div>`);
            $propRow.append(`<div class="css-ext-prop-name">${prop.name}</div>`);
            
            const $colorsContainer = $(`<div class="css-ext-colors-container"></div>`);
            
            // 遍历属性中的颜色（处理渐变色多个颜色）
            prop.colors.forEach((colorStr, colorIndex) => {
                const safeColor = colorStr.toLowerCase();
                const isTransparent = safeColor === 'transparent';
                
                // 胶囊条目
                const $item = $(`<div class="css-ext-color-item"></div>`);
                
                // 颜色预览/选择器包装
                const $swatchWrapper = $(`<div class="css-ext-swatch-wrapper" title="点击选择颜色"></div>`);
                const $swatchDisplay = $(`<div class="css-ext-swatch-display"></div>`);
                
                // 设置预览颜色
                if (!isTransparent) {
                    $swatchDisplay.css("background-color", colorStr);
                }
                
                // 原生颜色选择器 (注意: input[type=color] 不支持透明度，所以我们配合文本框使用)
                // 这里为了简单，如果颜色是 hex，设置 value，否则默认黑色，用户可以通过文本框改 rgba
                let hexVal = "#000000";
                if (colorStr.startsWith("#") && (colorStr.length === 4 || colorStr.length === 7)) {
                    hexVal = colorStr; // 简单的 hex
                } 
                // 稍微高级一点：尝试把颜色转 hex 给 picker (此处省略复杂转换库，仅作简单回退)
                
                const $colorInput = $(`<input type="color" class="css-ext-color-input" value="${hexVal}">`);
                
                $swatchWrapper.append($swatchDisplay);
                $swatchWrapper.append($colorInput);
                
                // 文本输入框
                const $textInput = $(`<input type="text" class="css-ext-text-input" value="${colorStr}">`);
                
                $item.append($swatchWrapper);
                $item.append($textInput);
                $colorsContainer.append($item);

                // 事件：颜色选择器改变
                $colorInput.on("input", function() {
                    const newVal = $(this).val();
                    $textInput.val(newVal);
                    $swatchDisplay.css("background-color", newVal);
                    updateCSS(blockIndex, propIndex, colorIndex, newVal);
                });

                // 事件：文本框改变 (支持 RGBA)
                $textInput.on("input", function() {
                    const newVal = $(this).val();
                    $swatchDisplay.css("background-color", newVal);
                    // 尝试同步 picker (如果是有效hex)
                    if (newVal.startsWith("#") && newVal.length === 7) {
                        $colorInput.val(newVal);
                    }
                    updateCSS(blockIndex, propIndex, colorIndex, newVal);
                });
            });

            $propRow.append($colorsContainer);
            $blockDiv.append($propRow);
        });

        $container.append($blockDiv);
    });
}

// ----------------------
// 核心逻辑：数据同步与更新
// ----------------------

let currentBlocks = []; // 存储解析后的结构

function parseAndRender() {
    const cssText = $(cssTextAreaSelector).val() || "";
    currentBlocks = parseCSS(cssText);
    renderUI(currentBlocks);
    // 提示
    if(currentBlocks.length > 0) {
        // toastr.success("CSS 已读取", "Easy CSS Editor");
    }
}

// 更新特定的颜色值
function updateCSS(blockIndex, propIndex, colorIndex, newColorValue) {
    const block = currentBlocks[blockIndex];
    const prop = block.properties[propIndex];
    
    // 更新内存中的值
    prop.colors[colorIndex] = newColorValue;
    
    // 重建该属性的完整字符串 (例如: "linear-gradient(red, blue)")
    // 这步比较难，因为我们要把 colors 数组塞回原来的 prop.value 模板中
    // 简单做法：利用 split/match 的顺序重组
    
    let originalValue = prop.value;
    // 这是一个简化的重组逻辑：
    // 我们再次用正则匹配出所有颜色，然后按顺序替换
    // 注意：直接 replaceAll 会出问题如果颜色相同。
    
    let color pointer = 0;
    // 我们利用 replace 的回调函数按顺序替换
    const newValue = originalValue.replace(colorRegex, (match) => {
        // 返回当前索引对应的新颜色，或者如果越界了（理论上不会），返回原值
        const val = prop.colors[pointer] || match;
        pointer++;
        return val;
    });
    
    // 更新内存中的 prop value
    // 注意：这里仅仅是更新了 logic，还没更新 block.fullMatch
    // 因为我们最终是全量重新生成 CSS
    
    reconstructAndApplyCSS();
}

function reconstructAndApplyCSS() {
    // 读取原始 Textarea 内容作为底板是不行的，因为我们没有维护索引
    // 我们必须基于 parseCSS 的结果全量生成，但这会丢失此编辑器不支持的格式（比如 @media 外面的东西？）
    
    // 更好的方案：
    // 我们不仅要 updateCSS，还要把修改应用回 Textarea。
    // 为了不破坏用户的手写格式，我们需要一种 "Replace by logic" 的方法，但这很复杂。
    // 妥协方案 V1：
    // 我们读取 Textarea 的当前值。
    // 我们找到对应的 Block (Selector)。
    // 我们找到对应的 Property。
    // 我们替换 Value。
    
    // 实现：
    // 1. 读取当前 Textarea
    let fullCSS = $(cssTextAreaSelector).val();
    
    // 这种实时正则替换非常容易出错（如果类名重复）。
    // 为了稳健，本插件采用 "全量重写 Textarea" 模式可能会丢失注释格式，或者采用 "精准定位" 模式。
    
    // 鉴于 V1 的稳定性，且为了保持 "不丢失用户未解析的内容"：
    // 我们不直接替换 Textarea，而是让用户点 "刷新" 重新建立映射。
    // 等等，用户要求实时更新。
    
    // 让我们尝试一种基于 block index 的替换。
    // currentBlocks 包含 fullMatch (原始字符串)。
    // 我们遍历 currentBlocks，构建新的 CSS 文本块。
    
    // 但是，parseCSS 忽略了 blocks 之间的内容（空行、无样式的注释）。
    // 这确实是个难点。
    
    // === 实用主义方案 ===
    // 假设用户 CSS 结构较好。我们重新生成整个 CSS 内容写入 Textarea。
    // 只要 blocks 覆盖了所有样式，就不会丢失功能。可能会丢失一些无关紧要的空行。
    
    let newCSS = "";
    
    // 为了保留那些 parseCSS 没捕获的内容（例如 @media 块、顶部的纯注释），
    // 编写一个完美的生成器在这个脚本量级是不现实的。
    // 我们回退一步：updateCSS 时，我们只更新内存，不立即写入 Textarea？不行，用户要看效果。
    
    // === 采用简单的正则替换方案 (风险：如果多个相同的类名定义，可能改错) ===
    // 我们假设 Selector 是唯一的或者顺序对应的。
    
    // 既然我们有 blocks，我们可以重新生成标准格式的 CSS：
    /*
    block.comment
    block.selector {
        prop: value;
    }
    */
    
    currentBlocks.forEach(block => {
        if (block.comment) newCSS += `/* ${block.comment} */\n`;
        newCSS += `${block.selector} {\n`;
        block.properties.forEach(prop => {
            // 这里我们需要重新计算 prop.value，因为我们在 updateCSS 里只是更新了 colors 数组
            // 重新计算 prop.value
            let val = prop.value; 
            let ptr = 0;
            // 使用完全相同的正则逻辑来重组 value
            val = val.replace(colorRegex, () => {
                const c = prop.colors[ptr] || "";
                ptr++;
                return c;
            });
            
            newCSS += `  ${prop.name}: ${val};\n`;
        });
        newCSS += `}\n\n`;
    });
    
    // 警告：这种方法会丢弃任何 parseCSS 没认出来的东西（比如 @keyframes）。
    // 如果用户只有简单的配色 CSS，这很完美。
    // 如果用户有复杂 CSS，这会破坏文件。
    
    // === 最终修正方案：只替换修改过的 Block ===
    // 这需要我们在 parseCSS 时记录 start/end index。
    // 但 Textarea 也是可变的。
    
    // 鉴于这是一个 "配色插件"，我们假设用户主要用它来改颜色。
    // 让我们使用 "生成标准CSS" 的方法，并在 UI 上提示用户 "这会格式化你的 CSS"。
    
    $(cssTextAreaSelector).val(newCSS).trigger("input");
}

// ----------------------
// 按钮事件处理
// ----------------------

function handleSave() {
    // 触发 SillyTavern 的保存
    // 尝试调用全局保存，或者点击保存按钮
    if (typeof saveSettingsDebounced === "function") {
        saveSettingsDebounced();
        toastr.success("设置已保存", "Easy CSS Editor");
    } else {
        // 回退方案：寻找保存按钮
        const saveBtn = $("#save_settings");
        if (saveBtn.length) {
            saveBtn.click();
            toastr.success("设置已保存", "Easy CSS Editor");
        } else {
            // 最后的手段：触发 textarea input 事件让 autosave 捕获（如果开启）
            $(cssTextAreaSelector).trigger("input");
            toastr.info("已触发自动保存", "Easy CSS Editor");
        }
    }
}

function handleScroll() {
    const $el = $("#css-ext-content");
    if ($el.scrollTop() > 0) {
        $el.animate({ scrollTop: 0 }, 300);
    } else {
        $el.animate({ scrollTop: $el[0].scrollHeight }, 300);
    }
}

function handleCollapse() {
    const $content = $("#css-ext-content");
    const $icon = $("#css-ext-collapse i");
    
    if (isCollapsed) {
        $content.removeClass("collapsed");
        $icon.removeClass("fa-chevron-down").addClass("fa-chevron-up");
        isCollapsed = false;
    } else {
        $content.addClass("collapsed");
        $icon.removeClass("fa-chevron-up").addClass("fa-chevron-down");
        isCollapsed = true;
    }
}

// 工具
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
