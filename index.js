import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 定义扩展的HTML结构
const EXTENSION_HTML = `
<div id="visual-css-editor" class="vce-container">
    <div class="vce-toolbar">
        <div class="vce-buttons-left">
            <button id="vce-btn-refresh" class="vce-btn" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
            <button id="vce-btn-save" class="vce-btn" title="Save Settings"><i class="fa-solid fa-floppy-disk"></i></button>
            <button id="vce-btn-scroll" class="vce-btn" title="Scroll Top/Bottom"><i class="fa-solid fa-arrow-down"></i></button>
            <button id="vce-btn-collapse" class="vce-btn" title="Collapse/Expand"><i class="fa-solid fa-chevron-up"></i></button>
        </div>
    </div>
    <div id="vce-content" class="vce-content">
        <div class="vce-empty-state">Loading CSS...</div>
    </div>
</div>
`;

// 颜色匹配正则 (Hex, RGB, HSL, Keywords)
// 排除 url(...) 防止误判图片路径中的字符
const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}|rgba?\([\d\s,.\/%]+\)|hsla?\([\d\s,.\/%]+\)|transparent|white|black|red|green|blue|yellow|cyan|magenta|gray|grey)/gi;

// CSS 块匹配正则：捕获组1=最后一条注释(可选), 组2=选择器, 组3=属性块
// JS正则中重复的捕获组只会保留最后一次匹配结果，正好符合"只取用类名前一个"的需求
const CSS_BLOCK_REGEX = /(?:\/\*([\s\S]*?)\*\/[\s\r\n]*)*([^{]+)\{([^}]+)\}/g;

let isCollapsed = false;
let scrollDirection = 'down';

jQuery(async () => {
    initUI();
    bindEvents();
    
    // 初次加载延迟执行，确保DOM就绪
    setTimeout(() => readAndRenderCSS(), 500);

    // 监听 ST 的设置更新事件（切换主题时触发）
    if (eventSource && event_types) {
        eventSource.on(event_types.SETTINGS_UPDATED, () => {
            // 稍微延迟以确保 #customCSS 文本域已更新
            setTimeout(() => readAndRenderCSS(), 200);
        });
    }
});

function initUI() {
    const targetArea = $('#CustomCSS-textAreaBlock');
    if (targetArea.length) {
        // 避免重复添加
        if ($('#visual-css-editor').length === 0) {
            targetArea.after(EXTENSION_HTML);
        }
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
        saveSettingsDebounced();
        toastr.success('Theme Settings Saved', 'Visual CSS Editor');
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
        const lastComment = match[1]; // 正则特性：重复组只捕获最后一次，即紧邻的注释
        const selector = match[2].trim();
        const body = match[3];

        // 格式化标题： 注释 | 类名 或 类名
        let displayTitle = selector;
        
        if (lastComment) {
            // 清理注释中的多余字符（空格、星号）
            const cleanComment = lastComment.trim().replace(/^[\s*]+|[\s*]+$/g, '');
            if (cleanComment) {
                displayTitle = `${cleanComment} | ${selector}`;
            }
        }

        const properties = parseProperties(body);
        // 过滤掉没有颜色的属性，同时过滤掉 CSS 变量定义 (--var)
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
    // 简单按分号分割，忽略 base64 图片内部的分号情况（极少数情况会误判，暂忽略）
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
    // 排除 url() 里的内容，防止图片名含有 red/black 等单词误判
    // 简单判断：如果包含颜色关键字且不在url(...)内（这里简化处理直接正则匹配）
    return COLOR_REGEX.test(val);
}

function createCard(title, properties, selector) {
    const card = $('<div class="vce-card"></div>');
    
    // 标题区域
    const header = $(`<div class="vce-card-header">${title}</div>`);
    card.append(header);

    const propsList = $('<div class="vce-props-list"></div>');
    
    properties.forEach(prop => {
        const propRow = $('<div class="vce-prop-row"></div>');
        const propName = $(`<div class="vce-prop-name">${prop.key.toUpperCase()}</div>`);
        propRow.append(propName);

        // 提取属性值中所有的颜色
        let colorMatch;
        const regex = new RegExp(COLOR_REGEX);
        let colorCount = 0;

        // 使用 replace 作为一个遍历器来按顺序处理所有颜色
        // 我们不真的替换，只是为了利用正则遍历
        let tempValue = prop.value;
        let match;
        while ((match = regex.exec(tempValue)) !== null) {
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
    const wrapper = $('<div class="vce-color-wrapper"></div>');
    
    const pickerId = `vce-picker-${Math.random().toString(36).substr(2, 9)}`;
    const picker = $(`<toolcool-color-picker id="${pickerId}" color="${initialColor}" class="vce-picker"></toolcool-color-picker>`);
    const input = $(`<input type="text" class="vce-color-input" value="${initialColor}">`);

    wrapper.append(picker);
    wrapper.append(input);

    const updateCSS = (newColor) => {
        let cssText = $('#customCSS').val();
        
        // 构造精准替换逻辑
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // 匹配整个规则块
        const blockRegex = new RegExp(`((?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)*${escapedSelector}\\s*\\{)([^}]+)(\\})`, 'g');
        
        const newCss = cssText.replace(blockRegex, (match, prefix, content, suffix) => {
            // 在规则块内匹配属性
            const propRegex = new RegExp(`(${propKey}\\s*:\\s*)([^;]+)(;?)`, 'gi');
            
            const newContent = content.replace(propRegex, (m, pPrefix, pValue, pSuffix) => {
                // 在属性值内替换第 N 个颜色
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
