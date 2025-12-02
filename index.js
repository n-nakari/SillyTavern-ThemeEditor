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

// 原生 CSS 区域辅助工具栏 HTML
const NATIVE_TOOLBAR_HTML = `
<div id="native-css-toolbar" class="native-css-toolbar">
    <div class="vce-search-wrapper native-search-wrapper">
        <i class="fa-solid fa-magnifying-glass vce-search-icon"></i>
        <input type="text" id="native-css-search" class="vce-search-input" placeholder="Find in CSS code... (Enter for next)" autocomplete="off">
        <span id="native-search-count" class="native-search-count"></span>
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
let lastSearchQuery = '';
let searchCursor = 0; // 原生搜索光标位置

jQuery(async () => {
    initUI();
    bindEvents();
    
    // 1. 初次加载：自动读取一次
    setTimeout(() => readAndRenderCSS(), 500);

    // 2. 切换美化主题后：自动读取一次
    if (eventSource && event_types) {
        eventSource.on(event_types.SETTINGS_UPDATED, () => {
            // 延迟确保 #customCSS 里的值已经变了
            setTimeout(() => readAndRenderCSS(), 200);
        });
    }
});

function initUI() {
    const cssBlock = $('#CustomCSS-block');
    const textAreaBlock = $('#CustomCSS-textAreaBlock');

    // 注入扩展面板 (在文本框下方)
    if (textAreaBlock.length && $('#visual-css-editor').length === 0) {
        textAreaBlock.after(EXTENSION_HTML);
    }

    // 注入原生辅助工具栏 (在标题下方，文本框上方)
    // 通常结构是 CustomCSS-block -> h4标题 -> CustomCSS-textAreaBlock
    if (cssBlock.length && $('#native-css-toolbar').length === 0) {
        // 找到文本框容器，插在它前面
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

    // 保存 (通用逻辑)
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

    const handleSearch = () => {
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

    searchInput.on('input', handleSearch);
    
    // 【修改点】点击/聚焦时，如果有内容，直接显示下拉
    searchInput.on('focus click', function() {
        if ($(this).val().trim()) {
            handleSearch();
        }
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

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.vce-search-wrapper').length) {
            dropdown.hide();
        }
    });

    // ===========================
    //      原生区域辅助功能绑定
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

    // 原生查找功能 (Find Next)
    const nativeSearchInput = $('#native-css-search');
    
    const performNativeSearch = () => {
        const query = nativeSearchInput.val();
        const textarea = $('#customCSS')[0];
        const text = textarea.value;

        if (!query) return;

        // 如果关键词变了，重置游标
        if (query !== lastSearchQuery) {
            searchCursor = -1;
            lastSearchQuery = query;
        }

        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        
        // 从当前光标位置开始查找
        let nextIndex = lowerText.indexOf(lowerQuery, searchCursor + 1);

        // 如果到底了，循环回到顶部
        if (nextIndex === -1) {
            nextIndex = lowerText.indexOf(lowerQuery, 0);
            // 给个视觉提示：循环了
            toastr.info('Search wrapped to top', '', { timeOut: 1000, preventDuplicates: true });
        }

        if (nextIndex !== -1) {
            // 选中文字并滚动到视野
            textarea.focus();
            textarea.setSelectionRange(nextIndex, nextIndex + query.length);
            
            // 计算行号，大概估算滚动位置，或者依赖浏览器的默认focus滚动行为
            // setSelectionRange通常会自动滚动，如果不行可以使用 blur/focus hack
            textarea.blur();
            textarea.focus();
            
            searchCursor = nextIndex;
        } else {
            toastr.warning('Text not found in CSS', '', { timeOut: 2000 });
        }
    };

    nativeSearchInput.on('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performNativeSearch();
        }
    });
    
    // 点击放大镜也可以搜索
    nativeSearchInput.siblings('.vce-search-icon').on('click', performNativeSearch);
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
