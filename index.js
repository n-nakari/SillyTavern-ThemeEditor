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
        
        // 禁用SillyTavern的原生CSS注入
        const sillyTavernStyleTag = document.getElementById('custom-css');
        if (sillyTavernStyleTag) {
            sillyTavernStyleTag.disabled = true;
        }

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        function updateLiveCssVariable(variableName, newColor) {
            // 在这里使用 !important 来确保我们的变量更新具有最高优先级
            document.documentElement.style.setProperty(variableName, newColor, 'important');
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
                const selector = ruleMatch[1].trim();
                let declarationsText = ruleMatch[2];

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
                            let replacementMadeInThisDeclaration = false;
                            
                            foundColors.forEach((colorStr, index) => {
                                const variableName = `--theme-editor-color-${uniqueId++}`;
                                
                                // 只替换第一个匹配项
                                if (tempValue.includes(colorStr)) {
                                    tempValue = tempValue.replace(colorStr, `var(${variableName})`);
                                    replacementMadeInThisDeclaration = true;

                                    let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                    updateLiveCssVariable(variableName, initialColor);

                                    const item = document.createElement('div');
                                    item.className = 'theme-editor-item';
                                    if(foundColors.length > 1) item.classList.add('multi-color');

                                    const label = document.createElement('div');
                                    label.className = 'theme-editor-label';
                                    label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                                    label.title = `${selector} { ${property}: ${value} }`;

                                    const colorPicker = document.createElement('toolcool-color-picker');
                                    
                                    // 关键修复 A: 将变量名绑定到元素上
                                    colorPicker.dataset.variableName = variableName;
                                    
                                    setTimeout(() => {
                                        colorPicker.color = initialColor;
                                    }, 0);

                                    // 关键修复 B: 从元素的dataset中读取正确的变量名
                                    colorPicker.addEventListener('input', (event) => {
                                        const varName = event.target.dataset.variableName;
                                        const newColor = event.detail.rgba || event.detail.hex;
                                        if (varName) {
                                            updateLiveCssVariable(varName, newColor);
                                        }
                                    });
                                    
                                    item.appendChild(label);
                                    item.appendChild(colorPicker);
                                    
                                    if (foundColors.length > 1 && index === 0) {
                                        const mainLabel = document.createElement('div');
                                        mainLabel.className = 'theme-editor-main-label';
                                        mainLabel.textContent = `${selector} ${property}`;
                                        editorContainer.appendChild(mainLabel);
                                    }
                                    editorContainer.appendChild(item);
                                }
                            });

                            if (replacementMadeInThisDeclaration) {
                                declarationsText = declarationsText.replace(declarationString, ` ${property}: ${tempValue} `);
                            }
                        }
                    }
                });
                
                finalCssRules += `${selector} { ${declarationsText} }\n`;
            }
            
            liveStyleTag.textContent = finalCssRules;
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            setTimeout(() => {
                const sillyTavernStyle = document.getElementById('custom-css');
                if (sillyTavernStyle) {
                    sillyTavernStyle.disabled = true;
                }
                parseAndBuildUI();
            }, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v7 - Final Fix) loaded successfully.");
    });
})();
