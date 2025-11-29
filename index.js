(function () {
    $(document).ready(function () {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';
        
        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.style.marginTop = '15px';

        customCssBlock.parentNode.insertBefore(title, customCssBlock.nextSibling);
        title.parentNode.insertBefore(editorContainer, title.nextSibling);

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

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorPropertiesRegex = new RegExp(`(?:^|;)\\s*(${colorProperties.join('|')})\\s*:([^;]+)`, 'gi');
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        function updateLiveCssVariable(variableName, newColor) {
            document.documentElement.style.setProperty(variableName, newColor);
        }

        // [新增] 辅助函数：生成美化后的标签HTML内容
        function createFormattedLabelContent(rawSelector, property) {
            let commentText = "";
            let cleanSelector = rawSelector.trim();

            // 尝试提取 /* ... */ 注释
            // 匹配模式：非贪婪匹配 /* 内容 */
            const commentMatch = rawSelector.match(/\/\*([\s\S]*?)\*\//);
            
            if (commentMatch) {
                // 提取注释内容并去除首尾空格
                commentText = commentMatch[1].trim();
                // 从选择器中移除注释部分
                cleanSelector = rawSelector.replace(commentMatch[0], '').trim();
            }

            // 构建第一行：如果有注释，显示 "注释 / 选择器"，否则只显示 "选择器"
            const line1 = commentText ? `<span class="label-highlight">${commentText}</span> / ${cleanSelector}` : cleanSelector;
            
            // 构建第二行：--属性名
            const line2 = `--${property}`;

            return `<div class="label-line-1">${line1}</div><div class="label-line-2">${line2}</div>`;
        }

        function parseAndBuildUI() {
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            let uniqueId = 0;
            let finalCssRules = '';

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                // 获取原始选择器字符串（包含可能的注释）
                const rawSelectorString = ruleMatch[1]; 
                // 为了CSS规则生成，我们需要一个干净的选择器（浏览器可能无法解析带注释的选择器作为Key）
                // 但这里我们把带有CSS变量的内容重新拼回去，所以保持原样或者清理都可以。
                // 简单起见，我们保留原始字符串用于替换，但清理它用于生成的CSS规则。
                const selector = rawSelectorString.trim(); 
                
                const declarationsText = ruleMatch[2];
                let processedDeclarations = declarationsText;

                const allDeclarations = declarationsText.split(';').filter(d => d.trim() !== '');

                allDeclarations.forEach(declarationString => {
                    const parts = declarationString.split(':');
                    if (parts.length < 2) return;

                    const property = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();

                    if (colorProperties.includes(property.toLowerCase())) {
                        let tempValue = value;
                        const foundColors = [...value.matchAll(colorValueRegex)].map(m => m[0]);
                        
                        if (foundColors.length > 0) {
                            let replacementMade = false;
                            
                            foundColors.forEach((colorStr, index) => {
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;
                                
                                if (tempValue.includes(colorStr)) {
                                    tempValue = tempValue.replace(colorStr, `var(${variableName})`);
                                    replacementMade = true;

                                    let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                    updateLiveCssVariable(variableName, initialColor);

                                    const item = document.createElement('div');
                                    item.className = 'theme-editor-item';
                                    if(foundColors.length > 1) item.classList.add('multi-color');

                                    const label = document.createElement('div');
                                    
                                    if (foundColors.length > 1) {
                                        label.className = 'theme-editor-sub-label';
                                        label.textContent = `Color #${index + 1}`;
                                    } else {
                                        label.className = 'theme-editor-label';
                                        // [修改] 使用 innerHTML 插入双行结构
                                        label.innerHTML = createFormattedLabelContent(rawSelectorString, property);
                                    }
                                    
                                    label.title = `${selector} { ${property}: ${value} }`;

                                    const colorPicker = document.createElement('toolcool-color-picker');
                                    
                                    setTimeout(() => {
                                        colorPicker.color = initialColor;
                                    }, 0);

                                    $(colorPicker).on('change', (evt) => {
                                        const newColor = evt.detail.rgba; 
                                        updateLiveCssVariable(variableName, newColor);
                                    });
                                    
                                    item.appendChild(label);
                                    item.appendChild(colorPicker);
                                    
                                    if (foundColors.length > 1 && index === 0) {
                                        const mainLabel = document.createElement('div');
                                        mainLabel.className = 'theme-editor-main-label';
                                        // [修改] 主标题也支持双行结构
                                        mainLabel.innerHTML = createFormattedLabelContent(rawSelectorString, property);
                                        editorContainer.appendChild(mainLabel);
                                    }
                                    editorContainer.appendChild(item);
                                }
                            });

                            if (replacementMade) {
                                processedDeclarations = processedDeclarations.replace(declarationString, ` ${property}: ${tempValue} `);
                            }
                        }
                    }
                });
                
                finalCssRules += `${selector} { ${processedDeclarations} }\n`;
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

        console.log("Theme Editor extension (v9 - Comments support) loaded successfully.");
    });
})();
