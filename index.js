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
        
        // 结构签名
        let lastStructureSignature = "";
        
        // 计时器
        let debounceTimer; 
        let syncTextareaTimer;
        let isAutoSyncing = false; 

        // --- UI 初始化 ---
        
        // [修改] 不再创建独立的 HeaderBar 和 Title
        // 直接创建顶部工具栏容器 (兼具 Tabs 功能)
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'theme-editor-tabs';
        
        // Tabs
        const tabColors = document.createElement('div');
        tabColors.className = 'theme-editor-tab active';
        tabColors.textContent = 'Colors';
        tabColors.dataset.target = 'panel-colors';

        const tabLayout = document.createElement('div');
        tabLayout.className = 'theme-editor-tab';
        tabLayout.textContent = 'Layout';
        tabLayout.dataset.target = 'panel-layout';

        // 搜索框区域
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

        // [修改] 按钮组现在移到这里
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

        // 组装顶部栏：Tabs -> Spacer(CSS控制) -> Search -> Buttons
        tabsContainer.appendChild(tabColors);
        tabsContainer.appendChild(tabLayout);
        tabsContainer.appendChild(searchWrapper);
        tabsContainer.appendChild(actionGroup);

        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';

        // 插入到页面
        customCssBlock.parentNode.insertBefore(tabsContainer, customCssBlock.nextSibling);
        tabsContainer.parentNode.insertBefore(editorContainer, tabsContainer.nextSibling);

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

        // 搜索逻辑
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
            'top', 'bottom', 'left', 'right', 'gap', 
            'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 
            'flex-basis'
        ];
        const unitlessProperties = []; 

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

        function createFormattedSelectorLabel(rawSelector) {
            let cleanSelector = rawSelector.replace(/^[}\s]+/, '').trim();
            let commentText = "";
            const commentRegex = /\/\*([\s\S]*?)\*\//g;
            const matches = [...cleanSelector.matchAll(commentRegex)];
            
            if (matches.length > 0) {
                const lastMatch = matches[matches.length - 1];
                const lastCommentContent = lastMatch[1].trim();
                const endIndex = lastMatch.index + lastMatch[0].length;
                const textBetween = cleanSelector.substring(endIndex);
                if (!textBetween.includes('/*')) { 
                    commentText = lastCommentContent;
                    cleanSelector = cleanSelector.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                }
            } else {
                cleanSelector = cleanSelector.replace(/\/\*[\s\S]*?\*\//g, '').trim();
            }
            
            cleanSelector = cleanSelector.replace(/\s+/g, ' ');
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

        function parseAndBuildUI(allowDomRebuild = true) {
            if (!isExtensionActive) return;
            
            if (document.getElementById('custom-css')) document.getElementById('custom-css').disabled = true;

            replacementTasks = []; 
            uniqueTitles.clear();
            const activeVariables = new Set(); 

            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            let finalCssRules = '';
            let cssVariablesBlock = ':root {';
            
            let currentStructureSignature = "";
            let colorUIBlocks = [];
            let layoutUIBlocks = [];

            const colorFragment = document.createDocumentFragment();
            const layoutFragment = document.createDocumentFragment();

            const ruleRegex = /([^{]+)\{([^}]+)\}/g;
            const declarationRegex = /(?:^|;)\s*([a-zA-Z0-9-]+)\s*:\s*([^;\}]+)/g;

            let ruleMatch;
            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const rawSelector = ruleMatch[1]; 
                const selector = rawSelector.trim();
                const declarationsText = ruleMatch[2];
                const ruleBodyOffset = ruleMatch.index + ruleMatch[0].indexOf('{') + 1;
                
                let processedDeclarations = declarationsText;
                
                currentStructureSignature += selector.length + "|";

                let declMatch;
                declarationRegex.lastIndex = 0;

                while ((declMatch = declarationRegex.exec(declarationsText)) !== null) {
                    const fullMatch = declMatch[0];
                    const property = declMatch[1].trim();
                    const originalValue = declMatch[2]; 
                    const lowerProp = property.toLowerCase();

                    const isColor = colorProperties.includes(lowerProp);
                    const isLayout = !isColor && layoutProperties.includes(lowerProp);

                    if (!isColor && !isLayout) continue;

                    const colonIndex = fullMatch.indexOf(':');
                    const valueRelativeStart = fullMatch.indexOf(originalValue, colonIndex); 
                    const valueAbsoluteStart = ruleBodyOffset + declMatch.index + valueRelativeStart;
                    const valueAbsoluteEnd = valueAbsoluteStart + originalValue.length;

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

                                let initialColor;
                                if (isAutoSyncing && currentValuesMap.hasOwnProperty(variableName)) {
                                     initialColor = currentValuesMap[variableName];
                                } else {
                                     initialColor = (colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr);
                                     currentValuesMap[variableName] = initialColor;
                                }

                                cssVariablesBlock += `${variableName}: ${initialColor};`;

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
                                    // [核心修复] 添加 popup-position="fixed" 以解决被容器遮挡的问题
                                    colorPicker.setAttribute('popup-position', 'fixed');
                                    
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
                            
                            cssVariablesBlock += `${variableName}: ${initValue};`;
                            
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
                } 

                finalCssRules += `${selector} { ${processedDeclarations} !important }\n`;

            } 
            
            cssVariablesBlock += '}';

            liveStyleTag.textContent = cssVariablesBlock + '\n' + finalCssRules;
            
            cleanupUnusedVariables(activeVariables);

            if (allowDomRebuild) {
                const structureChanged = (currentStructureSignature !== lastStructureSignature);
                
                if (structureChanged && !isAutoSyncing) {
                    const buildFragment = (items, fragment) => {
                        let currentGroup = null;
                        let lastSelector = null;
                        
                        items.forEach(item => {
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
            debounceTimer = setTimeout(() => {
                if (isAutoSyncing && !forceRebuild) {
                    isAutoSyncing = false;
                    parseAndBuildUI(false); 
                } else {
                    parseAndBuildUI(true);  
                }
            }, 50); 
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

        parseAndBuildUI(true);
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v25 - Compact UI) loaded successfully.");
    });
})();
