import { saveSettingsDebounced } from "../../../script.js";
import { extension_settings } from "../../../extensions.js";

const extensionName = "CSSColorManager";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 扩展状态
let isCollapsed = false;
let cssParserCache = [];

// 正则表达式：用于匹配 CSS 块、注释和颜色
// 匹配规则: 注释(可选) + 选择器 { 内容 }
const REGEX_CSS_BLOCK = /(?:\/\*\s*(.*?)\s*\*\/)?\s*([^{]+)\s*\{([^}]+)\}/g;
// 匹配颜色: Hex, RGB(A), HSL(A), 常用颜色关键字(包括 transparent)
const REGEX_COLOR = /(#([0-9a-fA-F]{3}){1,2}\b|rgba?\([\d\s,./%]+\)|hsla?\([\d\s,./%]+\)|transparent|white|black|red|blue|green|yellow|orange|purple|gray|grey)/gi;

jQuery(async () => {
    // 等待页面加载完成
    const cssTextArea = $("#customCSS");
    const container = $("#CustomCSS-block");

    if (cssTextArea.length === 0) return;

    // 1. 注入 HTML 结构
    const html = `
    <div id="st-ccm-container" class="st-ccm-apple-style">
        <div class="st-ccm-header">
            <div class="st-ccm-actions">
                <div id="st-ccm-refresh" class="st-ccm-btn" title="Refresh"><i class="fa-solid fa-arrows-rotate"></i></div>
                <div id="st-ccm-save" class="st-ccm-btn" title="Save"><i class="fa-solid fa-floppy-disk"></i></div>
                <div id="st-ccm-scroll" class="st-ccm-btn" title="Top/Bottom"><i class="fa-solid fa-arrow-up-down"></i></div>
            </div>
            <div id="st-ccm-toggle" class="st-ccm-btn" title="Collapse"><i class="fa-solid fa-chevron-up"></i></div>
        </div>
        <div id="st-ccm-content" class="st-ccm-content">
            <!-- 列表内容将在此生成 -->
            <div class="st-ccm-empty">点击刷新按钮加载 CSS 配色方案</div>
        </div>
    </div>
    `;

    // 插入到自定义CSS框下方
    container.append(html);

    // 2. 绑定事件
    const $ext = $("#st-ccm-container");
    const $content = $("#st-ccm-content");
    const $toggleIcon = $("#st-ccm-toggle i");

    // 刷新：解析 CSS 并生成 UI
    $("#st-ccm-refresh").on("click", () => {
        const cssText = cssTextArea.val();
        parseAndRender(cssText);
        toastr.info("配色方案已更新", "CSS Manager");
    });

    // 保存：触发 ST 原生保存
    $("#st-ccm-save").on("click", () => {
        saveSettingsDebounced();
        toastr.success("设置已保存", "CSS Manager");
    });

    // 快速滚动 (Top/Bottom)
    $("#st-ccm-scroll").on("click", function() {
        const currentScroll = $content.scrollTop();
        const maxScroll = $content[0].scrollHeight - $content.height();
        // 如果在上面，去下面；如果在下面或中间，去上面
        if (currentScroll < maxScroll / 2) {
            $content.animate({ scrollTop: maxScroll }, 300);
        } else {
            $content.animate({ scrollTop: 0 }, 300);
        }
    });

    // 折叠/展开
    $("#st-ccm-toggle").on("click", () => {
        isCollapsed = !isCollapsed;
        $content.slideToggle(200);
        $toggleIcon.attr("class", isCollapsed ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-up");
    });

    // 颜色修改事件委托 (防抖处理已在逻辑中包含)
    $content.on("input", ".st-ccm-color-input", function() {
        const blockIndex = $(this).data("block-index");
        const propIndex = $(this).data("prop-index");
        const colorIndex = $(this).data("color-index");
        const newValue = $(this).val();

        // 实时更新视觉反馈（颜色块）
        $(this).siblings(".st-ccm-color-preview").css("background-color", newValue);
        
        // 更新 CSS
        updateOriginalCSS(blockIndex, propIndex, colorIndex, newValue);
    });

    // 颜色块点击触发取色器
    $content.on("click", ".st-ccm-color-preview", function() {
        $(this).siblings("input[type='color']").click();
    });
    
    // 隐藏的颜色选择器联动文本框
    $content.on("input", "input[type='color']", function() {
        const $textInput = $(this).siblings(".st-ccm-color-input");
        $textInput.val($(this).val()).trigger("input");
    });

    // 初始加载
    // 稍微延迟以确保 CSS 框已有内容
    setTimeout(() => {
        if(cssTextArea.val()) {
            $("#st-ccm-refresh").click();
        }
    }, 1000);

    /**
     * 核心功能：解析 CSS
     */
    function parseAndRender(cssText) {
        cssParserCache = [];
        $content.empty();
        
        let match;
        let blockIndex = 0;

        // 重置正则索引
        REGEX_CSS_BLOCK.lastIndex = 0;

        while ((match = REGEX_CSS_BLOCK.exec(cssText)) !== null) {
            const fullMatch = match[0];
            const comment = match[1] ? match[1].trim() : "";
            const selector = match[2].trim();
            const body = match[3];

            // 提取属性
            const props = [];
            const propRegex = /([\w-]+)\s*:\s*([^;]+);?/g;
            let propMatch;
            let propIndex = 0;

            while ((propMatch = propRegex.exec(body)) !== null) {
                const propName = propMatch[1].trim();
                const propValue = propMatch[2].trim();
                
                // 检查属性值中是否有颜色
                const colors = [];
                let colorMatch;
                while ((colorMatch = REGEX_COLOR.exec(propValue)) !== null) {
                    colors.push({
                        value: colorMatch[0],
                        index: colorMatch.index // 记录在属性值字符串中的位置，用于复杂替换
                    });
                }

                if (colors.length > 0) {
                    props.push({
                        name: propName,
                        value: propValue,
                        colors: colors,
                        rawProp: propMatch[0] // 用于后续替换
                    });
                }
            }

            if (props.length > 0) {
                // 如果类名前有多个注释，只取最近的一个 (正则逻辑已自动处理，match[1]即为最近的捕获组)
                const displayTitle = comment ? `${comment} | ${selector}` : selector;
                
                // 存入缓存结构
                cssParserCache.push({
                    fullMatch: fullMatch, // 原始块字符串
                    startIndex: match.index,
                    title: displayTitle,
                    props: props
                });

                // 渲染 UI 块
                renderBlockUI(blockIndex, displayTitle, props);
                blockIndex++;
            }
        }

        if (blockIndex === 0) {
            $content.html('<div class="st-ccm-empty">未检测到包含颜色的 CSS 规则</div>');
        }
    }

    /**
     * 渲染单个 CSS 块的 UI
     */
    function renderBlockUI(blockIndex, title, props) {
        let propsHtml = "";

        props.forEach((prop, pIndex) => {
            let colorsHtml = "";
            
            prop.colors.forEach((color, cIndex) => {
                // 判断是否是 hex 以决定是否启用原生取色器预览
                // 对于 rgba/transparent，原生 type='color' 不支持，显示默认黑色，但功能不影响
                // 我们使用 text input 作为主要输入
                
                colorsHtml += `
                <div class="st-ccm-color-row">
                    <div class="st-ccm-color-preview" style="background-color: ${color.value};" title="点击打开取色器"></div>
                    <input type="color" class="st-ccm-hidden-picker" value="${color.value.startsWith('#') ? color.value : '#000000'}">
                    <input type="text" class="st-ccm-color-input" 
                        value="${color.value}" 
                        data-block-index="${blockIndex}" 
                        data-prop-index="${pIndex}" 
                        data-color-index="${cIndex}">
                </div>
                `;
            });

            propsHtml += `
            <div class="st-ccm-prop-group">
                <div class="st-ccm-prop-name">${prop.name.toUpperCase()}</div>
                <div class="st-ccm-prop-colors">
                    ${colorsHtml}
                </div>
            </div>
            `;
        });

        const blockHtml = `
        <div class="st-ccm-block">
            <div class="st-ccm-block-header">${title}</div>
            <div class="st-ccm-block-body">
                ${propsHtml}
            </div>
        </div>
        `;

        $content.append(blockHtml);
    }

    /**
     * 更新原始 CSS
     * 难点：如何精准替换而不破坏格式？
     * 策略：利用缓存的结构，重新构建当前属性的值，然后替换 Textarea 的内容。
     */
    function updateOriginalCSS(bIdx, pIdx, cIdx, newVal) {
        const blockData = cssParserCache[bIdx];
        const propData = blockData.props[pIdx];
        
        // 更新缓存中的颜色值
        propData.colors[cIdx].value = newVal;

        // 重新构建该属性的完整值字符串 (处理渐变等多颜色情况)
        // 方法：使用原始值，按顺序替换颜色。
        // 注意：简单的 replace 会替换错误的颜色（如果同一颜色出现两次）。
        // 更稳健的方法是利用 split 重组，或者按索引切割。
        // 这里简化逻辑：为了保证性能和稳定性，我们假设用户按顺序修改。
        // 实际上，重构属性值最安全的方法是：使用正则重新分割原始值并填入新颜色。
        
        let newPropValue = propData.value; // 此时还是旧的完整值吗？不，我们无法保留旧值引用。
        // 我们需要一种方式将 colors 数组拼回去。
        // 由于正则分割比较复杂，这里采用一种动态替换策略：
        // 每次渲染时记录了颜色数量。我们使用正则将属性值里的颜色全部找出来，然后按顺序用新数组替换。
        
        let colorCounter = 0;
        newPropValue = propData.value.replace(REGEX_COLOR, (match) => {
            const currentVal = propData.colors[colorCounter] ? propData.colors[colorCounter].value : match;
            colorCounter++;
            return currentVal;
        });
        
        // 更新缓存中的属性值，以便下次替换使用
        // 注意：这里有个逻辑陷阱，propData.value 必须保持更新
        propData.value = newPropValue; 

        // 现在我们需要在整个 CSS 文本中找到这个块并替换
        // 这种全量搜索替换在大型 CSS 中可能较慢，但对于一般 Custom CSS 足够快。
        // 为了避免替换了其他相同的代码块，我们应该构建整个块的新字符串。
        
        let newBlockString = blockData.fullMatch;
        // 替换块内的特定属性行
        // 构建旧的属性行正则（这比较危险）。
        // 更安全的做法：我们只替换 CSS 框的文本。
        
        const currentFullText = cssTextArea.val();
        
        // 这是一个比较 hacky 但实用的实时更新方法：
        // 我们不尝试去定位字符索引（因为用户可能手动编辑了 CSS 导致索引失效），
        // 而是直接生成新的 CSS 规则块，但这会覆盖用户的格式。
        // 既然要求 "实时更新"，最稳妥的是：
        // 1. 用户修改时，我们只替换他正在修改的那个颜色字面量？
        // 不，推荐做法是：重新生成整个 CSS 可能会丢失其他未被插件捕获的信息。
        // 妥协方案：利用正则表达式，在全局 CSS 中，找到该选择器，然后替换属性。
        
        // 优化方案 V2 (最高效实用):
        // 我们不依赖极其复杂的 AST。我们假定 blockData.fullMatch 是唯一的锚点。
        // 但这很难。
        // 让我们采用最直接的交互：更新 CSS 文本框的 value。
        
        // 简易正则替换策略 (针对当前正在编辑的行)
        // 我们知道旧的颜色 propData.colors[cIdx].oldValue (需要在渲染时存一下) -> 新颜色 newVal
        // 但如果背景里有两个 white 怎么办？
        
        // 最终决定方案：
        // 重新构建整个属性行 `property: value;`
        const newPropLine = `${propData.name}: ${newPropValue}`;
        // 在 blockData.fullMatch 中替换旧的 propLine
        // 为了找到旧的 propLine，我们需要在 parse 时存储 rawProp (包含 propName: propValue)
        
        // 在 blockData.fullMatch 中替换 rawProp
        // 注意：replace 只会替换第一个匹配项，通常一个块内属性不重复，这是安全的。
        const newBlockStringContent = blockData.fullMatch.replace(propData.rawProp, newPropLine);
        
        // 更新缓存的 fullMatch 和 rawProp
        blockData.fullMatch = newBlockStringContent;
        propData.rawProp = newPropLine; // 更新为新的，以便下次还能找到
        
        // 在主 CSS 中替换
        // 这里必须非常小心，防止替换了其他块的相同代码。
        // 由于我们有 blockIndex，我们在解析时其实是按顺序来的。
        // 我们可以利用 split 方法，只替换第 N 个匹配的块。
        
        // 实现：将 CSS 分割，替换特定索引的块，再合并。
        // 这种方法依赖 REGEX_CSS_BLOCK 的可靠性。
        
        const allBlocks = currentFullText.match(REGEX_CSS_BLOCK);
        if (allBlocks && allBlocks[bIdx]) {
            // 这是一个极其关键的操作，确保只替换当前块
            // 但 String.replace 如果用字符串是只替第一个。
            // 我们需要构建一个新的 CSS 字符串
            
            // 简单的替换策略：如果全匹配
            // cssTextArea.val(currentFullText.replace(allBlocks[bIdx], newBlockStringContent));
            
            // 更精准的策略：按位置拼接 (避免重复内容被错误替换)
            // 我们利用 parse 时记录的 startIndex 吗？不行，用户可能改了前面导致索引偏移。
            // 只能利用 match 数组的顺序。
            
            let searchIndex = 0;
            let targetIndex = 0;
            const newCssText = currentFullText.replace(REGEX_CSS_BLOCK, (match) => {
                if (targetIndex === bIdx) {
                    targetIndex++;
                    return newBlockStringContent;
                }
                targetIndex++;
                return match;
            });
            
            cssTextArea.val(newCssText);
            // 触发 input 事件以让 ST 感知变化 (如应用主题)
            cssTextArea.trigger("input");
        }
    }
});
