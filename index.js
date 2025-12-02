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
        <div class="vce-search-wrapper">
            <i class="fa-solid fa-magnifying-glass vce-search-icon"></i>
            <input type="text" id="vce-search-input" class="vce-search-input" placeholder="Search..." autocomplete="off">
            <div id="vce-search-dropdown" class="vce-search-dropdown"></div>
        </div>
    </div>
    <div id="vce-content" class="vce-content">
        <div class="vce-empty-state">Initializing...</div>
    </div>
</div>
`;

const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,.\/%]+\)|hsla?\([\d\s,.\/%]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey)/gi;
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
        // 清空搜索框
        $('#vce-search-input').val('');
        $('#vce-search-dropdown').hide();
        
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
            toastr.warning('Native theme save button not found. Saved to browser settings only.', 'Visual CSS Editor');
        }
    });

    // 回顶/回底
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

    // 折叠
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

    // --- 搜索功能 ---
    const searchInput = $('#vce-search-input');
    const dropdown = $('#vce-search-dropdown');

    // 输入监听
    searchInput.on('input', function() {
        const query = $(this).val().trim();
        dropdown.empty();

        if (!query) {
            dropdown.hide();
            return;
        }

        const cards = $('.vce-card');
        let hasResults = false;

        cards.each(function(index) {
            const header = $(this).find('.vce-card-header');
            const fullText = header.text();
            
            // 简单的包含匹配 (不区分大小写)
            if (fullText.toLowerCase().includes(query.toLowerCase())) {
                hasResults = true;
                
                // 高亮匹配文字
                // 转义正则特殊字符
                const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${safeQuery})`, 'gi');
                const highlightedHtml = fullText.replace(regex, '<span class="vce-highlight-text">$1</span>');

                const item = $(`<div class="vce-search-item" data-idx="${index}">${highlightedHtml}</div>`);
                dropdown.append(item);
            }
        });

        if (hasResults) {
            dropdown.show();
        } else {
            dropdown.hide();
        }
    });

    // 点击搜索结果跳转
    dropdown.on('click', '.vce-search-item', function() {
        const idx = $(this).data('idx');
        const targetCard = $('.vce-card').eq(idx);
        const content = $('#vce-content');

        if (targetCard.length) {
            // 计算滚动位置：当前滚动top + 目标相对top - 容器padding顶
            const scrollTop = content.scrollTop() + targetCard.position().top - 20;
            
            content.stop().animate({ scrollTop: scrollTop }, 300, 'swing', () => {
                // 跳转后闪烁高亮一下卡片
                targetCard.addClass('vce-flash-highlight');
                setTimeout(() => targetCard.removeClass('vce-flash-highlight'), 1000);
            });
        }
        
        dropdown.hide();
    });

    // 点击外部关闭下拉
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.vce-search-wrapper').length) {
            dropdown.hide();
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
        const rawHeader = match[1];
        const body = match[2];

        let displayTitle = '';
        let selector = '';

        const commentRegex = /\/\*([\s\S]*?)\*\//g;
        let lastCommentMatch = null;
        let tempMatch;
        while ((tempMatch = commentRegex.exec(rawHeader)) !== null) {
            lastCommentMatch = tempMatch;
        }

        if (lastCommentMatch) {
            const commentText = lastCommentMatch[1].trim();
            const commentEndIndex = lastCommentMatch.index + lastCommentMatch[0].length;
            const afterComment = rawHeader.substring(commentEndIndex);
            const newLineCount = (afterComment.match(/\n/g) || []).length;
            
            selector = afterComment.trim();

            if (newLineCount < 2 && selector) {
                displayTitle = `${commentText} | ${selector}`;
            } else {
                displayTitle = selector;
            }
        } else {
            selector = rawHeader.split('\n').pop().trim();
            if (!selector) selector = rawHeader.trim();
            displayTitle = selector;
        }

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
    const wrapper = $('<div class="vce-color-wrapper" tabindex="-1"></div>');
    
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
        
        const blockRegex = new RegExp(`([^{]*${escapedSelector}\\s*\\{)([^}]+)(\\})`, 'g');
        
        const newCss = cssText.replace(blockRegex, (match, prefix, content, suffix) => {
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
