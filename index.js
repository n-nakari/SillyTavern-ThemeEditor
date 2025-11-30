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
        
        // 防抖计时器
        let debounceTimer;
        
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
        saveBtn.title = 'Save changes to Theme File';
        saveBtn.addEventListener('click', saveCurrentTheme);

        // [优化] 开关逻辑：使用 classList 操作，更安全
        const toggleBtn = document.createElement('div');
        toggleBtn.className = 'theme-editor-icon-btn fa-solid fa-toggle-on active';
        toggleBtn.title = 'Enable/Disable Theme Editor';
        toggleBtn.addEventListener('click', () => {
            isExtensionActive = !isExtensionActive;
            if (isExtensionActive) {
                toggleBtn.classList.remove('fa-toggle-off');
                toggleBtn.classList.add('fa-toggle-on', 'active');
                editorContainer.classList.remove('theme-editor-hidden');
                // 重新触发解析以确保数据最新
                debouncedParse();
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

        // 搜索功能
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

        let sillyTavernStyleTag = document.getElementById('custom-css');
        if (sillyTavernStyleTag) {
            sillyTavernStyleTag.disabled = true;
        } else {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.id === 'custom-css') {
                            node.disabled = true;
                            observer.disconnect();
                            return;
                        }
                    }
                }
            });
            observer.observe(document.head, { childList: true });
        }

        // --- 配置 ---
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

        function cleanupOldVariables() {
            const rootStyle = document.documentElement.style;
            const varsToRemove = [];
            for (let i = 0; i < rootStyle.length; i++) {
                const prop = rootStyle[i];
                if (prop.startsWith('--theme-editor-')) {
                    varsToRemove.push(prop);
                }
            }
            varsToRemove.forEach(v => rootStyle.removeProperty(v));
            replacementTasks = [];
            currentValuesMap = {};
            uniqueTitles.clear();
        }

        function updateLiveCssVariable(variableName, newValue) {
            document.documentElement.style.setProperty(variableName, newValue, 'important');
            currentValuesMap[variableName] = newValue;
        }

        function createFormattedSelectorLabel(rawSelector) {
            let commentText = "";
            let cleanSelector = rawSelector.trim();
            const commentMatch = rawSelector.match(/\/\*([\s\S]*?)\*\//);
            if (commentMatch) {
                commentText = commentMatch[1].trim();
                cleanSelector = rawSelector.replace(commentMatch[0], '').trim();
            }
            const titleText = commentText ? `${commentText} ${cleanSelector}` : cleanSelector;
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

        function saveCurrentTheme() {
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

            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeInputValueSetter.call(customCssTextarea, newCss);
            const inputEvent = new Event('input', { bubbles: true });
            customCssTextarea.dispatchEvent(inputEvent);
            if (window.$) $(customCssTextarea).trigger('input');

            setTimeout(() => {
                const stUpdateBtn = document.getElementById('ui-preset-update-button');
                if (stUpdateBtn) {
                    stUpdateBtn.click();
                    if (window.toastr) window.toastr.success('Theme file updated!');
                } else {
                    alert('Updated CSS box. Please save theme manually.');
                }
            }, 100);
        }

        function parseAndBuildUI() {
            if (!isExtensionActive) return;

            // [优化] 记录并恢复滚动位置
            const scrollTop = editorContainer.scrollTop;

            cleanupOldVariables();
            if (document.getElementById('custom-css')) document.getElementById('custom-css').disabled = true;
            
            // [优化] 使用 DocumentFragment 批量插入
            const colorFragment = document.createDocumentFragment();
            const layoutFragment = document.createDocumentFragment();
            
            panelColors.innerHTML = '';
            panelLayout.innerHTML = '';
            liveStyleTag.textContent = '';
            
            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            let finalCssRules = '';

            const ruleRegex = /([^{]+)\{([^}]+)\}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const rawSelector = ruleMatch[1].trim();
                const selector = rawSelector;
                const declarationsText = ruleMatch[2];
                const ruleBodyOffset = ruleMatch.index + ruleMatch[0].indexOf('{') + 1;
                
                let processedDeclarations = declarationsText;
                let colorUIBlocks = [];
                let layoutUIBlocks = [];

                const declarationRegex = /(?:^|;)\s*([a-zA-Z0-9-]+)\s*:\s*([^;\}]+)/g;
                let declMatch;

                while ((declMatch = declarationRegex.exec(declarationsText)) !== null) {
                    const fullMatch = declMatch[0];
                    const property = declMatch[1].trim();
                    const originalValue = declMatch[2]; 
                    const lowerProp = property.toLowerCase();

                    const colonIndex = fullMatch.indexOf(':');
                    const valueRelativeStart = fullMatch.indexOf(originalValue, colonIndex + 1);
                    const valueAbsoluteStart = ruleBodyOffset + declMatch.index + valueRelativeStart;
                    const valueAbsoluteEnd = valueAbsoluteStart + originalValue.length;

                    // --- 颜色 ---
                    if (colorProperties.includes(lowerProp)) {
                        const foundColors = [...originalValue.matchAll(colorValueRegex)];
                        
                        if (foundColors.length > 0) {
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

                                replacementTasks.push({
                                    start: valueAbsoluteStart + colorMatch.index,
                                    end: valueAbsoluteStart + colorMatch.index + colorStr.length,
                                    variableName: variableName
                                });

                                let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                updateLiveCssVariable(variableName, initialColor);

                                colorReplacements.push({
                                    str: colorStr,
                                    var: `var(${variableName})`,
                                    index: colorMatch.index,
                                    length: colorStr.length
                                });

                                if (foundColors.length > 1) {
                                    const subLabel = document.createElement('div');
                                    subLabel.className = 'theme-editor-sub-label';
                                    subLabel.textContent = `Color #${index + 1}`;
                                    propertyBlock.appendChild(subLabel);
                                }

                                const colorPicker = document.createElement('toolcool-color-picker');
                                setTimeout(() => { colorPicker.color = initialColor; }, 0);
                                $(colorPicker).on('change', (evt) => {
                                    updateLiveCssVariable(variableName, evt.detail.rgba);
                                });
                                propertyBlock.appendChild(colorPicker);
                            });

                            colorReplacements.sort((a, b) => b.index - a.index);
                            let liveValue = originalValue;
                            colorReplacements.forEach(rep => {
                                liveValue = liveValue.substring(0, rep.index) + rep.var + liveValue.substring(rep.index + rep.length);
                            });
                            processedDeclarations = processedDeclarations.replace(originalValue, liveValue);
                            colorUIBlocks.push(propertyBlock);
                        }
                    }

                    // --- 布局 ---
                    else if (layoutProperties.includes(lowerProp)) {
                        const cleanValue = originalValue.replace('!important', '').trim();
                        const values = cleanValue.split(/\s+/);
                        
                        if (values.length > 0) {
                            const variableName = `--theme-editor-layout-${uniqueId}`;
                            uniqueId++;

                            replacementTasks.push({
                                start: valueAbsoluteStart, 
                                end: valueAbsoluteEnd,
                                variableName: variableName
                            });

                            updateLiveCssVariable(variableName, cleanValue);
                            processedDeclarations = processedDeclarations.replace(originalValue, `var(${variableName})`);

                            const propertyBlock = document.createElement('div');
                            propertyBlock.className = 'theme-editor-property-block';
                            const propLabel = document.createElement('div');
                            propLabel.className = 'theme-editor-prop-label';
                            propLabel.textContent = property;
                            propertyBlock.appendChild(propLabel);

                            const inputsContainer = document.createElement('div');
                            inputsContainer.className = 'layout-inputs-container';

                            let currentValues = [...values];

                            values.forEach((val, index) => {
                                const input = document.createElement('input');
                                input.type = 'text';
                                input.className = 'layout-input';
                                input.value = val;
                                
                                input.addEventListener('input', (e) => {
                                    currentValues[index] = e.target.value;
                                    const formattedValues = currentValues.map(v => formatLayoutValue(lowerProp, v));
                                    updateLiveCssVariable(variableName, formattedValues.join(' '));
                                });

                                inputsContainer.appendChild(input);
                            });

                            propertyBlock.appendChild(inputsContainer);
                            layoutUIBlocks.push(propertyBlock);
                        }
                    }
                }

                finalCssRules += `${selector} { ${processedDeclarations} !important }\n`;

                // [优化] 使用 Fragment 插入 Group
                if (colorUIBlocks.length > 0) {
                    const group = document.createElement('div');
                    group.className = 'theme-group';
                    const titleHtml = createFormattedSelectorLabel(rawSelector);
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = titleHtml;
                    group.dataset.filterText = tempDiv.textContent.toLowerCase().trim();

                    const mainLabel = document.createElement('div');
                    mainLabel.className = 'theme-editor-main-label';
                    mainLabel.innerHTML = titleHtml;
                    
                    group.appendChild(mainLabel);
                    colorUIBlocks.forEach(block => group.appendChild(block));
                    colorFragment.appendChild(group);
                }

                if (layoutUIBlocks.length > 0) {
                    const group = document.createElement('div');
                    group.className = 'theme-group';
                    const titleHtml = createFormattedSelectorLabel(rawSelector);
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = titleHtml;
                    group.dataset.filterText = tempDiv.textContent.toLowerCase().trim();

                    const mainLabel = document.createElement('div');
                    mainLabel.className = 'theme-editor-main-label';
                    mainLabel.innerHTML = titleHtml;

                    group.appendChild(mainLabel);
                    layoutUIBlocks.forEach(block => group.appendChild(block));
                    layoutFragment.appendChild(group);
                }
            }
            
            liveStyleTag.textContent = finalCssRules;
            
            // 一次性插入 DOM
            panelColors.appendChild(colorFragment);
            panelLayout.appendChild(layoutFragment);

            // 恢复状态
            const currentSearch = document.querySelector('.theme-editor-search-input')?.value.toLowerCase();
            if (currentSearch) filterPanels(currentSearch);
            editorContainer.scrollTop = scrollTop;
        }

        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
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

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v19 - Performance & Layout Fixed) loaded successfully.");
    });
})();
