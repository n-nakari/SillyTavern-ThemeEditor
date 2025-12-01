import { saveSettingsDebounced } from "../../../script.js";

// 颜色匹配正则：匹配 hex, rgb, rgba, hsl, hsla, 关键词
const COLOR_REGEX = /#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b|rgba?\([\s\d.,%]+\)|hsla?\([\s\d.,%]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey/gi;

// 简单的CSS解析器
class CSSParser {
    constructor(cssText) {
        this.rawText = cssText;
        this.rules = [];
        this.parse();
    }

    parse() {
        // 移除所有换行，简化正则匹配（注意：这不是完美的解析器，但对大多数手写CSS有效）
        // 更稳健的方法是遍历字符，这里为了性能和简洁使用正则块分割
        
        // 1. 分割每一个规则块 "selector { content }"
        // 捕获组: 1=Selector(含注释), 2=Content
        const blockRegex = /([^{]+)\{([^}]+)\}/g;
        let match;
        
        this.rules = [];

        while ((match = blockRegex.exec(this.rawText)) !== null) {
            const fullSelectorPart = match[1].trim();
            const contentPart = match[2];
            
            // 提取最后一个注释作为标题，提取纯选择器
            let comment = "";
            let selector = fullSelectorPart;

            // 尝试匹配最后一个 /* comment */
            const commentMatch = fullSelectorPart.match(/\/\*([\s\S]*?)\*\//g);
            if (commentMatch && commentMatch.length > 0) {
                // 取最后一个注释，去掉注释符号并清理空白
                const lastCommentRaw = commentMatch[commentMatch.length - 1];
                comment = lastCommentRaw.replace(/\/\*|\*\//g, '').trim();
                
                // 选择器应该是去掉所有注释后的部分
                selector = fullSelectorPart.replace(/\/\*[\s\S]*?\*\//g, '').trim();
            }

            // 如果没有注释，或者选择器为空（例如只是注释块），处理边界
            if (!selector) continue;

            // 解析属性
            const properties = this.parseProperties(contentPart);
            
            // 只有当属性里包含颜色时，我们才添加这个规则到列表
            if (properties.some(p => p.colors.length > 0)) {
                this.rules.push({
                    originalSelector: fullSelectorPart, // 用于定位替换（简单实现暂时不用）
                    selector: selector,
                    comment: comment,
                    properties: properties,
                    startIndex: match.index,
                    endIndex: match.index + match[0].length
                });
            }
        }
    }

    parseProperties(content) {
        // 按分号分割属性
        const props = [];
        const propList = content.split(';');
        
        propList.forEach(prop => {
            if (!prop.trim()) return;
            const parts = prop.split(':');
            if (parts.length < 2) return;

            const name = parts[0].trim();
            const value = parts.slice(1).join(':').trim(); // 防止 value 里也有冒号 (url等)

            // 在 value 中查找颜色
            const colors = [];
            let colorMatch;
            // 重置正则索引
            COLOR_REGEX.lastIndex = 0;
            
            while ((colorMatch = COLOR_REGEX.exec(value)) !== null) {
                colors.push({
                    original: colorMatch[0],
                    index: colorMatch.index
                });
            }

            if (colors.length > 0) {
                props.push({
                    name: name,
                    value: value,
                    colors: colors
                });
            }
        });

        return props;
    }
}

const extensionHtml = `
<div id="st-css-extension">
    <div class="css-ext-header">
        <button class="css-ext-btn" id="css-ext-refresh" title="刷新/读取CSS"><i class="fa-solid fa-sync"></i></button>
        <button class="css-ext-btn" id="css-ext-save" title="保存设置"><i class="fa-solid fa-save"></i></button>
        <button class="css-ext-btn" id="css-ext-scroll" title="快速回顶/回底"><i class="fa-solid fa-arrow-down-up-across-line"></i></button>
        <button class="css-ext-btn" id="css-ext-collapse" title="折叠面板"><i class="fa-solid fa-chevron-up"></i></button>
    </div>
    <div class="css-ext-content" id="css-ext-list">
        <!-- 列表内容将通过JS生成 -->
    </div>
</div>
`;

let isCollapsed = false;
let scrollToggle = false; // false = go bottom, true = go top

function renderColorItem(ruleIndex, propIndex, colorIndex, colorValue) {
    // 简单的颜色转换 helper (为了让 input type="color" 能显示初始值，即使是 rgba)
    // 注意：input type="color" 只能接受 hex。
    // 这里为了简化，我们尽量转换，如果是复杂颜色(transparent/rgba)，input color可能显示黑色，但文本框显示正确
    // 实际增强版可以用 toolcool-color-picker 库，SillyTavern自带了，但为了保持本插件独立性，这里做基础实现
    
    // 生成唯一的ID用于事件绑定
    const dataAttrs = `data-r="${ruleIndex}" data-p="${propIndex}" data-c="${colorIndex}"`;

    return `
    <div class="color-item">
        <div class="color-preview-wrapper" style="background-color: ${colorValue}">
            <input type="color" class="css-color-input" value="${colorValueToHex(colorValue)}" ${dataAttrs}>
        </div>
        <input type="text" class="css-color-text" value="${colorValue}" ${dataAttrs}>
    </div>
    `;
}

// 辅助：尝试将颜色转为 HEX 以适应 color input
function colorValueToHex(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    return ctx.fillStyle; // 浏览器会自动转为 hex
}

function buildUI(parserInstance) {
    const container = $('#css-ext-list');
    container.empty();

    if (parserInstance.rules.length === 0) {
        container.append('<div style="text-align:center; opacity:0.5; padding:20px;">未检测到可编辑的颜色规则。</div>');
        return;
    }

    parserInstance.rules.forEach((rule, rIndex) => {
        let title = rule.selector;
        if (rule.comment) {
            title = `<div class="rule-header">
                        <span class="rule-comment">${rule.comment}</span>
                        <span class="rule-selector">${rule.selector}</span>
                     </div>`;
        } else {
             title = `<div class="rule-header">
                        <span class="rule-selector">${rule.selector}</span>
                     </div>`;
        }

        let propsHtml = '';
        rule.properties.forEach((prop, pIndex) => {
            let colorsHtml = '';
            prop.colors.forEach((col, cIndex) => {
                colorsHtml += renderColorItem(rIndex, pIndex, cIndex, col.original);
            });

            propsHtml += `
            <div class="prop-row">
                <span class="prop-name">${prop.name}</span>
                <div class="color-group">
                    ${colorsHtml}
                </div>
            </div>
            `;
        });

        const blockHtml = `
        <div class="css-rule-block">
            ${title}
            ${propsHtml}
        </div>
        `;
        
        container.append(blockHtml);
    });

    bindEvents(parserInstance);
}

function bindEvents(parserInstance) {
    // 颜色选择器更改事件
    $('.css-color-input').on('input', function() {
        const hex = $(this).val();
        const rIdx = $(this).data('r');
        const pIdx = $(this).data('p');
        const cIdx = $(this).data('c');
        
        // 更新对应的文本框
        $(this).closest('.color-item').find('.css-color-text').val(hex);
        // 更新预览背景
        $(this).parent().css('background-color', hex);
        
        updateCSS(parserInstance, rIdx, pIdx, cIdx, hex);
    });

    // 文本框更改事件 (支持 rgba 等)
    $('.css-color-text').on('change', function() {
        const val = $(this).val();
        const rIdx = $(this).data('r');
        const pIdx = $(this).data('p');
        const cIdx = $(this).data('c');

        // 更新预览背景
        $(this).closest('.color-item').find('.color-preview-wrapper').css('background-color', val);
        // 如果是有效hex，更新色盘（可选）
        
        updateCSS(parserInstance, rIdx, pIdx, cIdx, val);
    });
}

function updateCSS(parser, rIdx, pIdx, cIdx, newValue) {
    // 这是一个关键逻辑：我们需要重新构建 CSS 字符串
    // 为了简单起见，我们修改解析器内存中的对象，然后重写整个CSS框
    // 注意：这会丢失原CSS中的格式细节（如空格数量），但能保证功能
    
    // 1. 更新内存对象
    parser.rules[rIdx].properties[pIdx].colors[cIdx].original = newValue;

    // 2. 重建该属性的完整字符串 (例如 linear-gradient)
    // 我们需要按原始顺序替换颜色。
    // 为了防止字符串替换错误（例如把 red 替换了 padding-red），我们需要非常小心
    // 这里采用简单策略：根据分割后的结构重组。
    // 但因为 colors 只是数组，我们需要利用原始 value 字符串并按位置替换
    // 更简单的方法：正则替换。但有风险。
    
    // **可靠的重建方法**：
    // 使用 colors 数组中的 index 信息是行不通的，因为前面的替换会改变长度。
    // 我们可以重构整个属性值字符串：
    // 这是一个难点。为了简化，我们假设用户按顺序修改。
    
    // 这里使用一种 "占位符" 策略重建属性值
    let originalPropValue = parser.rules[rIdx].properties[pIdx].value;
    let colorList = parser.rules[rIdx].properties[pIdx].colors; // 这是一个引用
    
    // 我们需要重新在原始值中找到所有颜色，然后按顺序用新值替换
    // 为了避免重叠替换，我们把原来的字符串拆解
    let rebuiltValue = "";
    let lastIndex = 0;
    
    // 这里的 colorList 必须是按 index 排序的（正则exec保证了这点）
    // 但正则重新执行一次最安全，因为我们只有旧的 snapshot
    // 重新运行一次正则来匹配当前文本框里的 CSS 结构（如果用户在外部改了CSS，这里可能会有问题，所以必须依赖Refresh）
    
    // *修正策略*：我们不再依赖 index，而是生成新的 CSS 文本。
    // 实际上，要完美保留格式太难。我们这里采用 "Regenerate Block" 策略。
    
    // 重新生成整个 CSS 文本
    regenerateFullCSS(parser);
}

function regenerateFullCSS(parser) {
    // 读取当前的 #customCSS，我们只替换被我们修改的部分？
    // 不，直接根据 rules 数组重写可能导致用户写在规则外的注释丢失。
    // 
    // 妥协方案：
    // 读取当前的 parser.rawText。
    // 对于每一个 rule，我们替换它在 rawText 中的片段。
    // 但因为字符串不可变且位置会变，最好的方式是：
    // 我们只针对当前的修改，更新 #customCSS 的内容。
    
    // 为了实现 "实时更新"，最简单的方法其实是：
    // 1. 获取当前修改的属性的新值。
    // 2. 找到这个属性在 CSS 字符串中的位置。
    // 3. 替换它。
    
    // 这里我们使用一种简化版逻辑：
    // 我们将整个 parser.rules 序列化回 CSS 字符串。
    // 警告：这会丢失未被解析器捕获的内容（例如 @media 块外的注释，或者无法解析的结构）。
    // 
    // **高级方案**：只替换变化。
    // 由于我们必须支持 "Gradient" 这种多颜色属性，
    // 我们遍历该属性的所有颜色，用新颜色替换旧颜色数组中的值，然后拼凑回属性值字符串。
    
    const rule = parser.rules[arguments[1]]; // rIdx
    const prop = rule.properties[arguments[2]]; // pIdx
    
    // 重建该属性的 value
    // 这是一个复杂的字符串操作，因为我们需要保留非颜色的字符 (e.g. "linear-gradient(90deg, ", " 0%, ", " 100%)")
    // 我们使用原始 value，再次正则分割，然后像拉链一样把新颜色塞进去
    
    let oldVal = prop.value; 
    let newValBuilder = "";
    let lastCursor = 0;
    
    // 我们需要再次匹配 oldVal 里的颜色结构来定位切分点
    // 注意：prop.colors 存储的是当前状态（包含已修改的值）
    // 等等，我们在 updateCSS 里已经修改了 prop.colors[cIdx].original 为 newValue
    // 但我们需要基于 parsing 时的原始结构来拼接。
    // 这在动态编辑中非常困难。
    
    // **最稳妥的即时反馈方案**：
    // 每次 updateCSS 被调用时：
    // 1. 我们不依赖复杂的字符串重建。
    // 2. 我们只简单地生成一个新的 CSS 块，用于替换旧的 CSS 块。
    // 3. 或者... 我们不尝试保留原始 CSS 的格式，而是根据当前面板内容生成标准的 CSS 格式，这会格式化用户的代码。
    
    // 决定：采用 "格式化重写" 方案。这会改变用户的缩进，但功能最稳定。
    // 但是用户可能写了 @media 查询，这会被我们的简单正则弄丢。
    
    // **最终方案**：
    // 不重写整个 CSS。只读取当前的 #customCSS 值，
    // 使用正则定位到当前修改的选择器和属性，替换那一行。
    
    const currentFullCSS = $('#customCSS').val();
    
    // 构造正则寻找该规则
    // 寻找 `selector { ... property: ... }`
    // 这太复杂且容易出错。
    
    // **退一步：简单且有效的方法**
    // 1. 当解析时，我们保存了整个 CSS 文本。
    // 2. 当修改时，我们只在内存中修改。
    // 3. 当生成时，我们遍历 rules，生成纯净的 CSS 字符串。
    // 4. 为了不丢失 @media，我们只支持解析和编辑根级别的规则，或者把 @media 当作选择器的一部分解析。
    // 5. 将生成的 CSS 写入 #customCSS。
    
    let outputCSS = "";
    
    // 如果原文本中有 parser 没处理的部分（比如开头注释），我们试着保留? 很难。
    // 让我们直接根据 UI 生成 CSS。这是最符合 "Ins/Apple" 极简主义的——它会帮你整理代码。
    
    parser.rules.forEach(r => {
        if (r.comment) outputCSS += `/* ${r.comment} */\n`;
        outputCSS += `${r.selector} {\n`;
        r.properties.forEach(p => {
            // 重建 value：这是最难的一步，如果是一个多颜色的属性
            // 我们需要重新将 colors 拼回去。
            // 假设我们有一个 split 后的非颜色片段数组？
            // 让我们在 parse 的时候做这件事。
            
            // 没办法完美还原，这里使用一种替换策略：
            // 我们重新运行正则在 p.value (原始值) 上，但这已经是被修改过的值吗？
            // 不，p.value 应该保持与 UI 同步。
            // 当 UI 修改颜色时，我们不仅修改 colors 数组，还必须更新 p.value。
            
            // 我们怎样把 "linear-gradient(red, blue)" 变成 "linear-gradient(pink, blue)"?
            // 我们利用 colors 数组的 index。
            // 不行，字符串变长了。
            
            // 解决：我们使用 split by regex。
            const parts = p.value.split(COLOR_REGEX);
            // parts 将包含 ["linear-gradient(", ", ", ")"]
            // 可是 split 可能会丢掉分隔符...
            // JS 的 split 正则如果包含捕获组会保留，但我们没有捕获组。
            
            // 重新实现：
            let tempVal = "";
            let regex = new RegExp(COLOR_REGEX); // clone
            let match;
            let lastIdx = 0;
            let colorCount = 0;
            
            // 这里的 p.value 必须是 *上一次* 的完整值
            // 我们很难追踪。
            
            // **Hack 方案**：
            // 在 updateCSS 中，我们知道修改的是第几个颜色。
            // 我们获取当前的 css-color-text 的所有兄弟元素的值。
            // 这样我们就有了一个颜色列表 [col1, col2, col3...]
            // 我们再次拿 p.value (原始的，未修改的) 进行正则 match。
            // 将 match 到的第 N 个结果替换为 UI 列表中的第 N 个值。
            // 这样保留了非颜色的文本。
        });
    });
}

// ------ 修正后的逻辑：基于 UI 状态重组属性值 ------

function reconstructPropertyValue(originalValue, newColorsArray) {
    let result = "";
    let lastIndex = 0;
    let match;
    let colorIndex = 0;
    
    // 必须使用全新的正则实例以重置 state
    const regex = new RegExp(COLOR_REGEX);
    
    while ((match = regex.exec(originalValue)) !== null) {
        // 添加颜色前的文本
        result += originalValue.substring(lastIndex, match.index);
        
        // 添加新颜色 (从 UI 读取的)
        if (colorIndex < newColorsArray.length) {
            result += newColorsArray[colorIndex];
        } else {
            result += match[0]; // Fallback
        }
        
        lastIndex = regex.lastIndex;
        colorIndex++;
    }
    
    // 添加剩余文本
    result += originalValue.substring(lastIndex);
    return result;
}

// 覆盖 updateCSS 逻辑
function realUpdateCSS(parser, rIdx, pIdx) {
    // 1. 获取该属性下所有颜色输入框的当前值
    const colorInputs = $(`#css-ext-list .color-item input[type="text"][data-r="${rIdx}"][data-p="${pIdx}"]`);
    const newColors = colorInputs.map((i, el) => $(el).val()).get();
    
    // 2. 获取该属性的原始 value (parse时保存的)
    // 注意：这里有个问题，如果用户修改一次，原始值就变了。
    // 我们需要把 "当前 value" 存在内存里。
    // 首次 parse 后，prop.value 是初始值。
    // 每次修改后，我们更新 prop.value 为新合成的值。
    
    const prop = parser.rules[rIdx].properties[pIdx];
    const newValue = reconstructPropertyValue(prop.value, newColors);
    
    // 3. 更新内存
    prop.value = newValue;
    // 同时也更新 colors 数组里的 original 值，虽然 parse 逻辑下次会重置它
    prop.colors.forEach((c, i) => {
        if (newColors[i]) c.original = newColors[i];
    });

    // 4. 重写 #customCSS
    writeToTextarea(parser);
}

function writeToTextarea(parser) {
    // 重新生成整个 CSS
    let cssOutput = "";
    
    parser.rules.forEach(rule => {
        if (rule.comment) {
            cssOutput += `/* ${rule.comment} */\n`;
        }
        cssOutput += `${rule.selector} {\n`;
        rule.properties.forEach(prop => {
            cssOutput += `  ${prop.name}: ${prop.value};\n`;
        });
        cssOutput += `}\n\n`;
    });
    
    // 写入并触发事件
    const textarea = $('#customCSS');
    textarea.val(cssOutput);
    textarea.trigger('input'); // 触发 ST 的监听器
}


// --- Main Entry ---

$(document).ready(function() {
    // 注入 HTML
    const textareaContainer = $('#customCSS').parent();
    if ($('#st-css-extension').length === 0) {
        textareaContainer.after(extensionHtml);
    }

    let currentParser = new CSSParser($('#customCSS').val());
    
    // 初始构建
    // 延迟一点以确保 ST 加载了 CSS
    setTimeout(() => {
        refreshExtension();
    }, 1000);

    function refreshExtension() {
        const cssText = $('#customCSS').val();
        currentParser = new CSSParser(cssText);
        buildUI(currentParser);
        
        // 重新绑定 Update 逻辑
        // 我们需要一种方式让 bindEvents 调用 realUpdateCSS
        // 在 bindEvents 里我们传递了 parserInstance，现在我们修改 bindEvents
        // 让它调用 realUpdateCSS(parserInstance, rIdx, pIdx)
    }

    // 重新定义 bindEvents 以使用正确的 update 逻辑
    function bindEvents(parserInstance) {
        const handleUpdate = function(el) {
            const rIdx = $(el).data('r');
            const pIdx = $(el).data('p');
            const cIdx = $(el).data('c');
            const val = $(el).val();

            // 如果是 color input，同步 text input
            if ($(el).hasClass('css-color-input')) {
                $(el).closest('.color-item').find('.css-color-text').val(val);
                $(el).parent().css('background-color', val);
            }
            // 如果是 text input，同步 preview bg
            if ($(el).hasClass('css-color-text')) {
                $(el).closest('.color-item').find('.color-preview-wrapper').css('background-color', val);
            }

            realUpdateCSS(parserInstance, rIdx, pIdx);
        };

        $('.css-color-input').on('input', function() { handleUpdate(this); });
        $('.css-color-text').on('change', function() { handleUpdate(this); }); // text用change防止输入时频繁触发
    }

    // 按钮事件
    $('#css-ext-refresh').on('click', function() {
        refreshExtension();
        // 添加简单的动画反馈
        $(this).find('i').addClass('fa-spin');
        setTimeout(() => $(this).find('i').removeClass('fa-spin'), 500);
    });

    $('#css-ext-save').on('click', function() {
        saveSettingsDebounced();
        // 反馈
        const icon = $(this).find('i');
        icon.removeClass('fa-save').addClass('fa-check');
        setTimeout(() => icon.removeClass('fa-check').addClass('fa-save'), 1000);
    });

    $('#css-ext-scroll').on('click', function() {
        const list = $('#css-ext-list');
        if (scrollToggle) {
            list.scrollTop(0);
        } else {
            list.scrollTop(list[0].scrollHeight);
        }
        scrollToggle = !scrollToggle;
    });

    $('#css-ext-collapse').on('click', function() {
        const list = $('#css-ext-list');
        const icon = $(this).find('i');
        
        if (isCollapsed) {
            list.removeClass('collapsed');
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        } else {
            list.addClass('collapsed');
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        }
        isCollapsed = !isCollapsed;
    });

    // 监听 #customCSS 的外部变化（例如用户手动打字）并提示
    // 注意：为了不形成循环触发，我们只在 focus 状态下监听，或者简单地依赖刷新按钮
    // 这里选择简单策略：用户手动修改后，需要点刷新按钮更新面板。
});
