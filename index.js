(function () {
    $(document).ready(function () {
        // 关键DOM元素
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        // 创建UI容器
        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';
        
        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.style.marginTop = '15px';

        // 插入UI到页面
        customCssBlock.parentNode.insertBefore(title, customCssBlock.nextSibling);
        title.parentNode.insertBefore(editorContainer, title.nextSibling);

        // 创建用于注入实时样式的 <style> 标签
        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }

        // 存储所有解析出的CSS声明及其颜色信息
        let declarationsWithColors = [];

        // 包含 "transparent" 的CSS颜色名称列表
        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        // 我们关心的CSS属性
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorPropertiesRegex = new RegExp(`(?:^|;)\\s*(${colorProperties.join('|')})\\s*:([^;]+)`, 'gi');
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        // 使用占位符系统来更新样式
        function updateLiveStyles() {
            const newCssRules = declarationsWithColors.map(declaration => {
                let finalValue = declaration.templateValue;
                declaration.colors.forEach(color => {
                    finalValue = finalValue.replace(color.placeholder, color.current);
                });
                return `${declaration.selector} { ${declaration.property}: ${finalValue} !important; }`;
            }).join('\n');
            liveStyleTag.textContent = newCssRules;
        }

        // 解析CSS并构建UI
        function parseAndBuildUI() {
            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            declarationsWithColors = [];
            let declarationCounter = 0;

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
                        let templateValue = value;
                        const declaration = {
                            selector: selector,
                            property: property,
                            templateValue: '',
                            colors: []
                        };

                        foundColors.forEach((color, index) => {
                            const placeholder = `__THEME_EDITOR_COLOR_${declarationCounter}_${index}__`;
                            templateValue = templateValue.replace(color, placeholder);
                            declaration.colors.push({
                                original: color,
                                current: color,
                                placeholder: placeholder
                            });
                        });
                        declaration.templateValue = templateValue;
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
                            
                            // 正确设置初始颜色，特别是处理 'transparent'
                            if (color.original.toLowerCase() === 'transparent') {
                                colorPicker.color = 'rgba(0, 0, 0, 0)';
                            } else {
                                colorPicker.color = color.original;
                            }

                            colorPicker.addEventListener('input', (event) => {
                                const newColor = event.detail.rgba ? event.detail.rgba : event.detail.hex;
                                color.current = newColor;
                                updateLiveStyles();
                            });
                            
                            item.appendChild(label);
                            item.appendChild(colorPicker);
                            editorContainer.appendChild(item);
                        });
                        declarationCounter++;
                    }
                }
            }
            // 初始加载时应用一次样式，以防万一
            updateLiveStyles();
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        // 初始运行并监听输入
        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension (v3) loaded successfully.");
    });
})();
