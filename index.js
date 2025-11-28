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

        // 我们自己的<style>标签，完全由我们控制
        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }

        // 关键：找到并禁用SillyTavern的原生自定义CSS标签，接管其功能
        const sillyTavernStyleTag = document.getElementById('custom-css');
        if (sillyTavernStyleTag) {
            sillyTavernStyleTag.disabled = true;
        }

        // 存储颜色数据和静态CSS规则的全局变量
        let allColors = [];
        let staticRuleBlock = '';

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'gi');

        // 核心：全局重新渲染函数
        function renderAllStyles() {
            // 1. 构建 :root 块，包含所有变量的当前值
            let rootBlock = ':root {';
            allColors.forEach(colorInfo => {
                rootBlock += `${colorInfo.variableName}: ${colorInfo.current}; `;
            });
            rootBlock += '}';

            // 2. 将 :root 块和静态规则块合并，并一次性写入 <style> 标签
            liveStyleTag.textContent = rootBlock + '\n' + staticRuleBlock;
        }

        // 解析CSS，创建UI，并准备好渲染所需的数据
        function parseAndBuildUI() {
            if (sillyTavernStyleTag) sillyTavernStyleTag.disabled = true;

            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            allColors = [];
            staticRuleBlock = '';
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
                        const foundColors = [...value.matchAll(colorValueRegex)].map(m => m[0]);
                        
                        if (foundColors.length > 0) {
                            let replacementMade = false;
                            
                            foundColors.forEach((colorStr, index) => {
                                const variableName = `--theme-editor-color-${uniqueId}`;
                                uniqueId++;
                                
                                const colorInfo = {
                                    original: colorStr,
                                    current: colorStr.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : colorStr,
                                    variableName: variableName
                                };
                                allColors.push(colorInfo);
                                
                                tempValue = tempValue.replace(colorStr, `var(${variableName})`);
                                replacementMade = true;

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
                                    colorPicker.color = colorInfo.current;
                                }, 0);

                                // 关键：事件监听器现在只更新数据模型，然后调用全局渲染
                                colorPicker.addEventListener('input', (event) => {
                                    const newColor = event.detail.rgba || event.detail.hex;
                                    colorInfo.current = newColor;
                                    renderAllStyles();
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

                            if (replacementMade) {
                                processedDeclarations = processedDeclarations.replace(declarationString, ` ${property}: ${tempValue} `);
                            }
                        }
                    }
                });
                
                staticRuleBlock += `${selector} { ${processedDeclarations} }\n`;
            }
            
            // 初始渲染
            renderAllStyles();
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
