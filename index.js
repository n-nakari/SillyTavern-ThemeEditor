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

// 颜色匹配正则
const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,.\/%]+\)|hsla?\([\d\s,.\/%]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey)/gi;

// CSS 块匹配正则
// Group 1: 完整的注释块 (可选)
// Group 2: 间隔 (用于判断空行)
// Group 3: 选择器
// Group 4: 属性块
const CSS_BLOCK_REGEX = /(?:(\/\*[\s\S]*?\*\/))?([\s\r\n]*)([^{]+)\{([^}]+)\}/g;

let scrollDirection = 'down';

jQuery(async () => {
    initUI();
    bindEvents();
    
    setTimeout(() => readAndRenderCSS(), 500);

    if (eventSource && event_types) {
        eventSource.on(event_types.SETTINGS_UPDATED, () => {
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
    $('#vce-btn-refresh').on('click', () => {
        readAndRenderCSS();
        const icon = $('#vce-btn-refresh i');
        icon.addClass('fa-spin');
        setTimeout(() => icon.removeClass('fa-spin'), 500);
    });

    $('#vce-btn-save').on('click', () => {
        const nativeSaveBtn = $('#ui-preset-update-button');
        if (nativeSaveBtn.length && nativeSaveBtn.is(':visible')) {
            nativeSaveBtn.trigger('click');
        } else {
            saveSettingsDebounced();
            toastr.info('Saved Settings (Native save button not found)', 'Visual CSS Editor');
        }
    });

    $('#vce-btn-scroll').on('click', function() {
        const content = $('#vce-content');
        const icon = $(this).find('i');
        
        if (scrollDirection === 'down') {
            content.animate({ scrollTop: content[0].scrollHeight }, 400, 'swing');
            scrollDirection = 'up';
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else {
            content.animate({ scrollTop: 0 }, 400, 'swing');
            scrollDirection = 'down';
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
        }
    });

    $('#vce-btn-collapse').on('click', function() {
        const container = $('#visual-css-editor');
        const icon = $(this).find('i');
        
        if (container.hasClass('collapsed')) {
            container.removeClass('collapsed');
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        } else {
            container.addClass('collapsed');
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        }
    });
}

/**
 * 核心逻辑修改部分：完全参考提供的思路进行标题格式化
 */
function readAndRenderCSS() {
    const cssText = $('#customCSS').val() || '';
    const container = $('#vce-content');
    container.empty();

    let match;
    let hasContent = false;
    CSS_BLOCK_REGEX.lastIndex = 0;

    while ((match = CSS_BLOCK_REGEX.exec(cssText)) !== null) {
        const rawCommentBlock = match[1]; // 例如 "/* 气泡框 */"
        const gap = match[2];             // 例如 "\n" 或 "\n\n"
        const selector = match[3].trim(); // 例如 ".mes"
        const body = match[4];            // 属性内容

        // 计算换行符数量：如果 gap 中包含2个或更多换行符，说明中间有空行
        // 参考逻辑：newlineCount < 2 代表紧邻， >= 2 代表隔了一行
        const newLineCount = (gap.match(/\n/g) || []).length;
        
        // 默认标题就是类名
        let displayTitle = selector;

        // 只有当存在注释 且 没有被空行隔开时，才提取注释
        if (rawCommentBlock && newLineCount < 2) {
            // 参考你提供的例子逻辑：提取 /* */ 中间的内容
            const commentMatch = rawCommentBlock.match(/\/\*([\s\S]*?)\*\//);
            
            if (commentMatch && commentMatch[1]) {
                const cleanComment = commentMatch[1].trim(); // 去除首尾空格
                // 如果提取到了内容，拼接格式： 注释 | 类名
                if (cleanComment) {
                    displayTitle = `${cleanComment} | ${selector}`;
                }
            }
        }

        const properties = parseProperties(body);
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
    // 直接显示处理好的 displayTitle
    const header = $(`<div class="vce-card-header">${title}</div>`);
    card.append(header);

    const propsList = $('<div class="vce-props-list"></div>');
    
    properties.forEach(prop => {
        const propRow = $('<div class="vce-prop-row"></div>');
        const propName = $(`<div class="vce-prop-name">${prop.key.toUpperCase()}</div>`);
        propRow.append(propName);

        const regex = new RegExp(COLOR_REGEX);
        let match;
        const colorsFound = [];
        
        while ((match = regex.exec(prop.value)) !== null) {
            colorsFound.push(match[0]);
        }

        const showIndex = colorsFound.length > 1;

        colorsFound.forEach((color, idx) => {
            const control = createColorControl(selector, prop.key, color, idx, showIndex ? idx + 1 : null);
            propRow.append(control);
        });

        propsList.append(propRow);
    });

    card.append(propsList);
    return card;
}

function createColorControl(selector, propKey, initialColor, colorIndex, displayIndex) {
    const wrapper = $('<div class="vce-color-wrapper" tabindex="0"></div>');
    
    if (displayIndex !== null) {
        wrapper.append(`<span class="vce-color-idx">${displayIndex}</span>`);
    }

    const pickerId = `vce-picker-${Math.random().toString(36).substr(2, 9)}`;
    const picker = $(`<toolcool-color-picker id="${pickerId}" color="${initialColor}" class="vce-picker"></toolcool-color-picker>`);
    const input = $(`<input type="text" class="vce-color-input" value="${initialColor}">`);

    wrapper.append(picker);
    wrapper.append(input);

    const updateCSS = (newColor) => {
        let cssText = $('#customCSS').val();
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const blockRegex = new RegExp(`((?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*)(${escapedSelector}\\s*\\{)([^}]+)(\\})`, 'g');
        
        const newCss = cssText.replace(blockRegex, (match, g1, g2, content, g4) => {
            const propRegex = new RegExp(`(${propKey}\\s*:\\s*)([^;]+)(;?)`, 'gi');
            
            const newContent = content.replace(propRegex, (m, pPrefix, pValue, pSuffix) => {
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
