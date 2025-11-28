(function () {
    $(document).ready(function () {
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Final attempt failed, essential UI elements not found.");
            return;
        }

        // --- UI Setup ---
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
        
        // 关键：禁用SillyTavern的原生CSS注入，由我们完全接管
        const sillyTavernStyleTag = document.getElementById('custom-css');
        if (sillyTavernStyleTag) {
            sillyTavernStyleTag.disabled = true;
        }

        // --- 数据模型 ---
        let parsedRules = []; // 存储所有解析出的规则和颜色

        // --- 正则表达式 ---
        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        /**
         * 核心函数：根据内存中的 parsedRules 数组，重新构建整个CSS文本并注入
         */
        function rebuildAndInjectCss() {
            let newCssText = '';
            for (const rule of parsedRules) {
                let declarationsText = rule.originalDeclarations;
                
                // 遍历该规则下的所有颜色属性
                for (const decl of rule.declarationsWithColors) {
                    let finalValue = decl.originalValue;
                    // 倒序替换，防止子字符串问题 (e.g., 'white' in 'whitesmoke')
                    const colorsToReplace = [...decl.colors].sort((a, b) => b.original.length - a.original.length);
                    
                    for (const color of colorsToReplace) {
                        // 使用一个临时占位符来做替换，避免一个颜色被多次替换
                        finalValue = finalValue.replace(color.original, `__TEMP_REPLACE_${color.id}__`);
                    }
                    for (const color of colorsToReplace) {
                        finalValue = finalValue.replace(`__TEMP_REPLACE_${color.id}__`, color.current);
                    }
                    
                    declarationsText = declarationsText.replace(decl.fullOriginalDeclaration, `${decl.property}: ${finalValue}`);
                }
                newCssText += `${rule.selector} { ${declarationsText} }\n`;
            }
            liveStyleTag.textContent = newCssText;
        }

        /**
         * 解析CSS文本，构建UI和数据模型
         */
        function parseAndBuildUI() {
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            parsedRules = [];
            let colorId = 0;

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch.trim();
                const declarationsText = ruleMatch.trim();

                const rule = {
                    selector: selector,
                    originalDeclarations: declarationsText,
                    declarationsWithColors: []
                };

                const allDeclarations = declarationsText.split(';').filter(d => d.trim() !== '');

                allDeclarations.forEach(declarationString => {
                    const parts = declarationString.split(':');
                    if (parts.length < 2) return;

                    const property = parts.trim();
                    const value = parts.slice(1).join(':').trim();

                    if (colorProperties.includes(property.toLowerCase())) {
                        const foundColors = [...new Set(value.match(colorValueRegex) || [])];
                        
                        if (foundColors.length > 0) {
                            const declaration = {
                                property: property,
                                originalValue: value,
                                fullOriginalDeclaration: declarationString.trim(),
                                colors: []
                            };

                            // 创建UI和数据
                            if (foundColors.length > 1) {
                                const mainLabel = document.createElement('div');
                                mainLabel.className = 'theme-editor-main-label';
                                mainLabel.textContent = `${selector} ${property}`;
                                editorContainer.appendChild(mainLabel);
                            }

                            foundColors.forEach((colorStr, index) => {
                                const color = {
                                    id: colorId++,
                                    original: colorStr,
                                    current: colorStr
                                };
                                declaration.colors.push(color);

                                const item = document.createElement('div');
                                item.className = 'theme-editor-item';
                                if(foundColors.length > 1) item.classList.add('multi-color');

                                const label = document.createElement('div');
                                label.className = 'theme-editor-label';
                                label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                                label.title = `${selector} { ${property}: ${value} }`;

                                const colorPicker = document.createElement('toolcool-color-picker');
                                
                                setTimeout(() => {
                                    colorPicker.color = color.original.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : color.original;
                                }, 0);

                                colorPicker.addEventListener('input', (event) => {
                                    const newColor = event.detail.rgba || event.detail.hex;
                                    color.current = newColor; // 更新内存中的数据模型
                                    rebuildAndInjectCss();  // 从头重建并注入整个样式表
                                });
                                
                                item.appendChild(label);
                                item.appendChild(colorPicker);
                                editorContainer.appendChild(item);
                            });
                            rule.declarationsWithColors.push(declaration);
                        }
                    }
                });
                parsedRules.push(rule);
            }
            rebuildAndInjectCss();
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v7 - Final Takeover) loaded successfully.");
    });
})();
