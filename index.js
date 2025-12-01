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

// CSS 块匹配正则 (改进版)
// Group 1: 前缀 (包含注释、空格、换行)
// Group 2: 选择器
// Group 3: 属性块
const CSS_BLOCK_REGEX = /((?:\s*\/\*[\s\S]*?\*\/)*\s*)([^{]+)\{([^}]+)\}/g;

let isCollapsed = false;
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
    // 刷新
    $('#vce-btn-refresh').on('click', () => {
        readAndRenderCSS();
        const icon = $('#vce-btn-refresh i');
        icon.addClass('fa-spin');
        setTimeout(() => icon.removeClass('fa-spin'), 500);
    });

    // 保存
    $('#vce-btn-save').on('click', () => {
        const nativeSaveBtn = $('#ui-preset-update-button');
        if (nativeSaveBtn.length && nativeSaveBtn.is(':visible')) {
            nativeSaveBtn.trigger('click');
        } else {
            saveSettingsDebounced();
            toastr.info('Saved Settings', 'Visual CSS Editor');
        }
    });

    // 回顶/回底 (平滑滚动)
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

    // 折叠 (平滑过渡)
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

function readAndRenderCSS() {
    const cssText = $('#customCSS').val() || '';
    const container = $('#vce-content');
    container.empty();

    let match;
    let hasContent = false;
    CSS_BLOCK_REGEX.lastIndex = 0;

    while ((match = CSS_BLOCK_REGEX.exec(cssText)) !== null) {
        const prefix = match[1] || ""; // 包含所有注释和空白
        const selector = match[2].trim();
        const body = match[3];

        let displayTitle = selector;

        // 核心修正逻辑：分析前缀
        // 匹配前缀中 "最后一条注释" 以及 "它后面的空白"
        // 1. \/\*([\s\S]*?)\*\/  -> 捕获注释内容（不含符号）
        // 2. ([ \t\r\n]*)$      -> 捕获注释后直到选择器前的所有空白
        const lastCommentRegex = /\/\*([\s\S]*?)\*\/([ \t\r\n]*)$/;
        const commentMatch = prefix.match(lastCommentRegex);

        if (commentMatch) {
            const rawContent = commentMatch[1]; // 注释内部文字
            const gap = commentMatch[2];        // 间隔空白

            // 计算间隔中的换行符数量
            const newLineCount = (gap.match(/\n/g) || []).length;

            // 只有当换行符小于1（即紧邻或仅隔一行）时才视为有效标题
            if (newLineCount < 1) {
                const cleanComment = rawContent.trim();
                if (cleanComment) {
                    // 强制格式：注释 | .类名
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
    const header = $(`<div class="vce-card-header">${title}</div>`);
    card.append(header);

    const propsList = $('<div class="vce-props-list"></div>');
    
    properties.forEach(prop => {
        const propRow = $('<div class="vce-prop-row"></div>');
        const propName = $(`<div class="vce-prop-name">${prop.key.toUpperCase()}</div>`);
        propRow.append(propName);

        // 统计颜色数量
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
        
        // 构造正则以定位整个块
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const blockRegex = new RegExp(`((?:\\s*\\/\\*[\\s\\S]*?\\*\\/)*\\s*)(${escapedSelector}\\s*\\{)([^}]+)(\\})`, 'g');
        
        const newCss = cssText.replace(blockRegex, (match, g1, g2, content, g4) => {
            const propRegex = new RegExp(`(${propKey}\\s*:\\s*)([^;]+)(;?)`, 'gi');
            
            const newContent = content.replace(propRegex, (m, pPrefix, pValue, pSuffix) => {
                let currentIdx = 0;
                // 仅替换第 colorIndex 个颜色
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
