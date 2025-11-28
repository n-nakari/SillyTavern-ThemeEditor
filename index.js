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

        // 存储所有解析出的CSS声明及其颜色信息
        let declarationsWithColors = [];
        let colorCounter = 0;

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorPropertiesRegex = new RegExp(`(?:^|;)\\s*(${colorProperties.join('|')})\\s*:([^;]+)`, 'gi');
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'g');
        
        // 此函数只在解析后运行一次，生成带CSS变量的样式
        function generateLiveStyles() {
            const rules = declarationsWithColors.map(declaration => {
                let finalValue = declaration.originalValue;
                declaration.colors.forEach(color => {
                    // 替换原始颜色为 CSS 变量
                    finalValue = finalValue.replace(color.original, `var(${color.varName})`);
                });
                return `${declaration.selector} { ${declaration.property}: ${finalValue} !important; }`;
            }).join('\n');

            // 将所有初始颜色值设置为 CSS 变量
            const rootVars = declarationsWithColors.flatMap(d => d.colors).map(c => {
                 // 处理 transparent
                const initialValue = c.original.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : c.original;
                document.documentElement.style.setProperty(c.varName, initialValue);
                return `${c.varName}: ${initialValue};`;
            }).join('\n');
            
            // 注入样式
            liveStyleTag.textContent = `:root { ${rootVars} } \n ${rules}`;
        }
        
        // 解析CSS并构建UI
        function parseAndBuildUI() {
            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            declarationsWithColors = [];
            colorCounter = 0;
            // 清除旧的CSS变量
            for (let i = 0; i < 500; i++) { // 清除足够多的变量
                document.documentElement.style.removeProperty(`--theme-editor-${i}`);
            }

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch[1].trim();
                const declarationsText = ruleMatch[2];

                let declarationMatch;
                colorPropertiesRegex.lastIndex = 0;
                
                while((declarationMatch = colorPropertiesRegex.exec(';' + declarationsText)) !== null) {
                    const property = declarationMatch[1].trim();
                    const value = declarationMatch[2].trim();
                    
                    const foundColors = [...value.matchAll(colorValueRegex)].map(m => m[0]);

                    if (foundColors.length > 0) {
                        const declaration = {
                            selector: selector,
                            property: property,
                            originalValue: value,
                            colors: []
                        };
                        
                        foundColors.forEach(color => {
                            const varName = `--theme-editor-${colorCounter++}`;
                            declaration.colors.push({
                                original: color,
                                varName: varName,
                            });
                        });
                        declarationsWithColors.push(declaration);

                        // --- 创建UI元素 ---
                        if (declaration.colors.length > 1) {
                            const mainLabel = document.createElement('div');
                            mainLabel.className = 'theme-editor-main-label';
                            mainLabel.textContent = `${selector} ${property}`;
                            editorContainer.appendChild(mainLabel);
                        }

                        declaration.colors.forEach((color, index) => {
                            const item = document.createElement('div');
                            item.className = 'theme-editor-item';
                            if(declaration.colors.length > 1) item.classList.add('multi-color');

                            const label = document.createElement('div');
                            label.className = 'theme-editor-label';
                            label.textContent = declaration.colors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                            label.title = `${selector} { ${property}: ${value} }`;
                            
                            const colorPicker = document.createElement('toolcool-color-picker');
                            
                            item.appendChild(label);
                            item.appendChild(colorPicker); // 先添加到DOM中
                            
                            // 关键：在添加到DOM后设置颜色，确保Web Component初始化完成
                            const initialColor = color.original.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : color.original;
                            colorPicker.color = initialColor;

                            // 监听颜色变化，并直接更新对应的CSS变量
                            colorPicker.addEventListener('input', (event) => {
                                const newColor = event.detail.rgba || event.detail.hex;
                                document.documentElement.style.setProperty(color.varName, newColor);
                            });
                            
                            editorContainer.appendChild(item);
                        });
                    }
                }
            }
            // 解析完成后，生成一次性的样式表
            generateLiveStyles();
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        // 初始运行并监听输入
        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v4 - CSS Variable method) loaded successfully.");
    });
})();
