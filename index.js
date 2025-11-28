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

        // 存储所有解析出的声明
        let declarationsWithColors = [];

        // 包含 "transparent" 的CSS颜色名称列表
        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeymist', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];

        // 关心的CSS属性
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorPropertiesRegex = new RegExp(`(?:^|;)\\s*(${colorProperties.join('|')})\\s*:([^;]+)`, 'gi');
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        // 更新函数：只更新CSS变量，非常高效
        function updateLiveCssVariable(variableName, newColor) {
            document.documentElement.style.setProperty(variableName, newColor);
        }

        function parseAndBuildUI() {
            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            declarationsWithColors = [];
            let uniqueId = 0;

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;
            let finalCssRules = '';

            // 遍历所有CSS规则
            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch[1].trim();
                const declarationsText = ruleMatch[2];
                let processedDeclarations = declarationsText;

                // 遍历我们关心的颜色属性
                let declarationMatch;
                colorPropertiesRegex.lastIndex = 0;
                while((declarationMatch = colorPropertiesRegex.exec(';' + declarationsText)) !== null) {
                    const property = declarationMatch[1].trim();
                    const value = declarationMatch[2].trim();
                    
                    let valueWithVars = value;
                    const foundColors = [...value.matchAll(colorValueRegex)].map(m => m[0]);

                    if (foundColors.length > 0) {
                        const declaration = {
                            selector: selector,
                            property: property,
                            originalValue: value,
                            colors: []
                        };

                        // 为每个颜色创建CSS变量并替换
                        foundColors.forEach((colorStr, index) => {
                            const variableName = `--theme-editor-color-${uniqueId}`;
                            uniqueId++;
                            
                            declaration.colors.push({
                                original: colorStr,
                                variableName: variableName
                            });
                            
                            // 替换第一个匹配到的颜色
                            valueWithVars = valueWithVars.replace(colorStr, `var(${variableName})`);

                            // 创建UI
                            const item = document.createElement('div');
                            item.className = 'theme-editor-item';
                            if(foundColors.length > 1) item.classList.add('multi-color');

                            const label = document.createElement('div');
                            label.className = 'theme-editor-label';
                            label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                            label.title = `${selector} { ${property}: ${value} }`;

                            const colorPicker = document.createElement('toolcool-color-picker');
                            
                            // 关键修复 1: 使用 setTimeout 解决初始化问题
                            setTimeout(() => {
                                if (colorStr.toLowerCase() === 'transparent') {
                                    colorPicker.color = 'rgba(0, 0, 0, 0)';
                                } else {
                                    colorPicker.color = colorStr;
                                }
                            }, 0);

                            // 关键修复 2: 事件监听器直接更新CSS变量
                            colorPicker.addEventListener('input', (event) => {
                                const newColor = event.detail.rgba || event.detail.hex;
                                updateLiveCssVariable(variableName, newColor);
                            });
                            
                            item.appendChild(label);
                            item.appendChild(colorPicker);
                            
                            // 如果是多颜色，先加主标题
                            if (foundColors.length > 1 && index === 0) {
                                const mainLabel = document.createElement('div');
                                mainLabel.className = 'theme-editor-main-label';
                                mainLabel.textContent = `${selector} ${property}`;
                                editorContainer.appendChild(mainLabel);
                            }
                            editorContainer.appendChild(item);
                        });
                        
                        declarationsWithColors.push(declaration);
                        // 更新整个规则块中的这个声明
                        processedDeclarations = processedDeclarations.replace(declarationMatch[0].slice(1), ` ${property}: ${valueWithVars}`);
                    }
                }
                finalCssRules += `${selector} { ${processedDeclarations} }\n`;
            }
            
            // 注入带有CSS变量的完整样式表
            liveStyleTag.textContent = finalCssRules;

            // 初始设置所有CSS变量的值
            declarationsWithColors.forEach(decl => {
                decl.colors.forEach(color => {
                    if (color.original.toLowerCase() === 'transparent') {
                        updateLiveCssVariable(color.variableName, 'rgba(0,0,0,0)');
                    } else {
                        updateLiveCssVariable(color.variableName, color.original);
                    }
                });
            });
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        // 初始运行并监听输入
        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v4 - CSS Variables) loaded successfully.");
    });
})();
