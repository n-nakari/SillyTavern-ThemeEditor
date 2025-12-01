import { saveSettingsDebounced } from "../../../../script.js";

// 扩展的唯一标识符
const EXTENSION_ID = "st-css-live-editor";
const EXTENSION_ROOT_ID = "st-css-editor-root";

// 常用CSS颜色关键字，用于正则匹配（避免匹配到 display: block 这种非颜色属性）
const CSS_COLOR_KEYWORDS = [
    "transparent", "currentcolor", "black", "silver", "gray", "white", "maroon", "red", "purple", "fuchsia", "green", "lime", "olive", "yellow", "navy", "blue", "teal", "aqua", "orange", "aliceblue", "antiquewhite", "aquamarine", "azure", "beige", "bisque", "blanchedalmond", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "gainsboro", "ghostwhite", "gold", "goldenrod", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "limegreen", "linen", "magenta", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "oldlace", "olivedrab", "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "thistle", "tomato", "turquoise", "violet", "wheat", "whitesmoke", "yellowgreen", "rebeccapurple"
];

// 匹配CSS颜色的正则表达式 (Hex, RGB, HSL, Named Colors)
const COLOR_REGEX = new RegExp(
    `(#(?:[\\da-f]{3}){1,2}(?:[\\da-f]{2})?)|` + // Hex
    `(rgba?\\([\\d\\s.,%]+\\))|` + // RGB/RGBA
    `(hsla?\\([\\d\\s.,%]+\\))|` + // HSL/HSLA
    `\\b(${CSS_COLOR_KEYWORDS.join("|")})\\b`, // Named Colors
    "gi"
);

// 状态管理
let isCollapsed = false;

/**
 * 解析CSS字符串，提取结构化数据
 */
function parseCustomCSS(cssText) {
    const blocks = [];
    // 移除CSS中的所有换行符，简化正则，但保留注释结构
    // 简单的解析策略：按 '}' 分割块
    const rawBlocks = cssText.split("}");

    rawBlocks.forEach(rawBlock => {
        if (!rawBlock.trim()) return;

        // 分离选择器部分和属性部分
        const parts = rawBlock.split("{");
        if (parts.length < 2) return;

        let selectorPart = parts[0].trim();
        const propsPart = parts[1].trim();

        // 提取注释作为标题
        let title = "";
        let selector = selectorPart;
        
        // 匹配最后一个注释 /* ... */
        const commentMatch = selectorPart.match(/\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*\/+/g);
        if (commentMatch && commentMatch.length > 0) {
            // 取最后一个注释作为标题
            const lastComment = commentMatch[commentMatch.length - 1];
            title = lastComment.replace(/\/\*|\*\//g, "").trim();
            // 清理选择器中的注释，只保留类名/ID
            selector = selectorPart.replace(/\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*\/+/g, "").trim();
        }

        // 如果没有注释，或者标题为空，只显示选择器
        const displayTitle = title ? `${title} | ${selector}` : selector;

        // 解析属性
        const properties = [];
        const propLines = propsPart.split(";");

        propLines.forEach(line => {
            if (!line.trim()) return;
            const [key, ...values] = line.split(":");
            if (!key || values.length === 0) return;

            const propName = key.trim();
            const propValue = values.join(":").trim(); // 重新组合值（防止值里面有冒号，如url）

            // 在值中查找颜色
            const colors = [];
            let match;
            // 重置正则索引
            COLOR_REGEX.lastIndex = 0;
            
            while ((match = COLOR_REGEX.exec(propValue)) !== null) {
                colors.push({
                    original: match[0],
                    index: match.index
                });
            }

            if (colors.length > 0) {
                properties.push({
                    name: propName.toUpperCase(),
                    fullValue: propValue,
                    colors: colors
                });
            }
        });

        if (properties.length > 0) {
            blocks.push({
                title: displayTitle,
                originalSelector: selectorPart, // 用于定位
                properties: properties
            });
        }
    });

    return blocks;
}

/**
 * 实时更新 Custom CSS 文本框
 * @param {string} selector - 选择器
 * @param {string} propName - 属性名 (如 BACKGROUND)
 * @param {number} colorIndex - 该属性中第几个颜色
 * @param {string} newColor - 新颜色值
 */
function updateCSSTextArea(selector, propName, colorIndex, newColor) {
    const $textarea = $("#customCSS");
    let cssText = $textarea.val();

    // 这是一个简化的替换逻辑。为了精确，我们实际上需要重新定位到具体的行。
    // 由于用户可能修改了格式，最好的方式是根据解析逻辑重建这一块，或者使用更高级的字符串替换。
    // 为了性能和稳定性，这里采用“定位+正则替换”策略。

    // 1. 找到对应的选择器块
    // 注意：这里需要转义正则特殊字符
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 查找 "selector { ... }" 结构
    // 稍微放宽匹配，允许换行和空格
    const blockRegex = new RegExp(`(${escapeRegExp(selector)}\\s*\\{)([^}]*)(\\})`, 'i');
    const blockMatch = cssText.match(blockRegex);

    if (blockMatch) {
        let body = blockMatch[2];
        
        // 2. 在块内找到对应的属性 "propName: ... ;"
        const propRegex = new RegExp(`(${escapeRegExp(propName.toLowerCase())}\\s*:\\s*)([^;]+)(;)`, 'gi');
        
        // 可能有多个相同属性（fallback），这里简单处理只替换第一个匹配到的，或者需要更复杂的逻辑
        // 我们假设解析顺序和这里匹配顺序一致
        body = body.replace(propRegex, (match, prefix, value, suffix) => {
            // 3. 在属性值中替换第 N 个颜色
            let currentColorIndex = 0;
            const newValue = value.replace(COLOR_REGEX, (colorMatch) => {
                if (currentColorIndex === colorIndex) {
                    currentColorIndex++;
                    return newColor;
                }
                currentColorIndex++;
                return colorMatch;
            });
            return `${prefix}${newValue}${suffix}`;
        });

        // 替换回 CSS 字符串
        const newCssText = cssText.replace(blockMatch[0], `${blockMatch[1]}${body}${blockMatch[3]}`);
        
        // 更新 textarea 并触发 input 事件（让 SillyTavern 应用样式）
        $textarea.val(newCssText).trigger("input");
    }
}

/**
 * 创建扩展 UI
 */
function renderExtensionUI() {
    const $container = $(`#${EXTENSION_ROOT_ID}`);
    const $content = $container.find('.st-css-content');
    $content.empty();

    const cssText = $("#customCSS").val();
    const blocks = parseCustomCSS(cssText);

    if (blocks.length === 0) {
        $content.append(`<div class="st-css-empty">未检测到可编辑的颜色属性</div>`);
        return;
    }

    blocks.forEach(block => {
        const $card = $(`<div class="st-css-card"></div>`);
        const $header = $(`<div class="st-css-card-header">${block.title}</div>`);
        $card.append($header);

        block.properties.forEach(prop => {
            const $propRow = $(`<div class="st-css-prop-row"></div>`);
            const $propTitle = $(`<div class="st-css-prop-title">${prop.name}</div>`);
            $propRow.append($propTitle);

            const $colorsContainer = $(`<div class="st-css-colors-container"></div>`);

            prop.colors.forEach((colorObj, index) => {
                const $colorWrapper = $(`<div class="st-css-color-wrapper"></div>`);
                
                // 颜色选择器组件 (toolcool-color-picker)
                const $picker = $(`<toolcool-color-picker color="${colorObj.original}" button-width="24px" button-height="24px" style="border-radius: 50%; overflow: hidden;"></toolcool-color-picker>`);
                
                // 颜色代码显示
                const $code = $(`<div class="st-css-color-code">${colorObj.original}</div>`);

                // 事件监听
                $picker.on('change', (evt) => {
                    const newColor = evt.detail.rgba;
                    $code.text(newColor);
                    // 实时更新 CSS 框
                    // 注意：由于我们是从解析结果反推，这里的 block.originalSelector 可能包含注释
                    // 我们传递原始选择器片段去尝试匹配
                    // 为了更精确，这里可能需要去清理 selector 的注释
                    const cleanSelector = block.originalSelector.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                    updateCSSTextArea(cleanSelector, prop.name, index, newColor);
                });

                $colorWrapper.append($picker).append($code);
                $colorsContainer.append($colorWrapper);
            });

            $propRow.append($colorsContainer);
            $card.append($propRow);
        });

        $content.append($card);
    });
}

/**
 * 构建主界面框架
 */
function initLayout() {
    // 防止重复注入
    if ($(`#${EXTENSION_ROOT_ID}`).length > 0) return;

    // 定位到 Custom CSS 框下方
    const $target = $("#CustomCSS-block");
    
    const html = `
    <div id="${EXTENSION_ROOT_ID}" class="st-css-editor-panel">
        <div class="st-css-toolbar">
            <div class="st-css-btn-group">
                <button id="st-css-refresh" title="刷新并重新读取CSS" class="st-css-btn"><i class="fa-solid fa-arrows-rotate"></i></button>
                <button id="st-css-save" title="保存当前设置" class="st-css-btn"><i class="fa-solid fa-floppy-disk"></i></button>
                <button id="st-css-scroll" title="快速回顶/回底" class="st-css-btn"><i class="fa-solid fa-arrow-up-down"></i></button>
            </div>
            <button id="st-css-collapse" title="折叠面板" class="st-css-btn st-css-btn-text"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
        <div class="st-css-content-wrapper">
            <div class="st-css-content"></div>
        </div>
    </div>
    `;

    $target.after(html);

    // 绑定事件
    $("#st-css-refresh").on("click", () => {
        renderExtensionUI();
        toastr.success("CSS颜色已重新载入", "扩展插件");
    });

    $("#st-css-save").on("click", () => {
        saveSettingsDebounced();
        toastr.success("设置已保存", "扩展插件");
    });

    $("#st-css-scroll").on("click", function() {
        const $wrapper = $(".st-css-content-wrapper");
        if ($wrapper.scrollTop() > 100) {
            $wrapper.animate({ scrollTop: 0 }, 300);
        } else {
            $wrapper.animate({ scrollTop: $wrapper[0].scrollHeight }, 300);
        }
    });

    $("#st-css-collapse").on("click", function() {
        isCollapsed = !isCollapsed;
        const $wrapper = $(".st-css-content-wrapper");
        const $icon = $(this).find("i");
        
        if (isCollapsed) {
            $wrapper.slideUp(200);
            $icon.removeClass("fa-chevron-up").addClass("fa-chevron-down");
        } else {
            $wrapper.slideDown(200);
            $icon.removeClass("fa-chevron-down").addClass("fa-chevron-up");
        }
    });

    // 监听美化主题切换事件（通过监听 Custom CSS textarea 的变化是不可靠的，因为我们自己就在改它）
    // 通常用户切换主题会触发页面刷新或特定事件。SillyTavern没有明确的“主题切换后”事件供插件使用，
    // 但可以利用 MutationObserver 或者简单的点击刷新策略。
    // 作为一个优化，我们首次加载时渲染一次。
    renderExtensionUI();
}

jQuery(document).ready(function () {
    // 延迟一点加载，确保 SillyTavern 的 UI 已经生成
    setTimeout(initLayout, 1000);
});
