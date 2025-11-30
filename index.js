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
        
        let colorTitles = new Set();
        let layoutTitles = new Set();
        
        let replacementTasks = []; 
        let currentValuesMap = {}; 
        let liveCssGenerators = []; 
        
        let lastStructureSignature = "";
        
        // 计时器
        let debounceTimer; 
        let syncTextareaTimer;
        let isAutoSyncing = false; 

        // [新] 状态保存相关
        const STATE_KEY = 'theme_editor_state';
        let savedState = JSON.parse(localStorage.getItem(STATE_KEY) || '{"tab": "panel-colors", "scrollTop": 0}');

        // 保存状态辅助函数
        function saveState() {
            localStorage.setItem(STATE_KEY, JSON.stringify(savedState));
        }

        // --- UI 初始化 ---
        
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'theme-editor-tabs';
        
        const tabColors = document.createElement('div');
        tabColors.className = 'theme-editor-tab';
        tabColors.textContent = 'Colors';
        tabColors.dataset.target = 'panel-colors';

        const tabLayout = document.createElement('div');
        tabLayout.className = 'theme-editor-tab';
        tabLayout.textContent = 'Layout';
        tabLayout.dataset.target = 'panel-layout';

        // 根据保存的状态设置初始 Tab
        if (savedState.tab === 'panel-layout') {
            tabLayout.classList.add('active');
        } else {
            tabColors.classList.add('active'); // 默认
        }

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

        tabsContainer.appendChild(tabColors);
        tabsContainer.appendChild(tabLayout);
        tabsContainer.appendChild(searchWrapper);
        tabsContainer.appendChild(actionGroup);

        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';

        customCssBlock.parentNode.insertBefore(tabsContainer, customCssBlock.nextSibling);
        tabsContainer.parentNode.insertBefore(editorContainer, tabsContainer.nextSibling);

        const panelColors = document.createElement('div');
        panelColors.id = 'panel-colors';
        panelColors.className = 'theme-editor-content-panel';
        if (savedState.tab !== 'panel-layout') panelColors.classList.add('active');
        editorContainer.appendChild(panelColors);

        const panelLayout = document.createElement('div');
        panelLayout.id = 'panel-layout';
        panelLayout.className = 'theme-editor-content-panel';
        if (savedState.tab === 'panel-layout') panelLayout.classList.add('active');
        editorContainer.appendChild(panelLayout);

        // Tab 切换逻辑
        [tabColors, tabLayout].forEach(tab => {
            tab.addEventListener('click', () => {
                [tabColors, tabLayout].forEach(t => t.classList.remove('active'));
                [panelColors, panelLayout].forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                const targetId = tab.dataset.target;
                document.getElementById(targetId).classList.add('active');
                
                // [保存状态] 记录当前 Tab
                savedState.tab = targetId;
                saveState();

                // 切换 Tab 时刷新搜索建议
                const currentSearch = searchInput.value;
                if (currentSearch) {
                    showAutocomplete(currentSearch);
                } else {
                     autocompleteList.style.display = 'none';
                }
            });
        });

        // [保存状态] 监听滚动事件记录位置 (防抖)
        let scrollTimeout;
        editorContainer.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                savedState.scrollTop = editorContainer.scrollTop;
                saveState();
            }, 200);
        });

        // 搜索逻辑
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            // [修改] 不再调用 filterPanels，只显示建议
            showAutocomplete(val);
        });

        searchInput.addEventListener('focus', (e) => {
            if (e.target.value) showAutocomplete(e.target.value);
        });

        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.value) {
                showAutocomplete(e.target.value);
            }
        });

        document.addEventListener('click', (e) => {
            if (!searchWrapper.contains(e.target)) {
                autocompleteList.style.display = 'none';
            }
        });

        // [新功能] 滚动到指定条目
        function scrollToItem(text) {
            const activePanel = document.querySelector('.theme-editor-content-panel.active');
            if (!activePanel) return;

            // 移除旧的高亮
            const oldFlashes = activePanel.querySelectorAll('.theme-flash');
            oldFlashes.forEach(el => el.classList.remove('theme-flash'));

            const groups = activePanel.querySelectorAll('.theme-group');
            // 精确匹配 dataset.filterText (它是我们在 createFormattedSelectorLabelInfo 里生成的 labelText.toLowerCase())
            const targetText = text.toLowerCase().trim();
            
            for (let group of groups) {
                if (group.dataset.filterText === targetText) {
                    // 滚动到视图中心
                    group.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // 添加高亮动画
                    group.classList.add('theme-flash');
                    return;
                }
            }
        }

        function showAutocomplete(text) {
            autocompleteList.innerHTML = '';
            if (!text) {
                autocompleteList.style.display = 'none';
                return;
            }
            const isColorTab = tabColors.classList.contains('active');
            const sourceSet = isColorTab ? colorTitles : layoutTitles;

            const matches = Array.from(sourceSet).filter(t => t.toLowerCase().includes(text.toLowerCase()));
            
            if (matches.length === 0) {
                autocompleteList.style.display = 'none';
                return;
            }
            
            matches.slice(0, 10).forEach(match => {
                const item = document.createElement('div');
                item.className = 'theme-editor-autocomplete-item';
                const regex = new RegExp(`(${text})`, 'gi');
                item.innerHTML = match.replace(regex, '<span class="match">$1</span>');
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    searchInput.value = match; // 填入全名
                    scrollToItem(match); // [修改] 跳转而不是过滤
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

        function updateLiveCss(variableName, newValue) {
            currentValuesMap[variableName] = newValue;
            renderLiveCss();
            clearTimeout(syncTextareaTimer);
            syncTextareaTimer = setTimeout(writeChangesToTextarea, 800);
        }

        function renderLiveCss() {
            const css = liveCssGenerators.map(generator => generator()).join('\n');
            liveStyleTag.textContent = css;
        }

        function createFormattedSelectorLabelInfo(rawSelector) {
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
            
            let html = "";
            if (commentText) {
                html = `<div class="label-line-1"><span class="label-highlight">${commentText}</span>/${cleanSelector}</div>`;
            } else {
                html = `<div class="label-line-1">${cleanSelector}</div>`;
            }
            return { html: html, text: titleText };
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

            // 如果要重绘DOM，先记录当前的滚动位置
            // 注意：如果是初始加载，我们希望使用 savedState.scrollTop
            // 如果是运行中的重绘（比如打字），我们希望保持当前 scrollTop
            // 这里我们优先取 DOM 的当前值（如果>0），否则取存档值
            let targetScrollTop = 0;
            if (allowDomRebuild) {
                if (editorContainer.scrollTop > 0) {
                    targetScrollTop = editorContainer.scrollTop;
                } else {
                    targetScrollTop = savedState.scrollTop || 0;
                }
            }

            replacementTasks = []; 
            liveCssGenerators = []; 
            
            colorTitles.clear();
            layoutTitles.clear();

            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            
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
                
                let ruleTemplate = declarationsText;
                
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
                            
                            const labelInfo = createFormattedSelectorLabelInfo(rawSelector);
                            colorTitles.add(labelInfo.text);

                            const propertyBlock = document.createElement('div');
                            propertyBlock.className = 'theme-editor-property-block';
                            const propLabel = document.createElement('div');
                            propLabel.className = 'theme-editor-prop-label';
                            propLabel.textContent = property;
                            propertyBlock.appendChild(propLabel);

                            let replacedValueInTemplate = originalValue;

                            foundColors.forEach((colorMatch, index) => {
                                const colorStr = colorMatch[0];
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;

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

                                replacedValueInTemplate = replacedValueInTemplate.replace(colorStr, `%%%${variableName}%%%`);

                                if (allowDomRebuild) {
                                    if (foundColors.length > 1) {
                                        const subLabel = document.createElement('div');
                                        subLabel.className = 'theme-editor-sub-label';
                                        subLabel.textContent = `Color #${index + 1}`;
                                        propertyBlock.appendChild(subLabel);
                                    }

                                    const colorPicker = document.createElement('toolcool-color-picker');
                                    colorPicker.dataset.varName = variableName;
                                    colorPicker.setAttribute('popup-position', 'fixed');
                                    
                                    setTimeout(() => { colorPicker.color = initialColor; }, 0);
                                    
                                    $(colorPicker).on('change', (evt) => {
                                        updateLiveCss(variableName, evt.detail.rgba);
                                    });
                                    propertyBlock.appendChild(colorPicker);
                                }
                            });

                            ruleTemplate = ruleTemplate.replace(originalValue, replacedValueInTemplate);
                            
                            if (allowDomRebuild) colorUIBlocks.push({block: propertyBlock, rawSelector: rawSelector, labelHtml: labelInfo.html, labelText: labelInfo.text});
                        }
                    }

                    else if (isLayout) {
                        const cleanValue = originalValue.replace('!important', '').trim();
                        const values = splitCSSValue(cleanValue);
                        
                        if (values.length > 0) {
                            currentStructureSignature += `L:${property}:${values.length}|`;
                            
                            const labelInfo = createFormattedSelectorLabelInfo(rawSelector);
                            layoutTitles.add(labelInfo.text);

                            const variableName = `--theme-editor-layout-${uniqueId}`;
                            uniqueId++;

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
                            
                            ruleTemplate = ruleTemplate.replace(originalValue, `%%%${variableName}%%%`);

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
                                        updateLiveCss(variableName, formattedValues.join(' '));
                                    });

                                    inputsContainer.appendChild(input);
                                });

                                propertyBlock.appendChild(inputsContainer);
                                layoutUIBlocks.push({block: propertyBlock, rawSelector: rawSelector, labelHtml: labelInfo.html, labelText: labelInfo.text});
                            }
                        }
                    }
                } 

                const generatorClosure = ((sel, tpl) => {
                    return () => {
                        const filledDeclarations = tpl.replace(/%%%(--[\w-]+)%%%/g, (_, vName) => {
                            return currentValuesMap[vName] || '';
                        });
                        return `${sel} { ${filledDeclarations} !important }`;
                    };
                })(selector, ruleTemplate);

                liveCssGenerators.push(generatorClosure);

            } 
            
            renderLiveCss();
            
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
                                currentGroup.dataset.filterText = item.labelText.toLowerCase().trim();

                                const mainLabel = document.createElement('div');
                                mainLabel.className = 'theme-editor-main-label';
                                mainLabel.innerHTML = item.labelHtml;
                                currentGroup.appendChild(mainLabel);
                                
                                fragment.appendChild(currentGroup);
                                lastSelector = item.rawSelector;
                            }
                            currentGroup.appendChild(item.block);
                        });
                    };

                    buildFragment(colorUIBlocks, colorFragment);
                    buildFragment(layoutUIBlocks, layoutFragment);

                    panelColors.innerHTML = '';
                    panelLayout.innerHTML = '';
                    panelColors.appendChild(colorFragment);
                    panelLayout.appendChild(layoutFragment);
                    
                    // [状态恢复] 恢复滚动位置
                    // 使用 setTimeout 确保 DOM 渲染后再滚动
                    setTimeout(() => {
                        editorContainer.scrollTop = targetScrollTop;
                    }, 50);
                    
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

        console.log("Theme Editor extension (v29 - Jump & Persist) loaded successfully.");
    });
})();
