(function () {
    $(document).ready(function () {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        // 主容器
        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';
        
        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.style.marginTop = '15px';

        customCssBlock.parentNode.insertBefore(title, customCssBlock.nextSibling);
        title.parentNode.insertBefore(editorContainer, title.nextSibling);

        // --- 顶部栏 (Tabs + Save Button) ---
        const headerRow = document.createElement('div');
        headerRow.className = 'theme-editor-header-row';

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

        tabsContainer.appendChild(tabColors);
        tabsContainer.appendChild(tabLayout);

        // [新增] 保存按钮
        const saveBtn = document.createElement('div');
        saveBtn.className = 'theme-editor-save-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Save changes to current theme';
        saveBtn.addEventListener('click', () => {
            saveCurrentTheme();
        });

        headerRow.appendChild(tabsContainer);
        headerRow.appendChild(saveBtn);
        editorContainer.appendChild(headerRow);

        // 内容面板
        const panelColors = document.createElement('div');
        panelColors.id = 'panel-colors';
        panelColors.className = 'theme-editor-content-panel active';
        editorContainer.appendChild(panelColors);

        const panelLayout = document.createElement('div');
        panelLayout.id = 'panel-layout';
        panelLayout.className = 'theme-editor-content-panel';
        editorContainer.appendChild(panelLayout);

        // Tab 切换逻辑
        [tabColors, tabLayout].forEach(tab => {
            tab.addEventListener('click', () => {
                [tabColors, tabLayout].forEach(t => t.classList.remove('active'));
                [panelColors, panelLayout].forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(tab.dataset.target).classList.add('active');
            });
        });

        // 样式注入标签
        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }
        
        // 禁用原生CSS
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
            'top', 'bottom', 'left', 'right', 'gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'font-size', 'line-height', 'border-radius', 'border-width'
        ];

        // [核心新增]：用于存储当前所有变量的最新值，Key是变量名，Value是当前值
        let currentValuesMap = {};

        function updateLiveCssVariable(variableName, newColor) {
            document.documentElement.style.setProperty(variableName, newColor);
            // 同时更新映射表
            currentValuesMap[variableName] = newColor;
        }

        // 格式化标题
        function createFormattedSelectorLabel(rawSelector) {
            let commentText = "";
            let cleanSelector = rawSelector.trim();
            const commentMatch = rawSelector.match(/\/\*([\s\S]*?)\*\//);
            if (commentMatch) {
                commentText = commentMatch[1].trim();
                cleanSelector = rawSelector.replace(commentMatch[0], '').trim();
            }
            if (commentText) {
                return `<div class="label-line-1"><span class="label-highlight">${commentText}</span>/${cleanSelector}</div>`;
            } else {
                return `<div class="label-line-1">${cleanSelector}</div>`;
            }
        }

        // --- [新增] 保存功能 ---
        function saveCurrentTheme() {
            // 我们需要重新扫描一遍原始CSS，然后把原来的值替换成 currentValuesMap 里的新值
            const originalCss = customCssTextarea.value;
            let newCss = ""; // 构建新的CSS字符串
            let lastIndex = 0;
            let uniqueId = 0; // 必须和 parseAndBuildUI 的顺序完全一致

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            // 这里的逻辑其实是对 parseAndBuildUI 的简化复刻，只为了按顺序找回变量ID
            while ((ruleMatch = ruleRegex.exec(originalCss)) !== null) {
                // 将规则前的部分原样追加
                newCss += originalCss.slice(lastIndex, ruleMatch.index);
                
                const fullMatch = ruleMatch[0];
                const selector = ruleMatch[1];
                const declarationsText = ruleMatch[2];
                
                // 我们需要重建声明块
                let newDeclarationsText = declarationsText;

                // 拆分声明，注意这里要小心，不能简单split，因为括号里可能有分号（虽然CSS很少见）
                // 简单起见，假设分号是分隔符
                const allDeclarations = declarationsText.split(';'); 
                let reconstructedDeclarations = [];

                allDeclarations.forEach(declarationString => {
                    if(!declarationString.trim()) return;

                    const parts = declarationString.split(':');
                    if (parts.length < 2) {
                        reconstructedDeclarations.push(declarationString);
                        return;
                    }

                    const property = parts[0].trim();
                    const originalValue = parts.slice(1).join(':'); // 保留值的前后空格以便尽量还原
                    const lowerProp = property.toLowerCase();
                    let processedValue = originalValue;

                    // 1. 颜色处理
                    if (colorProperties.includes(lowerProp)) {
                        const foundColors = [...originalValue.matchAll(colorValueRegex)].map(m => m[0]);
                        if (foundColors.length > 0) {
                            foundColors.forEach(colorStr => {
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;
                                
                                // 获取该变量当前存储的新值，如果没有则用原值
                                const newValue = currentValuesMap[variableName] || colorStr;
                                // 这里的替换要小心，只替换第一个匹配到的，防止替换错了
                                processedValue = processedValue.replace(colorStr, newValue);
                            });
                        }
                    }

                    // 2. 布局处理
                    else if (layoutProperties.includes(lowerProp)) {
                        const cleanValue = originalValue.replace('!important', '').trim();
                        const values = cleanValue.split(/\s+/);
                        if (values.length > 0) {
                            const variableName = `--theme-editor-layout-${uniqueId}`;
                            uniqueId++;
                            
                            const newValue = currentValuesMap[variableName];
                            if(newValue) {
                                // 如果有新值，直接用新值替换整个旧值部分（保留!important如果原来有的话，或者根据逻辑这里其实是完全重写了值）
                                // 简单点：直接用新值覆盖旧的数值部分
                                processedValue = originalValue.replace(cleanValue, newValue);
                            }
                        }
                    }

                    reconstructedDeclarations.push(`${parts[0]}:${processedValue}`);
                });

                // 重组规则
                newCss += `${selector}{${reconstructedDeclarations.join(';')}}`;
                lastIndex = ruleRegex.lastIndex;
            }

            // 追加剩余部分
            newCss += originalCss.slice(lastIndex);

            // 回写到 Textarea
            customCssTextarea.value = newCss;
            
            // 触发 input 事件，让 SillyTavern 保存
            const event = new Event('input', { bubbles: true });
            customCssTextarea.dispatchEvent(event);

            // 提示用户
            // 这里简单用 console，实际环境可以用 toastr.success 如果SillyTavern暴露了的话
            console.log("Theme saved!");
            alert("Theme saved to 'Custom CSS'!"); // 简单提示
        }


        // 核心解析函数
        function parseAndBuildUI() {
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            panelColors.innerHTML = '';
            panelLayout.innerHTML = '';
            
            // 每次解析重置 ID 和 Map，重新收集
            let uniqueId = 0;
            currentValuesMap = {}; 
            let finalCssRules = '';

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const rawSelector = ruleMatch[1];
                const selector = rawSelector.trim();
                const declarationsText = ruleMatch[2];
                let processedDeclarations = declarationsText;

                let colorUIBlocks = [];
                let layoutUIBlocks = [];

                const allDeclarations = declarationsText.split(';').filter(d => d.trim() !== '');

                allDeclarations.forEach(declarationString => {
                    const parts = declarationString.split(':');
                    if (parts.length < 2) return;

                    const property = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    const lowerProp = property.toLowerCase();

                    // --- 处理颜色 ---
                    if (colorProperties.includes(lowerProp)) {
                        let tempValue = value;
                        const foundColors = [...value.matchAll(colorValueRegex)].map(m => m[0]);
                        
                        if (foundColors.length > 0) {
                            let replacementMade = false;
                            
                            const propertyBlock = document.createElement('div');
                            propertyBlock.className = 'theme-editor-property-block';

                            const propLabel = document.createElement('div');
                            propLabel.className = 'theme-editor-prop-label';
                            propLabel.textContent = property;
                            propertyBlock.appendChild(propLabel);

                            foundColors.forEach((colorStr, index) => {
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;
                                
                                if (tempValue.includes(colorStr)) {
                                    tempValue = tempValue.replace(colorStr, `var(${variableName})`);
                                    replacementMade = true;

                                    let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                    updateLiveCssVariable(variableName, initialColor);

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
                                }
                            });

                            if (replacementMade) {
                                processedDeclarations = processedDeclarations.replace(declarationString, ` ${property}: ${tempValue} `);
                                colorUIBlocks.push(propertyBlock);
                            }
                        }
                    }

                    // --- 处理布局 ---
                    if (layoutProperties.includes(lowerProp)) {
                        // 简单的清理逻辑
                        const cleanValue = value.replace('!important', '').trim();
                        // 简单的空格分割
                        const values = cleanValue.split(/\s+/);
                        
                        if (values.length > 0) {
                            const variableName = `--theme-editor-layout-${uniqueId}`;
                            uniqueId++;

                            updateLiveCssVariable(variableName, cleanValue);
                            processedDeclarations = processedDeclarations.replace(declarationString, ` ${property}: var(${variableName}) `);

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
                                    updateLiveCssVariable(variableName, currentValues.join(' '));
                                });

                                inputsContainer.appendChild(input);
                            });

                            propertyBlock.appendChild(inputsContainer);
                            layoutUIBlocks.push(propertyBlock);
                        }
                    }
                });
                
                finalCssRules += `${selector} { ${processedDeclarations} !important }\n`;

                if (colorUIBlocks.length > 0) {
                    const mainLabel = document.createElement('div');
                    mainLabel.className = 'theme-editor-main-label';
                    mainLabel.innerHTML = createFormattedSelectorLabel(rawSelector);
                    panelColors.appendChild(mainLabel);
                    colorUIBlocks.forEach(block => panelColors.appendChild(block));
                }

                if (layoutUIBlocks.length > 0) {
                    const mainLabel = document.createElement('div');
                    mainLabel.className = 'theme-editor-main-label';
                    mainLabel.innerHTML = createFormattedSelectorLabel(rawSelector);
                    panelLayout.appendChild(mainLabel);
                    layoutUIBlocks.forEach(block => panelLayout.appendChild(block));
                }
            }
            
            liveStyleTag.textContent = finalCssRules;
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v12 - Style Isolation & Saving) loaded successfully.");
    });
})();
