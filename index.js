import { saveSettingsDebounced } from "../../../script.js";

// 扩展状态管理
const extState = {
    isCollapsed: false,
    parsedData: [],
    // 缓存正则表达式以提高性能
    regex: {
        // 匹配块：包含注释(可选)和类名，以及大括号内的内容
        // 捕获组: 1=注释(可能多行), 2=选择器, 3=内容
        block: /(?:\/\*([\s\S]*?)\*\/)?\s*([^{]+)\s*\{([^}]+)\}/g,
        // 匹配属性：属性名: 属性值
        prop: /([\w-]+)\s*:\s*([^;]+);/g,
        // 匹配颜色：Hex, RGB(a), HSL(a), 颜色关键字
        // 排除 url() 里的内容，防止匹配图片名
        color: /(?:#[\da-fA-F]{3,8}|rgba?\([\d\s,./%]+\)|hsla?\([\d\s,./%]+\)|transparent|[a-zA-Z]+)(?![^(]*\))/g
    },
    // 需要排除的非颜色关键字
    excludeKeywords: ['none', 'auto', 'inherit', 'initial', 'unset', 'url', 'var', 'center', 'top', 'bottom', 'left', 'right', 'cover', 'contain', 'repeat', 'no-repeat', 'scroll', 'fixed', 'block', 'inline', 'flex', 'grid', 'hidden', 'visible', 'pointer', 'default', 'solid', 'dashed', 'dotted', 'bold', 'normal', 'italic', 'underline']
};

/**
 * 初始化扩展
 */
const initExtension = () => {
    console.log('[CSS Color Ext] Initializing...');
    
    // 1. 定位目标容器 (SillyTavern 设置面板中的 Custom CSS 区域)
    const targetArea = document.querySelector('#CustomCSS-block');
    if (!targetArea) {
        setTimeout(initExtension, 1000); // 如果还没加载出来，延迟重试
        return;
    }

    // 2. 构建 UI 骨架
    buildInterface(targetArea);

    // 3. 初次加载数据
    refreshPanel();
};

/**
 * 构建界面骨架
 * @param {HTMLElement} container 
 */
const buildInterface = (container) => {
    // 防止重复添加
    if (document.getElementById('st-css-editor-container')) return;

    const html = `
        <div id="st-css-editor-container">
            <div class="st-css-toolbar">
                <div class="st-css-btn-group">
                    <button id="st-css-refresh" class="st-css-btn" title="刷新面板">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                    <button id="st-css-save" class="st-css-btn" title="保存设置">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                </div>
                <div class="st-css-btn-group">
                    <button id="st-css-scroll" class="st-css-btn" title="回顶/回底">
                        <i class="fa-solid fa-arrows-up-down"></i>
                    </button>
                    <button id="st-css-collapse" class="st-css-btn" title="折叠/展开">
                        <i class="fa-solid fa-chevron-up"></i>
                    </button>
                </div>
            </div>
            <div id="st-css-list">
                <!-- 列表项将在这里动态生成 -->
            </div>
        </div>
    `;

    // 插入到 Custom CSS 文本框下方
    const cssTextarea = container.querySelector('#customCSS');
    if (cssTextarea && cssTextarea.parentNode) {
        // 创建一个临时容器并转换成 DOM
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html.trim();
        const extensionUi = tempDiv.firstChild;
        
        // 插入到 DOM 中
        cssTextarea.parentNode.insertBefore(extensionUi, cssTextarea.nextSibling);
        
        // 绑定事件
        bindEvents();
    }
};

/**
 * 绑定按钮事件
 */
const bindEvents = () => {
    // 刷新
    document.getElementById('st-css-refresh').addEventListener('click', refreshPanel);

    // 保存
    document.getElementById('st-css-save').addEventListener('click', () => {
        saveSettingsDebounced();
        // 模拟点击 ST 原生保存按钮的视觉反馈或逻辑（如果有）
        toastr.success('CSS及设置已保存', '样式扩展');
    });

    // 滚动
    document.getElementById('st-css-scroll').addEventListener('click', () => {
        const list = document.getElementById('st-css-list');
        // 如果当前位置大于 0，滚到底部；如果在底部，滚到顶部
        // 简单逻辑：如果在上半部分就滚到底，否则滚到顶
        if (list.scrollTop < list.scrollHeight / 2) {
            list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
        } else {
            list.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // 折叠
    document.getElementById('st-css-collapse').addEventListener('click', (e) => {
        const container = document.getElementById('st-css-editor-container');
        const icon = e.currentTarget.querySelector('i');
        
        extState.isCollapsed = !extState.isCollapsed;
        
        if (extState.isCollapsed) {
            container.classList.add('collapsed');
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            container.classList.remove('collapsed');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    });
};

/**
 * 核心逻辑：读取 CSS 并重新渲染列表
 */
const refreshPanel = () => {
    const listContainer = document.getElementById('st-css-list');
    const cssContent = document.getElementById('customCSS').value;
    
    listContainer.innerHTML = ''; // 清空列表
    extState.parsedData = []; // 清空缓存数据

    // 1. 解析 CSS 块
    let match;
    // 重置正则索引
    extState.regex.block.lastIndex = 0;

    while ((match = extState.regex.block.exec(cssContent)) !== null) {
        const fullComment = match[1] || ''; // 可能为空
        const selector = match[2].trim();
        const body = match[3];
        
        // 处理注释：如果有多行，只取最后一行（即紧贴着类名的那一行）
        let cleanComment = '';
        if (fullComment) {
            const commentLines = fullComment.split('\n').filter(line => line.trim() !== '');
            if (commentLines.length > 0) {
                cleanComment = commentLines[commentLines.length - 1].trim();
            }
        }

        // 解析属性
        const properties = parseProperties(body);

        if (properties.length > 0) {
            // 保存解析结果，用于构建 UI
            const itemData = {
                title: cleanComment || '未命名样式', // 如果没注释，显示占位符
                selector: selector,
                properties: properties,
                fullBlockMatch: match[0],
                startIndex: match.index
            };
            extState.parsedData.push(itemData);
            
            // 渲染该条目
            const itemEl = createItemElement(itemData);
            listContainer.appendChild(itemEl);
        }
    }

    if (listContainer.children.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; opacity:0.5; padding:20px;">未检测到包含颜色的 CSS 规则</div>';
    }
};

/**
 * 解析 CSS 属性块，提取含有颜色的属性
 * @param {string} cssBody 
 */
const parseProperties = (cssBody) => {
    const props = [];
    let match;
    extState.regex.prop.lastIndex = 0;

    while ((match = extState.regex.prop.exec(cssBody)) !== null) {
        const propName = match[1].trim().toLowerCase();
        const propValue = match[2].trim();

        // 查找颜色
        const colors = [];
        let colorMatch;
        // 创建一个新的正则对象避免 lastIndex 污染，或者重置
        const colorRegex = new RegExp(extState.regex.color); 
        
        while ((colorMatch = colorRegex.exec(propValue)) !== null) {
            const colorStr = colorMatch[0];
            // 过滤掉非颜色关键字
            if (!extState.excludeKeywords.includes(colorStr.toLowerCase())) {
                colors.push({
                    value: colorStr,
                    index: colorMatch.index // 在属性值字符串中的位置，用于替换
                });
            }
        }

        if (colors.length > 0) {
            props.push({
                name: propName,
                value: propValue,
                colors: colors
            });
        }
    }
    return props;
};

/**
 * 创建单个列表项 DOM
 * @param {Object} data 
 */
const createItemElement = (data) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'st-css-item';

    // 标题部分
    const header = document.createElement('div');
    header.className = 'st-css-header';
    header.innerHTML = `
        <span class="st-css-comment">${data.title}</span>
        <span class="st-css-selector">${data.selector}</span>
    `;
    itemDiv.appendChild(header);

    // 属性循环
    data.properties.forEach(prop => {
        const row = document.createElement('div');
        row.className = 'st-css-prop-row';
        
        const propTitle = document.createElement('div');
        propTitle.className = 'st-css-prop-name';
        propTitle.innerText = prop.name.toUpperCase();
        row.appendChild(propTitle);

        const colorGroup = document.createElement('div');
        colorGroup.className = 'st-css-color-group';

        // 颜色选择器循环
        prop.colors.forEach((colorObj, colorIndex) => {
            const pickerWrapper = document.createElement('div');
            pickerWrapper.className = 'st-css-picker-wrapper';
            
            // 使用 toolcool-color-picker
            const picker = document.createElement('toolcool-color-picker');
            picker.color = colorObj.value;
            
            // 关键：实时更新逻辑
            picker.addEventListener('change', (e) => {
                const newColor = e.detail.rgba; // 获取 RGBA 格式
                updateCssContent(data.selector, prop.name, colorIndex, newColor);
            });

            pickerWrapper.appendChild(picker);
            colorGroup.appendChild(pickerWrapper);
        });

        row.appendChild(colorGroup);
        itemDiv.appendChild(row);
    });

    return itemDiv;
};

/**
 * 更新 Custom CSS 文本框内容
 * @param {string} selector 选择器名
 * @param {string} propName 属性名
 * @param {number} colorIndex 该属性下的第几个颜色
 * @param {string} newColor 新颜色值
 */
const updateCssContent = (selector, propName, colorIndex, newColor) => {
    const textarea = document.getElementById('customCSS');
    let cssText = textarea.value;

    // 这是一个简化但高效的替换策略：
    // 我们不重新生成整个 CSS，而是定位到特定的块和属性进行替换，保留用户格式。
    
    // 1. 找到选择器位置
    const blockRegex = new RegExp(`((?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*${escapeRegExp(selector)}\\s*\\{)`, 'g');
    let blockMatch;
    
    // 我们需要通过遍历确保找对位置（可能会有重复选择器，这里简单处理取第一个匹配的完整块）
    // 为了更严谨，实际应用中最好配合 refreshPanel 时的索引，但考虑到用户可能手动修改，
    // 这里采用动态正则匹配当前文本。
    
    blockMatch = blockRegex.exec(cssText);
    
    if (blockMatch) {
        const blockStartIndex = blockMatch.index + blockMatch[0].length;
        const blockEndIndex = cssText.indexOf('}', blockStartIndex);
        
        if (blockEndIndex === -1) return; // 格式错误

        // 截取大括号内的内容
        const blockBodyOriginal = cssText.substring(blockStartIndex, blockEndIndex);
        
        // 在块内查找属性
        // 匹配: propName : value ;
        const propRegex = new RegExp(`(${escapeRegExp(propName)}\\s*:\\s*)([^;]+)(;)`, 'i');
        const propMatch = propRegex.exec(blockBodyOriginal);

        if (propMatch) {
            const valPrefix = propMatch[1];
            let valContent = propMatch[2];
            const valSuffix = propMatch[3];

            // 在属性值中替换颜色
            // 重新运行颜色提取逻辑来定位第 N 个颜色
            let currentColorIndex = 0;
            const colorRegex = new RegExp(extState.regex.color);
            
            // 使用 replace 回调函数精确替换第 colorIndex 个匹配项
            const newValContent = valContent.replace(colorRegex, (match) => {
                if (extState.excludeKeywords.includes(match.toLowerCase())) return match;
                
                if (currentColorIndex === colorIndex) {
                    currentColorIndex++;
                    return newColor; // 替换为新颜色
                }
                currentColorIndex++;
                return match; // 保持原样
            });

            // 组合新的块内容
            const newBlockBody = blockBodyOriginal.replace(propMatch[0], valPrefix + newValContent + valSuffix);
            
            // 组合新的完整 CSS
            const newCssText = cssText.substring(0, blockStartIndex) + newBlockBody + cssText.substring(blockEndIndex);
            
            // 更新文本框
            textarea.value = newCssText;
            
            // 触发 input 事件，让 SillyTavern 感知变化并实时应用样式
            const event = new Event('input', { bubbles: true });
            textarea.dispatchEvent(event);
        }
    }
};

/**
 * 辅助：转义正则特殊字符
 */
const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// 启动
// 等待 jQuery 就绪 (SillyTavern 环境)
if (typeof jQuery !== 'undefined') {
    jQuery(document).ready(initExtension);
} else {
    // 纯 JS 回退
    document.addEventListener('DOMContentLoaded', initExtension);
    // 针对动态加载的情况，稍微延迟一下
    setTimeout(initExtension, 2000);
}
