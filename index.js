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
        
        // 禁用SillyTavern的原生CSS注入，由我们完全接管
        const sillyTavernStyleTag = document.getElementById('custom-css');
        if (sillyTavernStyleTag) {
            sillyTavernStyleTag.disabled = true;
        }

        // 全局状态，存储所有颜色变量和它们的当前值
        let colorVariables = [];
        // 全局状态，存储带有var()占位符的CSS规则
        let cssRulesTemplate = '';

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        // 核心函数：根据当前颜色状态，重新生成并注入完整的CSS
        function renderLiveStyles() {
            let variablesBlock = ':root {\n';
            colorVariables.forEach(v => {
                variablesBlock += `  ${v.name}: ${v.value};\n`;
            });
            variablesBlock += '}\n\n';
            
            liveStyleTag.textContent = variablesBlock + cssRulesTemplate;
        }

        function parseAndBuildUI() {
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            colorVariables = [];
            cssRulesTemplate = '';
            let uniqueId = 0;

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
                        const foundColors = [...new Set([...value.matchAll(colorValueRegex)].map(m => m[0]))];
                        
                        if (foundColors.length > 0) {
                            foundColors.forEach((colorStr) => {
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;
                                
                                const initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                
                                colorVariables.push({
                                    name: variableName,
                                    value: initialColor
                                });

                                // 全局替换这个颜色为变量
                                const colorRegexGlobal = new RegExp(colorStr.replace('(', '\\(').replace(')', '\\)'), 'g');
                                tempValue = tempValue.replace(colorRegexGlobal, `var(${variableName})`);

                                // --- UI Creation (only once per unique color) ---
                                const item = document.createElement('div');
                                item.className = 'theme-editor-item';

                                const label = document.createElement('div');
                                label.className = 'theme-editor-label';
                                // 为了简化，标题只显示选择器和属性
                                label.textContent = `${selector} ${property}`;
                                label.title = `${selector} { ${property}: ${value} }`;

                                const colorPicker = document.createElement('toolcool-color-picker');
                                
                                setTimeout(() => { colorPicker.color = initialColor; }, 0);

                                colorPicker.addEventListener('input', (event) => {
                                    const variable = colorVariables.find(v => v.name === variableName);
                                    if (variable) {
                                        variable.value = event.detail.rgba || event.detail.hex;
                                        renderLiveStyles(); // 每次拖动都重新渲染整个样式表
                                    }
                                });
                                
                                item.appendChild(label);
                                item.appendChild(colorPicker);
                                editorContainer.appendChild(item);
                            });

                            processedDeclarations = processedDeclarations.replace(declarationString, ` ${property}: ${tempValue} `);
                        }
                    }
                });
                
                cssRulesTemplate += `${selector} { ${processedDeclarations} }\n`;
            }
            
            renderLiveStyles();
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v7 - Rerender) loaded successfully.");
    });
})();
