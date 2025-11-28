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

        // 我们不再需要自己的 <style> 标签了
        // let liveStyleTag = document.getElementById('theme-editor-live-styles'); ...

        // 存储所有解析出的颜色信息，这次包含位置信息
        let colorEntries = [];
        let originalCssText = '';

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitespoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorPropertiesRegex = new RegExp(`(${colorProperties.join('|')})\\s*:([^;]+)`, 'gi');
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'g');
        
        // 核心函数：构建新的CSS字符串并更新文本框
        function applyChangesToTextarea() {
            let newCssText = originalCssText;
            
            // 从后往前替换，以避免索引错乱
            const sortedEntries = [...colorEntries].sort((a, b) => b.startIndex - a.startIndex);

            for (const entry of sortedEntries) {
                newCssText = newCssText.substring(0, entry.startIndex) + entry.current + newCssText.substring(entry.endIndex);
            }
            
            customCssTextarea.value = newCssText;
            // 关键：触发SillyTavern的内置更新机制
            customCssTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function parseAndBuildUI() {
            originalCssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            colorEntries = [];
            let uniqueId = 0;

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(originalCssText)) !== null) {
                const selector = ruleMatch[1].trim();
                const declarationsText = ruleMatch[2];
                const ruleStartIndex = ruleMatch.index;

                colorPropertiesRegex.lastIndex = 0;
                let declarationMatch;
                
                while((declarationMatch = colorPropertiesRegex.exec(declarationsText)) !== null) {
                    const property = declarationMatch[1].trim();
                    const value = declarationMatch[2].trim();
                    const declarationStartIndex = ruleStartIndex + ruleMatch[1].length + 1 + declarationMatch.index;
                    
                    let colorMatch;
                    colorValueRegex.lastIndex = 0;
                    
                    const foundColors = [];
                    while ((colorMatch = colorValueRegex.exec(value)) !== null) {
                        foundColors.push({
                            text: colorMatch[0],
                            index: colorMatch.index
                        });
                    }

                    if (foundColors.length > 0) {
                        // 为这个声明（如 box-shadow）创建一个主标题
                        if (foundColors.length > 1) {
                            const mainLabel = document.createElement('div');
                            mainLabel.className = 'theme-editor-main-label';
                            mainLabel.textContent = `${selector} ${property}`;
                            editorContainer.appendChild(mainLabel);
                        }
                        
                        foundColors.forEach((colorData, index) => {
                            const entry = {
                                id: uniqueId++,
                                selector: selector,
                                property: property,
                                original: colorData.text,
                                current: colorData.text,
                                // 计算颜色在整个CSS文本中的精确位置
                                startIndex: declarationStartIndex + value.indexOf(colorData.text, colorData.index),
                                endIndex: declarationStartIndex + value.indexOf(colorData.text, colorData.index) + colorData.text.length
                            };
                            colorEntries.push(entry);

                            const item = document.createElement('div');
                            item.className = 'theme-editor-item';
                            if(foundColors.length > 1) item.classList.add('multi-color');

                            const label = document.createElement('div');
                            label.className = 'theme-editor-label';
                            label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                            label.title = `${selector} { ${property}: ${value} }`;

                            const colorPicker = document.createElement('toolcool-color-picker');
                            colorPicker.dataset.id = entry.id;

                            setTimeout(() => {
                                if (entry.original.toLowerCase() === 'transparent') {
                                    colorPicker.color = 'rgba(0, 0, 0, 0)';
                                } else {
                                    colorPicker.color = entry.original;
                                }
                            }, 0);

                            colorPicker.addEventListener('input', (event) => {
                                const pickerId = parseInt(event.target.dataset.id);
                                const targetEntry = colorEntries.find(e => e.id === pickerId);
                                if (targetEntry) {
                                    targetEntry.current = event.detail.rgba || event.detail.hex;
                                    applyChangesToTextarea();
                                }
                            });
                            
                            item.appendChild(label);
                            item.appendChild(colorPicker);
                            editorContainer.appendChild(item);
                        });
                    }
                }
            }
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            // 只有当用户停止输入时才重新解析UI
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        // 初始运行并监听输入
        parseAndBuildUI();
        customCssTextarea.addEventListener('input', (event) => {
            // 如果事件不是由我们的扩展触发的（即是用户手动输入），则重新解析
            if (!event.isTrusted) return;
            debouncedParse();
        });

        console.log("Theme Editor extension (v6 - Direct Input Simulation) loaded successfully.");
    });
})();
