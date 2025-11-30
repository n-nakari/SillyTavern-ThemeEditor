(function () {
    $(document).ready(function () {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        // --- UI 初始化 ---
        const headerBar = document.createElement('div');
        headerBar.className = 'theme-editor-header-bar';

        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.className = 'theme-editor-title';

        const saveBtn = document.createElement('div');
        saveBtn.className = 'theme-editor-save-btn fa-solid fa-floppy-disk';
        saveBtn.title = 'Commit changes to Theme File (Disk)';
        // 现在的保存按钮只负责触发SillyTavern的文件保存，因为文本框已经是实时的了
        saveBtn.addEventListener('click', commitToThemeFile);

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
        const unitlessProperties = ['z-index', 'opacity', 'font-weight', 'line-height']; 

        let replacementTasks = [];
        let currentValuesMap = {}; 
        
        // 防抖计时器
        let syncTextareaTimer;
        let isSyncing = false; // 标志位：防止扩展写入文本框触发重解析

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
        }

        function updateLiveCssVariable(variableName, newValue) {
            document.documentElement.style.setProperty(variableName, newValue, 'important');
            currentValuesMap[variableName] = newValue;
            
            // [核心新增]：每次更新变量时，防抖触发写入文本框
            clearTimeout(syncTextareaTimer);
            syncTextareaTimer = setTimeout(writeChangesToTextarea, 800); // 延迟800ms写入，避免打断操作
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

        function formatLayoutValue(prop, val) {
            if (!val) return val;
            const trimmed = val.toString().trim();
            if (!isNaN(trimmed) && trimmed !== '0' && !unitlessProperties.includes(prop.toLowerCase())) {
                return trimmed + 'px';
            }
            return trimmed;
        }

        // 将当前所有的修改写回文本框 (Sync to Textarea)
        function writeChangesToTextarea() {
            isSyncing = true; // 锁定：这是我们自己的写入，不要触发全量重绘
            
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

            // 如果内容没变，就不写了，节省性能
            if (customCssTextarea.value !== newCss) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                nativeInputValueSetter.call(customCssTextarea, newCss);
                
                const event = new Event('input', { bubbles: true });
                customCssTextarea.dispatchEvent(event);
                
                // 写入后，我们需要重新解析以更新索引(Task)，否则下次写入位置会错
                // 但为了不打断UI，我们可以静默更新 Task 索引？太难了。
                // 简单的办法是：写入后触发 debouncedParse，但面板重建会导致失去焦点。
                // 所以我们设置较长的 debounce 时间，希望用户这时已经停手了。
                
                // 解锁在 debouncedParse 里处理
            } else {
                isSyncing = false;
            }
        }

        // 保存到文件 (Commit)
        function commitToThemeFile() {
            // 确保最新的值已经写入文本框
            writeChangesToTextarea();
            
            // 触发 SillyTavern 的保存
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
            // 如果是同步造成的 Input 事件，我们忽略这次 UI 重建，防止闪烁
            if (isSyncing) {
                isSyncing = false;
                // 但是！写入文本框后，字符串长度变了，replacementTasks 里的索引已经失效了！
                // 我们必须重新解析以获取新索引。
                // 为了不销毁 UI，我们其实应该只更新 Task 索引，但这非常复杂。
                // 现在的妥协方案：重建 UI。
                // 因为 writeChangesToTextarea 是防抖的（用户停手后0.8秒），
                // 所以 UI 重建发生在用户停手后，不会打断拖拽，只会让面板“闪”一下刷新数据。这是可接受的。
            }

            cleanupOldVariables();
            if (document.getElementById('custom-css')) document.getElementById('custom-css').disabled = true;
            
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
                                
                                // 监听变化
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
                                // 在失去焦点或回车时，可以尝试立即同步（可选，目前靠 updateLiveCssVariable 的 debounce）
                                input.addEventListener('change', () => {
                                    // 可以在这里强制立即写入
                                });

                                inputsContainer.appendChild(input);
                            });

                            propertyBlock.appendChild(inputsContainer);
                            layoutUIBlocks.push(propertyBlock);
                        }
                    }
                }

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

        console.log("Theme Editor extension (v17 - Auto Sync) loaded successfully.");
    });
})();
