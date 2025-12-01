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
        let replacementTasks = []; 
        let currentValuesMap = {}; 
        let liveCssGenerators = []; 
        let syncTextareaTimer;

        // ============================================================
        //  PART 1: CSS 文本框增强工具栏 (搜索 + 保存 + 回顶)
        // ============================================================

        const cssToolbar = document.createElement('div');
        cssToolbar.className = 'css-extra-toolbar';

        // 1. CSS 搜索框
        const cssSearchWrapper = document.createElement('div');
        cssSearchWrapper.className = 'css-search-wrapper';

        const cssSearchInput = document.createElement('input');
        cssSearchInput.type = 'text'; 
        cssSearchInput.className = 'css-search-input';
        cssSearchInput.placeholder = 'Search in CSS code...';

        const cssAutocompleteList = document.createElement('div');
        cssAutocompleteList.className = 'css-autocomplete-list';

        cssSearchWrapper.appendChild(cssSearchInput);
        cssSearchWrapper.appendChild(cssAutocompleteList);

        // 2. 保存按钮
        const saveBtn = document.createElement('div');
        saveBtn.className = 'css-icon-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Save changes to Theme File (Disk)';
        saveBtn.addEventListener('click', commitToThemeFile);

        // 3. CSS 文本框回顶按钮
        const cssTopBtn = document.createElement('div');
        cssTopBtn.className = 'css-icon-btn fa-solid fa-arrow-up-from-bracket'; 
        cssTopBtn.title = 'Scroll CSS to Top';
        cssTopBtn.addEventListener('click', () => {
            customCssTextarea.scrollTo({ top: 0, behavior: 'smooth' });
            customCssTextarea.setSelectionRange(0, 0); 
        });

        cssToolbar.appendChild(cssSearchWrapper);
        cssToolbar.appendChild(saveBtn);
        cssToolbar.appendChild(cssTopBtn);

        customCssTextarea.parentNode.insertBefore(cssToolbar, customCssTextarea);

        // --- CSS 搜索与跳转逻辑 ---
        function performCssSearch(text) {
            cssAutocompleteList.innerHTML = '';
            if (!text) {
                cssAutocompleteList.style.display = 'none';
                return;
            }

            const lines = customCssTextarea.value.split('\n');
            let matchCount = 0;
            const maxMatches = 15; 

            for (let i = 0; i < lines.length; i++) {
                if (matchCount >= maxMatches) break;
                const lineContent = lines[i];
                if (lineContent.toLowerCase().includes(text.toLowerCase())) {
                    const item = document.createElement('div');
                    item.className = 'css-autocomplete-item';
                    
                    const regex = new RegExp(`(${text})`, 'gi');
                    const highlightedContent = lineContent.replace(regex, '<span class="match">$1</span>');
                    
                    item.innerHTML = `<span class="line-num">${i + 1}</span> <span class="line-content">${highlightedContent}</span>`;
                    
                    item.addEventListener('click', () => {
                        jumpToLine(i);
                        cssAutocompleteList.style.display = 'none';
                    });
                    
                    cssAutocompleteList.appendChild(item);
                    matchCount++;
                }
            }

            cssAutocompleteList.style.display = matchCount > 0 ? 'block' : 'none';
        }

        // [核心修改] 精准定位跳转：让目标行位于可视区域的第一行
        function jumpToLine(lineIndex) {
            const lines = customCssTextarea.value.split('\n');
            
            // 1. 计算字符位置以设置光标
            let charIndex = 0;
            for (let i = 0; i < lineIndex; i++) {
                charIndex += lines[i].length + 1; // +1 是换行符
            }
            
            customCssTextarea.focus();
            customCssTextarea.setSelectionRange(charIndex, charIndex);
            
            // 2. 计算精准滚动位置
            // 获取 computed style 来计算真实的行高
            const style = window.getComputedStyle(customCssTextarea);
            let lineHeight = parseFloat(style.lineHeight);
            
            // 如果 line-height 是 "normal"，通常约为字体大小的 1.2 倍
            if (isNaN(lineHeight)) {
                const fontSize = parseFloat(style.fontSize);
                lineHeight = fontSize * 1.2;
            }

            // [修改] 直接设置为 target position，不减去高度的一半，这样目标行就在最顶端
            const scrollPos = lineIndex * lineHeight;
            
            // 加上一点点 padding (比如半行高)，稍微留点呼吸感，或者设为0完全顶格
            // 这里我们完全顶格，符合你的“框顶的第一行”要求
            customCssTextarea.scrollTop = scrollPos;
        }

        cssSearchInput.addEventListener('input', (e) => performCssSearch(e.target.value));
        cssSearchInput.addEventListener('focus', (e) => {
            if (e.target.value) performCssSearch(e.target.value);
        });
        
        document.addEventListener('click', (e) => {
            if (!cssSearchWrapper.contains(e.target)) {
                cssAutocompleteList.style.display = 'none';
            }
        });


        // ============================================================
        //  PART 2: 扩展面板 (Colors Editor)
        // ============================================================

        // 恢复原有的 Tabs 样式结构
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'theme-editor-tabs';

        const tabColors = document.createElement('div');
        tabColors.className = 'theme-editor-tab active'; // 永久激活
        tabColors.textContent = 'Colors Editor';
        tabColors.style.cursor = 'default'; // 看起来是Tab，但不需要点击切换

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

        // 扩展按钮组
        const actionGroup = document.createElement('div');
        actionGroup.className = 'theme-editor-header-actions';

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
            } else {
                toggleBtn.classList.remove('fa-toggle-on', 'active');
                toggleBtn.classList.add('fa-toggle-off');
                editorContainer.classList.add('theme-editor-hidden');
            }
        });

        actionGroup.appendChild(extTopBtn);
        actionGroup.appendChild(toggleBtn);

        tabsContainer.appendChild(tabColors);
        tabsContainer.appendChild(searchWrapper);
        tabsContainer.appendChild(actionGroup);

        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';

        // 插入扩展面板
        customCssBlock.appendChild(tabsContainer);
        customCssBlock.appendChild(editorContainer);

        const panelColors = document.createElement('div');
        panelColors.id = 'panel-colors';
        panelColors.className = 'theme-editor-content-panel active';
        editorContainer.appendChild(panelColors);

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
            // 注意：这里我们不再标记 isAutoSyncing，因为我们不需要防止循环更新
            // 因为我们已经移除了 textarea 的 'input' 监听器对 parseAndBuildUI 的调用
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
            }
        }

        function commitToThemeFile() {
            // 保存前先确保内容同步
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

        // [重要修改] 初始化解析只执行一次，生成 UI 和 Generator
        // 之后不再监听 textarea 的 input 事件来重建 UI
        function parseAndBuildUI() {
            if (!isExtensionActive) return;
            
            if (document.getElementById('custom-css')) document.getElementById('custom-css').disabled = true;

            replacementTasks = []; 
            liveCssGenerators = []; 
            colorTitles.clear();

            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            
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
                let hasColor = false; // 标记该规则是否有颜色，用于决定是否生成Generator

                let declMatch;
                declarationRegex.lastIndex = 0;

                while ((declMatch = declarationRegex.exec(declarationsText)) !== null) {
                    const fullMatch = declMatch[0];
                    const property = declMatch[1].trim();
                    const originalValue = declMatch[2]; 
                    const lowerProp = property.toLowerCase();

                    if (!colorProperties.includes(lowerProp)) continue;

                    const foundColors = [...originalValue.matchAll(colorValueRegex)];
                    if (foundColors.length === 0) continue;

                    hasColor = true;

                    // 计算绝对位置，用于 replacementTasks (Textarea update)
                    const colonIndex = fullMatch.indexOf(':');
                    const valueRelativeStart = fullMatch.indexOf(originalValue, colonIndex); 
                    const valueAbsoluteStart = ruleBodyOffset + declMatch.index + valueRelativeStart;
                    
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

                        // Task for File Update
                        replacementTasks.push({
                            start: valueAbsoluteStart + colorMatch.index,
                            end: valueAbsoluteStart + colorMatch.index + colorStr.length,
                            variableName: variableName
                        });

                        // 初始值
                        let initialColor = (colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr);
                        currentValuesMap[variableName] = initialColor;

                        // 模板替换
                        replacedValueInTemplate = replacedValueInTemplate.replace(colorStr, `%%%${variableName}%%%`);

                        // UI Create
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
                    });

                    ruleTemplate = ruleTemplate.replace(originalValue, replacedValueInTemplate);
                    
                    // 创建 UI Group 并加入 Fragment
                    const group = document.createElement('div');
                    group.className = 'theme-group';
                    group.dataset.filterText = labelInfo.text.toLowerCase().trim();

                    const mainLabel = document.createElement('div');
                    mainLabel.className = 'theme-editor-main-label';
                    mainLabel.innerHTML = labelInfo.html;
                    group.appendChild(mainLabel);
                    group.appendChild(propertyBlock);
                    
                    colorFragment.appendChild(group);
                } 

                // 如果这个规则里有颜色被替换了，生成 Generator 用于屏幕实时预览
                if (hasColor) {
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

            } // end while

            renderLiveCss(); // 初始应用

            // 渲染 DOM
            panelColors.innerHTML = '';
            panelColors.appendChild(colorFragment);
        }

        // 仅在脚本加载时执行一次
        parseAndBuildUI();

        console.log("Theme Editor extension (v32 - Colors Only & One-Way Sync) loaded successfully.");
    });
})();
