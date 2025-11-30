(function () {
    $(document).ready(function () {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        // --- 初始化 UI ---
        const headerBar = document.createElement('div');
        headerBar.className = 'theme-editor-header-bar';

        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.className = 'theme-editor-title';

        const saveBtn = document.createElement('div');
        saveBtn.className = 'theme-editor-save-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Save changes (Preserves formatting)';
        saveBtn.addEventListener('click', saveCurrentTheme);

        headerBar.appendChild(title);
        headerBar.appendChild(saveBtn);

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

        tabsContainer.appendChild(tabColors);
        tabsContainer.appendChild(tabLayout);
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

        // --- 数据定义 ---
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

        let replacementTasks = [];
        let currentValuesMap = {}; 

        function cleanupOldVariables() {
            // 遍历所有样式属性，删除我们自己创建的变量
            const rootStyle = document.documentElement.style;
            for (let i = rootStyle.length - 1; i >= 0; i--) {
                const prop = rootStyle[i];
                if (prop.startsWith('--theme-editor-')) {
                    rootStyle.removeProperty(prop);
                }
            }
            replacementTasks = [];
            currentValuesMap = {};
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
            if (commentText) {
                return `<div class="label-line-1"><span class="label-highlight">${commentText}</span>/${cleanSelector}</div>`;
            } else {
                return `<div class="label-line-1">${cleanSelector}</div>`;
            }
        }

        function saveCurrentTheme() {
            const originalCss = customCssTextarea.value;
            let newCss = originalCss;
            
            // 按照起始位置从后往前排序，防止替换后影响前面的索引
            const tasks = replacementTasks.sort((a, b) => b.start - a.start);
            
            tasks.forEach(task => {
                const newValue = currentValuesMap[task.variableName];
                if (newValue !== undefined && newValue !== null) {
                    const before = newCss.slice(0, task.start);
                    const after = newCss.slice(task.end);
                    newCss = before + newValue + after;
                }
            });

            customCssTextarea.value = newCss;
            const event = new Event('input', { bubbles: true });
            customCssTextarea.dispatchEvent(event);

            // 重新解析以同步状态
            setTimeout(() => {
                parseAndBuildUI();
                // 使用 toastr 提示如果可用，否则用 alert
                if (window.toastr) window.toastr.success('Theme saved successfully!');
                else alert('Theme saved successfully!');
            }, 50);
        }

        function parseAndBuildUI() {
            // 1. 清理环境
            cleanupOldVariables();
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;
            panelColors.innerHTML = '';
            panelLayout.innerHTML = '';
            
            const cssText = customCssTextarea.value;
            let uniqueId = 0;
            let finalCssRules = '';

            // 匹配规则块：选择器 { 内容 }
            const ruleRegex = /([^{]+)\{([^}]+)\}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const rawSelector = ruleMatch[1].trim();
                const selector = rawSelector; // 用于 CSS 选择器
                const declarationsText = ruleMatch[2];
                // 计算规则块内容在整个字符串中的起始偏移量（大括号后）
                const ruleBodyOffset = ruleMatch.index + ruleMatch[0].indexOf('{') + 1;
                
                let processedDeclarations = declarationsText;
                let colorUIBlocks = [];
                let layoutUIBlocks = [];

                // 匹配声明： 属性 : 值
                // 排除分号结尾，处理最后一行可能没分号的情况
                const declarationRegex = /(?:^|;)\s*([a-zA-Z0-9-]+)\s*:\s*([^;]+)/g;
                let declMatch;

                while ((declMatch = declarationRegex.exec(declarationsText)) !== null) {
                    const fullMatch = declMatch[0];
                    const property = declMatch[1].trim();
                    const originalValue = declMatch[2]; // 值可能包含空格
                    const lowerProp = property.toLowerCase();

                    // 计算值在 declarationsText 中的相对位置
                    // declMatch.index 是匹配项开始的位置（可能包含前导分号）
                    // 我们需要找到冒号的位置
                    const colonRelativeIndex = fullMatch.indexOf(':');
                    // 值的起始位置是 冒号位置 + 1 (跳过冒号) + 前导空格长度 (trimStart处理)
                    // 但 originalValue 已经不含前导空格了吗？declMatch[2] 是正则捕获组
                    // 为了精确，我们在 fullMatch 中搜索 originalValue
                    const valueIndexInMatch = fullMatch.indexOf(originalValue);
                    
                    // 绝对起始位置 = 规则体偏移 + 匹配项偏移 + 值在匹配项中的偏移
                    const valueAbsoluteStart = ruleBodyOffset + declMatch.index + valueIndexInMatch;
                    const valueAbsoluteEnd = valueAbsoluteStart + originalValue.length;

                    // --- 颜色处理 ---
                    if (colorProperties.includes(lowerProp)) {
                        const foundColors = [...originalValue.matchAll(colorValueRegex)];
                        
                        if (foundColors.length > 0) {
                            let tempValue = originalValue;
                            
                            const propertyBlock = document.createElement('div');
                            propertyBlock.className = 'theme-editor-property-block';
                            const propLabel = document.createElement('div');
                            propLabel.className = 'theme-editor-prop-label';
                            propLabel.textContent = property;
                            propertyBlock.appendChild(propLabel);

                            // 从后往前处理颜色变量替换（用于 Live CSS），同时记录 Task
                            // 注意：foundColors 的 index 是相对于 originalValue 的
                            
                            // 这里我们先收集所有颜色信息
                            let colorReplacements = [];

                            foundColors.forEach((colorMatch, index) => {
                                const colorStr = colorMatch[0];
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;

                                // 记录保存任务
                                replacementTasks.push({
                                    start: valueAbsoluteStart + colorMatch.index,
                                    end: valueAbsoluteStart + colorMatch.index + colorStr.length,
                                    variableName: variableName
                                });

                                // 初始化变量
                                let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                updateLiveCssVariable(variableName, initialColor);

                                // 收集替换信息用于构建 Live CSS
                                colorReplacements.push({
                                    str: colorStr,
                                    var: `var(${variableName})`,
                                    index: colorMatch.index,
                                    length: colorStr.length
                                });

                                // UI
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

                            // 构建 Live CSS 的值 string (倒序替换)
                            colorReplacements.sort((a, b) => b.index - a.index);
                            let liveValue = originalValue;
                            colorReplacements.forEach(rep => {
                                liveValue = liveValue.substring(0, rep.index) + rep.var + liveValue.substring(rep.index + rep.length);
                            });

                            // 替换 processedDeclarations 中的这一段
                            // 这里简单的 replace 可能会有风险，如果 originalValue 在同一个规则里出现多次
                            // 但由于我们是顺序遍历，且 declarationsText 是局部的，只要值唯一就没问题。
                            // 更稳妥的是重建 processedDeclarations，但这里我们使用 replace 第一次出现
                            processedDeclarations = processedDeclarations.replace(originalValue, liveValue);
                            
                            colorUIBlocks.push(propertyBlock);
                        }
                    }

                    // --- 布局处理 ---
                    else if (layoutProperties.includes(lowerProp)) {
                        const cleanValue = originalValue.replace('!important', '').trim();
                        // 简单的按空格分割数值
                        const values = cleanValue.split(/\s+/);
                        
                        if (values.length > 0) {
                            const variableName = `--theme-editor-layout-${uniqueId}`;
                            uniqueId++;

                            // 任务：替换整个值部分 (保留 !important 结构，我们在变量里不含 !important)
                            // 注意：如果原值有 !important，我们这里替换的是 originalValue (包含 !important)
                            // 所以变量里只需要值。
                            // 但为了保留原CSS里的 !important，我们应该只替换数值部分。
                            // 简化：直接替换整个 originalValue 为 var(...)，我们在 CSS rule 末尾加了 !important，所以原内联 !important 可以忽略
                            
                            replacementTasks.push({
                                start: valueAbsoluteStart, // 这里的 start 是原值的起始位置
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
                                    updateLiveCssVariable(variableName, currentValues.join(' '));
                                });

                                inputsContainer.appendChild(input);
                            });

                            propertyBlock.appendChild(inputsContainer);
                            layoutUIBlocks.push(propertyBlock);
                        }
                    }
                } // end while declaration

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

        // 监听外部的主题变化（例如通过其他方式加载了新CSS）
        // 但最主要的是初始化时解析
        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v14 - Cleanup & Robust Parsing) loaded successfully.");
    });
})();
