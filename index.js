import { saveSettingsDebounced } from "../../../../script.js";

// 配置常量
const CONTAINER_ID = 'st-css-extension';
const CONTENT_ID = 'st-css-ext-content';
const TEXTAREA_SELECTOR = '#customCSS'; // SillyTavern 自定义CSS的ID
const TARGET_ANCHOR = '#CustomCSS-block'; // 扩展将插入到这个元素后面

// 匹配CSS颜色的正则表达式 (Hex, RGB, RGBA, HSL, HSLA, Named Colors)
// 注意：Named colors列表可以根据需要扩展，这里包含了常用和要求中的transparent
const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey|orange|purple|pink|brown|beige|ivory)/gi;

// 匹配CSS规则块的正则：提取注释(Group 1)和选择器(Group 2)以及内容(Group 3)
// 逻辑：寻找 /*注释*/ (可选) 加上 选择器 { 内容 }
const RULE_REGEX = /(?:\/\*\s*(.*?)\s*\*\/[\s\r\n]*)?([^{}]+)\{([^{}]+)\}/g;

let isCollapsed = false;
let scrollDirection = 'bottom'; // 'bottom' or 'top'

/**
 * 初始化扩展
 */
function init() {
    const anchor = $(TARGET_ANCHOR);
    if (anchor.length === 0) {
        // 如果目标元素还没加载，稍后重试
        setTimeout(init, 500);
        return;
    }

    // 防止重复注入
    if ($(`#${CONTAINER_ID}`).length > 0) return;

    // 创建UI结构
    const container = $(`
        <div id="${CONTAINER_ID}">
            <div class="ext-toolbar">
                <button class="ext-btn" id="ext-btn-refresh" title="刷新 (读取当前CSS)">
                    <i class="fa-solid fa-rotate-right"></i>
                </button>
                <button class="ext-btn" id="ext-btn-save" title="保存设置">
                    <i class="fa-solid fa-floppy-disk"></i>
                </button>
                <button class="ext-btn" id="ext-btn-scroll" title="快速回顶/回底">
                    <i class="fa-solid fa-arrow-down"></i>
                </button>
                <button class="ext-btn" id="ext-btn-collapse" title="折叠面板">
                    <i class="fa-solid fa-minus"></i>
                </button>
            </div>
            <div id="${CONTENT_ID}" class="ext-content">
                <div class="ext-empty-msg">正在读取 CSS...</div>
            </div>
        </div>
    `);

    anchor.after(container);

    // 绑定事件
    $('#ext-btn-refresh').on('click', refreshContent);
    $('#ext-btn-save').on('click', saveSettings);
    $('#ext-btn-scroll').on('click', toggleScroll);
    $('#ext-btn-collapse').on('click', toggleCollapse);

    // 初始加载
    // 稍微延迟以确保 customCSS 文本框已被 ST 填充
    setTimeout(refreshContent, 1000); 
    
    // 监听 ST 的主题切换事件 (如果 ST 触发了某些 input 事件改变文本框)
    // 这里我们简单地假设每次打开扩展或手动刷新时读取。
    // 如果需要监听外部对 #customCSS 的修改，可以在 #customCSS 上绑定 change 事件，但为避免循环，这里主要靠刷新按钮。
}

/**
 * 刷新功能：从文本框读取 CSS 并生成 UI
 */
function refreshContent() {
    const cssText = $(TEXTAREA_SELECTOR).val() || '';
    const parsedData = parseCSS(cssText);
    renderUI(parsedData);
}

/**
 * 保存功能
 */
function saveSettings() {
    saveSettingsDebounced();
    // 可以添加一个简单的视觉反馈
    const btn = $('#ext-btn-save i');
    btn.removeClass('fa-floppy-disk').addClass('fa-check');
    setTimeout(() => btn.removeClass('fa-check').addClass('fa-floppy-disk'), 1000);
}

/**
 * 滚动功能
 */
function toggleScroll() {
    const content = $(`#${CONTENT_ID}`);
    const btnIcon = $('#ext-btn-scroll i');
    
    if (scrollDirection === 'bottom') {
        content.scrollTop(content[0].scrollHeight);
        scrollDirection = 'top';
        btnIcon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
    } else {
        content.scrollTop(0);
        scrollDirection = 'bottom';
        btnIcon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
    }
}

/**
 * 折叠功能
 */
function toggleCollapse() {
    const content = $(`#${CONTENT_ID}`);
    const btnIcon = $('#ext-btn-collapse i');
    
    if (isCollapsed) {
        content.removeClass('collapsed');
        btnIcon.removeClass('fa-plus').addClass('fa-minus');
    } else {
        content.addClass('collapsed');
        btnIcon.removeClass('fa-minus').addClass('fa-plus');
    }
    isCollapsed = !isCollapsed;
}

/**
 * 解析 CSS 文本
 * @param {string} css 
 * @returns {Array} 包含规则对象的数组
 */
function parseCSS(css) {
    const rules = [];
    let match;

    // 重置正则索引
    RULE_REGEX.lastIndex = 0;

    while ((match = RULE_REGEX.exec(css)) !== null) {
        // match[0]: 完整匹配
        // match[1]: 注释 (可能 undefined)
        // match[2]: 选择器
        // match[3]: 属性块内容
        
        const fullComment = match[1] ? match[1].trim() : '';
        // 如果有多个注释，取最后一个（紧邻类名的前一个）
        // 实际上正则 /\/\*\s*(.*?)\s*\*\/[\s\r\n]*/ 会匹配到最近的一个块注释
        // 如果需要处理连续的多个注释块，逻辑会更复杂，这里简单处理取正则捕获到的
        let title = fullComment;
        
        const selector = match[2].trim();
        const body = match[3];
        const startIndex = match.index; // 记录该规则在原文的起始位置，用于精确定位（如果需要）

        // 解析属性
        const properties = [];
        const propRegex = /([\w-]+)\s*:\s*([^;]+);?/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(body)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2].trim();
            
            // 检查该属性值是否包含颜色
            const colors = [];
            let colorMatch;
            COLOR_REGEX.lastIndex = 0; // 重置颜色正则
            
            while ((colorMatch = COLOR_REGEX.exec(propValue)) !== null) {
                colors.push({
                    value: colorMatch[0],
                    index: colorMatch.index // 在属性值字符串中的位置
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
            rules.push({
                comment: title,
                selector: selector,
                properties: properties,
                originalText: match[0] // 整个规则块的原始文本
            });
        }
    }
    return rules;
}

/**
 * 渲染 UI
 * @param {Array} rules 
 */
function renderUI(rules) {
    const container = $(`#${CONTENT_ID}`);
    container.empty();

    if (rules.length === 0) {
        container.append('<div class="ext-empty-msg">当前 CSS 中未检测到颜色属性。</div>');
        return;
    }

    rules.forEach((rule, ruleIndex) => {
        const titleDisplay = rule.comment 
            ? `<span class="rule-comment">${rule.comment}</span> <span class="rule-separator">|</span> <span class="rule-selector">${rule.selector}</span>` 
            : `<span class="rule-comment">${rule.selector}</span>`;

        const card = $(`<div class="css-rule-card">
            <div class="css-rule-header">${titleDisplay}</div>
        </div>`);

        rule.properties.forEach((prop, propIndex) => {
            const propRow = $(`<div class="css-property-row">
                <span class="property-name">${prop.name.toUpperCase()}</span>
                <div class="color-input-group"></div>
            </div>`);

            const group = propRow.find('.color-input-group');

            prop.colors.forEach((colorObj, colorIndex) => {
                // 构建胶囊组件
                const capsule = $(`
                    <div class="color-capsule">
                        <toolcool-color-picker color="${colorObj.value}" button-width="28px" button-height="28px" padding="0"></toolcool-color-picker>
                        <input type="text" class="color-text-input" value="${colorObj.value}">
                    </div>
                `);

                const picker = capsule.find('toolcool-color-picker')[0];
                const input = capsule.find('input');

                // 颜色选择器变更事件
                picker.addEventListener('change', (evt) => {
                    const newColor = evt.detail.rgba; // 获取rgba格式
                    input.val(newColor);
                    // 实时更新CSS文本框
                    updateCSSTextArea(rule.selector, prop.name, colorIndex, newColor);
                });

                // 文本框输入变更事件
                input.on('change', () => {
                    let newColor = input.val();
                    // 简单的验证，如果picker能识别最好，这里直接推给picker处理
                    picker.color = newColor;
                    // updateCSSTextArea 在 picker 的 change 事件中触发，但如果picker认为颜色没变可能不触发
                    // 所以这里也强制触发一次更新
                    updateCSSTextArea(rule.selector, prop.name, colorIndex, newColor);
                });

                group.append(capsule);
            });

            card.append(propRow);
        });

        container.append(card);
    });
}

/**
 * 更新 Custom CSS 文本框的核心逻辑
 * @param {string} selector CSS选择器
 * @param {string} propName 属性名 (如 background-color)
 * @param {number} colorIndex 该属性中第几个颜色 (处理渐变等多色情况)
 * @param {string} newColorVal 新颜色值
 */
function updateCSSTextArea(selector, propName, colorIndex, newColorVal) {
    const $textarea = $(TEXTAREA_SELECTOR);
    let cssText = $textarea.val();

    // 重新构建正则来定位具体的规则块
    // 逻辑：找到 selector { ... propName: ... ; ... }
    // 注意：需要转义 selector 中的特殊字符
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 定位规则块
    // 1. 找到选择器及后面的大括号
    const ruleBlockRegex = new RegExp(`(${escapedSelector}\\s*\\{)([^}]+)(\\})`, '');
    const ruleMatch = ruleBlockRegex.exec(cssText);

    if (!ruleMatch) {
        console.warn('CSS Extension: Cannot locate rule in textarea during update.');
        return;
    }

    const preBlock = ruleMatch[1];
    const blockBody = ruleMatch[2];
    const postBlock = ruleMatch[3];
    const fullMatchIndex = ruleMatch.index;

    // 定位属性
    // 在 blockBody 中查找 "propName: value;"
    // 简单的匹配：属性名 + 冒号 + 值 + 分号(或结束)
    const propRegex = new RegExp(`(${propName}\\s*:\\s*)([^;]+)(;?)`, 'i'); 
    // 注意：如果同一个块里写了两次同样的属性（比如兼容性写法），这里只会改第一个。
    // 更严谨的做法需要解析整个body，但对于用户手写CSS通常足够。
    
    const propMatch = propRegex.exec(blockBody);
    
    if (!propMatch) {
        console.warn('CSS Extension: Cannot locate property in rule.');
        return;
    }

    const preProp = propMatch[1];
    let propValue = propMatch[2];
    const postProp = propMatch[3];
    
    // 替换颜色
    // 我们需要在 propValue 中找到第 colorIndex+1 个颜色并替换它
    let currentColorIndex = 0;
    
    // 使用回调函数进行替换，只替换计数器匹配的那一个
    const newPropValue = propValue.replace(COLOR_REGEX, (match) => {
        if (currentColorIndex === colorIndex) {
            currentColorIndex++;
            return newColorVal;
        }
        currentColorIndex++;
        return match;
    });

    // 重新组装 CSS
    // 1. 组装新的 body
    const newBody = blockBody.substring(0, propMatch.index) + 
                    preProp + newPropValue + postProp + 
                    blockBody.substring(propMatch.index + propMatch[0].length);

    // 2. 组装新的 CSS 全文
    const newCssText = cssText.substring(0, fullMatchIndex) +
                       preBlock + newBody + postBlock +
                       cssText.substring(fullMatchIndex + ruleMatch[0].length);

    // 3. 写入并触发事件
    $textarea.val(newCssText).trigger('input');
}

// 启动插件
$(document).ready(init);
