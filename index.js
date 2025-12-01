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
        // [移除] layoutTitles
        
        let replacementTasks = []; 
        let currentValuesMap = {}; 
        let liveCssGenerators = []; 
        
        let lastStructureSignature = "";
        
        // 计时器
        let debounceTimer; 
        let syncTextareaTimer;
        let isAutoSyncing = false; 

        // [状态保存] 只需要保存扩展面板的滚动位置(可选)，不再需要Tab状态
        // 这里为了体验，我们保留扩展面板的滚动位置记忆
        /* 
           注：由于删除了Layout面板，Tab记忆已无意义，
           但为了刷新后不丢失颜色面板的浏览位置，我们保留 scrollTop 记忆逻辑（可选），
           或者根据你之前的要求“移除滚动记忆”，这里我保持清爽，暂不加复杂记忆。
        */

        // ============================================================
        //  PART 1: CSS 文本框增强工具栏 (搜索 + 保存 + 回顶)
        // ============================================================

        const cssToolbar = document.createElement('div');
        cssToolbar.className = 'css-extra-toolbar';

        // 1. CSS 搜索框
        const cssSearchWrapper = document.createElement('div');
        cssSearchWrapper.className = 'css-search-wrapper';

        const cssSearchInput = document.createElement('input');
        cssSearchInput.type = 'text'; // 使用 text 类型避免某些浏览器的默认清除按钮干扰样式
        cssSearchInput.className = 'css-search-input';
        cssSearchInput.placeholder = 'Search in CSS code...';

        const cssAutocompleteList = document.createElement('div');
        cssAutocompleteList.className = 'css-autocomplete-list';

        cssSearchWrapper.appendChild(cssSearchInput);
        cssSearchWrapper.appendChild(cssAutocompleteList);

        // 2. 保存按钮 (从扩展移来)
        const saveBtn = document.createElement('div');
        saveBtn.className = 'css-icon-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Save changes to Theme File (Disk)';
        saveBtn.addEventListener('click', commitToThemeFile);

        // 3. CSS 文本框回顶按钮
        const cssTopBtn = document.createElement('div');
        cssTopBtn.className = 'css-icon-btn fa-solid fa-arrow-up-from-bracket'; // 稍微不同的图标以示区别
        cssTopBtn.title = 'Scroll CSS to Top';
        cssTopBtn.addEventListener('click', () => {
            customCssTextarea.scrollTo({ top: 0, behavior: 'smooth' });
            customCssTextarea.setSelectionRange(0, 0); // 光标也回去
        });

        // 组装 CSS 工具栏
        cssToolbar.appendChild(cssSearchWrapper);
        cssToolbar.appendChild(saveBtn);
        cssToolbar.appendChild(cssTopBtn);

        // 插入到 Textarea 之前
        customCssTextarea.parentNode.insertBefore(cssToolbar, customCssTextarea);

        // --- CSS 搜索逻辑 ---
        function performCssSearch(text) {
            cssAutocompleteList.innerHTML = '';
            if (!text) {
                cssAutocompleteList.style.display = 'none';
                return;
            }

            const lines = customCssTextarea.value.split('\n');
            let matchCount = 0;
            const maxMatches = 15; // 限制显示数量

            for (let i = 0; i < lines.length; i++) {
                if (matchCount >= maxMatches) break;
                const lineContent = lines[i];
                if (lineContent.toLowerCase().includes(text.toLowerCase())) {
                    const item = document.createElement('div');
                    item.className = 'css-autocomplete-item';
                    
                    // 高亮匹配文字
                    const regex = new RegExp(`(${text})`, 'gi');
                    const highlightedContent = lineContent.replace(regex, '<span class="match">$1</span>');
                    
                    // 显示行号和内容
                    item.innerHTML = `<span class="line-num">${i + 1}</span> <span class="line-content">${highlightedContent}</span>`;
                    
                    item.addEventListener('click', () => {
                        jumpToLine(i);
                        cssAutocompleteList.style.display = 'none';
                    });
                    
                    cssAutocompleteList.appendChild(item);
                    matchCount++;
                }
            }

            if (matchCount > 0) {
                cssAutocompleteList.style.display = 'block';
            } else {
                cssAutocompleteList.style.display = 'none';
            }
        }

        function jumpToLine(lineIndex) {
            const lines = customCssTextarea.value.split('\n');
            let charIndex = 0;
            for (let i = 0; i < lineIndex; i++) {
                charIndex += lines[i].length + 1; // +1 for newline
            }
            
            customCssTextarea.focus();
            customCssTextarea.setSelectionRange(charIndex, charIndex);
            
            // 辅助计算滚动位置 (简单估算)
            const lineHeight = 20; // 假设行高，虽然不完美但通常有效
            const scrollPos = lineIndex * lineHeight;
            
            // 更好的方法：利用 blur/focus 迫使浏览器滚动，或者计算 scrollTop
            // 这里使用简单的计算居中
            const textAreaHeight = customCssTextarea.clientHeight;
            customCssTextarea.scrollTop = scrollPos - (textAreaHeight / 2);
        }

        cssSearchInput.addEventListener('input', (e) => performCssSearch(e.target.value));
        cssSearchInput.addEventListener('focus', (e) => {
            if (e.target.value) performCssSearch(e.target.value);
        });
        
        // 点击外部关闭 CSS 搜索下拉
        document.addEventListener('click', (e) => {
            if (!cssSearchWrapper.contains(e.target)) {
                cssAutocompleteList.style.display = 'none';
            }
        });


        // ============================================================
        //  PART 2: 扩展面板 (只剩颜色)
        // ============================================================

        // 扩展头部 (Simplified Header)
        const extHeader = document.createElement('div');
        extHeader.className = 'theme-editor-header'; 
        // 不再是 Tabs，而是一个单纯的工具栏

        const extTitle = document.createElement('div');
        extTitle.className = 'theme-editor-tab active'; // 保持样式一致，但不可点击
        extTitle.textContent = 'Colors Editor';
        extTitle.style.cursor = 'default';

        // 扩展搜索框
        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'theme-editor-search-wrapper';

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'theme-editor-search-input';
        searchInput.placeholder = 'Search colors...';
        
        const autocompleteList = document.createElement('div');
        autocompleteList.className = 'theme-editor-autocomplete-list';

        searchWrapper.appendChild(searchInput);
        searchWrapper.appendChild(autocompleteList);

        // 扩展按钮组 (回顶 + 开关)
        const actionGroup = document.createElement('div');
        actionGroup.className = 'theme-editor-header-actions';

        // 扩展面板回顶
        const extTopBtn = document.createElement('div');
        extTopBtn.className = 'theme-editor-icon-btn fa-solid fa-arrow-up';
        extTopBtn.title = 'Scroll Extension to Top';
        extTopBtn.addEventListener('click', () => {
            editorContainer.scrollTo({ top: 0, behavior: 'smooth' });
        });

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

        actionGroup.appendChild(extTopBtn);
        actionGroup.appendChild(toggleBtn);

        extHeader.appendChild(extTitle);
        extHeader.appendChild(searchWrapper);
        extHeader.appendChild(actionGroup);

        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';

        // 插入扩展面板 (在 CSS 文本框下方，或者保持原来的位置？)
        // 原逻辑是插在 CustomCSS-block 内部，文本框之后。
        // 为了布局美观，我们把扩展放在文本框下方。
        customCssBlock.appendChild(extHeader);
        customCssBlock.appendChild(editorContainer);

        const panelColors = document.createElement('div');
        panelColors.id = 'panel-colors';
        panelColors.className = 'theme-editor-content-panel active'; // 默认激活
        editorContainer.appendChild(panelColors);

        // [移除] panelLayout

        // --- 扩展搜索逻辑 ---
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            showAutocomplete(val);
        });
        searchInput.addEventListener('focus', (e) => {
            if (e.target.value) showAutocomplete(e.target.value);
        });
        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.value) showAutocomplete(e.target.value);
        });
        document.addEventListener('click', (e) => {
            if (!searchWrapper.contains(e.target)) {
                autocompleteList.style.display = 'none';
            }
        });

        function scrollToItem(text) {
            // [修改] 直接在唯一的面板里找
            const groups = panelColors.querySelectorAll('.theme-group');
            const targetText = text.toLowerCase().trim();
            
            for (let group of groups) {
                if (group.dataset.filterText === targetText) {
                    group.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            
            // [修改] 数据源只有 colorTitles
            const matches = Array.from(colorTitles).filter(t => t.toLowerCase().includes(text.toLowerCase()));
            
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
                    searchInput.value = match; 
                    scrollToItem(match); 
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

        // [移除] layoutProperties, unitlessProperties

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
            liveCssGenerators = []; 
            
            colorTitles.clear();
            // [移除] layoutTitles.clear();

            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            
            let currentStructureSignature = "";
            let colorUIBlocks = [];
            // [移除] layoutUIBlocks

            const colorFragment = document.createDocumentFragment();

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
                    // [移除] isLayout check

                    if (!isColor) continue;

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

                    // [移除] else if (isLayout) 块
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
                    // [移除] buildFragment(layoutUIBlocks...

                    panelColors.innerHTML = '';
                    panelColors.appendChild(colorFragment);
                    
                    lastStructureSignature = currentStructureSignature;

                } else if (!isAutoSyncing) {
                    const allPickers = document.querySelectorAll('toolcool-color-picker');
                    for (let picker of allPickers) {
                        const vName = picker.dataset.varName;
                        if (vName && currentValuesMap[vName] && picker.color !== currentValuesMap[vName]) {
                            picker.color = currentValuesMap[vName];
                        }
                    }
                    // [移除] Layout input update logic
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

        console.log("Theme Editor extension (v31 - Colors Only) loaded successfully.");
    });
})();
