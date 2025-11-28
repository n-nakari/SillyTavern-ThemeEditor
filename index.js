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

        // 存储解析出的声明
        let declarationsWithColors = [];
        
        // CSS颜色名称列表 (用于精确匹配)
        const cssColorNames = [
            'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];

        // 只查找这些属性
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorPropertiesRegex = new RegExp(`(?:^|;)\\s*(${colorProperties.join('|')})\\s*:([^;]+)`, 'gi');
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        function updateLiveStyles() {
            const newCssRules = declarationsWithColors.map(declaration => {
                let finalValue = declaration.originalValue;
                declaration.colors.forEach(color => {
                    // 顺序替换，确保如果多个颜色相同，它们能被正确地逐个替换
                    finalValue = finalValue.replace(color.original, color.current);
                });
                return `${declaration.selector} { ${declaration.property}: ${finalValue} !important; }`;
            }).join('\n');
            liveStyleTag.textContent = newCssRules;
        }

        function parseAndBuildUI() {
            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            declarationsWithColors = [];

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch[1].trim();
                const declarationsText = ruleMatch[2];

                let declarationMatch;
                colorPropertiesRegex.lastIndex = 0; // 重置正则索引
                
                while((declarationMatch = colorPropertiesRegex.exec(';' + declarationsText)) !== null) {
                    const property = declarationMatch[1].trim();
                    const value = declarationMatch[2].trim();
                    
                    const foundColors = value.match(colorValueRegex);

                    if (foundColors && foundColors.length > 0) {
                        const declaration = {
                            selector: selector,
                            property: property,
                            originalValue: value,
                            colors: foundColors.map(color => ({
                                original: color,
                                current: color
                            }))
                        };
                        declarationsWithColors.push(declaration);

                        // 如果一个属性有多个颜色，先显示一个主标题
                        if (declaration.colors.length > 1) {
                            const mainLabel = document.createElement('div');
                            mainLabel.className = 'theme-editor-main-label';
                            mainLabel.textContent = `${selector} ${property}`;
                            editorContainer.appendChild(mainLabel);
                        }

                        // 为每个颜色创建调色盘
                        declaration.colors.forEach((color, index) => {
                            const item = document.createElement('div');
                            item.className = 'theme-editor-item';
                            if(declaration.colors.length > 1) item.classList.add('multi-color');

                            const label = document.createElement('div');
                            label.className = 'theme-editor-label';
                            
                            if (declaration.colors.length > 1) {
                                label.textContent = `Color #${index + 1}`;
                            } else {
                                label.textContent = `${selector} ${property}`;
                            }
                            label.title = `${selector} { ${property}: ${value} }`;

                            const colorPicker = document.createElement('toolcool-color-picker');
                            colorPicker.color = color.original;

                            // 关键：使用 'input' 事件进行实时更新
                            colorPicker.addEventListener('input', (event) => {
                                const newColor = event.detail.rgba || event.detail.hex; // 优先使用rgba
                                color.current = newColor;
                                updateLiveStyles();
                            });
                            
                            item.appendChild(label);
                            item.appendChild(colorPicker);
                            editorContainer.appendChild(item);
                        });
                    }
                }
            }
            updateLiveStyles();
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v2) loaded successfully.");
    });
})();
