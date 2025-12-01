import { saveSettingsDebounced } from "../../../../script.js";

// 定义扩展的HTML结构
const EXTENSION_HTML = `
<div id="visual-css-editor" class="vce-container">
    <div class="vce-toolbar">
        <div class="vce-buttons-left">
            <button id="vce-btn-refresh" class="vce-btn" title="Refresh / Read CSS"><i class="fa-solid fa-rotate-right"></i></button>
            <button id="vce-btn-save" class="vce-btn" title="Save Settings"><i class="fa-solid fa-floppy-disk"></i></button>
            <button id="vce-btn-scroll" class="vce-btn" title="Scroll Top/Bottom"><i class="fa-solid fa-arrow-down"></i></button>
            <button id="vce-btn-collapse" class="vce-btn" title="Collapse/Expand"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
    </div>
    <div id="vce-content" class="vce-content">
        <!-- 动态生成的条目将放在这里 -->
        <div class="vce-empty-state">Click refresh to load CSS colors...</div>
    </div>
</div>
`;

// 颜色匹配正则 (Hex, RGB, HSL, Keywords)
const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,.\/%]+\)|hsla?\([\d\s,.\/%]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey)/gi;

// CSS 块匹配正则
const CSS_BLOCK_REGEX = /(?:\/\*([\s\S]*?)\*\/[\s\r\n]*)*([^{]+)\{([^}]+)\}/g;

let isCollapsed = false;
let scrollDirection = 'down'; // 'down' means click to go down

jQuery(async () => {
    // 1. 初始化界面
    initUI();

    // 2. 绑定事件
    bindEvents();

    // 3. 初次加载 (延迟一点确保SillyTavern已经加载了设置)
    setTimeout(() => {
        readAndRenderCSS();
    }, 1000);
});

function initUI() {
    // 定位到自定义CSS框下方
    const targetArea = $('#CustomCSS-textAreaBlock');
    if (targetArea.length) {
        targetArea.after(EXTENSION_HTML);
    } else {
        console.warn('Visual CSS Editor: Could not find #CustomCSS-textAreaBlock');
    }
}

function bindEvents() {
    // 刷新
    $('#vce-btn-refresh').on('click', () => {
        readAndRenderCSS();
        // 添加一个小动画反馈
        const icon = $('#vce-btn-refresh i');
        icon.addClass('fa-spin');
        setTimeout(() => icon.removeClass('fa-spin'), 500);
    });

    // 保存
    $('#vce-btn-save').on('click', () => {
        saveSettingsDebounced();
        toastr.success('CSS Settings Saved', 'Visual CSS Editor');
    });

    // 回顶/回底
    $('#vce-btn-scroll').on('click', function() {
        const content = $('#vce-content');
        const icon = $(this).find('i');
        
        if (scrollDirection === 'down') {
            content.animate({ scrollTop: content[0].scrollHeight }, 300);
            scrollDirection = 'up';
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else {
            content.animate({ scrollTop: 0 }, 300);
            scrollDirection = 'down';
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
        }
    });

    // 折叠/展开
    $('#vce-btn-collapse').on('click', function() {
        const content = $('#vce-content');
        const icon = $(this).find('i');
        
        if (isCollapsed) {
            content.slideDown(200);
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        } else {
            content.slideUp(200);
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        }
        isCollapsed = !isCollapsed;
    });

    // 监听SillyTavern的主题切换事件 (hacky way: 监听body class变化或特定事件，这里简单起见假设用户手动点击刷新，或者可以在全局事件中hook)
    // 注意：ST原生的刷新网页会自动重新执行此脚本的init，所以不需要额外监听 load
}

/**
 * 核心功能：读取CSS文本框内容并渲染
 */
function readAndRenderCSS() {
    const cssText = $('#customCSS').val() || '';
    const container = $('#vce-content');
    container.empty();

    let match;
    let hasContent = false;

    // 重置正则索引
    CSS_BLOCK_REGEX.lastIndex = 0;

    // 遍历所有CSS块
    while ((match = CSS_BLOCK_REGEX.exec(cssText)) !== null) {
        const fullMatch = match[0];
        const rawComment = match[1]; // 捕获组1：注释 (可能undefined)
        const selector = match[2].trim(); // 捕获组2：选择器
        const body = match[3]; // 捕获组3：属性块

        // 处理标题：如果有注释，取最后一行非空注释；否则用选择器
        let title = selector;
        let subtitle = ''; // 类名作为副标题

        if (rawComment) {
            // 清理注释内容，取最后一段有意义的文字
            const commentLines = rawComment.split(/[\r\n]+/).map(s => s.trim()).filter(s => s);
            if (commentLines.length > 0) {
                title = commentLines[commentLines.length - 1].replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
                subtitle = selector;
            }
        }

        // 解析属性块
        const properties = parseProperties(body);
        
        // 筛选出含有颜色的属性
        const colorProperties = properties.filter(p => hasColor(p.value));

        if (colorProperties.length > 0) {
            hasContent = true;
            const card = createCard(title, subtitle, colorProperties, selector);
            container.append(card);
        }
    }

    if (!hasContent) {
        container.html('<div class="vce-empty-state">No editable colors found in Custom CSS.</div>');
    }
}

/**
 * 解析属性字符串为对象数组
 * @param {string} bodyStr 
 */
function parseProperties(bodyStr) {
    const props = [];
    // 简单的分号分割，注意：这不支持 base64 图片中包含分号的情况，但在颜色编辑场景通常够用
    // 更严谨的方法需逐字解析，这里为了性能采用分割
    const lines = bodyStr.split(';');
    
    lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(':');
        if (parts.length < 2) return;
        
        const key = parts[0].trim();
        // 值可能包含冒号（如url），所以重新组合剩余部分
        const value = parts.slice(1).join(':').trim();
        
        props.push({ key, value });
    });
    return props;
}

/**
 * 检查字符串是否包含颜色
 */
function hasColor(val) {
    COLOR_REGEX.lastIndex = 0; // 重置
    return COLOR_REGEX.test(val);
}

/**
 * 创建单个CSS规则的卡片DOM
 */
function createCard(title, subtitle, properties, selector) {
    const card = $('<div class="vce-card"></div>');
    
    // 标题区域
    const header = $(`
        <div class="vce-card-header">
            <div class="vce-card-title">${title}</div>
            ${subtitle ? `<div class="vce-card-subtitle">${subtitle}</div>` : ''}
        </div>
    `);
    card.append(header);

    // 属性列表
    const propsList = $('<div class="vce-props-list"></div>');
    
    properties.forEach(prop => {
        const propRow = $('<div class="vce-prop-row"></div>');
        const propName = $(`<div class="vce-prop-name">${prop.key.toUpperCase()}</div>`);
        propRow.append(propName);

        // 在值中查找所有颜色
        let colorMatch;
        const colors = [];
        // 这里必须用循环匹配所有颜色
        const regex = new RegExp(COLOR_REGEX); 
        while ((colorMatch = regex.exec(prop.value)) !== null) {
            colors.push({
                color: colorMatch[0],
                index: colorMatch.index
            });
        }

        // 为每个颜色创建一个控制器
        colors.forEach((colorObj, idx) => {
            const controlGroup = createColorControl(selector, prop.key, prop.value, colorObj.color, idx);
            propRow.append(controlGroup);
        });

        propsList.append(propRow);
    });

    card.append(propsList);
    return card;
}

/**
 * 创建颜色控制器（选择器+输入框）
 * @param {string} selector CSS选择器
 * @param {string} propKey 属性名
 * @param {string} fullValue 属性完整值（用于处理渐变等多颜色情况）
 * @param {string} currentColor 当前颜色值
 * @param {number} colorIndex 该属性中第几个颜色（用于区分渐变中的多个颜色）
 */
function createColorControl(selector, propKey, fullValue, currentColor, colorIndex) {
    const wrapper = $('<div class="vce-color-wrapper"></div>');
    
    // 1. ToolCool Color Picker
    // 注意：ToolCool Picker 是 Web Component，使用 <toolcool-color-picker>
    const pickerId = `vce-picker-${Math.random().toString(36).substr(2, 9)}`;
    const picker = $(`<toolcool-color-picker id="${pickerId}" color="${currentColor}" class="vce-picker"></toolcool-color-picker>`);
    
    // 2. 文本输入框
    const input = $(`<input type="text" class="vce-color-input" value="${currentColor}">`);

    // 组装
    wrapper.append(picker);
    wrapper.append(input);

    // 事件处理函数：更新CSS
    const updateCSS = (newColor) => {
        // 读取当前文本框的最新内容 (因为可能已经被其他条目修改了)
        let currentCSSText = $('#customCSS').val();
        
        // 定位规则块
        // 这里使用简单的字符串查找和正则替换可能不够精确，特别是当有多个相同的选择器时。
        // 为了稳健性，我们构建一个针对该特定属性的正则替换。
        
        // 1. 找到选择器对应的块
        // 构造正则：找到 selector { ... propKey: ... } 
        // 注意转义选择器中的特殊字符
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 匹配该选择器块的正则
        const blockRegex = new RegExp(`((?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)*${escapedSelector}\\s*\\{)([^}]+)(\\})`, 'g');
        
        let newCSSText = currentCSSText.replace(blockRegex, (match, prefix, content, suffix) => {
            // 在 content 中找到对应的属性
            // 构造匹配属性的正则: property: value;
            const propRegex = new RegExp(`(${propKey}\\s*:\\s*)([^;]+)(;?)`, 'gi');
            
            const newContent = content.replace(propRegex, (m, pPrefix, pValue, pSuffix) => {
                // 此时 pValue 是旧的完整属性值 (例如 "linear-gradient(red, blue)")
                // 我们需要替换里面的第 colorIndex 个颜色
                
                let colorCount = 0;
                // 替换第 colorIndex 次出现的颜色
                const newValue = pValue.replace(new RegExp(COLOR_REGEX), (matchColor) => {
                    if (colorCount === colorIndex) {
                        colorCount++;
                        return newColor;
                    }
                    colorCount++;
                    return matchColor;
                });
                
                return `${pPrefix}${newValue}${pSuffix}`;
            });
            
            return `${prefix}${newContent}${suffix}`;
        });

        // 写入并触发事件
        $('#customCSS').val(newCSSText).trigger('input');
    };

    // 绑定 Picker 变化
    picker.on('change', (evt) => {
        const newColor = evt.detail.rgba; // ToolCool picker 返回 rgba
        input.val(newColor);
        updateCSS(newColor);
    });

    // 绑定 Input 变化
    input.on('change', () => {
        const newColor = input.val();
        // 更新 picker 显示
        const pickerElem = document.getElementById(pickerId);
        if(pickerElem) pickerElem.color = newColor;
        updateCSS(newColor);
    });

    return wrapper;
}
