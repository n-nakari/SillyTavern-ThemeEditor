import { saveSettingsDebounced, power_user } from '../../script.js';

// 定义颜色匹配正则 (支持 hex, rgb, rgba, hsl, hsla, 英文名, transparent)
// 性能优化：预编译正则
const COLOR_REGEX = /#([0-9a-fA-F]{3}){1,2}\b|rgba?\([\d\s,./%]+\)|hsla?\([\d\s,./%]+\)|transparent|[a-zA-Z]+(?![-(])/g;
// 排除一些常见的非颜色CSS关键字，避免误判
const EXCLUDE_KEYWORDS = new Set(['none', 'auto', 'inherit', 'initial', 'unset', 'solid', 'dashed', 'dotted', 'center', 'top', 'bottom', 'left', 'right', 'block', 'flex', 'grid', 'hidden', 'visible', 'absolute', 'relative', 'fixed', 'sticky', 'bold', 'normal', 'italic', 'pointer', 'default']);

// 检查字符串是否真的是颜色 (简单校验)
function isValidColor(str) {
    if (EXCLUDE_KEYWORDS.has(str.toLowerCase())) return false;
    // 这里可以利用浏览器的原生能力检测颜色有效性，但为了性能，我们主要依赖正则和排除列表
    return true;
}

// 解析 CSS 文本的核心函数
function parseCSS(cssText) {
    const rules = [];
    // 移除换行，简化正则 (但保留注释结构)
    // 1. 匹配规则块: (注释)? 选择器 { 内容 }
    const ruleRegex = /(?:\/\*\s*(.*?)\s*\*\/)?\s*([^{}]+)\s*\{([^{}]+)\}/g;
    
    let match;
    while ((match = ruleRegex.exec(cssText)) !== null) {
        const comment = match[1] ? match[1].trim() : '';
        const selector = match[2].trim();
        const content = match[3];
        
        // 优化：清理 selector 中的换行符
        const cleanSelector = selector.replace(/\s+/g, ' ');

        const properties = [];
        // 2. 匹配属性: property: value;
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].toLowerCase();
            const propValue = propMatch[2];
            
            // 3. 在属性值中查找颜色
            const colors = [];
            let colorMatch;
            // 重置 lastIndex 以防万一
            COLOR_REGEX.lastIndex = 0; 
            
            while ((colorMatch = COLOR_REGEX.exec(propValue)) !== null) {
                const colorStr = colorMatch[0];
                if (isValidColor(colorStr)) {
                    colors.push({
                        value: colorStr,
                        index: colorMatch.index // 记录在属性值字符串中的位置，用于后续替换
                    });
                }
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
                comment: comment,
                selector: cleanSelector,
                fullMatchIndex: match.index, // 记录整条规则在CSS中的位置（如果将来要做极其精确的定位）
                properties: properties
            });
        }
    }
    return rules;
}

const extensionRoot = document.createElement('div');
extensionRoot.id = 'st-css-extension-root';

// 构建 UI
function buildUI() {
    // 如果已经存在则清除，防止重复
    if ($('#st-css-extension-root').length) return;

    // 1. 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'st-css-toolbar';

    const btnRefresh = createBtn('fa-solid fa-sync-alt', '刷新 / Refresh', loadAndRender);
    const btnSave = createBtn('fa-solid fa-save', '保存 / Save', () => {
        saveSettingsDebounced();
        toastr.success('CSS & Settings Saved', 'Style Extension');
    });
    
    // 回顶/回底 逻辑
    let isAtTop = true;
    const btnScroll = createBtn('fa-solid fa-arrow-down', '回底 / Bottom', function() {
        const content = extensionRoot.querySelector('.st-css-content');
        if (isAtTop) {
            content.scrollTop = content.scrollHeight;
            this.querySelector('i').className = 'fa-solid fa-arrow-up';
            this.title = "回顶 / Top";
        } else {
            content.scrollTop = 0;
            this.querySelector('i').className = 'fa-solid fa-arrow-down';
            this.title = "回底 / Bottom";
        }
        isAtTop = !isAtTop;
    });

    const btnCollapse = createBtn('fa-solid fa-chevron-up', '折叠 / Collapse', function() {
        extensionRoot.classList.toggle('collapsed');
        const icon = this.querySelector('i');
        if (extensionRoot.classList.contains('collapsed')) {
            icon.className = 'fa-solid fa-chevron-down';
        } else {
            icon.className = 'fa-solid fa-chevron-up';
        }
    });

    toolbar.append(btnRefresh, btnSave, btnScroll, btnCollapse);

    // 2. 内容区
    const content = document.createElement('div');
    content.className = 'st-css-content';

    extensionRoot.append(toolbar, content);

    // 插入到 Custom CSS 文本框下方
    $('#CustomCSS-textAreaBlock').after(extensionRoot);

    // 初始加载
    loadAndRender();
}

function createBtn(iconClass, title, onClick) {
    const btn = document.createElement('button');
    btn.className = 'st-css-btn';
    btn.title = title;
    btn.innerHTML = `<i class="${iconClass}"></i>`;
    btn.onclick = (e) => {
        e.preventDefault(); // 防止触发表单提交
        onClick.call(btn, e);
    };
    return btn;
}

// 核心逻辑：读取 CSS -> 生成 DOM
function loadAndRender() {
    const cssText = power_user.custom_css || '';
    const container = extensionRoot.querySelector('.st-css-content');
    container.innerHTML = ''; // 清空

    const rules = parseCSS(cssText);

    if (rules.length === 0) {
        container.innerHTML = '<div class="st-css-empty">没有检测到包含颜色的 CSS 规则 / No colors found in CSS</div>';
        return;
    }

    // 使用 DocumentFragment 优化 DOM 插入性能
    const fragment = document.createDocumentFragment();

    rules.forEach(rule => {
        const card = document.createElement('div');
        card.className = 'st-css-card';

        // 标题部分：注释 | 类名
        const header = document.createElement('div');
        header.className = 'st-css-header';
        
        if (rule.comment) {
            const title = document.createElement('span');
            title.className = 'st-css-title';
            title.textContent = rule.comment;
            header.appendChild(title);
            
            // 分隔符
            const sep = document.createElement('span');
            sep.style.opacity = '0.3';
            sep.textContent = '|';
            header.appendChild(sep);
        }

        const selector = document.createElement('span');
        selector.className = 'st-css-selector';
        selector.textContent = rule.selector;
        header.appendChild(selector);
        card.appendChild(header);

        // 属性部分
        rule.properties.forEach(prop => {
            const propRow = document.createElement('div');
            propRow.className = 'st-css-prop-row';

            const propName = document.createElement('div');
            propName.className = 'st-css-prop-name';
            propName.textContent = prop.name;
            propRow.appendChild(propName);

            const pickersContainer = document.createElement('div');
            pickersContainer.className = 'st-css-pickers-container';

            // 为该属性中的每个颜色创建选择器
            prop.colors.forEach((colorObj, colorIndex) => {
                const picker = document.createElement('toolcool-color-picker');
                picker.color = colorObj.value;
                picker.style.width = '30px';
                picker.style.height = '30px';
                picker.style.padding = '0';
                
                // 核心：实时更新逻辑
                // 使用 'change' 事件，toolcool-color-picker 支持
                picker.addEventListener('change', (evt) => {
                    const newColor = evt.detail.rgba; // 获取新颜色
                    updateCSS(rule.selector, prop.name, colorIndex, newColor);
                });

                pickersContainer.appendChild(picker);
            });

            propRow.appendChild(pickersContainer);
            card.appendChild(propRow);
        });

        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

// 核心逻辑：更新 CSS 文本并应用
// 这里采用“读取当前文本框 -> 正则替换 -> 写回文本框 -> 触发输入事件”的流程
function updateCSS(selector, propName, colorIndexInProp, newColor) {
    const textArea = $('#customCSS');
    let currentCSS = textArea.val();

    // 构建一个足够精确的正则来定位具体的规则块和属性
    // 注意：这需要非常小心，为了性能和准确性，我们假设用户没有在短时间内大幅修改结构
    // 1. 找到规则块
    const ruleRegex = new RegExp(`((?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*${escapeRegExp(selector)}\\s*\\{)`, 'g');
    
    // 我们需要遍历找到正确的块（如果有多个相同的 selector，这可能会更新第一个，这是妥协）
    // 为了简化，我们假设选择器是唯一的或只更新第一个匹配项
    
    // 更稳健的方法：重新解析并构建字符串，但那样会破坏格式。
    // 这里的策略是：定位到 selector 后，在紧接着的 {} 块内查找属性。

    let match = ruleRegex.exec(currentCSS);
    if (!match) return; // 找不到选择器

    const blockStartIndex = match.index + match[0].length;
    const cssAfterSelector = currentCSS.slice(blockStartIndex);
    const blockEndIndex = cssAfterSelector.indexOf('}');
    
    if (blockEndIndex === -1) return; // CSS 结构错误

    const blockContent = cssAfterSelector.substring(0, blockEndIndex);
    
    // 2. 在块内容中找到属性
    const propRegex = new RegExp(`(${escapeRegExp(propName)}\\s*:\\s*)([^;]+)(;)`, 'gi');
    let propMatch = propRegex.exec(blockContent);
    
    if (!propMatch) return; // 找不到属性

    const propPrefix = propMatch[1];
    let propValue = propMatch[2];
    const propSuffix = propMatch[3];

    // 3. 在属性值中替换第 N 个颜色
    // 我们需要再次用 COLOR_REGEX 扫描 propValue 来定位第 colorIndexInProp 个颜色
    let colorMatches = [];
    let cm;
    COLOR_REGEX.lastIndex = 0;
    while ((cm = COLOR_REGEX.exec(propValue)) !== null) {
        if (isValidColor(cm[0])) {
            colorMatches.push({ start: cm.index, end: cm.index + cm[0].length, val: cm[0] });
        }
    }

    if (colorMatches[colorIndexInProp]) {
        const target = colorMatches[colorIndexInProp];
        // 替换字符串
        const newPropValue = propValue.substring(0, target.start) + newColor + propValue.substring(target.end);
        
        // 拼装新的块内容
        const newBlockContent = blockContent.substring(0, propMatch.index) + 
                               propPrefix + newPropValue + propSuffix + 
                               blockContent.substring(propMatch.index + propMatch[0].length);

        // 拼装新的完整 CSS
        const newCSS = currentCSS.substring(0, blockStartIndex) + newBlockContent + currentCSS.substring(blockStartIndex + blockEndIndex);

        // 4. 更新
        power_user.custom_css = newCSS; // 更新内存
        textArea.val(newCSS); // 更新UI
        textArea.trigger('input'); // 触发 ST 的原生监听器以应用样式
    }
}

// 辅助：转义正则特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

// 初始化
jQuery(document).ready(function () {
    // 稍微延迟以确保 #CustomCSS-textAreaBlock 已渲染
    setTimeout(buildUI, 500);
    
    // 监听 ST 主题切换事件（如果有），或者监听设置面板打开
    // 这里我们简单地通过 MutationObserver 监听 #user-settings-button 的打开状态，
    // 或者简单地依赖用户点击“刷新”按钮。
    // 为了更好的体验，当 CSS 文本框失去焦点时，自动刷新面板
    $(document).on('blur', '#customCSS', function() {
        // 给一点延迟让保存先发生
        setTimeout(loadAndRender, 200);
    });
});
