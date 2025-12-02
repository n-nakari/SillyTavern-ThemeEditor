import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展面板 HTML
const EXTENSION_HTML = `
<div id="visual-css-editor" class="vce-container">
    <div class="vce-toolbar">
        <div class="vce-buttons-left">
            <button id="vce-btn-refresh" class="vce-btn" title="Refresh Panel"><i class="fa-solid fa-rotate-right"></i></button>
            <button id="vce-btn-save" class="vce-btn" title="Save Theme"><i class="fa-solid fa-floppy-disk"></i></button>
            <button id="vce-btn-scroll" class="vce-btn" title="Scroll Top/Bottom"><i class="fa-solid fa-arrow-down"></i></button>
            <button id="vce-btn-collapse" class="vce-btn" title="Collapse/Expand"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
        <div class="vce-search-wrapper">
            <i class="fa-solid fa-magnifying-glass vce-search-icon"></i>
            <input type="text" id="vce-search-input" class="vce-search-input" placeholder="Search items..." autocomplete="off">
            <div id="vce-search-dropdown" class="vce-search-dropdown"></div>
        </div>
    </div>
    <div id="vce-content" class="vce-content">
        <div class="vce-empty-state">Initializing...</div>
    </div>
</div>
`;

// 原生 CSS 区域辅助工具栏 HTML (增加下拉栏容器)
const NATIVE_TOOLBAR_HTML = `
<div id="native-css-toolbar" class="native-css-toolbar">
    <div class="vce-search-wrapper native-search-wrapper">
        <i class="fa-solid fa-magnifying-glass vce-search-icon"></i>
        <input type="text" id="native-css-search" class="vce-search-input" placeholder="Find in CSS... (Click to jump)" autocomplete="off">
        <div id="native-search-dropdown" class="vce-search-dropdown"></div>
    </div>
    <div class="vce-buttons-left">
        <button id="native-btn-save" class="vce-btn" title="Save Theme"><i class="fa-solid fa-floppy-disk"></i></button>
        <button id="native-btn-scroll" class="vce-btn" title="Scroll Code Top/Bottom"><i class="fa-solid fa-arrow-down"></i></button>
    </div>
</div>
`;

const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,.\/%]+\)|hsla?\([\d\s,.\/%]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey)/gi;
const CSS_BLOCK_REGEX = /([^{]+)\{([^}]+)\}/g;

let scrollDirection = 'down';
let nativeScrollDirection = 'down';

jQuery(async () => {
    initUI();
    bindEvents();
    
    // 1. 初次加载：读取一次
    setTimeout(() => readAndRenderCSS(), 500);

    // 2. 仅在切换美化主题下拉框时读取一次 (不再监听 SETTINGS_UPDATED 防止 autosave 触发)
    $(document).on('change', '#themes', () => {
        // 延迟一点等待 ST 载入新主题的 CSS 内容
        setTimeout(() => readAndRenderCSS(), 300);
    });
});

function initUI() {
    const cssBlock = $('#CustomCSS-block');
    const textAreaBlock = $('#CustomCSS-textAreaBlock');

    // 注入扩展面板
    if (textAreaBlock.length && $('#visual-css-editor').length === 0) {
        textAreaBlock.after(EXTENSION_HTML);
    }

    // 注入原生辅助工具栏
    if (cssBlock.length && $('#native-css-toolbar').length === 0) {
        textAreaBlock.before(NATIVE_TOOLBAR_HTML);
    }
}

function bindEvents() {
    // ===========================
    //      扩展面板功能绑定
    // ===========================

    // 刷新
    $('#vce-btn-refresh').on('click', () => {
        readAndRenderCSS();
        $('#vce-search-input').val('');
        $('#vce-search-dropdown').hide();
        
        const icon = $('#vce-btn-refresh i');
        icon.addClass('fa-spin');
        setTimeout(() => icon.removeClass('fa-spin'), 500);
    });

    // 保存
    const triggerSave = () => {
        const nativeSaveBtn = $('#ui-preset-update-button');
        if (nativeSaveBtn.length && nativeSaveBtn.is(':visible')) {
            nativeSaveBtn.trigger('click');
        } else {
            saveSettingsDebounced();
            toastr.warning('Native theme save button not found. Saved to browser settings.', 'Visual CSS Editor');
        }
    };
    $('#vce-btn-save').on('click', triggerSave);

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

    // --- 扩展面板搜索 ---
    const searchInput = $('#vce-search-input');
    const dropdown = $('#vce-search-dropdown');

    const handleExtensionSearch = () => {
        const query = searchInput.val().trim();
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
            
            if (fullText.toLowerCase().includes(query.toLowerCase())) {
                hasResults = true;
                const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${safeQuery})`, 'gi');
                const highlightedHtml = fullText.replace(regex, '<span class="vce-highlight-text">$1</span>');
                const item = $(`<div class="vce-search-item" data-idx="${index}">${highlightedHtml}</div>`);
                dropdown.append(item);
            }
        });

        hasResults ? dropdown.show() : dropdown.hide();
    };

    searchInput.on('input', handleExtensionSearch);
    searchInput.on('focus click', function() {
        if ($(this).val().trim()) handleExtensionSearch();
    });

    dropdown.on('click', '.vce-search-item', function() {
        const idx = $(this).data('idx');
        const targetCard = $('.vce-card').eq(idx);
        const content = $('#vce-content');

        if (targetCard.length) {
            const scrollPos = content.scrollTop() + targetCard.position().top;
            content.stop().animate({ scrollTop: scrollPos }, 300, 'swing', () => {
                targetCard.addClass('vce-flash-highlight');
                setTimeout(() => targetCard.removeClass('vce-flash-highlight'), 1200);
            });
        }
        dropdown.hide();
    });

    // ===========================
    //      原生区域辅助功能
    // ===========================

    // 原生保存
    $('#native-btn-save').on('click', triggerSave);

    // 原生回顶/回底
    $('#native-btn-scroll').on('click', function() {
        const textarea = $('#customCSS');
        const icon = $(this).find('i');
        
        if (nativeScrollDirection === 'down') {
            textarea.scrollTop(textarea[0].scrollHeight);
            nativeScrollDirection = 'up';
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else {
            textarea.scrollTop(0);
            nativeScrollDirection = 'down';
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
        }
    });

    // --- 原生文本搜索 (下拉栏版) ---
    const nativeSearchInput = $('#native-css-search');
    const nativeDropdown = $('#native-search-dropdown');

    const handleNativeSearch = () => {
        const query = nativeSearchInput.val();
        const textarea = $('#customCSS')[0];
        const fullText = textarea.value;
        nativeDropdown.empty();

        if (!query) {
            nativeDropdown.hide();
            return;
        }

        const lines = fullText.split('\n');
        let hasResults = false;
        const lowerQuery = query.toLowerCase();

        // 遍历每一行查找匹配
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.toLowerCase().includes(lowerQuery)) {
                hasResults = true;
                
                // 计算该行在全文中的起始索引 (大致估算用于跳转)
                // 精确做法是累加长度，这里为了性能简化，点击时再精确计算
                
                const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${safeQuery})`, 'gi');
                
                // 截取代码片段，防止过长
                let displayLine = line.trim();
                if (displayLine.length > 50) {
                    displayLine = displayLine.substring(0, 50) + '...';
                }
                
                const highlightedHtml = displayLine.replace(regex, '<span class="vce-highlight-text">$1</span>');
                
                // data-line 存储行号
                const item = $(`
                    <div class="vce-search-item native-item" data-line="${i}">
                        <span class="vce-line-num">${i + 1}:</span> ${highlightedHtml}
                    </div>
                `);
                nativeDropdown.append(item);
                
                // 限制下拉栏显示数量，防止卡顿
                if (nativeDropdown.children().length >= 100) break;
            }
        }

        hasResults ? nativeDropdown.show() : nativeDropdown.hide();
    };

    nativeSearchInput.on('input', handleNativeSearch);
    nativeSearchInput.on('focus click', function() {
        if ($(this).val()) handleNativeSearch();
    });

    nativeDropdown.on('click', '.vce-search-item', function() {
        const lineNum = parseInt($(this).data('line'));
        const textarea = $('#customCSS');
        const rawTextarea = textarea[0];
        const lines = rawTextarea.value.split('\n');
        const query = nativeSearchInput.val();

        // 计算目标行的起始位置
        let pos = 0;
        for (let i = 0; i < lineNum; i++) {
            pos += lines[i].length + 1; // +1 是换行符
        }

        // 在该行内找到匹配文字的位置
        const matchIndex = lines[lineNum].toLowerCase().indexOf(query.toLowerCase());
        const finalPos = pos + (matchIndex !== -1 ? matchIndex : 0);

        // 选中文字并跳转
        rawTextarea.focus();
        rawTextarea.setSelectionRange(finalPos, finalPos + query.length);
        
        // 滚动到光标位置 (利用 blur/focus hack 或 scrollIntoView)
        // 简单计算滚动高度
        const lineHeight = 20; // 估算行高
        const scrollAmount = lineNum * lineHeight;
        
        // 尝试居中显示
        const textAreaHeight = textarea.height();
        textarea.scrollTop(scrollAmount - textAreaHeight / 2);

        nativeDropdown.hide();
    });

    // 点击外部关闭所有下拉
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.vce-search-wrapper').length) {
            dropdown.hide();
            nativeDropdown.hide();
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
