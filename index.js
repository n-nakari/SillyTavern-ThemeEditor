import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';

// 扩展名称
const extensionName = "CssColorTuner";

// 缓存DOM引用
let cssTextArea = null;
let container = null;
let contentArea = null;
let tunerBody = null;
let lastCssContent = "";
let currentParsedBlocks = [];
let scrollDirection = 'bottom';

// 颜色匹配正则
const colorRegex = /((#[0-9a-fA-F]{3,8})|rgba?\([\d\s,.]+\)|hsla?\([\d\s,.%]+\)|\b(transparent|aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)\b)/gi;

/* ==========================================================================
   Helper: Color Math & Parsing (HSV, RGB, Hex)
   ========================================================================== */
const ColorUtils = {
    // 解析任意 CSS 颜色为 RGBA 对象 {r, g, b, a}
    parse: function(str) {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = 'transparent'; // Reset
        ctx.fillStyle = str;
        let computed = ctx.fillStyle;
        
        let r = 0, g = 0, b = 0, a = 1;

        // 如果是 HEX
        if (computed.startsWith('#')) {
            const hex = computed;
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        } else if (computed.startsWith('rgb')) {
            const parts = computed.match(/[\d.]+/g);
            if (parts) {
                r = parseInt(parts[0]);
                g = parseInt(parts[1]);
                b = parseInt(parts[2]);
                if (parts.length > 3) a = parseFloat(parts[3]);
            }
        }
        
        // 尝试从原始字符串解析透明度（Canvas 有时会丢失透明度如果不是rgba语法）
        if (str.includes('rgba') || str.includes('hsla')) {
            const match = str.match(/,\s*([\d.]+)\s*\)/);
            if (match) a = parseFloat(match[1]);
        }
        
        return { r, g, b, a };
    },

    rgbToHsv: function(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;

        if (max === min) h = 0;
        else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s * 100, v: v * 100 };
    },

    hsvToRgb: function(h, s, v) {
        let r, g, b;
        h /= 360; s /= 100; v /= 100;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return { 
            r: Math.round(r * 255), 
            g: Math.round(g * 255), 
            b: Math.round(b * 255) 
        };
    },

    toRgbaString: function(r, g, b, a) {
        const alpha = Math.round(a * 100) / 100;
        if (alpha === 1) return `rgb(${r}, ${g}, ${b})`; // 优化：如果a是1，用rgb
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
};

/* ==========================================================================
   Advanced Color Picker UI Class
   ========================================================================== */
class AdvancedColorPicker {
    constructor() {
        this.h = 0; this.s = 100; this.v = 100; this.a = 1;
        this.currentCallback = null;
        this.active = false;
        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        // 创建遮罩
        this.overlay = $('<div class="tuner-overlay"></div>').appendTo('body');
        
        // 创建主窗口
        this.modal = $(`
            <div class="tuner-picker-modal">
                <div class="tp-sv-panel">
                    <div class="tp-sv-white"></div>
                    <div class="tp-sv-black"></div>
                    <div class="tp-cursor"></div>
                </div>
                
                <div class="tp-controls-row">
                    <div class="tp-eye-dropper" title="吸管工具"><i class="fa-solid fa-eye-dropper"></i></div>
                    <div class="tp-preview"><div class="tp-preview-inner"></div></div>
                    <div class="tp-sliders">
                        <div class="tp-slider-track tp-hue-track">
                            <div class="tp-slider-thumb" id="tp-thumb-hue"></div>
                        </div>
                        <div class="tp-slider-track tp-alpha-track">
                            <div class="tp-alpha-gradient"></div>
                            <div class="tp-slider-thumb" id="tp-thumb-alpha"></div>
                        </div>
                    </div>
                </div>

                <div class="tp-inputs-row">
                    <div class="tp-input-group">
                        <input type="number" class="tp-input-box" id="tp-in-r" min="0" max="255">
                        <span class="tp-label">R</span>
                    </div>
                    <div class="tp-input-group">
                        <input type="number" class="tp-input-box" id="tp-in-g" min="0" max="255">
                        <span class="tp-label">G</span>
                    </div>
                    <div class="tp-input-group">
                        <input type="number" class="tp-input-box" id="tp-in-b" min="0" max="255">
                        <span class="tp-label">B</span>
                    </div>
                    <div class="tp-input-group">
                        <input type="number" class="tp-input-box" id="tp-in-a" min="0" max="1" step="0.01">
                        <span class="tp-label">A</span>
                    </div>
                </div>
            </div>
        `).appendTo('body');

        this.dom = {
            sv: this.modal.find('.tp-sv-panel'),
            cursor: this.modal.find('.tp-cursor'),
            hue: this.modal.find('.tp-hue-track'),
            hueThumb: this.modal.find('#tp-thumb-hue'),
            alpha: this.modal.find('.tp-alpha-track'),
            alphaThumb: this.modal.find('#tp-thumb-alpha'),
            alphaGrad: this.modal.find('.tp-alpha-gradient'),
            preview: this.modal.find('.tp-preview-inner'),
            dropper: this.modal.find('.tp-eye-dropper'),
            inR: this.modal.find('#tp-in-r'),
            inG: this.modal.find('#tp-in-g'),
            inB: this.modal.find('#tp-in-b'),
            inA: this.modal.find('#tp-in-a')
        };
    }

    bindEvents() {
        const self = this;
        let isDraggingSV = false;
        let isDraggingHue = false;
        let isDraggingAlpha = false;

        // 1. SV Panel Drag
        const updateSV = (e) => {
            const offset = self.dom.sv.offset();
            let x = e.pageX - offset.left;
            let y = e.pageY - offset.top;
            const w = self.dom.sv.width();
            const h = self.dom.sv.height();

            x = Math.max(0, Math.min(x, w));
            y = Math.max(0, Math.min(y, h));

            self.s = (x / w) * 100;
            self.v = 100 - (y / h) * 100;
            self.updateUI(true);
            self.emitChange();
        };

        this.dom.sv.on('mousedown', (e) => { isDraggingSV = true; updateSV(e); });
        
        // 2. Hue Drag
        const updateHue = (e) => {
            const offset = self.dom.hue.offset();
            let x = e.pageX - offset.left;
            const w = self.dom.hue.width();
            x = Math.max(0, Math.min(x, w));
            self.h = (x / w) * 360;
            self.updateUI(true);
            self.emitChange();
        };
        this.dom.hue.on('mousedown', (e) => { isDraggingHue = true; updateHue(e); });

        // 3. Alpha Drag
        const updateAlpha = (e) => {
            const offset = self.dom.alpha.offset();
            let x = e.pageX - offset.left;
            const w = self.dom.alpha.width();
            x = Math.max(0, Math.min(x, w));
            self.a = parseFloat((x / w).toFixed(2));
            self.updateUI(true);
            self.emitChange();
        };
        this.dom.alpha.on('mousedown', (e) => { isDraggingAlpha = true; updateAlpha(e); });

        // Global Mouse Events
        $(document).on('mousemove', (e) => {
            if (!self.active) return;
            if (isDraggingSV) updateSV(e);
            if (isDraggingHue) updateHue(e);
            if (isDraggingAlpha) updateAlpha(e);
        });

        $(document).on('mouseup', () => {
            isDraggingSV = false; isDraggingHue = false; isDraggingAlpha = false;
        });

        // 4. Inputs
        const inputChange = () => {
            const r = parseInt(self.dom.inR.val()) || 0;
            const g = parseInt(self.dom.inG.val()) || 0;
            const b = parseInt(self.dom.inB.val()) || 0;
            const a = parseFloat(self.dom.inA.val());
            
            const hsv = ColorUtils.rgbToHsv(r, g, b);
            self.h = hsv.h; self.s = hsv.s; self.v = hsv.v;
            self.a = isNaN(a) ? 1 : a;
            self.updateUI(false); // Don't update inputs (avoid loop)
            self.emitChange();
        };

        this.dom.inR.on('input', inputChange);
        this.dom.inG.on('input', inputChange);
        this.dom.inB.on('input', inputChange);
        this.dom.inA.on('input', inputChange);

        // 5. Dropper
        this.dom.dropper.on('click', async () => {
            if (!window.EyeDropper) {
                toastr.warning("你的浏览器不支持吸管工具", "CssTuner");
                return;
            }
            try {
                const ed = new EyeDropper();
                const result = await ed.open();
                const rgba = ColorUtils.parse(result.sRGBHex);
                const hsv = ColorUtils.rgbToHsv(rgba.r, rgba.g, rgba.b);
                self.h = hsv.h; self.s = hsv.s; self.v = hsv.v;
                // Keep current alpha or reset to 1? usually pipette is solid color
                self.a = 1; 
                self.updateUI(true);
                self.emitChange();
            } catch (e) {
                // Cancelled
            }
        });

        // 6. Close
        this.overlay.on('click', () => this.close());
    }

    open(initialColorStr, targetElement, onChange) {
        this.currentCallback = onChange;
        const rgba = ColorUtils.parse(initialColorStr);
        const hsv = ColorUtils.rgbToHsv(rgba.r, rgba.g, rgba.b);
        
        this.h = hsv.h; this.s = hsv.s; this.v = hsv.v; this.a = rgba.a;
        
        this.updateUI(true);
        this.active = true;
        this.overlay.addClass('active');
        this.modal.addClass('active');

        // Positioning
        const rect = targetElement.getBoundingClientRect();
        const modalHeight = 280; // approx
        const modalWidth = 260;
        
        let top = rect.bottom + 10;
        let left = rect.left;

        if (top + modalHeight > window.innerHeight) {
            top = rect.top - modalHeight - 10;
        }
        if (left + modalWidth > window.innerWidth) {
            left = window.innerWidth - modalWidth - 20;
        }
        
        this.modal.css({ top: top + 'px', left: left + 'px' });
    }

    close() {
        this.active = false;
        this.overlay.removeClass('active');
        this.modal.removeClass('active');
        this.currentCallback = null;
    }

    updateUI(updateInputs = true) {
        const rgb = ColorUtils.hsvToRgb(this.h, this.s, this.v);
        const baseColor = ColorUtils.hsvToRgb(this.h, 100, 100);
        const rgbaString = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.a})`;
        const baseString = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`;

        // SV Background
        this.dom.sv.css('background-color', baseString);

        // SV Cursor Position
        this.dom.cursor.css({
            left: `${this.s}%`,
            top: `${100 - this.v}%`,
            backgroundColor: rgbaString
        });

        // Hue Thumb
        this.dom.hueThumb.css('left', `${(this.h / 360) * 100}%`);

        // Alpha Gradient & Thumb
        this.dom.alphaGrad.css('background', `linear-gradient(to right, transparent, rgb(${rgb.r},${rgb.g},${rgb.b}))`);
        this.dom.alphaThumb.css('left', `${this.a * 100}%`);

        // Preview
        this.dom.preview.css('background-color', rgbaString);

        // Inputs
        if (updateInputs) {
            this.dom.inR.val(rgb.r);
            this.dom.inG.val(rgb.g);
            this.dom.inB.val(rgb.b);
            this.dom.inA.val(this.a);
        }
    }

    emitChange() {
        if (this.currentCallback) {
            const rgb = ColorUtils.hsvToRgb(this.h, this.s, this.v);
            const str = ColorUtils.toRgbaString(rgb.r, rgb.g, rgb.b, this.a);
            this.currentCallback(str);
        }
    }
}

const colorPicker = new AdvancedColorPicker();


/* ==========================================================================
   Core Logic: Parsing & UI Generation
   ========================================================================== */

/**
 * 解析CSS字符串 (修改版：只取紧邻选择器的最后一条注释，且去除标点)
 */
function parseCssColors(cssString) {
    const blocks = [];
    const ruleRegex = /(?:((?:\/\*[\s\S]*?\*\/[\s\r\n]*)+))?([^{}]+)\{([^}]+)\}/g;
    
    // 标点符号正则 (含中英文常见标点)
    const punctuationRegex = /[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~，。！？；：“”‘’（）【】《》、\s]/g;
    
    let match;
    while ((match = ruleRegex.exec(cssString)) !== null) {
        const rawComments = match[1];
        const selector = match[2].trim();
        const content = match[3];
        
        let finalComment = "";
        
        if (rawComments) {
            // 1. 分割多个注释块 (split by */)
            // 比如 "/* A */ /* B */" -> ["/* A ", " /* B ", ""]
            const commentParts = rawComments.split('*/');
            
            // 2. 找到最后一个包含 content 的块
            // 反向查找第一个非空且包含 /* 的
            let lastValidRaw = null;
            for (let i = commentParts.length - 1; i >= 0; i--) {
                if (commentParts[i].includes('/*')) {
                    lastValidRaw = commentParts[i];
                    break;
                }
            }

            if (lastValidRaw) {
                // 3. 去除 /* 以及多余空格
                let clean = lastValidRaw.replace(/.*?\/\*/, '').trim();
                // 4. 去除标点符号 (保留中文、字母、数字)
                // 这里用 replace 将标点替换为空
                clean = clean.replace(punctuationRegex, '');
                
                if (clean.length > 0) {
                    finalComment = clean;
                }
            }
        }
        
        const properties = [];
        const propRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let propMatch;
        
        while ((propMatch = propRegex.exec(content)) !== null) {
            const propName = propMatch[1].trim();
            const propValue = propMatch[2].trim();
            
            if (propName.startsWith('--')) continue; 
            if (propValue.includes('var(')) continue;

            const colors = [];
            let colorMatch;
            colorRegex.lastIndex = 0;
            
            while ((colorMatch = colorRegex.exec(propValue)) !== null) {
                colors.push({ value: colorMatch[0], index: colorMatch.index });
            }
            
            if (colors.length > 0) {
                properties.push({ name: propName, fullValue: propValue, colors: colors });
            }
        }
        
        if (properties.length > 0) {
            blocks.push({
                id: `tuner-block-${blocks.length}`,
                selector,
                comment: finalComment,
                properties
            });
        }
    }
    return blocks;
}

// UI 构建
function createTunerUI() {
    if ($('.css-tuner-container').length > 0) return;

    const topBar = $(`
        <div class="css-tools-bar">
            <div class="css-tools-search-wrapper">
                <input type="text" id="css-top-search" placeholder="搜索 CSS 代码..." autocomplete="off">
                <div class="css-search-dropdown" id="css-search-results"></div>
            </div>
            <div class="tools-btn-group">
                <div class="tools-btn" id="css-top-save" title="保存并更新主题"><i class="fa-solid fa-save"></i></div>
                <div class="tools-btn" id="css-top-scroll" title="滚动到底部/顶部"><i class="fa-solid fa-arrow-down"></i></div>
            </div>
        </div>
    `);

    container = $(`
        <div class="css-tuner-container">
            <div class="tuner-header">
                <div class="tuner-controls">
                    <div class="tools-btn" id="tuner-refresh" title="刷新列表"><i class="fa-solid fa-sync-alt"></i></div>
                    <div class="tools-btn" id="tuner-up" title="回到列表顶部"><i class="fa-solid fa-arrow-up"></i></div>
                    <div class="tools-btn" id="tuner-collapse" title="折叠/展开"><i class="fa-solid fa-chevron-up"></i></div>
                </div>
            </div>
            
            <div class="tuner-body">
                <div class="tuner-sub-header">
                    <input type="text" id="tuner-search" placeholder="搜索类名、属性或注释..." autocomplete="off">
                    <div class="css-search-dropdown" id="tuner-search-results"></div>
                </div>
                <div class="tuner-content" id="tuner-content-area"></div>
            </div>
        </div>
    `);

    const textAreaBlock = $('#CustomCSS-textAreaBlock');
    topBar.insertBefore(textAreaBlock);
    container.insertAfter(textAreaBlock);
    
    contentArea = $('#tuner-content-area');
    tunerBody = container.find('.tuner-body');
    cssTextArea = $('#customCSS');

    bindEvents();
}

function bindEvents() {
    const topSearchInput = $('#css-top-search');
    const topResultsContainer = $('#css-search-results');

    // CSS代码搜索 (Top Bar)
    topSearchInput.on('input', function() {
        const query = $(this).val();
        topResultsContainer.empty().removeClass('active');
        if (!query) return;

        const text = cssTextArea.val();
        const lines = text.split('\n');
        const results = [];
        let count = 0;

        for (let i = 0; i < lines.length; i++) {
            if (count > 50) break;
            const line = lines[i];
            if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({ lineIndex: i, content: line.trim() });
                count++;
            }
        }

        if (results.length > 0) {
            results.forEach(res => {
                const item = $(`<div class="css-search-item"><i class="fa-solid fa-code fa-xs" style="opacity:0.5"></i> ${escapeHtml(res.content)}</div>`);
                item.on('click', () => {
                    jumpToLine(res.lineIndex);
                    topResultsContainer.removeClass('active');
                });
                topResultsContainer.append(item);
            });
            topResultsContainer.addClass('active');
        }
    });

    // 内部搜索 (Tuner)
    const tunerSearchInput = $('#tuner-search');
    tunerSearchInput.on('input', function() {
        const query = $(this).val().toLowerCase();
        contentArea.find('.tuner-card').each(function() {
            const block = $(this);
            const text = block.text().toLowerCase();
            block.toggle(text.includes(query));
        });
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.css-tools-search-wrapper').length) topResultsContainer.removeClass('active');
    });

    $('#css-top-save').on('click', saveSettings);
    
    $('#css-top-scroll').on('click', function() {
        const el = cssTextArea[0];
        const icon = $(this).find('i');
        if (scrollDirection === 'bottom') {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            icon.removeClass('fa-arrow-down').addClass('fa-arrow-up');
            scrollDirection = 'top';
        } else {
            el.scrollTo({ top: 0, behavior: 'smooth' });
            icon.removeClass('fa-arrow-up').addClass('fa-arrow-down');
            scrollDirection = 'bottom';
        }
    });

    $('#tuner-refresh').on('click', () => refreshTuner(true));
    $('#tuner-up').on('click', () => contentArea[0].scrollTo({ top: 0, behavior: 'smooth' }));
    $('#tuner-collapse').on('click', function() {
        tunerBody.toggleClass('collapsed');
        $(this).find('i').toggleClass('fa-chevron-up fa-chevron-down');
    });
}

function saveSettings() {
    cssTextArea.trigger('input');
    const systemUpdateBtn = $('#ui-preset-update-button');
    if (systemUpdateBtn.length && systemUpdateBtn.is(':visible')) {
        systemUpdateBtn.click();
        toastr.success("主题文件已更新", "CssColorTuner");
    } else {
        saveSettingsDebounced();
        toastr.success("全局配置已保存", "CssColorTuner");
    }
}

function jumpToLine(lineIndex) {
    const el = cssTextArea[0];
    const text = el.value;
    const lines = text.split('\n');
    let charIndex = 0;
    for (let i = 0; i < lineIndex; i++) charIndex += lines[i].length + 1; 
    el.focus();
    el.setSelectionRange(charIndex, charIndex);
    const lh = 20; // Approx line height
    el.scrollTo({ top: lineIndex * lh, behavior: 'smooth' });
}

function refreshTuner(force = false) {
    if (!cssTextArea || !cssTextArea.length) cssTextArea = $('#customCSS');
    const cssText = cssTextArea.val();
    if (!force && cssText === lastCssContent) return;
    
    lastCssContent = cssText;
    currentParsedBlocks = parseCssColors(cssText);
    renderTunerBlocks(currentParsedBlocks);
}

function renderTunerBlocks(blocks) {
    contentArea.empty();

    if (blocks.length === 0) {
        contentArea.append('<div style="text-align:center; padding:40px; color:var(--tuner-text-sub);">未检测到可编辑颜色</div>');
        return;
    }

    blocks.forEach(block => {
        // --- 标题格式化：注释 | 选择器 ---
        let titleHtml = '';
        if (block.comment) {
            titleHtml = `<span class="tuner-comment-tag">${escapeHtml(block.comment)}</span><span style="opacity:0.4">|</span> ${escapeHtml(block.selector)}`;
        } else {
            titleHtml = escapeHtml(block.selector);
        }

        const blockEl = $(`<div class="tuner-card" id="${block.id}">
            <div class="tuner-card-header">${titleHtml}</div>
        </div>`);

        block.properties.forEach(prop => {
            const row = $(`<div class="tuner-prop-row">
                <div class="tuner-prop-name">${escapeHtml(prop.name)}</div>
                <div class="tuner-inputs-container"></div>
            </div>`);

            const inputsContainer = row.find('.tuner-inputs-container');

            prop.colors.forEach((colorObj, index) => {
                const colorVal = colorObj.value;

                // 构建输入组
                const group = $(`<div class="tuner-input-group"></div>`);
                
                // 1. 颜色触发块 (Swatch)
                const swatchTrigger = $(`<div class="tuner-swatch-trigger" title="点击打开调色板">
                    <div class="tuner-swatch-inner" style="background-color: ${colorVal}"></div>
                </div>`);

                // 2. 文本输入框
                const textInput = $(`<input type="text" class="tuner-text" value="${colorVal}">`);

                // 更新函数
                const updateValue = (newVal) => {
                    swatchTrigger.find('.tuner-swatch-inner').css('background-color', newVal);
                    textInput.val(newVal);
                    updateCssContent(block.selector, prop.name, index, newVal);
                };

                // 事件绑定：点击 Swatch 打开高级取色器
                swatchTrigger.on('click', function(e) {
                    e.stopPropagation();
                    const currentVal = textInput.val();
                    colorPicker.open(currentVal, this, (newColor) => {
                        updateValue(newColor);
                    });
                });

                // 事件绑定：文本框输入
                textInput.on('change', function() {
                    updateValue($(this).val());
                });

                group.append(swatchTrigger).append(textInput);
                inputsContainer.append(group);
            });

            blockEl.append(row);
        });

        contentArea.append(blockEl);
    });
}

function updateCssContent(selector, propName, colorIndex, newColorValue) {
    const originalCss = cssTextArea.val();
    const selectorEscaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 正则定位到对应的块
    const blockRegex = new RegExp(`(?:(?:\\/\\*[\\s\\S]*?\\*\\/[\\s\\r\\n]*)+)?(${selectorEscaped})\\s*\\{([^}]+)\\}`, 'g');
    
    let match;
    // 需要找到完全匹配的那个块 (可能存在同名选择器，这里简单处理找第一个或遍历)
    // 实际应用中 selector 是唯一的 key 吗？通常在 Tuner 解析里是按顺序来的。
    // 为了简单起见，我们假设 cssTextArea 没被外部剧烈修改，利用 lastCssContent 重新定位可能更好，
    // 但这里直接 replace 也可以。
    
    // 更稳妥的方式：重新读取整个文本，定位到对应位置替换。
    // 由于我们解析时没有存绝对位置(index)，这里尝试用正则替换。
    
    const newCss = originalCss.replace(blockRegex, (fullBlockMatch, matchedSelector, blockContent) => {
        // 如果选择器匹配
        if (matchedSelector !== selector) return fullBlockMatch;

        // 在 blockContent 中查找属性
        const propRegex = new RegExp(`(${propName})\\s*:\\s*([^;]+);`, 'g');
        
        const newBlockContent = blockContent.replace(propRegex, (fullPropMatch, pName, pValue) => {
            let currentColorIndex = 0;
            const newPropValue = pValue.replace(colorRegex, (matchedColor) => {
                if (currentColorIndex === colorIndex) {
                    currentColorIndex++;
                    return newColorValue;
                }
                currentColorIndex++;
                return matchedColor;
            });
            return `${pName}: ${newPropValue};`;
        });
        
        return fullBlockMatch.replace(blockContent, newBlockContent);
    });
    
    if (newCss !== originalCss) {
        lastCssContent = newCss; 
        cssTextArea.val(newCss);
        // 不触发 input 以免重绘整个 Tuner 导致弹窗关闭，但需要让 ST 知道变了
        // 这里我们只更新内部状态，Save 时再触发 input
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

$(document).ready(function() {
    const checkExist = setInterval(function() {
        if ($('#CustomCSS-textAreaBlock').length) {
            console.log(extensionName + " Loaded");
            clearInterval(checkExist);
            createTunerUI();
            setTimeout(() => refreshTuner(true), 300);
        }
    }, 1000);

    eventSource.on(event_types.SETTINGS_UPDATED, function() {
        setTimeout(() => {
            if ($('#customCSS').length && !colorPicker.active) {
                refreshTuner(false);
            }
        }, 500);
    });
});
