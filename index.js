import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 定义扩展的HTML结构
const EXTENSION_HTML = `
<div id="visual-css-editor" class="vce-container">
    <div class="vce-toolbar">
        <div class="vce-buttons-left">
            <button id="vce-btn-refresh" class="vce-btn" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
            <button id="vce-btn-save" class="vce-btn" title="Save Theme"><i class="fa-solid fa-floppy-disk"></i></button>
            <button id="vce-btn-scroll" class="vce-btn" title="Scroll Top/Bottom"><i class="fa-solid fa-arrow-down"></i></button>
            <button id="vce-btn-collapse" class="vce-btn" title="Collapse/Expand"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
    </div>
    <div id="vce-content" class="vce-content">
        <div class="vce-empty-state">Initializing...</div>
    </div>
</div>
`;

// 颜色匹配正则 (排除 url() 防止误判图片路径)
const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,.\/%]+\)|hsla?\([\d\s,.\/%]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey)/gi;

// 改进的块匹配正则：
// Group 1: 完整的注释块 (例如 /* ... */) - 非贪婪
// Group 2: 注释和选择器之间的空白符
// Group 3: 选择器
// Group 4: 属性内容
const CSS_BLOCK_REGEX = /(?:\/\*([\s\S]*?)\*\/)?(\s*)([^{]+)\{([^}]+)\}/g;

let isCollapsed = false;
let scrollDirection = 'down';

jQuery(async () => {
    initUI();
    bindEvents();
    
    // 初次加载
    setTimeout(() => readAndRenderCSS(), 500);

    // 监听 ST 的设置更新事件（切换主题时会自动触发）
    if (eventSource && event_types) {
        eventSource.on(event_types.SETTINGS_UPDATED, () => {
            // 延迟一点，确保 #customCSS 文本域的值已被ST更新
            setTimeout(() => readAndRenderCSS(), 200);
        });
    }
});

function initUI() {
    const targetArea = $('#CustomCSS-textAreaBlock');
    if (targetArea.length && $('#visual-css-editor').length === 0) {
        targetArea.after(EXTENSION_HTML);
    }
}

function bindEvents() {
    // 刷新
    $('#vce-btn-refresh').on('click', () => {
        readAndRenderCSS();
        const icon = $('#vce-btn-refresh i');
        icon.addClass('fa-spin');
        setTimeout(() => icon.removeClass('fa-spin'), 500);
    });

    // 保存 - 模拟点击 ST 原生的 "Update theme file" 按钮
    $('#vce-btn-save').on('click', () => {
        const nativeSaveBtn = $('#ui-preset-update-button');
        if (nativeSaveBtn.length && nativeSaveBtn.is(':visible')) {
            nativeSaveBtn.trigger('click');
            // Toastr 通常由 ST 原生按钮触发，这里不再重复提示，除非找不到按钮
        } else {
            // 如果原生按钮不可用（例如未选择主题），尝试保存设置
            saveSettingsDebounced();
            toastr.info('Saved Settings (Native theme save button not found)', 'Visual CSS Editor');
        }
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

    // 折叠
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
}

function readAndRenderCSS() {
    const cssText = $('#customCSS').val() || '';
    const container = $('#vce-content');
    container.empty();

    let match;
    let hasContent = false;
    CSS_BLOCK_REGEX.lastIndex = 0;

    while ((match = CSS_BLOCK_REGEX.exec(cssText)) !== null) {
        const rawCommentContent = match[1]; // 注释内容（不含 /* */）
        const gap = match[2];               // 注释与类名之间的空白
        const selector = match[3].trim();   // 类名
        const body = match[4];              // 属性

        // 逻辑：判断是否显示注释
        // 1. 必须有注释内容
        // 2. Gap 中不能包含超过1个换行符（即不能有空行）
        // 计算换行符数量
        const newLineCount = (gap.match(/\n/g) || []).length;
        
        let displayTitle = selector;

        if (rawCommentContent && newLineCount <= 1) {
            // 清理注释内容：移除前后空格和可能存在的星号装饰
            const cleanComment = rawCommentContent
                .replace(/^[\s*]+/, '') // 去除开头的空格和星号
                .replace(/[\s*]+$/, '') // 去除结尾的空格和星号
                .trim();
            
            if (cleanComment) {
                // 格式化：注释 | 类名
                displayTitle = `${cleanComment} | ${selector}`;
            }
        }

        const properties = parseProperties(body);
        // 过滤：排除 CSS 变量 (--var) 和无颜色的属性
        const colorProperties = properties.filter(p => !p.key.startsWith('--') && hasColor(p.value));

        if (colorProperties.length > 0) {
            hasContent = true;
            const card = createCard(displayTitle, colorProperties, selector);
            container.append(card);
        }
    }

    if (!hasContent) {
        container.html('<div class="vce-empty-state">No editable colors found.</div>');
    }
}

function parseProperties(bodyStr) {
    const props = [];
    // 简单的分号分割
    const lines = bodyStr.split(';');
    lines.forEach(line => {
        if (!line.trim()) return;
        const firstColon = line.indexOf(':');
        if (firstColon === -1) return;
        
        const key = line.substring(0, firstColon).trim();
        const value = line.substring(firstColon + 1).trim();
        props.push({ key, value });
    });
    return props;
}

function hasColor(val) {
    COLOR_REGEX.lastIndex = 0;
    return COLOR_REGEX.test(val);
}

function createCard(title, properties, selector) {
    const card = $('<div class="vce-card"></div>');
    
    // 标题
    const header = $(`<div class="vce-card-header">${title}</div>`);
    card.append(header);

    const propsList = $('<div class="vce-props-list"></div>');
    
    properties.forEach(prop => {
        const propRow = $('<div class="vce-prop-row"></div>');
        const propName = $(`<div class="vce-prop-name">${prop.key.toUpperCase()}</div>`);
        propRow.append(propName);

        // 提取属性值中所有的颜色
        let colorCount = 0;
        const regex = new RegExp(COLOR_REGEX);
        let match;
        
        // 遍历所有匹配的颜色，生成多个控制器
        // 使用一个临时副本进行匹配，确保不修改原始值
        const valueStr = prop.value;
        
        while ((match = regex.exec(valueStr)) !== null) {
            const currentColor = match[0];
            const control = createColorControl(selector, prop.key, currentColor, colorCount);
            propRow.append(control);
            colorCount++;
        }

        propsList.append(propRow);
    });

    card.append(propsList);
    return card;
}

function createColorControl(selector, propKey, initialColor, colorIndex) {
    const wrapper = $('<div class="vce-color-wrapper" tabindex="0"></div>'); // 添加tabindex使其可聚焦
    
    const pickerId = `vce-picker-${Math.random().toString(36).substr(2, 9)}`;
    const picker = $(`<toolcool-color-picker id="${pickerId}" color="${initialColor}" class="vce-picker"></toolcool-color-picker>`);
    const input = $(`<input type="text" class="vce-color-input" value="${initialColor}">`);

    wrapper.append(picker);
    wrapper.append(input);

    const updateCSS = (newColor) => {
        let cssText = $('#customCSS').val();
        
        // 转义选择器中的特殊字符
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 1. 找到对应的 CSS 块
        // 正则解释：
        // ((?:\/\*[\s\S]*?\*\/)?\s*) -> 捕获组1：可能存在的注释+空白
        // (${escapedSelector}\s*\{) -> 捕获组2：选择器 + 左大括号
        // ([^}]+) -> 捕获组3：块内容
        // (\}) -> 捕获组4：右大括号
        const blockRegex = new RegExp(`((?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*)(${escapedSelector}\\s*\\{)([^}]+)(\\})`, 'g');
        
        const newCss = cssText.replace(blockRegex, (match, g1, g2, content, g4) => {
            // 2. 在块内容中找到对应的属性
            const propRegex = new RegExp(`(${propKey}\\s*:\\s*)([^;]+)(;?)`, 'gi');
            
            const newContent = content.replace(propRegex, (m, pPrefix, pValue, pSuffix) => {
                // 3. 在属性值中替换第 N 个颜色
                let currentIdx = 0;
                const newValue = pValue.replace(new RegExp(COLOR_REGEX), (matchColor) => {
                    if (currentIdx === colorIndex) {
                        currentIdx++;
                        return newColor;
                    }
                    currentIdx++;
                    return matchColor;
                });
                return `${pPrefix}${newValue}${pSuffix}`;
            });
            
            return `${g1}${g2}${newContent}${g4}`;
        });

        if (newCss !== cssText) {
            $('#customCSS').val(newCss).trigger('input');
        }
    };

    picker.on('change', (evt) => {
        const col = evt.detail.rgba;
        input.val(col);
        updateCSS(col);
    });

    input.on('change', () => {
        const col = input.val();
        const pEl = document.getElementById(pickerId);
        if (pEl) pEl.color = col;
        updateCSS(col);
    });

    return wrapper;
}
