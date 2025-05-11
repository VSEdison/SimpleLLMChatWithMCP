document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const clearButton = document.getElementById('clear-btn');
    const toolsList = document.getElementById('tools-list');
    const refreshToolsButton = document.getElementById('refresh-tools-btn');

    
    // WebSocket连接
    let ws = null;
    let isConnecting = false;

    // 创建WebSocket连接
    function createWebSocketConnection() {
        if (ws !== null || isConnecting) {
            return;
        }

        isConnecting = true;

        // 创建WebSocket连接
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;

        console.log("创建WebSocket连接:", wsUrl);
        ws = new WebSocket(wsUrl);

        // 连接建立时的处理
        ws.onopen = function() {
            console.log("WebSocket连接已建立");
            isConnecting = false;
        };

        // 连接关闭时的处理
        ws.onclose = function() {
            console.log("WebSocket连接已关闭");
            ws = null;
            isConnecting = false;
        };

        // 连接错误时的处理
        ws.onerror = function(error) {
            console.error("WebSocket错误:", error);
            isConnecting = false;
        };
    }

    // 确保WebSocket连接已建立
    function ensureWebSocketConnection() {
        return new Promise((resolve, reject) => {
            if (ws !== null && ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            createWebSocketConnection();

            // 如果连接正在建立中，等待连接建立
            const checkInterval = setInterval(() => {
                if (ws !== null && ws.readyState === WebSocket.OPEN) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (!isConnecting && ws === null) {
                    clearInterval(checkInterval);
                    reject(new Error("无法建立WebSocket连接"));
                }
            }, 100);
        });
    }

    // 发送消息
    async function sendMessage() {
        const message = userInput.value.trim();

        if (message === '') {
            return;
        }
        console.log("发送消息:", message);
        // 添加用户消息到聊天界面
        addMessage('user', message);

        // 清空输入框
        userInput.value = '';

        // 显示加载动画
        const loadingElement = addLoading();

        let assistantMessageDiv = null;

        // 旧代码变量
        // let currentAssistantMessage = '';

        // let currentSection = 0;
        // let currentContainer = null;
        // let contentDiv = null;
        // let contentBuffer = '';

        // 记录是否已经完成，避免重复处理
        let isCompleted = false;

        try {
            // 确保WebSocket连接已建立
            await ensureWebSocketConnection();
			// --- 首先，定义一些辅助变量和配置 ---
			const tagConfig = {
				"think": { open: "<think>", close: "</think>", summaryText: "🤔 思考过程", className: "think" },
				"tool": { open: "<tool>", close: "</tool>", summaryText: "🛠️ 使用工具", className: "tool" },
				"tool_result": { open: "<tool_result>", close: "</tool_result>", summaryText: "📋 工具结果", className: "tool-result" }
				// 可以根据需要添加更多标签
			};

			let streamBuffer = ""; // 用于累积流式数据
			let activeCollapsibleSectionContent = null; // 当前活动的折叠框内容DOM元素
			let activeCollapsibleTagKey = null; // 当前活动折叠框的标签类型 ('think', 'tool', etc.)
			let mainContentContainer = null; // 指向主要的聊天消息内容区域 (之前代码中的 contentDiv)


			// 增加了点击切换展开/折叠的逻辑，并确保返回的是内容容器
			function createCollapsibleSection(container, baseClassName, headerText) {
				console.log("创建可折叠部分:", baseClassName, headerText);
				const section = document.createElement('div');
				// 初始折叠，'expanded' 使其默认展开
				section.className = `${baseClassName}-section expanded`; 

				const header = document.createElement('div');
				header.className = `${baseClassName}-header`;
				
				const toggleIcon = document.createElement('span');
				toggleIcon.className = 'toggle-icon';
				toggleIcon.textContent = '▼'; // 折叠时的图标
				header.appendChild(toggleIcon);

				const headerTitle = document.createElement('span'); // 用于标题文本
				headerTitle.className = 'header-title';
				headerTitle.textContent = " " + headerText; // 加个空格与图标分开
				header.appendChild(headerTitle);


				const content = document.createElement('div');
				content.className = `${baseClassName}-content`;
				content.style.display = 'block'; // 初始隐藏内容

				section.appendChild(header);
				section.appendChild(content);

				header.onclick = function() {
					const isCollapsed = section.classList.contains('collapsed');
					if (isCollapsed) {
						section.classList.remove('collapsed');
						section.classList.add('expanded');
						content.style.display = 'block';
						toggleIcon.textContent = '▼'; // 展开时的图标
					} else {
						section.classList.remove('expanded');
						section.classList.add('collapsed');
						content.style.display = 'none';
						toggleIcon.textContent = '▶'; // 折叠时的图标
					}
				};

				container.appendChild(section);
				return content; // 返回内容容器，以便向其中添加文本
			}

			// --- 辅助函数：查找最早出现的开始标签 ---
			function findEarliestOpeningTag(text) {
				let earliestMatch = null;
				for (const key in tagConfig) {
					const tagInfo = tagConfig[key];
					const index = text.indexOf(tagInfo.open);
					if (index !== -1) {
						if (earliestMatch === null || index < earliestMatch.index) {
							earliestMatch = { key, index, config: tagInfo };
						}
					}
				}
				return earliestMatch;
			}

			// --- 辅助函数：安全地追加文本到容器，处理 pre-wrap ---
			function appendTextToContainer(container, text) {
				if (!container || !text) return;

				// 如果容器内最后一个子节点是文本节点，则追加到该文本节点
				// 否则，创建一个新的文本节点
				// 这有助于在流式输出时，文本看起来是连续的，而不是每块数据一个新行（除非文本本身包含换行）
				if (container.lastChild && container.lastChild.nodeType === Node.TEXT_NODE) {
					container.lastChild.textContent += text;
				} else {
					const textNode = document.createTextNode(text);
					container.appendChild(textNode);
				}
			}

			// --- 核心处理函数：处理缓冲区中的流数据 ---
			function processStreamBuffer() {
				let currentTargetContainer = activeCollapsibleSectionContent || mainContentContainer;
				if (!currentTargetContainer) return; // 如果还没有主容器，则不处理

				// eslint-disable-next-line no-constant-condition
				while (true) {
					const initialBufferLength = streamBuffer.length;
					let processedThisIteration = false;

					if (activeCollapsibleSectionContent) { // 当前在折叠框内
						const closeTag = tagConfig[activeCollapsibleTagKey].close;
						const closeTagIndex = streamBuffer.indexOf(closeTag);

						if (closeTagIndex !== -1) { // 找到完整的结束标签
							const content = streamBuffer.substring(0, closeTagIndex);
							appendTextToContainer(activeCollapsibleSectionContent, content);
							// 可选：在关闭折叠框时对其内容进行 Markdown 解析
							activeCollapsibleSectionContent.innerHTML = marked.parse(activeCollapsibleSectionContent.innerHTML);

							streamBuffer = streamBuffer.substring(closeTagIndex + closeTag.length);
							
							// 关闭当前折叠框
							activeCollapsibleSectionContent = null;
							activeCollapsibleTagKey = null;
							currentTargetContainer = mainContentContainer; // 切换回主容器
							processedThisIteration = true;
						} else {
							// 未找到完整结束标签，将当前缓冲区中不可能是部分结束标签的内容追加
							let appendableContent = streamBuffer;
							// 检查缓冲区末尾是否是部分结束标签
							for (let i = closeTag.length - 1; i > 0; i--) {
								if (streamBuffer.endsWith(closeTag.substring(0, i))) {
									appendableContent = streamBuffer.substring(0, streamBuffer.length - closeTag.substring(0, i).length);
									break;
								}
							}
							if (appendableContent) {
							appendTextToContainer(activeCollapsibleSectionContent, appendableContent);
							streamBuffer = streamBuffer.substring(appendableContent.length);
							}
							// 如果缓冲区有变化，说明处理了数据
							if (streamBuffer.length < initialBufferLength) processedThisIteration = true;
							break; // 等待更多数据来形成完整的结束标签
						}
					} else { // 当前不在折叠框内，寻找开始标签
						const earliestOpenTagMatch = findEarliestOpeningTag(streamBuffer);

						if (earliestOpenTagMatch) {
							// 将开始标签前的文本添加到主容器
							const plainTextBeforeTag = streamBuffer.substring(0, earliestOpenTagMatch.index);
							appendTextToContainer(mainContentContainer, plainTextBeforeTag);

							// 创建新的折叠框
							const tagKey = earliestOpenTagMatch.key;
							const tagInfo = earliestOpenTagMatch.config;
							activeCollapsibleSectionContent = createCollapsibleSection(
								mainContentContainer, // 折叠框添加到主内容容器
								tagInfo.className,
								tagInfo.summaryText
							);
							activeCollapsibleTagKey = tagKey;
							currentTargetContainer = activeCollapsibleSectionContent; // 新内容进入新折叠框

							streamBuffer = streamBuffer.substring(earliestOpenTagMatch.index + tagInfo.open.length);
							processedThisIteration = true;
						} else {
							// 没有找到开始标签，将整个（或部分）缓冲区视为普通文本
							// 如果缓冲区以 '<' 开头，可能是不完整的标签，暂时不处理，等待更多数据
							if (streamBuffer.startsWith("<")) {
								// 如果没有其他处理发生，就跳出循环等待更多数据
							} else {
								// 如果包含 '<' 但不在开头，则输出'<'之前的内容
								const firstAngleBracket = streamBuffer.indexOf('<');
								if (firstAngleBracket > 0) {
									const plainText = streamBuffer.substring(0, firstAngleBracket);
									appendTextToContainer(mainContentContainer, plainText);
									streamBuffer = streamBuffer.substring(firstAngleBracket);
									processedThisIteration = true;
								} else if (firstAngleBracket === -1 && streamBuffer.length > 0) {
									// 没有'<'，全是普通文本
									appendTextToContainer(mainContentContainer, streamBuffer);
									streamBuffer = "";
									processedThisIteration = true;
								}
							}
							// 如果没有处理任何内容（例如，缓冲区只有 "<t"），则跳出等待更多数据
							if (!processedThisIteration) break;
						}
					}

					if (!processedThisIteration && streamBuffer.length > 0) {
						break; // 防止死循环，如果缓冲区有内容但无法处理，则等待新数据
					}
					if (streamBuffer.length === 0) break; // 缓冲区已空
				}
			}

            // 发送消息
            ws.send(JSON.stringify({ message: message }));
		
            // 处理接收到的消息
            ws.onmessage = function(event) {
                // 如果已经完成，忽略后续消息
                if (isCompleted) {
                    return;
                }

                // 移除加载动画 (如果存在且是第一条消息)
                if (loadingElement && !assistantMessageDiv) {
                    loadingElement.remove();
                }

                const data = event.data;

                // 处理特殊消息
                if (data === "[DONE]") {
					if (streamBuffer.length > 0) {
						const target = activeCollapsibleSectionContent || mainContentContainer;
						if (target) {
							appendTextToContainer(target, streamBuffer);
						}
						streamBuffer = "";
					}

                    isCompleted = true;
                    scrollToBottom();
                    return;
                }

                if (data.startsWith("[ERROR]")) {
					// 同样，处理缓冲区中可能存在的未完成文本
					if (streamBuffer.length > 0) {
						const target = activeCollapsibleSectionContent || mainContentContainer;
						if (target) appendTextToContainer(target, streamBuffer);
						streamBuffer = "";
					}
					activeCollapsibleSectionContent = null; // 清理状态
					activeCollapsibleTagKey = null;

                    const errorMessage = data.substring("[ERROR]".length).trim();
                    addMessage('system', `错误: ${errorMessage}`);
                    isCompleted = true;
                    scrollToBottom();
                    return;
                }

                if (!assistantMessageDiv) {
                    assistantMessageDiv = document.createElement('div');
					assistantMessageDiv.className = 'message assistant';
					
					// contentDiv 将作为所有助手回复内容的根容器，包括普通文本和折叠框
					const newContentDiv = document.createElement('div');
					newContentDiv.className = 'message-content';
					// 设置 white-space: pre-wrap 以保留空格和换行符，这对于代码块和思考过程很重要
					newContentDiv.style.whiteSpace = 'pre-wrap'; 
					assistantMessageDiv.appendChild(newContentDiv);
					chatMessages.appendChild(assistantMessageDiv);

					mainContentContainer = newContentDiv; // 设置主内容容器
					// currentContainer = contentDiv; // 原来的逻辑，现在由 mainContentContainer 替代
					scrollToBottom();
                }

                // 处理流式输出
                // 将新数据追加到缓冲区并处理
				streamBuffer += data;
				processStreamBuffer(); // 处理累积的缓冲区内容
				
				// currentAssistantMessage += data; // 可以保留这个变量，如果需要完整的原始消息字符串


                if (isAtBottom()) {
                    scrollToBottom();
                }
            };

            // 处理WebSocket错误
            const originalOnError = ws.onerror;
            ws.onerror = function(error) {
                console.error("WebSocket错误:", error);

                // 如果已经完成，忽略错误
                if (isCompleted) {
                    return;
                }

                // 移除加载动画
                if (loadingElement) {
                    loadingElement.remove();
                }

                // 显示错误消息
                addMessage('system', '与服务器的连接发生错误，请稍后再试。');
                scrollToBottom();

                // 恢复原始的onerror处理函数
                ws.onerror = originalOnError;

                // 标记为已完成
                isCompleted = true;
            };

        } catch (error) {
            console.error("发送消息时出错:", error);

            // 移除加载动画
            if (loadingElement) {
                loadingElement.remove();
            }

            // 显示错误消息
            addMessage('system', `发送消息时出错: ${error.message}`);
            scrollToBottom();
        }
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

        // 定义标签类型和对应的处理信息
        const tagTypes = [
            {
                openTag: "<think>",
                closeTag: "</think>",
                sectionClass: "thinking",
                sectionTitle: "思考过程",
                processor: function(content) {
                    return content; // 思考过程内容直接显示
                }
            },
            {
                openTag: "<tool>",
                closeTag: "</tool>",
                sectionClass: "tool-call",
                sectionTitle: "工具调用",
                processor: function(content) {
                    try {
                        // 解析JSON
                        const toolData = JSON.parse(content.trim());
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

                        return `<pre><code>{
  "name": "${toolName}",
  "parameters": {
${paramsStr}
  }
}</code></pre>`;
                    } catch (e) {
                        console.error("解析工具调用JSON时出错:", e);
                        return `<pre><code>${content}</code></pre>`;
                    }
                }
            },
            {
                openTag: "<tool_result>",
                closeTag: "</tool_result>",
                sectionClass: "tool-call",
                sectionTitle: "工具结果",
                processor: function(content) {
                    try {
                        // 解析JSON
                        const resultData = JSON.parse(content.trim());
                        const toolName = resultData.name || '未知工具';
                        const result = resultData.result || resultData.error || '';

                        // 更新标题以包含工具名称
                        this.sectionTitle = `工具结果: ${toolName}`;

                        return `<pre><code>${result}</code></pre>`;
                    } catch (e) {
                        console.error("解析工具结果JSON时出错:", e);
                        return `<pre><code>${content}</code></pre>`;
                    }
                }
            }
        ];

        // 处理所有标签类型
        for (const tagType of tagTypes) {
            const regex = new RegExp(`${tagType.openTag}([\\s\\S]*?)${tagType.closeTag}`, 'g');
            let match;

            // 查找所有匹配项
            while ((match = regex.exec(formatted)) !== null) {
                console.log(`检测到${tagType.sectionTitle}:`, match[1].substring(0, 50) + "...");

                // 处理内容
                const processedContent = tagType.processor.call(tagType, match[1]);

                // 创建HTML
                const html = `<div class="${tagType.sectionClass}-section">
                    <div class="${tagType.sectionClass}-header">
                        ${tagType.sectionTitle} <span class="toggle-icon">▼</span>
                    </div>
                    <div class="${tagType.sectionClass}-content">
                        ${processedContent}
                    </div>
                </div>`;

                // 替换原始内容
                formatted = formatted.replace(match[0], html);

                // 重置正则表达式索引，因为我们修改了字符串
                regex.lastIndex = 0;
            }
        }

        // 替换代码块
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

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
            console.log("Enter键被按下，发送消息");
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
