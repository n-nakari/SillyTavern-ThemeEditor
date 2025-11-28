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

        let colorEntries = [];

        const cssColorNames = [
            'transparent', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
        ];
        
        const colorProperties = ['color', 'background-color', 'background', 'background-image', 'border', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline', 'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke'];
        const colorValueRegex = new RegExp(`(rgba?\\([^)]+\\)|#([0-9a-fA-F]{3}){1,2}\\b|\\b(${cssColorNames.join('|')})\\b)`, 'g');
        
        // 核心：直接修改文本框并触发事件
        function applyChangesToTextarea() {
            let newCssText = customCssTextarea.value;
            
            // 为了处理文本长度变化，我们需要从后往前替换
            const sortedEntries = [...colorEntries].sort((a, b) => b.startIndex - a.startIndex);

            for (const entry of sortedEntries) {
                // 只替换已更改的颜色
                if (entry.current !== entry.original) {
                    newCssText = newCssText.substring(0, entry.startIndex) + entry.current + newCssText.substring(entry.endIndex);
                }
            }
            
            customCssTextarea.value = newCssText;
            customCssTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        }

        let isUpdatingByPicker = false; // 标志位，防止循环触发

        function parseAndBuildUI() {
            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = '';
            colorEntries = [];
            let uniqueId = 0;

            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let ruleMatch;

            while ((ruleMatch = ruleRegex.exec(cssText)) !== null) {
                const selector = ruleMatch[1].trim();
                const declarationsText = ruleMatch[2];
                const ruleStartIndex = ruleMatch.index;

                const declarationEntries = declarationsText.split(';').filter(d => d.trim());
                
                let currentDeclarationOffset = ruleStartIndex + ruleMatch[1].length + 1;

                declarationEntries.forEach(declStr => {
                    const parts = declStr.split(':');
                    if (parts.length < 2) {
                        currentDeclarationOffset += declStr.length + 1; // 移动偏移量
                        return;
                    }
                    const property = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    
                    if (colorProperties.includes(property.toLowerCase())) {
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
                            if (foundColors.length > 1) {
                                const mainLabel = document.createElement('div');
                                mainLabel.className = 'theme-editor-main-label';
                                mainLabel.textContent = `${selector} ${property}`;
                                editorContainer.appendChild(mainLabel);
                            }

                            foundColors.forEach((colorData, index) => {
                                const entry = {
                                    id: uniqueId++,
                                    original: colorData.text,
                                    current: colorData.text,
                                    startIndex: currentDeclarationOffset + declStr.indexOf(value) + colorData.index,
                                    endIndex: currentDeclarationOffset + declStr.indexOf(value) + colorData.index + colorData.text.length
                                };
                                colorEntries.push(entry);

                                const item = document.createElement('div');
                                item.className = 'theme-editor-item';
                                if (foundColors.length > 1) item.classList.add('multi-color');
                                
                                const label = document.createElement('div');
                                label.className = 'theme-editor-label';
                                label.textContent = foundColors.length > 1 ? `Color #${index + 1}` : `${selector} ${property}`;
                                label.title = `${selector} { ${property}: ${value} }`;

                                const colorPicker = document.createElement('toolcool-color-picker');
                                colorPicker.dataset.id = entry.id;

                                setTimeout(() => {
                                    colorPicker.color = entry.original.toLowerCase() === 'transparent' ? 'rgba(0,0,0,0)' : entry.original;
                                }, 0);

                                colorPicker.addEventListener('input', (event) => {
                                    if (isUpdatingByPicker) return; // 防止循环
                                    isUpdatingByPicker = true;
                                    
                                    const pickerId = parseInt(event.target.dataset.id);
                                    const targetEntry = colorEntries.find(e => e.id === pickerId);
                                    if (targetEntry) {
                                        targetEntry.current = event.detail.rgba || event.detail.hex;
                                        applyChangesToTextarea();
                                    }
                                    
                                    // 在短暂停顿后重置标志位
                                    setTimeout(() => { isUpdatingByPicker = false; }, 50); 
                                });
                            
                                item.appendChild(label);
                                item.appendChild(colorPicker);
                                editorContainer.appendChild(item);
                            });
                        }
                    }
                    currentDeclarationOffset += declStr.length + 1; // 更新到下一个声明的开始位置
                });
            }
        }

        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500);
        }

        parseAndBuildUI();

        customCssTextarea.addEventListener('input', () => {
            // 如果是我们的扩展正在更新，则不要重新解析UI，避免死循环
            if (isUpdatingByPicker) {
                // 更新完成后，我们需要重新计算所有颜色条目的位置
                // 因为文本长度可能已经改变
                const currentCss = customCssTextarea.value;
                for (const entry of colorEntries) {
                    const newIndex = currentCss.indexOf(entry.current, entry.startIndex - 5); // 在旧位置附近搜索新颜色
                    if (newIndex !== -1) {
                        entry.startIndex = newIndex;
                        entry.endIndex = newIndex + entry.current.length;
                        entry.original = entry.current; // 将当前颜色设为新的“原始”颜色
                    }
                }
                return;
            }
            // 如果是用户手动输入，则重新构建整个UI
            debouncedParse();
        });

        console.log("Theme Editor extension (v7 - Final Simulation) loaded successfully.");
    });
})();
