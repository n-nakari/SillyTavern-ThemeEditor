(function () {
    // 等待SillyTavern完全加载
    $(document).ready(function () {
        // 获取关键的DOM元素
        const customCssTextarea = document.getElementById('customCSS');
        const customCssBlock = document.getElementById('CustomCSS-block');

        if (!customCssTextarea || !customCssBlock) {
            console.error("Theme Editor: Could not find essential UI elements.");
            return;
        }

        // 创建用于存放我们动态UI的容器
        const editorContainer = document.createElement('div');
        editorContainer.id = 'theme-editor-container';
        
        // 创建一个标题
        const title = document.createElement('h4');
        title.textContent = 'Live Theme Editor';
        title.style.marginTop = '15px';

        // 将我们的容器和标题插入到“自定义CSS”框之后
        customCssBlock.parentNode.insertBefore(title, customCssBlock.nextSibling);
        title.parentNode.insertBefore(editorContainer, title.nextSibling);

        // 创建一个style标签用于实时注入覆盖样式
        let liveStyleTag = document.getElementById('theme-editor-live-styles');
        if (!liveStyleTag) {
            liveStyleTag = document.createElement('style');
            liveStyleTag.id = 'theme-editor-live-styles';
            document.head.appendChild(liveStyleTag);
        }

        // 用来存储解析出的颜色信息
        let colorEntries = [];

        // 更新实时样式的函数
        function updateLiveStyles() {
            const newCssRules = colorEntries.map(entry => {
                // 为每个选择器和属性生成一个新的CSS规则
                return `${entry.selector} { ${entry.property}: ${entry.currentColor} !important; }`;
            }).join('\n');
            liveStyleTag.textContent = newCssRules;
        }

        // 解析CSS并构建UI的核心函数
        function parseAndBuildUI() {
            const cssText = customCssTextarea.value;
            editorContainer.innerHTML = ''; // 清空旧的UI
            colorEntries = [];

            // 正则表达式来匹配CSS规则 (选择器 + { ... })
            // 这是一个简化的版本，对于复杂的CSS可能不完美，但对大多数情况有效
            const ruleRegex = /([^{}]+)\s*\{\s*([^}]+)\s*}/g;
            let match;

            while ((match = ruleRegex.exec(cssText)) !== null) {
                const selector = match[1].trim();
                const declarations = match[2];

                // 正则表达式来匹配颜色属性和值
                const colorRegex = /([a-zA-Z-]+)\s*:\s*([^;]+(rgba?\(.+?\)|#([0-9a-fA-F]{3}){1,2}|[a-zA-Z]+))/g;
                let declarationMatch;

                while ((declarationMatch = colorRegex.exec(declarations)) !== null) {
                    const property = declarationMatch[1].trim();
                    const value = declarationMatch[2].trim();
                    
                    // 过滤掉不是纯颜色的值 (例如包含 url() 的)
                    if (value.includes('url(')) continue;

                    const entry = {
                        id: `theme-editor-${colorEntries.length}`,
                        selector: selector,
                        property: property,
                        originalColor: value,
                        currentColor: value
                    };
                    colorEntries.push(entry);

                    // 创建UI元素
                    const item = document.createElement('div');
                    item.className = 'theme-editor-item';

                    const label = document.createElement('div');
                    label.className = 'theme-editor-label';
                    label.textContent = `${selector} ${property}`;
                    label.title = `${selector} { ${property}: ${value} }`;

                    const colorPicker = document.createElement('toolcool-color-picker');
                    colorPicker.color = entry.originalColor;

                    // 监听颜色变化事件
                    colorPicker.addEventListener('change', (event) => {
                        entry.currentColor = event.detail.hex;
                        updateLiveStyles();
                    });

                    item.appendChild(label);
                    item.appendChild(colorPicker);
                    editorContainer.appendChild(item);
                }
            }
            // 初始应用一次样式
            updateLiveStyles();
        }

        // 使用debounce来防止过于频繁地解析CSS
        let debounceTimer;
        function debouncedParse() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(parseAndBuildUI, 500); // 延迟500毫秒执行
        }

        // 当页面加载时和“自定义CSS”框内容改变时，触发解析
        parseAndBuildUI();
        customCssTextarea.addEventListener('input', debouncedParse);

        console.log("Theme Editor extension loaded successfully.");
    });
})();
