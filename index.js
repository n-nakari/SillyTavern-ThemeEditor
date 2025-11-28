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

        // 样式表1：存放使用变量的CSS规则
        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }

        // 样式表2：专门存放变量的定义
        let variableStyleTag = document.getElementById('theme-editor-variable-definitions');
        if (!variableStyleTag) {
            variableStyleTag = document.createElement('style');
            variableStyleTag.id = 'theme-editor-variable-definitions';
            document.head.appendChild(variableStyleTag);
        }
        
        // 关键：禁用SillyTavern的原生自定义CSS注入，完全由我们接管
        const sillyTavernStyleTag = document.getElementById('custom-css');
        if (sillyTavernStyleTag) {
            sillyTavernStyleTag.disabled = true;
        }

        // 用一个Map来存储所有变量名和它们的当前颜色值
        let colorVariables = new Map();

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        // 核心函数：重新生成并应用所有CSS变量定义
        function regenerateVariableStyleSheet() {
            let variableCss = ':root {\n';
            for (const [name, value] of colorVariables.entries()) {
                variableCss += `  ${name}: ${value} !important;\n`;
            }
            variableCss += '}';
            variableStyleTag.textContent = variableCss;
        }

        function parseAndBuildUI() {
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            colorVariables.clear();
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
                                
                                if (tempValue.includes(colorStr)) {
                                    tempValue = tempValue.replace(colorStr, `var(${variableName})`);
                                    replacementMade = true;

                                    let initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                    colorVariables.set(variableName, initialColor);

                                    // --- 创建UI ---
                                    const item = document.createElement('div');
                                    item.className = 'theme-editor-item';
                                    if(foundColors.length > 1) item.classList.add('multi-color');

                                    const label = document.createElement('div');
                                    label.className = 'theme-editor-label';
                                    label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                                    label.title = `${selector} { ${property}: ${value} }`;

                                    const colorPicker = document.createElement('toolcool-color-picker');
                                    
                                    setTimeout(() => { colorPicker.color = initialColor; }, 0);

                                    colorPicker.addEventListener('input', (event) => {
                                        const newColor = event.detail.rgba || event.detail.hex;
                                        colorVariables.set(variableName, newColor);
                                        regenerateVariableStyleSheet(); // 每次变动都重新生成整个变量表
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
            regenerateVariableStyleSheet(); // 初始加载时应用一次所有变量
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v7 - Final) loaded successfully.");
    });
})();
