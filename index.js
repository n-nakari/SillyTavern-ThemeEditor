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

        // 禁用SillyTavern的原生Custom CSS样式注入，由我们完全接管
        const sillyTavernStyleTag = document.getElementById('custom-css');
        if (sillyTavernStyleTag) {
            sillyTavernStyleTag.disabled = true;
        }

        let declarationsWithColors = []; // 我们的内存数据库

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        // 关键函数：重新生成并注入所有样式
        function regenerateAndApplyStyles() {
            const newCssRules = declarationsWithColors.map(declaration => {
                let finalValue = declaration.templateValue;
                // 用当前颜色替换占位符
                declaration.colors.forEach(color => {
                    finalValue = finalValue.replace(color.placeholder, color.current);
                });
                // 为每一条规则都加上 !important
                return `${declaration.selector} { ${declaration.property}: ${finalValue} !important; }`;
            }).join('\n');

            liveStyleTag.textContent = newCssRules;
        }

        function parseAndBuildUI() {
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            declarationsWithColors = [];

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch[1].trim();
                const declarationsText = ruleMatch[2];
                const allDeclarations = declarationsText.split(';').filter(d => d.trim() !== '');

                allDeclarations.forEach(declarationString => {
                    const parts = declarationString.split(':');
                    if (parts.length < 2) return;

                    const property = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();

                    if (colorProperties.includes(property.toLowerCase())) {
                        const foundColors = [...value.matchAll(colorValueRegex)].map(m => m[0]);
                        
                        if (foundColors.length > 0) {
                            let templateValue = value;
                            const declarationData = {
                                selector: selector,
                                property: property,
                                templateValue: '',
                                colors: []
                            };

                            foundColors.forEach((colorStr, index) => {
                                const placeholder = `__PLACEHOLDER_${declarationsWithColors.length}_${index}__`;
                                // 只替换第一个匹配项，防止替换多个相同颜色值
                                templateValue = templateValue.replace(colorStr, placeholder);
                                
                                const colorData = {
                                    original: colorStr,
                                    current: colorStr,
                                    placeholder: placeholder
                                };
                                declarationData.colors.push(colorData);

                                // --- 创建UI ---
                                const item = document.createElement('div');
                                item.className = 'theme-editor-item';
                                if(foundColors.length > 1) item.classList.add('multi-color');

                                const label = document.createElement('div');
                                label.className = 'theme-editor-label';
                                label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                                label.title = `${selector} { ${property}: ${value} }`;

                                const colorPicker = document.createElement('toolcool-color-picker');
                                
                                setTimeout(() => {
                                    const initialColor = colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr;
                                    colorPicker.color = initialColor;
                                }, 0);

                                // 监听器现在只更新内存数据，然后调用重绘函数
                                colorPicker.addEventListener('input', (event) => {
                                    const newColor = event.detail.rgba || event.detail.hex;
                                    colorData.current = newColor;
                                    regenerateAndApplyStyles();
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
                            });
                            
                            declarationData.templateValue = templateValue;
                            declarationsWithColors.push(declarationData);
                        }
                    }
                });
            }
            
            // 初始加载时，生成并应用一次样式
            regenerateAndApplyStyles();
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (Final - Regenerate) loaded successfully.");
    });
})();
