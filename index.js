(function () {
    $(document).ready(function () {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        // --- 状态变量 ---
        let isExtensionActive = true;
        let uniqueTitles = new Set();
        let replacementTasks = [];
        let currentValuesMap = {}; 
        
        // 结构签名，用于检测是否需要重建 DOM
        let lastStructureSignature = "";
        
        // 计时器 & 锁
        let debounceTimer; 
        let syncTextareaTimer;
        let isAutoSyncing = false; // 标记是否正在进行自动同步（拖动滑块/输入数值）

        // --- UI 初始化 ---
        const headerBar = document.createElement('div');
        headerBar.className = 'theme-editor-header-bar';

        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.className = 'theme-editor-title';

        const actionGroup = document.createElement('div');
        actionGroup.className = 'theme-editor-header-actions';

        const saveBtn = document.createElement('div');
        saveBtn.className = 'theme-editor-icon-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Save changes to Theme File (Disk)';
        saveBtn.addEventListener('click', commitToThemeFile);

        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'theme-editor-icon-btn fa-solid fa-toggle-on active';
        toggleBtn.title = 'Enable/Disable Theme Editor';
        toggleBtn.addEventListener('click', () => {
            isExtensionActive = !isExtensionActive;
            if (isExtensionActive) {
                toggleBtn.classList.remove('fa-toggle-off');
                toggleBtn.classList.add('fa-toggle-on', 'active');
                editorContainer.classList.remove('theme-editor-hidden');
                // 开启时强制完整重绘
                lastStructureSignature = ""; 
                debouncedParse(true); 
            } else {
                toggleBtn.classList.remove('fa-toggle-on', 'active');
                toggleBtn.classList.add('fa-toggle-off');
                editorContainer.classList.add('theme-editor-hidden');
            }
        });

        actionGroup.appendChild(saveBtn);
        actionGroup.appendChild(toggleBtn);
        headerBar.appendChild(title);
        headerBar.appendChild(actionGroup);

        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';

        customCssBlock.parentNode.insertBefore(headerBar, customCssBlock.nextSibling);
        headerBar.parentNode.insertBefore(editorContainer, headerBar.nextSibling);

        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'theme-editor-tabs';
        
        const tabColors = document.createElement('div');
        tabColors.className = 'theme-editor-tab active';
        tabColors.textContent = 'Colors';
        tabColors.dataset.target = 'panel-colors';

        const tabLayout = document.createElement('div');
        tabLayout.className = 'theme-editor-tab';
        tabLayout.textContent = 'Layout';
        tabLayout.dataset.target = 'panel-layout';

        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'theme-editor-search-wrapper';

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'theme-editor-search-input';
        searchInput.placeholder = 'Search...';
        
        const autocompleteList = document.createElement('div');
        autocompleteList.className = 'theme-editor-autocomplete-list';

        searchWrapper.appendChild(searchInput);
        searchWrapper.appendChild(autocompleteList);

        tabsContainer.appendChild(tabColors);
        tabsContainer.appendChild(tabLayout);
        tabsContainer.appendChild(searchWrapper);
        editorContainer.appendChild(tabsContainer);

        const panelColors = document.createElement('div');
        panelColors.id = 'panel-colors';
        panelColors.className = 'theme-editor-content-panel active';
        editorContainer.appendChild(panelColors);

        const panelLayout = document.createElement('div');
        panelLayout.id = 'panel-layout';
        panelLayout.className = 'theme-editor-content-panel';
        editorContainer.appendChild(panelLayout);

        [tabColors, tabLayout].forEach(tab => {
            tab.addEventListener('click', () => {
                [tabColors, tabLayout].forEach(t => t.classList.remove('active'));
                [panelColors, panelLayout].forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.target).classList.add('active');
            });
        });

        // 搜索
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            filterPanels(val);
            showAutocomplete(val);
        });
        searchInput.addEventListener('focus', (e) => {
            if (e.target.value) showAutocomplete(e.target.value);
        });
        document.addEventListener('click', (e) => {
            if (!searchWrapper.contains(e.target)) {
                autocompleteList.style.display = 'none';
            }
        });

        function filterPanels(text) {
            const groups = document.querySelectorAll('.theme-group');
            groups.forEach(group => {
                const filterText = group.dataset.filterText || '';
                if (filterText.includes(text)) {
                    group.style.display = '';
                } else {
                    group.style.display = 'none';
                }
            });
        }

        function showAutocomplete(text) {
            autocompleteList.innerHTML = '';
            if (!text) {
                autocompleteList.style.display = 'none';
                return;
            }
            const matches = Array.from(uniqueTitles).filter(t => t.toLowerCase().includes(text));
            if (matches.length === 0) {
                autocompleteList.style.display = 'none';
                return;
            }
            matches.slice(0, 10).forEach(match => {
                const item = document.createElement('div');
                item.className = 'theme-editor-autocomplete-item';
                const regex = new RegExp(`(${text})`, 'gi');
                item.innerHTML = match.replace(regex, '<span class="match">$1</span>');
                item.addEventListener('click', () => {
                    searchInput.value = match;
                    filterPanels(match.toLowerCase());
                    autocompleteList.style.display = 'none';
                });
                autocompleteList.appendChild(item);
            });
            autocompleteList.style.display = 'block';
        }

        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }

        // --- 核心配置 ---
        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        const layoutProperties = [
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'top', 'bottom', 'left', 'right', 'gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'font-size', 'line-height', 'border-radius', 'border-width', 'font-weight', 'z-index', 'opacity', 'flex-basis'
        ];
        const unitlessProperties = ['z-index', 'opacity', 'font-weight', 'line-height']; 

        // 只清除不再使用的变量
        function cleanupUnusedVariables(activeVariables) {
            const rootStyle = document.documentElement.style;
            const varsToRemove = [];
            for (let i = 0; i < rootStyle.length; i++) {
                const prop = rootStyle[i];
                if (prop.startsWith('--theme-editor-') && !activeVariables.has(prop)) {
                    varsToRemove.push(prop);
                }
            }
            varsToRemove.forEach(v => rootStyle.removeProperty(v));
        }

        function updateLiveCssVariable(variableName, newValue) {
            currentValuesMap[variableName] = newValue;
            document.documentElement.style.setProperty(variableName, newValue, 'important');

            clearTimeout(syncTextareaTimer);
            syncTextareaTimer = setTimeout(writeChangesToTextarea, 800);
        }

        // [优化] 标题格式化逻辑：更严格的清洗，防止出现 "} .mes"
        function createFormattedSelectorLabel(rawSelector) {
            let commentText = "";
            
            // 1. 去除前面残留的 } 或空白
            let cleanSelector = rawSelector.replace(/^[}\s]+/, '').trim();
            
            // 2. 提取注释
            const commentMatch = cleanSelector.match(/\/\*([\s\S]*?)\*\//);
            if (commentMatch) {
                commentText = commentMatch[1].trim(); // 注释内容
                cleanSelector = cleanSelector.replace(commentMatch[0], '').trim(); // 移除注释后的选择器
            }
            
            // 3. 压缩空白字符 (把换行和多余空格变成单个空格)
            cleanSelector = cleanSelector.replace(/\s+/g, ' ');

            // 4. 拼接：注释/选择器 (无空格)
            const titleText = commentText ? `${commentText}/${cleanSelector}` : cleanSelector;
            
            uniqueTitles.add(titleText);

            if (commentText) {
                return `<div class="label-line-1"><span class="label-highlight">${commentText}</span>/${cleanSelector}</div>`;
            } else {
                return `<div class="label-line-1">${cleanSelector}</div>`;
            }
        }

        function formatLayoutValue(prop, val) {
            if (!val) return val;
            const trimmed = val.toString().trim();
            if (!isNaN(trimmed) && trimmed !== '0' && !unitlessProperties.includes(prop.toLowerCase())) {
                return trimmed + 'px';
            }
            return trimmed;
        }

        function splitCSSValue(value) {
            const parts = [];
            let current = '';
            let depth = 0; 

            for (let char of value) {
                if (char === '(') depth++;
                else if (char === ')') depth--;

                if (depth === 0 && /\s/.test(char)) {
                    if (current) {
                        parts.push(current);
                        current = '';
                    }
                } else {
                    current += char;
                }
            }
            if (current) parts.push(current);
            return parts;
        }

        function writeChangesToTextarea() {
            isAutoSyncing = true;
            const originalCss = customCssTextarea.value;
            let newCss = originalCss;
            const tasks = replacementTasks.sort((a, b) => b.start - a.start);
            
            tasks.forEach(task => {
                const newValue = currentValuesMap[task.variableName];
                if (newValue !== undefined && newValue !== null) {
                    const before = newCss.slice(0, task.start);
                    const after = newCss.slice(task.end);
                    newCss = before + newValue + after;
                }
            });

            if (originalCss !== newCss) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                nativeInputValueSetter.call(customCssTextarea, newCss);
                const inputEvent = new Event('input', { bubbles: true });
                customCssTextarea.dispatchEvent(inputEvent);
                if (window.$) $(customCssTextarea).trigger('input');
            } else {
                isAutoSyncing = false;
            }
        }

        function commitToThemeFile() {
            writeChangesToTextarea();
            setTimeout(() => {
                const stUpdateBtn = document.getElementById('ui-preset-update-button');
                if (stUpdateBtn) {
                    stUpdateBtn.click();
                    if (window.toastr) window.toastr.success('Theme file updated!');
                } else {
                    alert('CSS Updated. Please save theme manually.');
                }
            }, 100);
        }

        // --- 核心解析与UI构建 ---
        function parseAndBuildUI(allowDomRebuild = true) {
            if (!isExtensionActive) return;
            
            if (document.getElementById('custom-css')) document.getElementById('custom-css').disabled = true;

            replacementTasks = []; 
            uniqueTitles.clear();
            const activeVariables = new Set(); 

            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            let finalCssRules = '';
            
            let currentStructureSignature = "";
            let colorUIBlocks = [];
            let layoutUIBlocks = [];

            const colorFragment = document.createDocumentFragment();
            const layoutFragment = document.createDocumentFragment();

            // [优化] 预编译正则，循环外定义
            const ruleRegex = /([^{]+)\{([^}]+)\}/g;
            const declarationRegex = /(?:^|;)\s*([a-zA-Z0-9-]+)\s*:\s*([^;\}]+)/g;

            let ruleMatch;
            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const rawSelector = ruleMatch[1]; // 不在这里trim，交给专门的Label处理函数清洗
                const selector = rawSelector.trim();
                const declarationsText = ruleMatch[2];
                const ruleBodyOffset = ruleMatch.index + ruleMatch[0].indexOf('{') + 1;
                
                let processedDeclarations = declarationsText;
                
                // 签名只需记录粗略结构，保证速度
                currentStructureSignature += selector.length + "|";

                let declMatch;
                // 重置 lastIndex 确保正则从头开始匹配新字符串
                declarationRegex.lastIndex = 0;

                while ((declMatch = declarationRegex.exec(declarationsText)) !== null) {
                    const fullMatch = declMatch[0];
                    const property = declMatch[1].trim();
                    const originalValue = declMatch[2]; 
                    const lowerProp = property.toLowerCase();

                    // 快速跳过不相关的属性，大幅提升循环速度
                    const isColor = colorProperties.includes(lowerProp);
                    const isLayout = !isColor && layoutProperties.includes(lowerProp);

                    if (!isColor && !isLayout) continue;

                    const colonIndex = fullMatch.indexOf(':');
                    const valueRelativeStart = fullMatch.indexOf(originalValue, colonIndex); 
                    const valueAbsoluteStart = ruleBodyOffset + declMatch.index + valueRelativeStart;
                    const valueAbsoluteEnd = valueAbsoluteStart + originalValue.length;

                    // --- 颜色处理 ---
                    if (isColor) {
                        const foundColors = [...originalValue.matchAll(colorValueRegex)];
                        
                        if (foundColors.length > 0) {
                            currentStructureSignature += `C:${property}:${foundColors.length}|`;
                            
                            const propertyBlock = document.createElement('div');
                            propertyBlock.className = 'theme-editor-property-block';
                            const propLabel = document.createElement('div');
                            propLabel.className = 'theme-editor-prop-label';
                            propLabel.textContent = property;
                            propertyBlock.appendChild(propLabel);

                            let colorReplacements = [];

                            foundColors.forEach((colorMatch, index) => {
                                const colorStr = colorMatch[0];
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;
                                activeVariables.add(variableName);

                                replacementTasks.push({
                                    start: valueAbsoluteStart + colorMatch.index,
                                    end: valueAbsoluteStart + colorMatch.index + colorStr.length,
                                    variableName: variableName
                                });

                                // [核心修复] 初始值逻辑
                                // 1. 如果正在自动同步(拖拽中)，优先用 Map 里的值，保证流畅
                                // 2. 如果不是自动同步(比如换了主题/手改了代码)，必须用 colorStr (文件里的新颜色)
                                let initialColor;
                                if (isAutoSyncing && currentValuesMap.hasOwnProperty(variableName)) {
                                     initialColor = currentValuesMap[variableName];
                                } else {
                                     initialColor = (colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr);
                                     // 强制更新 Map，确保切回 Map 模式时值是新的
                                     currentValuesMap[variableName] = initialColor;
                                }

                                document.documentElement.style.setProperty(variableName, initialColor, 'important');

                                colorReplacements.push({
                                    str: colorStr,
                                    var: `var(${variableName})`,
                                    index: colorMatch.index,
                                    length: colorStr.length
                                });

                                if (allowDomRebuild) {
                                    if (foundColors.length > 1) {
                                        const subLabel = document.createElement('div');
                                        subLabel.className = 'theme-editor-sub-label';
                                        subLabel.textContent = `Color #${index + 1}`;
                                        propertyBlock.appendChild(subLabel);
                                    }

                                    const colorPicker = document.createElement('toolcool-color-picker');
                                    colorPicker.dataset.varName = variableName;
                                    // 延迟设值
                                    setTimeout(() => { colorPicker.color = initialColor; }, 0);
                                    
                                    $(colorPicker).on('change', (evt) => {
                                        updateLiveCssVariable(variableName, evt.detail.rgba);
                                    });
                                    propertyBlock.appendChild(colorPicker);
                                }
                            });

                            colorReplacements.sort((a, b) => b.index - a.index);
                            let liveValue = originalValue;
                            colorReplacements.forEach(rep => {
                                liveValue = liveValue.substring(0, rep.index) + rep.var + liveValue.substring(rep.index + rep.length);
                            });
                            processedDeclarations = processedDeclarations.replace(originalValue, liveValue);
                            
                            if (allowDomRebuild) colorUIBlocks.push({block: propertyBlock, rawSelector: rawSelector});
                        }
                    }

                    // --- 布局处理 ---
                    else if (isLayout) {
                        const cleanValue = originalValue.replace('!important', '').trim();
                        const values = splitCSSValue(cleanValue);
                        
                        if (values.length > 0) {
                            currentStructureSignature += `L:${property}:${values.length}|`;
                            
                            const variableName = `--theme-editor-layout-${uniqueId}`;
                            uniqueId++;
                            activeVariables.add(variableName);

                            replacementTasks.push({
                                start: valueAbsoluteStart, 
                                end: valueAbsoluteEnd,
                                variableName: variableName
                            });

                            let initValue;
                            if (isAutoSyncing && currentValuesMap.hasOwnProperty(variableName)) {
                                initValue = currentValuesMap[variableName];
                            } else {
                                initValue = cleanValue;
                                currentValuesMap[variableName] = initValue;
                            }
                            
                            document.documentElement.style.setProperty(variableName, initValue, 'important');
                            
                            processedDeclarations = processedDeclarations.replace(originalValue, `var(${variableName})`);

                            let currentSplitValues = splitCSSValue(initValue);

                            if (allowDomRebuild) {
                                const propertyBlock = document.createElement('div');
                                propertyBlock.className = 'theme-editor-property-block';
                                const propLabel = document.createElement('div');
                                propLabel.className = 'theme-editor-prop-label';
                                propLabel.textContent = property;
                                propertyBlock.appendChild(propLabel);

                                const inputsContainer = document.createElement('div');
                                inputsContainer.className = 'layout-inputs-container';

                                currentSplitValues.forEach((val, index) => {
                                    const input = document.createElement('input');
                                    input.type = 'text';
                                    input.className = 'layout-input';
                                    input.value = val;
                                    input.dataset.varName = variableName;
                                    input.dataset.index = index;
                                    
                                    input.addEventListener('input', (e) => {
                                        let latestVals = splitCSSValue(currentValuesMap[variableName] || initValue);
                                        while(latestVals.length <= index) latestVals.push('0');
                                        
                                        latestVals[index] = e.target.value;
                                        const formattedValues = latestVals.map(v => formatLayoutValue(lowerProp, v));
                                        updateLiveCssVariable(variableName, formattedValues.join(' '));
                                    });

                                    inputsContainer.appendChild(input);
                                });

                                propertyBlock.appendChild(inputsContainer);
                                layoutUIBlocks.push({block: propertyBlock, rawSelector: rawSelector});
                            }
                        }
                    }
                } // end declarations

                finalCssRules += `${selector} { ${processedDeclarations} !important }\n`;

            } // end rules loop
            
            liveStyleTag.textContent = finalCssRules;
            cleanupUnusedVariables(activeVariables);

            if (allowDomRebuild) {
                const structureChanged = (currentStructureSignature !== lastStructureSignature);
                
                // 如果结构变了，或者不是自动同步（即换主题了），重建 DOM
                if (structureChanged && !isAutoSyncing) {
                    
                    // 辅助函数：批量构建
                    const buildFragment = (items, fragment) => {
                        let currentGroup = null;
                        let lastSelector = null;
                        
                        items.forEach(item => {
                            // 简单的分组逻辑：如果选择器一样，放在同一个组
                            if (item.rawSelector !== lastSelector || !currentGroup) {
                                currentGroup = document.createElement('div');
                                currentGroup.className = 'theme-group';
                                
                                const titleHtml = createFormattedSelectorLabel(item.rawSelector);
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = titleHtml;
                                currentGroup.dataset.filterText = tempDiv.textContent.toLowerCase().trim();

                                const mainLabel = document.createElement('div');
                                mainLabel.className = 'theme-editor-main-label';
                                mainLabel.innerHTML = titleHtml;
                                currentGroup.appendChild(mainLabel);
                                
                                fragment.appendChild(currentGroup);
                                lastSelector = item.rawSelector;
                            }
                            currentGroup.appendChild(item.block);
                        });
                    };

                    buildFragment(colorUIBlocks, colorFragment);
                    buildFragment(layoutUIBlocks, layoutFragment);

                    const scrollTop = editorContainer.scrollTop;
                    panelColors.innerHTML = '';
                    panelLayout.innerHTML = '';
                    panelColors.appendChild(colorFragment);
                    panelLayout.appendChild(layoutFragment);
                    
                    const currentSearch = document.querySelector('.theme-editor-search-input')?.value.toLowerCase();
                    if (currentSearch) filterPanels(currentSearch);
                    editorContainer.scrollTop = scrollTop;
                    
                    lastStructureSignature = currentStructureSignature;

                } else if (!isAutoSyncing) {
                    // 结构没变但数据变了（从文件读取），更新 UI 显示
                    const allPickers = document.querySelectorAll('toolcool-color-picker');
                    for (let picker of allPickers) {
                        const vName = picker.dataset.varName;
                        if (vName && currentValuesMap[vName] && picker.color !== currentValuesMap[vName]) {
                            picker.color = currentValuesMap[vName];
                        }
                    }

                    const allInputs = document.querySelectorAll('.layout-input');
                    const activeEl = document.activeElement;
                    for (let input of allInputs) {
                        if (input === activeEl) continue;
                        const vName = input.dataset.varName;
                        const idx = parseInt(input.dataset.index);
                        if (vName && currentValuesMap[vName]) {
                            const splitVals = splitCSSValue(currentValuesMap[vName]);
                            if (splitVals[idx] && input.value !== splitVals[idx]) {
                                input.value = splitVals[idx];
                            }
                        }
                    }
                }
            }
        }

        function debouncedParse(forceRebuild = false) {
            clearTimeout(debounceTimer);
            // [优化] 极速响应：从 300ms 降至 60ms
            debounceTimer = setTimeout(() => {
                if (isAutoSyncing && !forceRebuild) {
                    isAutoSyncing = false;
                    parseAndBuildUI(false); 
                } else {
                    parseAndBuildUI(true);  
                }
            }, 60); 
        }

        const originalValueDescriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        Object.defineProperty(customCssTextarea, 'value', {
            get: function() {
                return originalValueDescriptor.get.call(this);
            },
            set: function(val) {
                originalValueDescriptor.set.call(this, val);
                debouncedParse();
            }
        });

        // 初始化
        parseAndBuildUI(true);
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v23 - Fast & Clean) loaded successfully.");
    });
})();
