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

        let isUpdatingTextarea = false; // 一个标志，防止无限循环

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorPropertiesRegex = new RegExp(`(${colorProperties.join('|')})\\s*:([^;]+)`, 'g');
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'g');

        function parseAndBuildUI() {
            if (isUpdatingTextarea) return; // 如果是我们的代码正在更新文本框，则跳过解析，防止循环

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            
            // 使用一个更简单的正则表达式来捕获规则块，包括注释
            const ruleRegex = /([^{}]+)\s*\{([^}]+)\}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch[1].trim();
                const declarationsText = ruleMatch[2];
                const ruleStartIndex = ruleMatch.index;

                // 排除 @keyframes 等规则
                if (selector.startsWith('@')) continue;

                let declarationMatch;
                colorPropertiesRegex.lastIndex = 0;
                
                while((declarationMatch = colorPropertiesRegex.exec(declarationsText)) !== null) {
                    const property = declarationMatch[1].trim();
                    const value = declarationMatch[2].trim();
                    const declarationStartIndex = ruleStartIndex + ruleMatch[1].length + 1 + declarationMatch.index;
                    
                    let colorMatch;
                    colorValueRegex.lastIndex = 0;
                    
                    const colorsInDeclaration = [];
                    while ((colorMatch = colorValueRegex.exec(value)) !== null) {
                        colorsInDeclaration.push({
                            str: colorMatch[0],
                            index: colorMatch.index
                        });
                    }

                    if (colorsInDeclaration.length > 0) {
                         if (colorsInDeclaration.length > 1) {
                            const mainLabel = document.createElement('div');
                            mainLabel.className = 'theme-editor-main-label';
                            mainLabel.textContent = `${selector} ${property}`;
                            editorContainer.appendChild(mainLabel);
                        }

                        colorsInDeclaration.forEach((colorInfo, index) => {
                            const item = document.createElement('div');
                            item.className = 'theme-editor-item';
                            if (colorsInDeclaration.length > 1) item.classList.add('multi-color');

                            const label = document.createElement('div');
                            label.className = 'theme-editor-label';
                            label.textContent = colorsInDeclaration.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                            label.title = `${selector} { ${property}: ${value} }`;

                            const colorPicker = document.createElement('toolcool-color-picker');
                            
                            setTimeout(() => {
                                if (colorInfo.str.toLowerCase() === 'transparent') {
                                    colorPicker.color = 'rgba(0, 0, 0, 0)';
                                } else {
                                    colorPicker.color = colorInfo.str;
                                }
                            }, 0);

                            // 核心逻辑：更新文本框并触发事件
                            colorPicker.addEventListener('input', (event) => {
                                const newColor = event.detail.rgba || event.detail.hex;
                                const currentText = customCssTextarea.value;
                                
                                // 计算颜色的绝对位置
                                const colorAbsIndex = declarationStartIndex + value.indexOf(colorInfo.str, colorInfo.index);
                                
                                // 精确替换
                                const newText = currentText.substring(0, colorAbsIndex) + newColor + currentText.substring(colorAbsIndex + colorInfo.str.length);
                                
                                isUpdatingTextarea = true; // 设置标志
                                customCssTextarea.value = newText;
                                // 触发SillyTavern的内置更新机制
                                customCssTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                                isUpdatingTextarea = false; // 重置标志
                            });
                            
                            item.appendChild(label);
                            item.appendChild(colorPicker);
                            editorContainer.appendChild(item);
                        });
                    }
                }
            }
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 300); // 减少延迟以获得更快的响应
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v6 - Final) loaded successfully.");
    });
})();
