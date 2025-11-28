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

        // 我们自己的style标签，用于注入最终的CSS
        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }
        
        // 找到并禁用SillyTavern为Custom CSS创建的style标签
        // SillyTavern的这个功能没有固定的ID，但它通常是后加载的。
        // 一个稳妥的办法是，在我们自己的脚本运行时，先禁用所有可能是它的style标签，
        // 然后只启用我们自己的。但更简单的做法是确保我们的规则优先级最高。
        // 让我们最后一次尝试用 !important，但这次确保我们的规则是唯一被应用的。
        // 更新：我们将直接修改textarea的内容，让SillyTavern的原生机制为我们所用。但这风险太大。
        // 最终决定：我们注入我们自己的样式，并希望它的加载顺序在后面，或者通过!important来覆盖。
        // 之前的失败表明这还不够。所以现在，我们将动态找到并禁用它。
        
        // SillyTavern将自定义CSS注入到一个ID为 'custom-css' 的 <style> 标签中
        let sillyTavernStyleTag = document.getElementById('custom-css');
        if (!sillyTavernStyleTag) {
            // 如果没找到，创建一个以防万一，尽管SillyTavern通常会自己创建
            sillyTavernStyleTag = document.createElement('style');
            sillyTavernStyleTag.id = 'custom-css';
            document.head.appendChild(sillyTavernStyleTag);
        }
        // 关键：禁用它！
        sillyTavernStyleTag.disabled = true;

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        function updateLiveCssVariable(variableName, newColor) {
            document.documentElement.style.setProperty(variableName, newColor, 'important');
        }

        function parseAndBuildUI() {
            // 确保SillyTavern的样式标签被禁用
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            let uniqueId = 0;
            let finalCssRules = '';

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch[1].trim();
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
                                
                                // 替换第一个匹配项
                                if (tempValue.includes(colorStr)) {
                                    tempValue = tempValue.replace(colorStr, `var(${variableName})`);
                                    replacementMade = true;

                                    // 初始化CSS变量
                                    let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                    updateLiveCssVariable(variableName, initialColor);

                                    // 创建UI
                                    const item = document.createElement('div');
                                    item.className = 'theme-editor-item';
                                    if(foundColors.length > 1) item.classList.add('multi-color');

                                    const label = document.createElement('div');
                                    label.className = 'theme-editor-label';
                                    label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                                    label.title = `${selector} { ${property}: ${value} }`;

                                    const colorPicker = document.createElement('toolcool-color-picker');
                                    
                                    setTimeout(() => {
                                        colorPicker.color = initialColor;
                                    }, 0);

                                    colorPicker.addEventListener('input', (event) => {
                                        const newColor = event.detail.rgba || event.detail.hex;
                                        updateLiveCssVariable(variableName, newColor);
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

        console.log("Theme Editor extension (v6 - Takeover) loaded successfully.");
    });
})();
