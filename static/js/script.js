document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const clearButton = document.getElementById('clear-btn');
    const toolsList = document.getElementById('tools-list');
    const refreshToolsButton = document.getElementById('refresh-tools-btn');

    // 添加折叠/展开功能的事件委托
    chatMessages.addEventListener('click', function(event) {
        console.log("点击事件触发", event.target);

        // 检查是否点击了思考过程或工具调用的标题
        const thinkingHeader = event.target.closest('.thinking-header');
        const toolCallHeader = event.target.closest('.tool-call-header');

        if (thinkingHeader) {
            console.log("点击了思考过程标题");
            const thinkingSection = thinkingHeader.parentElement;
            thinkingSection.classList.toggle('expanded');
            console.log("思考部分展开状态:", thinkingSection.classList.contains('expanded'));
        } else if (toolCallHeader) {
            console.log("点击了工具调用标题");
            const toolCallSection = toolCallHeader.parentElement;
            toolCallSection.classList.toggle('expanded');
            console.log("工具调用展开状态:", toolCallSection.classList.contains('expanded'));
        }
    });

    function createCollapsibleSection(container, headerClass, headerText) {
        console.log("创建可折叠部分:", headerClass, headerText);
        const section = document.createElement('div');
        section.className = headerClass + '-section expanded';

        const header = document.createElement('div');
        header.className = headerClass + '-header';
        header.textContent = headerText;
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.textContent = '▼';
        header.appendChild(toggleIcon);

        const content = document.createElement('div');
        content.className = headerClass + '-content';

        section.appendChild(header);
        section.appendChild(content);

        container.appendChild(section);
        return content;
    }

    // 发送消息
    async function sendMessage() { // 改为异步函数以适应EventSource的用法
        const message = userInput.value.trim();

        if (message === '') {
            return;
        }

        // 添加用户消息到聊天界面
        addMessage('user', message);

        // 清空输入框
        userInput.value = '';

        // 显示加载动画
        const loadingElement = addLoading();

        // 使用EventSource处理流式响应
        const eventSource = new EventSource(`/api/chat?message=${encodeURIComponent(message)}`);
        let assistantMessageDiv = null;
        let currentAssistantMessage = '';

        let currentSection = 0;
        let currentContainer = null;
        let contentDiv = null;
        let contentBuffer = '';


        eventSource.onmessage = function(event) {
            // 移除加载动画 (如果存在且是第一条消息)
            if (loadingElement && !assistantMessageDiv) {
                loadingElement.remove();
            }

            const data = event.data;
            // console.log(data)
            if (data === "[DONE]") {
                if(currentContainer){
                    currentContainer.innerHTML = marked.parse(currentContainer.innerHTML);
                }
                eventSource.close();
                scrollToBottom();
                return;
            }

            if (data.startsWith("[ERROR]")) {
                const errorMessage = data.substring("[ERROR]".length).trim();
                addMessage('system', `错误: ${errorMessage}`);
                eventSource.close();
                scrollToBottom();
                return;
            }

            // 完整的助手信息
            currentAssistantMessage += data;

            if (!assistantMessageDiv) {
                // 创建助手消息的容器
                assistantMessageDiv = document.createElement('div');
                assistantMessageDiv.className = 'message assistant';
                contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                assistantMessageDiv.appendChild(contentDiv);
                chatMessages.appendChild(assistantMessageDiv);

                currentContainer = contentDiv;
                scrollToBottom();
            }

            // 处理流式输出
            contentBuffer += data;
            if(contentBuffer.includes("</think>")){
                if(currentSection === 1){
                    currentSection = 0;
                    currentContainer.innerHTML = contentBuffer.replace("</think>", "").replace("<think>", "");
                    contentBuffer = '';
                }
            }
            else if(contentBuffer.includes("</tool>")){
                if(currentSection === 2){
                    currentSection = 0;
                    currentContainer.innerHTML = contentBuffer.replace("</tool>", "").replace("<tool>", "");
                    contentBuffer = '';
                }
            }
            else if(contentBuffer.includes("</tool_result>")){
                if(currentSection === 3){
                    currentSection = 0;
                    currentContainer.innerHTML = contentBuffer.replace("</tool_result>", "").replace("<tool_result>", "");
                    contentBuffer = '';
                }
            }
            // console.log("contentBuffer:", contentBuffer);

            if(contentBuffer){
                if(contentBuffer.includes("<think>")){
                    if(currentSection != 1){
                        currentSection = 1;
                        currentContainer.innerHTML = marked.parse(currentContainer.innerHTML);
                        currentContainer = createCollapsibleSection(contentDiv, "thinking", "思考过程");
                    }
                    currentContainer.innerHTML += data.replace("<think>", "");
                }
                else if(contentBuffer.includes("<tool>")){
                    if(currentSection != 2){
                        currentSection = 2;
                        currentContainer.innerHTML = marked.parse(currentContainer.innerHTML);
                        currentContainer = createCollapsibleSection(contentDiv, "tool-call", "工具调用");
                    }
                    currentContainer.innerHTML += data.replace("<tool>", "");
                }
                else if(contentBuffer.includes("<tool_result>")){
                    if(currentSection != 3){
                        currentSection = 3;
                        currentContainer.innerHTML = marked.parse(currentContainer.innerHTML);
                        currentContainer = createCollapsibleSection(contentDiv, "tool-call", "工具结果");
                    }
                    currentContainer.innerHTML += data.replace("<tool_result>", "");
                }
                else if(!contentBuffer.slice(-12).includes("<")){
                    currentSection = 0;
                    currentContainer = contentDiv;
                    currentContainer.innerHTML += data;
                }
                if(contentBuffer.includes("</think>") || contentBuffer.includes("</tool>") || contentBuffer.includes("</tool_result>")){
                    currentSection = 0;
                    contentBuffer = '';
                }
            }

            // console.log(chatMessages.scrollTop , chatMessages.scrollHeight, chatMessages.clientHeight, chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight);

            if (isAtBottom()) {
                scrollToBottom();
            }

        };

        eventSource.onerror = function(error) {
            console.error("EventSource failed:", error);
            eventSource.close();
            // 移除加载动画
            if (loadingElement) {
                loadingElement.remove();
            }
            addMessage('system', '与服务器的连接发生错误，请稍后再试。');
            scrollToBottom();
        };
    }

    // 添加消息到聊天界面
    function addMessage(role, content) {
        console.log(`添加${role}消息:`, content.substring(0, 50) + "...");

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // 检查是否包含思考过程或工具调用
        const hasThinking = content.includes('<think>');
        const hasToolCall = content.includes('<tool>');
        const hasToolResult = content.includes('<tool_result>');

        console.log("消息包含思考过程:", hasThinking);
        console.log("消息包含工具调用:", hasToolCall);
        console.log("消息包含工具结果:", hasToolResult);

        // 处理格式化
        if (hasThinking || hasToolCall || hasToolResult) {
            content = formatMessage(content);
        }

        contentDiv.innerHTML = content;

        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);

        // 滚动到底部
        scrollToBottom();
    }

    // 格式化消息内容（处理代码块、链接、思考过程、工具调用和换行）
    // 备注：用于处理完整的消息
    function formatMessage(content) {
        // 首先处理换行，以便后续处理
        let formatted = content;

        // 处理思考过程 <think>...</think>
        const thinkingRegex = /<think>([\s\S]*?)<\/think>/g;
        formatted = formatted.replace(thinkingRegex, function(_, thinking) {
            console.log("找到思考过程:", thinking.substring(0, 50) + "...");
            return `<div class="thinking-section">
                <div class="thinking-header">
                    思考过程 <span class="toggle-icon">▼</span>
                </div>
                <div class="thinking-content">${thinking}</div>
            </div>`;
        });

        // 处理工具调用 - 使用新的XML标记格式
        // 处理工具调用请求
        const toolCallRegex = /<tool>([\s\S]*?)<\/tool>/g;
        let toolCallMatch;

        while ((toolCallMatch = toolCallRegex.exec(formatted)) !== null) {
            console.log("检测到工具调用请求");

            try {
                // 提取工具调用JSON
                const toolCallJson = toolCallMatch[1].trim();
                console.log("工具调用JSON:", toolCallJson);

                // 解析JSON
                const toolData = JSON.parse(toolCallJson);
                const toolName = toolData.name || '未知工具';
                const toolParams = toolData.parameters || {};

                // 格式化参数
                let paramsStr = '';
                for (const [key, value] of Object.entries(toolParams)) {
                    paramsStr += `  "${key}": ${JSON.stringify(value)},\n`;
                }
                if (paramsStr) {
                    paramsStr = paramsStr.slice(0, -2); // 移除最后的逗号和换行符
                }

                // 创建工具调用的HTML
                const toolCallHtml = `<div class="tool-call-section">
                    <div class="tool-call-header">
                        工具调用: ${toolName} <span class="toggle-icon">▼</span>
                    </div>
                    <div class="tool-call-content">
<pre><code>{
  "name": "${toolName}",
  "parameters": {
${paramsStr}
  }
}</code></pre>
                    </div>
                </div>`;

                // 替换原始内容
                formatted = formatted.replace(toolCallMatch[0], toolCallHtml);
            } catch (e) {
                console.error("解析工具调用JSON时出错:", e);
            }
        }

        // 处理工具调用结果
        const toolResultRegex = /<tool_result>([\s\S]*?)<\/tool_result>/g;
        let toolResultMatch;

        while ((toolResultMatch = toolResultRegex.exec(formatted)) !== null) {
            console.log("检测到工具调用结果");

            try {
                // 提取工具结果JSON
                const toolResultJson = toolResultMatch[1].trim();
                // 解析JSON
                const resultData = JSON.parse(toolResultJson);
                const toolName = resultData.name || '未知工具';
                const result = resultData.result || '';

                // 创建工具结果的HTML
                const toolResultHtml = `<div class="tool-call-section">
                    <div class="tool-call-header">
                        工具结果: ${toolName} <span class="toggle-icon">▼</span>
                    </div>
                    <div class="tool-call-content">
<pre><code>${result}</code></pre>
                    </div>
                </div>`;

                // 替换原始内容
                formatted = formatted.replace(toolResultMatch[0], toolResultHtml);
            } catch (e) {
                console.error("解析工具结果JSON时出错:", e);
            }
        }

        // 替换代码块
        formatted = formatted.replace(/```([\s\S]*?)```/g, '$1');

        // 替换单行代码
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 替换URL为链接
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // 添加调试信息
        console.log("最终格式化结果包含思考部分:", formatted.includes("thinking-section"));
        console.log("最终格式化结果包含工具调用:", formatted.includes("tool-call-section"));

        return formatted;
    }

    // 添加加载动画
    function addLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message assistant loading';

        const loadingContent = document.createElement('div');
        loadingContent.className = 'message-content loading-dots';

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            loadingContent.appendChild(dot);
        }

        loadingDiv.appendChild(loadingContent);
        chatMessages.appendChild(loadingDiv);

        // 滚动到底部
        scrollToBottom();

        return loadingDiv;
    }

    // 判断是否在底部附近（容忍一定误差）
    function isAtBottom(threshold = 30) {
        const tolerance = threshold;
        const atBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight <= tolerance;
        return atBottom;
    }

    // 滚动到底部
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 清除对话历史
    function clearChat() {
        // 发送请求到服务器
        fetch('/api/clear', {
            method: 'POST',
        })
        .then(response => response.json())
        .then(responseData => {
            console.log("清除历史响应:", responseData);

            // 清空聊天界面，只保留欢迎消息
            chatMessages.innerHTML = '';

            // 添加系统消息
            addMessage('system', '对话历史已清除');
        })
        .catch(error => {
            // 显示错误消息
            addMessage('system', `清除历史时出错: ${error.message}`);
        });
    }

    // 获取工具列表
    function fetchTools() {
        toolsList.innerHTML = '<div class="loading-tools">加载中...</div>';

        fetch('/api/tools')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    displayTools(data.tools_by_server);
                } else {
                    toolsList.innerHTML = '<div class="loading-tools">加载工具列表失败</div>';
                }
            })
            .catch(error => {
                console.error('获取工具列表时出错:', error);
                toolsList.innerHTML = '<div class="loading-tools">加载工具列表失败: ' + error.message + '</div>';
            });
    }

    // 显示工具列表
    function displayTools(toolsByServer) {
        toolsList.innerHTML = '';

        if (Object.keys(toolsByServer).length === 0) {
            toolsList.innerHTML = '<div class="loading-tools">没有可用的工具</div>';
            return;
        }

        for (const serverName in toolsByServer) {
            const tools = toolsByServer[serverName];

            if (tools.length === 0) continue;

            const serverGroup = document.createElement('div');
            serverGroup.className = 'server-group';

            const serverNameElement = document.createElement('div');
            serverNameElement.className = 'server-name';
            serverNameElement.innerHTML = serverName + ' <span class="toggle-icon">▼</span>';
            serverNameElement.addEventListener('click', function() {
                this.classList.toggle('expanded');
                const toolsContainer = this.nextElementSibling;
                if (toolsContainer.style.display === 'none') {
                    toolsContainer.style.display = 'block';
                    this.querySelector('.toggle-icon').textContent = '▼';
                } else {
                    toolsContainer.style.display = 'none';
                    this.querySelector('.toggle-icon').textContent = '▶';
                }
            });

            const toolsContainer = document.createElement('div');
            toolsContainer.className = 'server-tools';

            for (const tool of tools) {
                const toolItem = document.createElement('div');
                toolItem.className = 'tool-item';

                const toolName = document.createElement('div');
                toolName.className = 'tool-name';
                toolName.textContent = tool.name;

                const toolDescription = document.createElement('div');
                toolDescription.className = 'tool-description';
                toolDescription.textContent = tool.description;

                toolItem.appendChild(toolName);
                toolItem.appendChild(toolDescription);
                toolsContainer.appendChild(toolItem);
            }

            serverGroup.appendChild(serverNameElement);
            serverGroup.appendChild(toolsContainer);
            toolsList.appendChild(serverGroup);
        }
    }

    // 事件监听器
    sendButton.addEventListener('click', sendMessage);

    userInput.addEventListener('keydown', function(event) {
        
        // 按下Enter发送消息
        if (!event.shiftKey && event.key === 'Enter') {
            sendMessage();
            event.preventDefault();
        }
    });

    clearButton.addEventListener('click', clearChat);

    refreshToolsButton.addEventListener('click', fetchTools);

    // 初始化
    fetchTools();
    scrollToBottom();
});
