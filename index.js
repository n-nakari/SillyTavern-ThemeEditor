(function () {
    // 等待文档加载
    const initExtension = () => {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Essential elements not found.");
            return;
        }

        // --- 核心状态 ---
        let isExtensionActive = true;
        let uniqueTitles = new Set();
        let replacementTasks = [];
        let currentValuesMap = {}; 
        let lastStructureSignature = "";
        
        // --- 性能控制 ---
        let debounceTimer; 
        let syncTextareaTimer;
        let isAutoSyncing = false;
        let renderQueue = []; // 异步渲染队列
        let renderFrameId;  // 动画帧ID

        // --- 配置常量 ---
        const cssColorNames = new Set([
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ]);
        
        const colorProperties = new Set(['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke']);
        const layoutProperties = new Set(['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'top', 'bottom', 'left', 'right', 'gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'font-size', 'line-height', 'border-radius', 'border-width', 'font-weight', 'z-index', 'opacity', 'flex-basis']);
        const unitlessProperties = new Set(['z-index', 'opacity', 'font-weight', 'line-height']); 

        // 预编译正则，提升性能
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${Array.from(cssColorNames).join('|')})\\b)`, 'gi');
        const ruleRegex = /([^{]+)\{([^}]+)\}/g;
        const declarationRegex = /(?:^|;)\s*([a-zA-Z0-9-]+)\s*:\s*([^;\}]+)/g;

        // --- DOM 构建 ---
        const headerBar = document.createElement('div');
        headerBar.className = 'theme-editor-header-bar';
        headerBar.innerHTML = `<h4 class="theme-editor-title">Live Theme Editor</h4>`;

        const actionGroup = document.createElement('div');
        actionGroup.className = 'theme-editor-header-actions';

        const saveBtn = document.createElement('div');
        saveBtn.className = 'theme-editor-icon-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Save changes to Theme File';
        saveBtn.onclick = commitToThemeFile;

        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'theme-editor-icon-btn fa-solid fa-toggle-on active';
        toggleBtn.title = 'Toggle Editor';
        toggleBtn.onclick = () => {
            isExtensionActive = !isExtensionActive;
            if (isExtensionActive) {
                toggleBtn.className = 'theme-editor-icon-btn fa-solid fa-toggle-on active';
                editorContainer.classList.remove('theme-editor-hidden');
                lastStructureSignature = ""; 
                debouncedParse(true);
            } else {
                toggleBtn.className = 'theme-editor-icon-btn fa-solid fa-toggle-off';
                editorContainer.classList.add('theme-editor-hidden');
            }
        };

        actionGroup.append(saveBtn, toggleBtn);
        headerBar.appendChild(actionGroup);

        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';

        // 插入到页面
        customCssBlock.parentNode.insertBefore(headerBar, customCssBlock.nextSibling);
        headerBar.parentNode.insertBefore(editorContainer, headerBar.nextSibling);

        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'theme-editor-tabs';
        tabsContainer.innerHTML = `
            <div class="theme-editor-tab active" data-target="panel-colors">Colors</div>
            <div class="theme-editor-tab" data-target="panel-layout">Layout</div>
            <div class="theme-editor-search-wrapper">
                <input type="search" class="theme-editor-search-input" placeholder="Search...">
                <div class="theme-editor-autocomplete-list"></div>
            </div>
        `;
        editorContainer.appendChild(tabsContainer);

        const panelColors = document.createElement('div');
        panelColors.id = 'panel-colors';
        panelColors.className = 'theme-editor-content-panel active';
        
        const panelLayout = document.createElement('div');
        panelLayout.id = 'panel-layout';
        panelLayout.className = 'theme-editor-content-panel';
        
        editorContainer.append(panelColors, panelLayout);

        // --- 事件绑定 ---
        const tabs = tabsContainer.querySelectorAll('.theme-editor-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                [panelColors, panelLayout].forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.target).classList.add('active');
            });
        });

        const searchInput = tabsContainer.querySelector('input');
        const autocompleteList = tabsContainer.querySelector('.theme-editor-autocomplete-list');

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            filterPanels(val);
            showAutocomplete(val);
        });
        searchInput.addEventListener('focus', (e) => { if (e.target.value) showAutocomplete(e.target.value); });
        document.addEventListener('click', (e) => {
            if (!tabsContainer.querySelector('.theme-editor-search-wrapper').contains(e.target)) {
                autocompleteList.style.display = 'none';
            }
        });

        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }

        // --- 辅助功能 ---

        function filterPanels(text) {
            // 使用 requestAnimationFrame 避免搜索时卡顿
            requestAnimationFrame(() => {
                const groups = document.querySelectorAll('.theme-group');
                groups.forEach(group => {
                    const show = !text || (group.dataset.filterText && group.dataset.filterText.includes(text));
                    group.style.display = show ? '' : 'none';
                });
            });
        }

        function showAutocomplete(text) {
            autocompleteList.innerHTML = '';
            if (!text) { autocompleteList.style.display = 'none'; return; }
            
            const matches = Array.from(uniqueTitles).filter(t => t.toLowerCase().includes(text)).slice(0, 10);
            if (matches.length === 0) { autocompleteList.style.display = 'none'; return; }

            const frag = document.createDocumentFragment();
            matches.forEach(match => {
                const item = document.createElement('div');
                item.className = 'theme-editor-autocomplete-item';
                item.innerHTML = match.replace(new RegExp(`(${text})`, 'gi'), '<span class="match">$1</span>');
                item.onclick = () => {
                    searchInput.value = match;
                    filterPanels(match.toLowerCase());
                    autocompleteList.style.display = 'none';
                };
                frag.appendChild(item);
            });
            autocompleteList.appendChild(frag);
            autocompleteList.style.display = 'block';
        }

        function cleanupUnusedVariables(activeVariables) {
            const rootStyle = document.documentElement.style;
            // 缓存 keys 避免循环中修改导致的问题
            const props = [];
            for (let i = 0; i < rootStyle.length; i++) props.push(rootStyle[i]);
            
            props.forEach(prop => {
                if (prop.startsWith('--theme-editor-') && !activeVariables.has(prop)) {
                    rootStyle.removeProperty(prop);
                }
            });
        }

        // 优化：括号感知分割 (更高效的实现)
        function splitCSSValue(value) {
            if (!value.includes('(')) return value.split(/\s+/).filter(Boolean);
            
            const parts = [];
            let current = '';
            let depth = 0;
            for (let i = 0; i < value.length; i++) {
                const char = value[i];
                if (char === '(') depth++;
                else if (char === ')') depth--;
                
                if (depth === 0 && /\s/.test(char)) {
                    if (current) parts.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            if (current) parts.push(current);
            return parts;
        }

        // 优化：标题清理 (修复 /} .mes 问题)
        function createFormattedSelectorLabel(rawSelector) {
            // 1. 移除前导的 } 或乱码
            let cleanSelector = rawSelector.replace(/^[}\s]+/, '').trim();
            
            // 2. 提取注释
            let commentText = "";
            const commentMatch = cleanSelector.match(/\/\*([\s\S]*?)\*\//);
            
            if (commentMatch) {
                commentText = commentMatch[1].trim();
                // 移除注释本身，得到纯选择器
                cleanSelector = cleanSelector.replace(commentMatch[0], '').trim();
            }
            
            // 3. 构建显示文本
            const titleText = commentText ? `${commentText} ${cleanSelector}` : cleanSelector;
            uniqueTitles.add(titleText);

            if (commentText) {
                return `<div class="label-line-1"><span class="label-highlight">${commentText}</span> / ${cleanSelector}</div>`;
            } else {
                return `<div class="label-line-1">${cleanSelector}</div>`;
            }
        }

        function updateLiveCssVariable(variableName, newValue) {
            currentValuesMap[variableName] = newValue;
            document.documentElement.style.setProperty(variableName, newValue, 'important');
            
            clearTimeout(syncTextareaTimer);
            syncTextareaTimer = setTimeout(writeChangesToTextarea, 800);
        }

        function writeChangesToTextarea() {
            isAutoSyncing = true;
            const originalCss = customCssTextarea.value;
            let newCss = originalCss;
            const tasks = replacementTasks.sort((a, b) => b.start - a.start);
            
            tasks.forEach(task => {
                const val = currentValuesMap[task.variableName];
                if (val != null) {
                    newCss = newCss.slice(0, task.start) + val + newCss.slice(task.end);
                }
            });

            if (originalCss !== newCss) {
                // 原生 setter 触发 React/Vue 等框架监听
                const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
                descriptor.set.call(customCssTextarea, newCss);
                customCssTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                isAutoSyncing = false;
            }
        }

        function commitToThemeFile() {
            writeChangesToTextarea();
            setTimeout(() => {
                const btn = document.getElementById('ui-preset-update-button');
                if (btn) {
                    btn.click();
                    if (window.toastr) window.toastr.success('Theme updated!');
                } else {
                    alert('CSS Updated. Save manually.');
                }
            }, 100);
        }

        // --- 核心逻辑：异步队列渲染 ---
        function processRenderQueue() {
            if (renderQueue.length === 0) return;

            // 每次 RAF 处理 20 个组，保证界面不卡顿
            const CHUNK_SIZE = 20; 
            const chunk = renderQueue.splice(0, CHUNK_SIZE);
            
            const colorFrag = document.createDocumentFragment();
            const layoutFrag = document.createDocumentFragment();
            let hasColor = false;
            let hasLayout = false;

            chunk.forEach(item => {
                const { rawSelector, colorBlocks, layoutBlocks } = item;
                const titleHtml = createFormattedSelectorLabel(rawSelector);
                // 临时创建元素获取纯文本用于搜索
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = titleHtml;
                const filterText = tempDiv.textContent.toLowerCase().trim();

                if (colorBlocks && colorBlocks.length > 0) {
                    const group = document.createElement('div');
                    group.className = 'theme-group';
                    group.dataset.filterText = filterText;
                    group.innerHTML = `<div class="theme-editor-main-label">${titleHtml}</div>`;
                    colorBlocks.forEach(b => group.appendChild(b));
                    colorFrag.appendChild(group);
                    hasColor = true;
                }

                if (layoutBlocks && layoutBlocks.length > 0) {
                    const group = document.createElement('div');
                    group.className = 'theme-group';
                    group.dataset.filterText = filterText;
                    group.innerHTML = `<div class="theme-editor-main-label">${titleHtml}</div>`;
                    layoutBlocks.forEach(b => group.appendChild(b));
                    layoutFrag.appendChild(group);
                    hasLayout = true;
                }
            });

            if (hasColor) panelColors.appendChild(colorFrag);
            if (hasLayout) panelLayout.appendChild(layoutFrag);

            // 如果还有剩余，继续请求下一帧
            if (renderQueue.length > 0) {
                renderFrameId = requestAnimationFrame(processRenderQueue);
            } else {
                // 渲染完成，如果有搜索词，重新应用过滤
                const currentSearch = searchInput.value.toLowerCase();
                if (currentSearch) filterPanels(currentSearch);
            }
        }

        function parseAndBuildUI(allowDomRebuild = true) {
            if (!isExtensionActive) return;

            // 取消之前的渲染任务
            if (renderFrameId) cancelAnimationFrame(renderFrameId);
            renderQueue = [];

            replacementTasks = [];
            uniqueTitles.clear();
            const activeVariables = new Set();
            
            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            let finalCssRules = '';
            let currentStructureSignature = "";
            
            // 仅当 DOM 需要重建时才收集 UI 块
            const shouldRebuildDOM = allowDomRebuild && !isAutoSyncing;

            let ruleMatch;
            // 重置正则索引
            ruleRegex.lastIndex = 0;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const rawSelector = ruleMatch[1]; // 不 trim，保留原始以便计算位置，稍后处理
                const declarationsText = ruleMatch[2];
                const ruleBodyOffset = ruleMatch.index + ruleMatch[0].indexOf('{') + 1;
                
                let processedDeclarations = declarationsText;
                let uiItem = { rawSelector: rawSelector, colorBlocks: [], layoutBlocks: [] };
                let hasUI = false;

                currentStructureSignature += rawSelector + "|";

                declarationRegex.lastIndex = 0;
                let declMatch;
                while ((declMatch = declarationRegex.exec(declarationsText)) !== null) {
                    const property = declMatch[1].trim();
                    const originalValue = declMatch[2];
                    const lowerProp = property.toLowerCase();
                    const valStart = ruleBodyOffset + declMatch.index + declMatch[0].indexOf(originalValue, declMatch[0].indexOf(':'));

                    // --- 颜色 ---
                    if (colorProperties.has(lowerProp)) {
                        const foundColors = [...originalValue.matchAll(colorValueRegex)];
                        if (foundColors.length > 0) {
                            currentStructureSignature += `C:${foundColors.length}|`;
                            
                            const pBlock = shouldRebuildDOM ? document.createElement('div') : null;
                            if (pBlock) {
                                pBlock.className = 'theme-editor-property-block';
                                pBlock.innerHTML = `<div class="theme-editor-prop-label">${property}</div>`;
                            }

                            let replacements = [];
                            foundColors.forEach((cm, idx) => {
                                const varName = `--theme-editor-c-${uniqueId++}`;
                                activeVariables.add(varName);

                                replacementTasks.push({ start: valStart + cm.index, end: valStart + cm.index + cm[0].length, variableName: varName });

                                // 优先使用现有值防止闪烁
                                let val = currentValuesMap[varName] || (cm[0].toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : cm[0]);
                                if (!currentValuesMap[varName]) currentValuesMap[varName] = val; // 初始化

                                document.documentElement.style.setProperty(varName, val, 'important');

                                replacements.push({ start: cm.index, end: cm.index + cm[0].length, var: `var(${varName})` });

                                if (pBlock) {
                                    if (foundColors.length > 1) {
                                        const subLabel = document.createElement('div');
                                        subLabel.className = 'theme-editor-sub-label';
                                        subLabel.textContent = `Color #${idx + 1}`;
                                        pBlock.appendChild(subLabel);
                                    }
                                    const picker = document.createElement('toolcool-color-picker');
                                    picker.color = val;
                                    picker.dataset.varName = varName;
                                    picker.addEventListener('change', (e) => updateLiveCssVariable(varName, e.detail.rgba));
                                    pBlock.appendChild(picker);
                                }
                            });

                            // 替换 CSS 字符串
                            replacements.sort((a,b) => b.start - a.start);
                            let newVal = originalValue;
                            replacements.forEach(r => newVal = newVal.slice(0, r.start) + r.var + newVal.slice(r.end));
                            processedDeclarations = processedDeclarations.replace(originalValue, newVal);
                            
                            if (pBlock) uiItem.colorBlocks.push(pBlock);
                            hasUI = true;
                        }
                    }
                    // --- 布局 ---
                    else if (layoutProperties.has(lowerProp)) {
                        const cleanVal = originalValue.replace('!important', '').trim();
                        const parts = splitCSSValue(cleanVal);
                        
                        if (parts.length > 0) {
                            currentStructureSignature += `L:${parts.length}|`;
                            const varName = `--theme-editor-l-${uniqueId++}`;
                            activeVariables.add(varName);

                            replacementTasks.push({ start: valStart, end: valStart + originalValue.length, variableName: varName }); // Layout replaces full value

                            let val = currentValuesMap[varName] || cleanVal;
                            if (!currentValuesMap[varName]) currentValuesMap[varName] = val;

                            document.documentElement.style.setProperty(varName, val, 'important');
                            processedDeclarations = processedDeclarations.replace(originalValue, `var(${varName})`);

                            if (shouldRebuildDOM) {
                                const pBlock = document.createElement('div');
                                pBlock.className = 'theme-editor-property-block';
                                pBlock.innerHTML = `<div class="theme-editor-prop-label">${property}</div>`;
                                const inputsDiv = document.createElement('div');
                                inputsDiv.className = 'layout-inputs-container';
                                
                                const valParts = splitCSSValue(val);
                                valParts.forEach((vp, idx) => {
                                    const inp = document.createElement('input');
                                    inp.type = 'text';
                                    inp.className = 'layout-input';
                                    inp.value = vp;
                                    inp.dataset.varName = varName;
                                    inp.dataset.index = idx;
                                    inp.dataset.prop = lowerProp; // 用于 formatLayoutValue
                                    
                                    inp.oninput = (e) => {
                                        const currentArr = splitCSSValue(currentValuesMap[varName] || "");
                                        // 补齐数组
                                        while(currentArr.length <= idx) currentArr.push('0');
                                        currentArr[idx] = e.target.value;
                                        
                                        const unitless = unitlessProperties.has(lowerProp);
                                        const finalStr = currentArr.map(v => {
                                            const t = v.trim();
                                            if (!unitless && !isNaN(t) && t !== '0' && t !== '') return t + 'px';
                                            return t;
                                        }).join(' ');
                                        
                                        updateLiveCssVariable(varName, finalStr);
                                    };
                                    inputsDiv.appendChild(inp);
                                });
                                pBlock.appendChild(inputsDiv);
                                uiItem.layoutBlocks.push(pBlock);
                                hasUI = true;
                            }
                        }
                    }
                } // end declarations

                finalCssRules += `${rawSelector} { ${processedDeclarations} !important }\n`;
                if (hasUI && shouldRebuildDOM) renderQueue.push(uiItem);

            } // end rules loop

            // 1. 立即更新页面样式 (无延迟)
            liveStyleTag.textContent = finalCssRules;
            cleanupUnusedVariables(activeVariables);

            // 2. 处理 UI 更新 (智能 diff)
            if (shouldRebuildDOM) {
                if (currentStructureSignature !== lastStructureSignature) {
                    // 结构变了，清空并重新分帧渲染
                    panelColors.innerHTML = '';
                    panelLayout.innerHTML = '';
                    processRenderQueue(); 
                    lastStructureSignature = currentStructureSignature;
                } else {
                    // 结构没变，原位更新数值 (Color Picker & Inputs)
                    // 这样不会打断用户的输入焦点
                    document.querySelectorAll('toolcool-color-picker').forEach(p => {
                        const v = currentValuesMap[p.dataset.varName];
                        if (v && p.color !== v) p.color = v;
                    });
                    
                    const activeEl = document.activeElement;
                    document.querySelectorAll('.layout-input').forEach(inp => {
                        if (inp === activeEl) return;
                        const v = currentValuesMap[inp.dataset.varName];
                        if (v) {
                            const parts = splitCSSValue(v);
                            const idx = parseInt(inp.dataset.index);
                            if (parts[idx] && inp.value !== parts[idx]) inp.value = parts[idx];
                        }
                    });
                }
            }
        }

        function debouncedParse(forceRebuild = false) {
            clearTimeout(debounceTimer);
            // 动态防抖：如果是自动同步(拖动条)，几乎无需延迟；如果是打字，延迟稍长
            const delay = isAutoSyncing ? 50 : (customCssTextarea.value.length > 50000 ? 300 : 150);
            
            debounceTimer = setTimeout(() => {
                if (isAutoSyncing && !forceRebuild) {
                    isAutoSyncing = false;
                    parseAndBuildUI(false); // 只更新变量映射，不重建 DOM
                } else {
                    parseAndBuildUI(true);
                }
            }, delay);
        }

        // 劫持 value setter 实现双向绑定
        const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        Object.defineProperty(customCssTextarea, 'value', {
            get: function() { return desc.get.call(this); },
            set: function(val) {
                desc.set.call(this, val);
                debouncedParse();
            }
        });

        // 绑定输入事件
        customCssTextarea.addEventListener('input', debouncedParse);
        
        // 初始运行
        parseAndBuildUI(true);
        console.log("Theme Editor (v3.0 - Optimized Async Render) loaded.");
    };

    if (window.jQuery) {
        $(document).ready(initExtension);
    } else {
        document.addEventListener('DOMContentLoaded', initExtension);
    }
})();
