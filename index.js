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

// CSS 块匹配正则 (更稳健的策略)
// 捕获组1: { 之前的所有内容 (包含注释、换行、选择器)
// 捕获组2: { } 内部的属性内容
const CSS_BLOCK_REGEX = /([^{]+)\{([^}]+)\}/g;

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

    // 保存 - 模拟原生点击
    $('#vce-btn-save').on('click', () => {
        // 尝试找到 ST 原生的 "Update theme file" 按钮
        // 通常 ID 为 ui-preset-update-button
        const nativeSaveBtn = $('#ui-preset-update-button');
        
        if (nativeSaveBtn.length) {
            // 触发原生保存逻辑 (即保存到文件)
            nativeSaveBtn.trigger('click');
            // 添加一个视觉反馈，因为原生的 toastr 可能不会立即显示
            const btnIcon = $('#vce-btn-save i');
            btnIcon.removeClass('fa-floppy-disk').addClass('fa-check');
            setTimeout(() => btnIcon.removeClass('fa-check').addClass('fa-floppy-disk'), 1000);
        } else {
            // 如果找不到原生按钮 (罕见情况)，回退到保存设置
            saveSettingsDebounced();
            toastr.warning('Native theme save button not found. Saved to browser settings only.', 'Visual CSS Editor');
        }
    });

    // 回顶/回底 (带平滑动画)
    $('#vce-btn-scroll').on('click', function() {
        const content = $('#vce-content');
        const icon = $(this).find('i');
        const scrollHeight = content[0].scrollHeight;
        
        if (scrollDirection === 'down') {
            content.stop().animate({ scrollTop: scrollHeight }, 500, 'swing');
            scrollDirection = 'up';
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else {
            content.stop().animate({ scrollTop: 0 }, 500, 'swing');
            scrollDirection = 'down';
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
        }
    });

    // 折叠 (处理顶栏圆角和平滑过渡)
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
 * 核心逻辑：读取 CSS 并解析
 */
function readAndRenderCSS() {
    const cssText = $('#customCSS').val() || '';
    const container = $('#vce-content');
    container.empty();

    let match;
    let hasContent = false;
    CSS_BLOCK_REGEX.lastIndex = 0;

    while ((match = CSS_BLOCK_REGEX.exec(cssText)) !== null) {
        const rawHeader = match[1]; // e.g. "\n\n/* 注释 */\n.class"
        const body = match[2];      // 属性块

        let displayTitle = '';
        let selector = '';

        // --- 标题解析逻辑 (参考你的思路) ---
        // 1. 查找最后一条注释的位置
        const commentRegex = /\/\*([\s\S]*?)\*\//g;
        let lastCommentMatch = null;
        let tempMatch;
        while ((tempMatch = commentRegex.exec(rawHeader)) !== null) {
            lastCommentMatch = tempMatch;
        }

        if (lastCommentMatch) {
            const commentText = lastCommentMatch[1].trim(); // 提取注释内容
            const commentEndIndex = lastCommentMatch.index + lastCommentMatch[0].length;
            
            // 获取注释后面的部分 (即 Gap + Selector)
            const afterComment = rawHeader.substring(commentEndIndex);
            
            // 核心判断：计算中间的换行符数量
            const newLineCount = (afterComment.match(/\n/g) || []).length;
            
            // 提取类名 (去掉首尾空白)
            selector = afterComment.trim();

            // 如果换行符少于2个，说明没有空行，关联注释
            if (newLineCount < 2 && selector) {
                displayTitle = `${commentText} | ${selector}`;
            } else {
                displayTitle = selector;
            }
        } else {
            // 没有注释，直接取最后一行作为类名 (清理掉前面的空白)
            selector = rawHeader.split('\n').pop().trim();
            // 如果只有一行且没有换行符
            if (!selector) selector = rawHeader.trim();
            displayTitle = selector;
        }

        // 如果选择器为空（例如只是文件开头的注释），跳过
        if (!selector) continue;

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

        const regex = new RegExp(COLOR_REGEX);
        let match;
        const colorsFound = [];
        
        while ((match = regex.exec(prop.value)) !== null) {
            colorsFound.push(match[0]);
        }

        // 是否显示数字索引 (颜色多于1个时)
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
    // tabindex="0" 允许div获得焦点，配合 css focus-within 解决层级问题
    const wrapper = $('<div class="vce-color-wrapper" tabindex="-1"></div>');
    
    // 多颜色时显示数字
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
        
        // 使用更安全的替换逻辑：
        // 1. 找到对应的块
        // 2. 找到对应的属性
        // 3. 替换第 N 个颜色
        
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 匹配规则块：找到选择器，直到下一个 }
        // 注意：这里需要匹配 rawHeader 的一部分特征来确保唯一性，但为了简化且高效，我们主要依赖选择器
        const blockRegex = new RegExp(`([^{]*${escapedSelector}\\s*\\{)([^}]+)(\\})`, 'g');
        
        let found = false;
        const newCss = cssText.replace(blockRegex, (match, prefix, content, suffix) => {
            // 简单的防误触：如果已经修改过了就不再修改（假设文件里有重复选择器）
            // 这里的逻辑可以优化，但通常够用
            
            // 替换属性值
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
            
            return `${prefix}${newContent}${suffix}`;
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
