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
            <input type="search" id="vce-search-input" class="vce-search-input" placeholder="" autocomplete="off">
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
        <input type="text" id="native-css-search" class="vce-search-input" placeholder="" autocomplete="off">
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
    
    // 1. 初次加载：只读取，不修改
    setTimeout(() => readAndRenderCSS(), 500);

    // 2. 仅在切换美化主题下拉框时读取一次
    $(document).on('change', '#themes', () => {
        setTimeout(() => readAndRenderCSS(), 300);
    });
});

function initUI() {
    const cssBlock = $('#CustomCSS-block');
    const textAreaBlock = $('#CustomCSS-textAreaBlock');

    if (textAreaBlock.length && $('#visual-css-editor').length === 0) {
        textAreaBlock.after(EXTENSION_HTML);
        
        const savedMode = localStorage.getItem('vce-theme-mode');
        if (savedMode === 'dark') {
            $('#visual-css-editor').addClass('vce-dark-mode');
            $('#native-css-toolbar').addClass('vce-dark-mode');
        }
    }

    if (cssBlock.length && $('#native-css-toolbar').length === 0) {
        textAreaBlock.before(NATIVE_TOOLBAR_HTML);
    }

    // 这里不再需要 vce-live-patch，因为我们直接修改原生 custom-style
}

function smartScroll(container, targetPos) {
    const currentPos = container.scrollTop;
    const diff = targetPos - currentPos;
    const threshold = 400;

    if (Math.abs(diff) > threshold) {
        const jumpTo = diff > 0 
            ? targetPos - threshold 
            : targetPos + threshold;
        
        container.scrollTop = jumpTo;
    }

    container.scrollTo({
        top: targetPos,
        behavior: 'smooth'
    });
}

function bindEvents() {
    // ===========================
    //      扩展面板功能绑定
    // ===========================

    $('#vce-btn-refresh').on('click', () => {
        readAndRenderCSS();
        $('#vce-search-input').val('');
        $('#vce-search-dropdown').hide();
        
        const icon = $('#vce-btn-refresh i');
        icon.addClass('fa-spin');
        setTimeout(() => icon.removeClass('fa-spin'), 500);
        
        toastr.info('Panel refreshed from CSS code', 'Visual CSS Editor');
    });

    const triggerSave = () => {
        // 触发 input 事件以真正保存
        $('#customCSS').trigger('input');

        const nativeSaveBtn = $('#ui-preset-update-button');
        if (nativeSaveBtn.length && nativeSaveBtn.is(':visible')) {
            nativeSaveBtn.trigger('click');
        } else {
            saveSettingsDebounced();
            toastr.warning('Native theme save button not found. Saved to browser settings.', 'Visual CSS Editor');
        }
    };
    $('#vce-btn-save').on('click', triggerSave);

    $('#vce-btn-scroll').on('click', function() {
        const content = $('#vce-content')[0];
        const icon = $(this).find('i');
        
        if (scrollDirection === 'down') {
            smartScroll(content, content.scrollHeight);
            scrollDirection = 'up';
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else {
            smartScroll(content, 0);
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

    // --- 扩展面板搜索 ---
    const searchInput = $('#vce-search-input');
    const dropdown = $('#vce-search-dropdown');

    searchInput.on('keydown search', function(e) {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.keyCode !== 13) return;
        
        const query = $(this).val().trim().toLowerCase();
        
        if (query === '/dark' || query === '/light') {
            const container = $('#visual-css-editor');
            const nativeToolbar = $('#native-css-toolbar');

            if (query === '/dark') {
                container.addClass('vce-dark-mode');
                nativeToolbar.addClass('vce-dark-mode');
                localStorage.setItem('vce-theme-mode', 'dark');
                $(this).val(''); 
                dropdown.hide();
                toastr.success('Switched to Dark Mode', 'Visual CSS Editor');
            } else if (query === '/light') {
                container.removeClass('vce-dark-mode');
                nativeToolbar.removeClass('vce-dark-mode');
                localStorage.setItem('vce-theme-mode', 'light');
                $(this).val('');
                dropdown.hide();
                toastr.success('Switched to Light Mode', 'Visual CSS Editor');
            }
            e.preventDefault();
            return false;
        }
    });

    const handleExtensionSearch = () => {
        const query = searchInput.val().trim();
        dropdown.empty();

        if (!query || query.startsWith('/')) {
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
                const item = $(`<div class="vce-search-item" data-idx="${index}" title="${fullText}">${highlightedHtml}</div>`);
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
        const contentEl = content[0];

        if (targetCard.length) {
            const targetEl = targetCard[0];
            const topPos = targetEl.offsetTop;

            smartScroll(contentEl, topPos);

            targetCard.addClass('vce-flash-highlight');
            setTimeout(() => targetCard.removeClass('vce-flash-highlight'), 1200);
        }
        dropdown.hide();
    });

    // ===========================
    //      原生区域辅助功能
    // ===========================

    $('#native-btn-save').on('click', triggerSave);

    $('#native-btn-scroll').on('click', function() {
        const textarea = $('#customCSS')[0];
        const icon = $(this).find('i');
        
        if (nativeScrollDirection === 'down') {
            smartScroll(textarea, textarea.scrollHeight);
            nativeScrollDirection = 'up';
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
        } else {
            smartScroll(textarea, 0);
            nativeScrollDirection = 'down';
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
        }
    });

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

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.toLowerCase().includes(lowerQuery)) {
                hasResults = true;
                
                const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${safeQuery})`, 'gi');
                
                let displayLine = line.trim();
                const highlightedHtml = displayLine.replace(regex, '<span class="vce-highlight-text">$1</span>');
                
                const item = $(`
                    <div class="vce-search-item native-item" data-line="${i}" title="${displayLine}">
                        <span class="vce-line-num">${i + 1}:</span> ${highlightedHtml}
                    </div>
                `);
                nativeDropdown.append(item);
                
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

        let pos = 0;
        for (let i = 0; i < lineNum; i++) {
            pos += lines[i].length + 1;
        }
        
        const matchIndex = lines[lineNum].toLowerCase().indexOf(query.toLowerCase());
        const finalPos = pos + (matchIndex !== -1 ? matchIndex : 0);

        rawTextarea.focus();
        rawTextarea.setSelectionRange(finalPos, finalPos + query.length);
        
        const pixelTop = getCaretCoordinates(rawTextarea, finalPos);
        const styles = window.getComputedStyle(rawTextarea);
        const paddingTop = parseInt(styles.paddingTop) || 0;
        
        smartScroll(rawTextarea, pixelTop - paddingTop);

        nativeDropdown.hide();
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.vce-search-wrapper').length) {
            dropdown.hide();
            nativeDropdown.hide();
        }
    });
}

function getCaretCoordinates(element, position) {
    const div = document.createElement('div');
    const style = window.getComputedStyle(element);
    
    const props = [
        'box-sizing', 'width', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
        'border-width', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
        'line-height', 'text-transform', 'word-spacing', 'text-indent', 'white-space', 'word-wrap', 'word-break'
    ];

    props.forEach(prop => {
        div.style[prop] = style.getPropertyValue(prop);
    });

    div.style.position = 'absolute';
    div.style.top = '0px';
    div.style.left = '-9999px';
    div.style.visibility = 'hidden';
    div.style.overflow = 'hidden'; 
    
    div.textContent = element.value.substring(0, position);
    div.style.whiteSpace = 'pre-wrap'; 

    const span = document.createElement('span');
    span.textContent = '|'; 
    div.appendChild(span);

    document.body.appendChild(div);
    const top = span.offsetTop;
    document.body.removeChild(div);

    return top;
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

        const cleanBody = body.replace(/\/\*[\s\S]*?\*\//g, '');

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
                const cleanComment = commentText
                    .replace(/^\/\*+|\*+\/$/g, '')
                    .replace(/^[=\-~\s]+|[=\-~\s]+$/g, '')
                    .trim();
                
                if (cleanComment) {
                    displayTitle = `${cleanComment} | ${selector}`;
                } else {
                    displayTitle = selector;
                }
            } else {
                displayTitle = selector;
            }
        } else {
            selector = rawHeader.split('\n').pop().trim();
            if (!selector) selector = rawHeader.trim();
            displayTitle = selector;
        }

        if (!selector) continue;

        const properties = parseProperties(cleanBody); 
        const colorProperties = properties.filter(p => hasColor(p.value));

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
        
        let key = line.substring(0, firstColon).trim();
        key = key.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        
        const value = line.substring(firstColon + 1).trim();
        
        if (key && value) {
            props.push({ key, value });
        }
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
        const propName = $(`<div class="vce-prop-name">${prop.key}</div>`); 
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
    
    let allowUpdate = false;

    if (displayIndex !== null) {
        wrapper.append(`<span class="vce-color-idx">${displayIndex}</span>`);
    }

    const pickerId = `vce-picker-${Math.random().toString(36).substr(2, 9)}`;
    const picker = $(`<toolcool-color-picker id="${pickerId}" color="${initialColor}" class="vce-picker"></toolcool-color-picker>`);
    const input = $(`<input type="text" class="vce-color-input" value="${initialColor}">`);

    wrapper.append(picker);
    wrapper.append(input);

    const unlock = () => { allowUpdate = true; };
    wrapper.on('mousedown', unlock);
    wrapper.on('click', unlock);
    input.on('focus', unlock);

    const updateCSS = (newColor) => {
        if (!allowUpdate) return;

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
            // 1. 更新文本框的值（用于后续保存）
            $('#customCSS').val(newCss);
            
            // 2. 【核心修复】直接修改 DOM 中的 style 标签实现实时预览
            // 这跳过了 saveSettingsDebounced 的触发，因此不会保存到文件
            let style = document.getElementById('custom-style');
            if (style) {
                style.textContent = newCss;
            }
        }
    };

    picker.on('change', (evt) => {
        const col = evt.detail.rgba;
        if (col !== input.val()) {
            input.val(col);
            updateCSS(col);
        }
    });

    input.on('change', () => {
        const col = input.val();
        const pEl = document.getElementById(pickerId);
        if (pEl) pEl.color = col;
        updateCSS(col);
    });

    return wrapper;
}
