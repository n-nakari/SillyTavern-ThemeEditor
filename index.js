(function () {
    $(document).ready(function () {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        // --- 初始化 UI 结构 ---
        
        // 标题栏容器
        const headerBar = document.createElement('div');
        headerBar.className = 'theme-editor-header-bar';

        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.className = 'theme-editor-title';

        // 保存按钮
        const saveBtn = document.createElement('div');
        saveBtn.className = 'theme-editor-save-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Save changes to current theme (Preserves formatting)';
        saveBtn.addEventListener('click', () => {
            saveCurrentTheme();
        });

        headerBar.appendChild(title);
        headerBar.appendChild(saveBtn);

        // 主容器
        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';

        // 插入到页面
        customCssBlock.parentNode.insertBefore(headerBar, customCssBlock.nextSibling);
        headerBar.parentNode.insertBefore(editorContainer, headerBar.nextSibling);

        // Tabs
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
        editorContainer.appendChild(tabsContainer);

        // Panels
        const panelColors = document.createElement('div');
        panelColors.id = 'panel-colors';
        panelColors.className = 'theme-editor-content-panel active';
        editorContainer.appendChild(panelColors);

        const panelLayout = document.createElement('div');
        panelLayout.id = 'panel-layout';
        panelLayout.className = 'theme-editor-content-panel';
        editorContainer.appendChild(panelLayout);

        // Tab Switching
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
        
        // 禁用 SillyTavern 原生样式
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

        // --- 配置数据 ---
        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        const layoutProperties = [
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'top', 'bottom', 'left', 'right', 'gap', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'font-size', 'line-height', 'border-radius', 'border-width', 'font-weight', 'z-index', 'opacity'
        ];

        // 存储“替换任务”： { start: index, end: index, variableName: string, currentValue: string }
        // 使用 Map 存储当前值，Key 为 variableName
        let replacementTasks = [];
        let currentValuesMap = {}; 

        // 更新变量
        function updateLiveCssVariable(variableName, newValue) {
            document.documentElement.style.setProperty(variableName, newValue);
            currentValuesMap[variableName] = newValue;
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

        // [核心改进]：非破坏性保存
        function saveCurrentTheme() {
            const originalCss = customCssTextarea.value;
            
            // 1. 过滤出有修改过的任务
            // 如果 currentValuesMap 里没有值，或者值没变（虽然很难判断，但我们只替换有记录的），就替换
            // 关键是 replacementTasks 记录了 原始CSS中的位置。
            // 我们必须按照位置 从后往前 替换，这样前面的索引才不会乱。
            
            const tasks = replacementTasks.sort((a, b) => b.start - a.start);
            
            let newCss = originalCss;

            tasks.forEach(task => {
                const newValue = currentValuesMap[task.variableName];
                // 只有当内存中有新值时才替换
                if (newValue !== undefined && newValue !== null) {
                    const before = newCss.slice(0, task.start);
                    const after = newCss.slice(task.end);
                    newCss = before + newValue + after;
                }
            });

            // 回写并触发保存
            customCssTextarea.value = newCss;
            const event = new Event('input', { bubbles: true });
            customCssTextarea.dispatchEvent(event);

            // 稍微延迟后重新解析，以确保 UI 与新保存的 CSS 同步（主要是重置 task 索引）
            setTimeout(() => {
                parseAndBuildUI();
                // 简单提示
                alert("Theme saved successfully!"); 
            }, 100);
        }

        function parseAndBuildUI() {
            // 1. 清理旧状态
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;
            panelColors.innerHTML = '';
            panelLayout.innerHTML = '';
            liveStyleTag.textContent = '';
            
            // 清除旧的 CSS 变量 (通过移除 style 属性里的相关变量，或者直接重置)
            // 简单暴力的做法：遍历 currentValuesMap 里的 key 并移除
            Object.keys(currentValuesMap).forEach(key => {
                document.documentElement.style.removeProperty(key);
            });

            replacementTasks = []; // 重置替换任务
            currentValuesMap = {}; // 重置当前值
            
            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            let finalCssRules = '';

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const rawSelector = ruleMatch[1];
                const selector = rawSelector.trim();
                const declarationsText = ruleMatch[2];
                // 规则块在原始字符串中的起始位置（大括号后的第一个字符）
                const ruleBodyStartIndex = ruleMatch.index + ruleMatch[0].indexOf('{') + 1;
                
                let processedDeclarations = declarationsText; // 用于生成实时 CSS

                let colorUIBlocks = [];
                let layoutUIBlocks = [];

                // 我们需要手动解析声明，并记录它们在 ruleBody 中的相对位置，以便计算绝对位置
                // 正则匹配属性:值
                const declarationRegex = /([a-zA-Z-]+)\s*:\s*([^;]+)/g;
                let declMatch;

                while ((declMatch = declarationRegex.exec(declarationsText)) !== null) {
                    const property = declMatch[1].trim();
                    const originalValue = declMatch[2]; // 包含可能的空格，但不含分号
                    const valueTrimmed = originalValue.trim();
                    const lowerProp = property.toLowerCase();
                    
                    // 值的绝对起始位置 = 规则体起始 + 匹配项起始 + 冒号后的偏移
                    // 这一步比较繁琐，因为 : 前后可能有空格。
                    // 我们可以直接用 declMatch.index 定位到属性名，然后找冒号
                    const propIndex = declMatch.index;
                    const colonRelativeIndex = declarationsText.indexOf(':', propIndex);
                    // 值开始的位置（冒号后第一个非空字符? 不，我们替换的是整个 capture group 2）
                    // declMatch[2] 是正则捕获的，它从冒号后开始，到分号前（或块结束）
                    // 它的在 declarationsText 中的索引需要精确定位
                    
                    // 为了简单且准确，我们直接利用正则匹配到的子串位置
                    // declMatch[0] 是 "prop: value"
                    // declMatch[1] 是 "prop"
                    // declMatch[2] 是 " value" (可能包含前导空格)
                    
                    // 值的相对起始位置 = 匹配项起始 + 完整匹配长度 - 值长度
                    const valueRelativeStart = declMatch.index + declMatch[0].lastIndexOf(originalValue);
                    const valueAbsoluteStart = ruleBodyStartIndex + valueRelativeStart;
                    const valueAbsoluteEnd = valueAbsoluteStart + originalValue.length;

                    // --- 颜色处理 ---
                    if (colorProperties.includes(lowerProp)) {
                        let tempValueForLiveCss = originalValue; // 用于实时预览的字符串
                        const foundColors = [...originalValue.matchAll(colorValueRegex)]; // 获取所有匹配对象以便定位
                        
                        if (foundColors.length > 0) {
                            let replacementMade = false;
                            
                            const propertyBlock = document.createElement('div');
                            propertyBlock.className = 'theme-editor-property-block';
                            const propLabel = document.createElement('div');
                            propLabel.className = 'theme-editor-prop-label';
                            propLabel.textContent = property;
                            propertyBlock.appendChild(propLabel);

                            // 从后往前处理颜色，以免影响前面颜色的索引（虽然这里是替换变量名，不影响 task）
                            // 但对于生成 live css，我们需要替换。
                            
                            // 这里我们只需为每个颜色生成 UI 和 Task
                            // 注意：如果一个属性里有多个颜色，我们需要计算每个颜色相对于 originalValue 的位置
                            foundColors.forEach((colorMatch, index) => {
                                const colorStr = colorMatch[0];
                                const colorIndexInValue = colorMatch.index; // 相对于 originalValue 的位置
                                
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;

                                // 记录替换任务
                                replacementTasks.push({
                                    start: valueAbsoluteStart + colorIndexInValue,
                                    end: valueAbsoluteStart + colorIndexInValue + colorStr.length,
                                    variableName: variableName,
                                    // 初始值不存，等 update 时存
                                });

                                // 初始化 CSS 变量
                                let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                updateLiveCssVariable(variableName, initialColor);

                                // 替换 live css 字符串中的颜色为变量
                                // 这里为了避免替换错（比如有两个 #fff），我们其实应该按位置替换。
                                // 但为了简化 Live CSS 生成，我们假设替换所有匹配项是安全的，或者只替换当前这个。
                                // 简单的 replace 可能会替换错。更严谨的做法是重建字符串。
                                // 鉴于 Live CSS 只是预览，我们简单处理：把整个属性值里的颜色都换成变量。
                                // *修正*：必须精确。
                                
                                // UI 生成
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

                            colorUIBlocks.push(propertyBlock);
                            
                            // 生成 Live CSS: 把该属性的所有颜色换成变量
                            let valueWithVars = originalValue;
                            // 倒序替换以保持索引正确
                            for (let i = foundColors.length - 1; i >= 0; i--) {
                                const cm = foundColors[i];
                                // 这里的 variableName 需要重新计算一下... 或者我们在上面循环时存下来
                                // 为了简单，我们重新生成一遍 ID 逻辑是不行的。
                                // 修正逻辑：我们在上面循环时，应该构建好 valueWithVars
                            }
                            
                            // 重新遍历一遍来构建 Live CSS 字符串 (比较笨但安全)
                            let offset = 0;
                            let newValueBuilder = "";
                            let vIdStart = uniqueId - foundColors.length; // 回溯 ID
                            
                            let lastEnd = 0;
                            foundColors.forEach(cm => {
                                const vName = `--theme-editor-color-${vIdStart}`;
                                vIdStart++;
                                newValueBuilder += originalValue.slice(lastEnd, cm.index);
                                newValueBuilder += `var(${vName})`;
                                lastEnd = cm.index + cm[0].length;
                            });
                            newValueBuilder += originalValue.slice(lastEnd);
                            
                            // 替换 processedDeclarations 中的这一段
                            processedDeclarations = processedDeclarations.replace(originalValue, newValueBuilder);
                        }
                    }

                    // --- 布局处理 ---
                    else if (layoutProperties.includes(lowerProp)) {
                        const cleanValue = valueTrimmed.replace('!important', '').trim();
                        const values = cleanValue.split(/\s+/);
                        
                        if (values.length > 0) {
                            const variableName = `--theme-editor-layout-${uniqueId}`;
                            uniqueId++;

                            // 任务：替换整个值部分
                            replacementTasks.push({
                                start: valueAbsoluteStart,
                                end: valueAbsoluteEnd,
                                variableName: variableName
                            });

                            // 初始化变量
                            updateLiveCssVariable(variableName, cleanValue);
                            
                            // Live CSS
                            processedDeclarations = processedDeclarations.replace(originalValue, `var(${variableName})`);

                            // UI
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
                } // end while declarations

                // 生成 Live CSS 规则，加上 !important
                // 注意：这里生成的 CSS 可能包含多个同名属性，但浏览器会应用最后一个（即我们的变量版）
                // 更精确的做法是只保留变量版。上面的 replace 逻辑已经尽量做到了。
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

            } // end while rules
            
            liveStyleTag.textContent = finalCssRules;
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v13 - Perfect Save) loaded successfully.");
    });
})();
