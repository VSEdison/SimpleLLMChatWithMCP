document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-btn');
    const clearButton = document.getElementById('clear-btn');
    const toolsList = document.getElementById('tools-list');
    const refreshToolsButton = document.getElementById('refresh-tools-btn');
    const sessionsList = document.getElementById('sessions-list');
    const newSessionButton = document.getElementById('new-session-btn');
    const sessionModal = document.getElementById('session-modal');
    const closeModalButton = document.querySelector('.close-modal');
    const modalTitle = document.getElementById('modal-title');
    const sessionNameInput = document.getElementById('session-name');
    const sessionIdInput = document.getElementById('session-id');
    const cancelSessionButton = document.getElementById('cancel-session-btn');
    const saveSessionButton = document.getElementById('save-session-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sessionsPanel = document.getElementById('sessions-panel');
    const toolsPanel = document.getElementById('tools-panel');
    const toggleToolsBtn = document.getElementById('toggle-tools-btn');
    const toggleParamsBtn = document.getElementById('toggle-params-btn');
    const overlay = document.getElementById('overlay');
    const mobileSessionsDrawer = document.getElementById('mobile-sessions-drawer');
    const closeDrawerButton = document.getElementById('close-drawer');
    const mobileSessionsList = document.getElementById('mobile-sessions-list');
    const currentSessionInfo = document.getElementById('current-session-info');
    const loadingOverlay = document.getElementById('loading-overlay');

    // LLM参数设置相关元素
    const paramsModal = document.getElementById('params-modal');
    const closeParamsModalButton = document.getElementById('close-params-modal');
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValue = document.getElementById('temperature-value');
    const maxTokensSlider = document.getElementById('max-tokens-slider');
    const maxTokensValue = document.getElementById('max-tokens-value');
    const resetParamsButton = document.getElementById('reset-params-btn');
    const saveParamsButton = document.getElementById('save-params-btn');

    // 当前会话ID
    let currentSessionId = 1;

    // WebSocket连接
    let ws = null;
    let isConnecting = false;

    // 检查用户偏好的主题
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    // 从本地存储中获取主题设置
    const savedTheme = localStorage.getItem('theme');

    // 应用主题设置
    if (savedTheme === 'dark' || (!savedTheme && prefersDarkScheme.matches)) {
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }

    // 主题切换
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-theme');

        if (document.body.classList.contains('dark-theme')) {
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    });

    // 侧边栏切换
    sidebarToggle.addEventListener('click', function() {
        sessionsPanel.classList.add('open');
        overlay.style.display = 'block';
    });

    // 工具面板切换
    toggleToolsBtn.addEventListener('click', function() {
        console.log("切换工具面板");

        // 检查当前窗口宽度
        const isMobileView = window.innerWidth <= 992;

        if (isMobileView) {
            // 移动设备上，工具面板是从右侧滑入的
            if (toolsPanel.classList.contains('open')) {
                toolsPanel.classList.remove('open');
                overlay.style.display = 'none';
            } else {
                toolsPanel.classList.add('open');
                overlay.style.display = 'block';

                // 关闭会话面板（如果打开的话）
                sessionsPanel.classList.remove('open');
            }
        } else {
            // 桌面设备上，工具面板是固定的，可以通过CSS显示/隐藏
            if (toolsPanel.style.display === 'none') {
                toolsPanel.style.display = 'flex';
            } else {
                toolsPanel.style.display = 'none';
            }
        }
    });

    // 点击遮罩层关闭侧边栏和工具面板
    overlay.addEventListener('click', function() {
        sessionsPanel.classList.remove('open');
        toolsPanel.classList.remove('open');
        mobileSessionsDrawer.classList.remove('open');
        overlay.style.display = 'none';
    });

    // 关闭移动端抽屉
    closeDrawerButton.addEventListener('click', function() {
        mobileSessionsDrawer.classList.remove('open');
        overlay.style.display = 'none';
    });

    // 显示加载动画
    function showLoading() {
        loadingOverlay.style.display = 'flex';
    }

    // 隐藏加载动画
    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    // 更新当前会话信息
    function updateCurrentSessionInfo(sessionName) {
        currentSessionInfo.innerHTML = `<span class="session-title">${sessionName}</span>`;
    }

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

    // 获取会话列表
    function fetchSessions() {
        sessionsList.innerHTML = '<div class="loading-sessions"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

        // 如果是移动设备，也更新移动端会话列表
        if (window.innerWidth <= 992) {
            mobileSessionsList.innerHTML = '<div class="loading-sessions"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
        }

        fetch('/api/sessions')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    displaySessions(data.sessions, data.current_session_id);
                    currentSessionId = data.current_session_id;

                    // 更新当前会话信息
                    const currentSession = data.sessions.find(session => session.id === currentSessionId);
                    if (currentSession) {
                        updateCurrentSessionInfo(currentSession.name);
                    }
                } else {
                    const errorMsg = '<div class="loading-sessions"><i class="fas fa-exclamation-circle"></i> 加载会话列表失败</div>';
                    sessionsList.innerHTML = errorMsg;
                    if (window.innerWidth <= 992) {
                        mobileSessionsList.innerHTML = errorMsg;
                    }
                }
            })
            .catch(error => {
                console.error('获取会话列表时出错:', error);
                const errorMsg = `<div class="loading-sessions"><i class="fas fa-exclamation-circle"></i> 加载失败: ${error.message}</div>`;
                sessionsList.innerHTML = errorMsg;
                if (window.innerWidth <= 992) {
                    mobileSessionsList.innerHTML = errorMsg;
                }
            });
    }

    // 显示会话列表
    function displaySessions(sessions, activeSessionId) {
        sessionsList.innerHTML = '';

        // 如果是移动设备，也更新移动端会话列表
        if (window.innerWidth <= 992) {
            mobileSessionsList.innerHTML = '';
        }

        if (sessions.length === 0) {
            const emptyMsg = '<div class="loading-sessions"><i class="fas fa-comment-slash"></i> 没有可用的会话</div>';
            sessionsList.innerHTML = emptyMsg;
            if (window.innerWidth <= 992) {
                mobileSessionsList.innerHTML = emptyMsg;
            }
            return;
        }

        sessions.forEach(session => {
            // 创建会话项
            const sessionItem = createSessionItem(session, activeSessionId);
            sessionsList.appendChild(sessionItem);

            // 如果是移动设备，也添加到移动端会话列表
            if (window.innerWidth <= 992) {
                const mobileSessionItem = createSessionItem(session, activeSessionId);
                mobileSessionsList.appendChild(mobileSessionItem);
            }
        });
    }

    // 创建会话项
    function createSessionItem(session, activeSessionId) {
        const sessionItem = document.createElement('div');
        sessionItem.className = 'session-item';
        if (session.id === activeSessionId) {
            sessionItem.classList.add('active');
        }
        sessionItem.dataset.id = session.id;

        const sessionName = document.createElement('div');
        sessionName.className = 'session-name';
        sessionName.innerHTML = `<i class="fas fa-comments"></i> ${session.name}`;

        const sessionInfo = document.createElement('div');
        sessionInfo.className = 'session-info';

        // 格式化日期
        const updatedDate = new Date(session.updated_at);
        const formattedDate = updatedDate.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        sessionInfo.innerHTML = `<i class="fas fa-message"></i> ${session.message_count || 0} · <i class="fas fa-clock"></i> ${formattedDate}`;

        const sessionActions = document.createElement('div');
        sessionActions.className = 'session-actions';

        // 编辑按钮
        const editButton = document.createElement('button');
        editButton.className = 'session-action-btn';
        editButton.innerHTML = '<i class="fas fa-edit"></i>';
        editButton.title = '重命名';
        editButton.onclick = function(e) {
            e.stopPropagation();
            openSessionModal('edit', session.id, session.name);
        };

        // 删除按钮
        const deleteButton = document.createElement('button');
        deleteButton.className = 'session-action-btn';
        deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteButton.title = '删除';
        deleteButton.onclick = function(e) {
            e.stopPropagation();
            if (confirm(`确定要删除会话 "${session.name}" 吗？`)) {
                deleteSession(session.id);
            }
        };

        sessionActions.appendChild(editButton);
        sessionActions.appendChild(deleteButton);

        sessionItem.appendChild(sessionName);
        sessionItem.appendChild(sessionInfo);
        sessionItem.appendChild(sessionActions);

        // 点击会话项切换会话
        sessionItem.addEventListener('click', function() {
            switchSession(session.id);

            // 如果是移动设备，关闭抽屉
            if (window.innerWidth <= 992) {
                sessionsPanel.classList.remove('open');
                mobileSessionsDrawer.classList.remove('open');
                overlay.style.display = 'none';
            }
        });

        return sessionItem;
    }

    // 打开会话模态框
    function openSessionModal(mode, sessionId = null, sessionName = '') {
        modalTitle.textContent = mode === 'create' ? '新建会话' : '重命名会话';
        sessionNameInput.value = sessionName;
        sessionIdInput.value = sessionId || '';

        // 显示模态框
        sessionModal.style.display = 'block';
        overlay.style.display = 'block';

        // 聚焦输入框
        setTimeout(() => {
            sessionNameInput.focus();
        }, 300);
    }

    // 关闭会话模态框
    function closeSessionModal() {
        sessionModal.style.display = 'none';
        overlay.style.display = 'none';
        sessionNameInput.value = '';
        sessionIdInput.value = '';
    }

    // 保存会话
    function saveSession() {
        const name = sessionNameInput.value.trim();
        const sessionId = sessionIdInput.value;

        if (!name) {
            alert('请输入会话名称');
            return;
        }

        // 显示加载动画
        showLoading();

        if (sessionId) {
            // 更新会话
            fetch(`/api/sessions/${sessionId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name })
            })
            .then(response => response.json())
            .then(data => {
                hideLoading();
                if (data.status === 'success') {
                    closeSessionModal();
                    fetchSessions();

                    // 如果更新的是当前会话，更新标题
                    if (parseInt(sessionId) === currentSessionId) {
                        updateCurrentSessionInfo(name);
                    }
                } else {
                    alert(`重命名会话失败: ${data.message}`);
                }
            })
            .catch(error => {
                hideLoading();
                console.error('重命名会话时出错:', error);
                alert(`重命名会话时出错: ${error.message}`);
            });
        } else {
            // 创建会话
            fetch('/api/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name })
            })
            .then(response => response.json())
            .then(data => {
                hideLoading();
                if (data.status === 'success') {
                    closeSessionModal();
                    fetchSessions();
                    // 切换到新会话
                    switchSession(data.session_id);
                } else {
                    alert(`创建会话失败: ${data.message}`);
                }
            })
            .catch(error => {
                hideLoading();
                console.error('创建会话时出错:', error);
                alert(`创建会话时出错: ${error.message}`);
            });
        }
    }

    // 删除会话
    function deleteSession(sessionId) {
        // 显示加载动画
        showLoading();

        fetch(`/api/sessions/${sessionId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            hideLoading();
            if (data.status === 'success') {
                fetchSessions();
                // 清空聊天界面
                chatMessages.innerHTML = '';
                addMessage('system', '<i class="fas fa-info-circle"></i> 已切换到新会话');
            } else {
                alert(`删除会话失败: ${data.message}`);
            }
        })
        .catch(error => {
            hideLoading();
            console.error('删除会话时出错:', error);
            alert(`删除会话时出错: ${error.message}`);
        });
    }

    // 加载会话历史消息
    function loadSessionMessages(sessionId) {
        // 清空聊天界面
        chatMessages.innerHTML = '';

        // 添加加载提示
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'message system';
        loadingMessage.innerHTML = '<div class="message-content"><i class="fas fa-spinner fa-spin"></i> 加载历史消息中...</div>';
        chatMessages.appendChild(loadingMessage);

        fetch(`/api/sessions/${sessionId}/messages`)
            .then(response => response.json())
            .then(data => {
                // 移除加载提示
                chatMessages.removeChild(loadingMessage);
                hideLoading(); // 隐藏全局加载动画

                if (data.status === 'success') {
                    // 如果没有历史消息，显示欢迎消息
                    if (data.messages.length === 0) {
                        addMessage('system', '<i class="fas fa-robot"></i> 欢迎使用FastMcpLLM对话工具！您可以开始与AI助手对话，助手可以通过MCP协议调用各种工具来扩展能力。');
                        return;
                    }

                    // 显示历史消息
                    data.messages.forEach(message => {
                        console.log("加载历史消息:", message.content);
                        addMessage(message.role, message.content);
                    });

                    // 滚动到底部
                    scrollToBottom();
                } else {
                    addMessage('system', `<i class="fas fa-exclamation-circle"></i> 加载历史消息失败: ${data.message}`);
                }
            })
            .catch(error => {
                // 移除加载提示
                chatMessages.removeChild(loadingMessage);
                hideLoading(); // 隐藏全局加载动画

                console.error('加载历史消息时出错:', error);
                addMessage('system', `<i class="fas fa-exclamation-circle"></i> 加载历史消息时出错: ${error.message}`);
            });
    }

    // 切换会话
    function switchSession(sessionId) {
        if (sessionId === currentSessionId) {
            return;
        }

        // 显示加载动画
        showLoading();

        fetch(`/api/sessions/switch/${sessionId}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                currentSessionId = sessionId;
                fetchSessions();

                // 加载会话历史消息
                loadSessionMessages(sessionId);
            } else {
                hideLoading();
                alert(`切换会话失败: ${data.message}`);
            }
        })
        .catch(error => {
            hideLoading();
            console.error('切换会话时出错:', error);
            alert(`切换会话时出错: ${error.message}`);
        });
    }

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
        content.style.display = 'block'; // 初始显示内容

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

        // 禁用发送按钮，防止重复发送
        sendButton.disabled = true;
        sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 发送中...';
        userInput.disabled = true;

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

            // 发送消息，包含会话ID
            ws.send(JSON.stringify({
                message: message,
                session_id: currentSessionId
            }));

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

                    // 恢复发送按钮状态
                    sendButton.disabled = false;
                    sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> 发送';
                    userInput.disabled = false;
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
                    addMessage('system', `<i class="fas fa-exclamation-circle"></i> 错误: ${errorMessage}`);
                    isCompleted = true;
                    scrollToBottom();

                    // 恢复发送按钮状态
                    sendButton.disabled = false;
                    sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> 发送';
                    userInput.disabled = false;
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
                addMessage('system', '<i class="fas fa-exclamation-triangle"></i> 与服务器的连接发生错误，请稍后再试。');
                scrollToBottom();

                // 恢复发送按钮状态
                sendButton.disabled = false;
                sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> 发送';
                userInput.disabled = false;

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
            addMessage('system', `<i class="fas fa-exclamation-circle"></i> 发送消息时出错: ${error.message}`);
            scrollToBottom();

            // 恢复发送按钮状态
            sendButton.disabled = false;
            sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> 发送';
            userInput.disabled = false;
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
            mainContentContainer = contentDiv;
            streamBuffer = content;
            processStreamBuffer();
        }
        else {
            contentDiv.innerHTML = content;
        }

        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);

        // 滚动到底部
        scrollToBottom();
    }

    // 注意：formatMessage函数已被移除，现在使用processStreamBuffer来处理消息格式化

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

    // 获取LLM参数
    function fetchLLMParams() {
        fetch('/api/llm-params')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    updateParamsUI(data.params);
                } else {
                    console.error('获取LLM参数失败:', data.message);
                }
            })
            .catch(error => {
                console.error('获取LLM参数时出错:', error);
            });
    }

    // 更新参数UI
    function updateParamsUI(params) {
        temperatureSlider.value = params.temperature;
        temperatureValue.value = params.temperature;
        maxTokensSlider.value = params.max_tokens;
        maxTokensValue.value = params.max_tokens;
    }

    // 保存LLM参数
    function saveLLMParams() {
        const temperature = parseFloat(temperatureValue.value);
        const maxTokens = parseInt(maxTokensValue.value);

        // 显示加载动画
        showLoading();

        fetch('/api/llm-params', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                temperature: temperature,
                max_tokens: maxTokens
            })
        })
        .then(response => response.json())
        .then(data => {
            hideLoading();
            if (data.status === 'success') {
                // 关闭模态框
                closeParamsModal();
                // 显示成功消息
                addMessage('system', `<i class="fas fa-check-circle"></i> LLM参数已更新`);
            } else {
                alert(`更新参数失败: ${data.message}`);
            }
        })
        .catch(error => {
            hideLoading();
            console.error('更新参数时出错:', error);
            alert(`更新参数时出错: ${error.message}`);
        });
    }

    // 打开参数模态框
    function openParamsModal() {
        // 获取最新参数
        fetchLLMParams();

        // 显示模态框
        paramsModal.style.display = 'block';
        overlay.style.display = 'block';
    }

    // 关闭参数模态框
    function closeParamsModal() {
        paramsModal.style.display = 'none';
        overlay.style.display = 'none';
    }

    // 重置参数为默认值
    function resetParams() {
        temperatureSlider.value = 0.2;
        temperatureValue.value = 0.2;
        maxTokensSlider.value = 40960;
        maxTokensValue.value = 40960;
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

    // 参数设置相关事件监听
    toggleParamsBtn.addEventListener('click', openParamsModal);
    closeParamsModalButton.addEventListener('click', closeParamsModal);
    saveParamsButton.addEventListener('click', saveLLMParams);
    resetParamsButton.addEventListener('click', resetParams);

    // 滑块和输入框同步
    temperatureSlider.addEventListener('input', function() {
        temperatureValue.value = this.value;
    });

    temperatureValue.addEventListener('input', function() {
        temperatureSlider.value = this.value;
    });

    maxTokensSlider.addEventListener('input', function() {
        maxTokensValue.value = this.value;
    });

    maxTokensValue.addEventListener('input', function() {
        maxTokensSlider.value = this.value;
    });

    // 会话模态框事件
    newSessionButton.addEventListener('click', function() {
        openSessionModal('create');
    });

    closeModalButton.addEventListener('click', closeSessionModal);

    // 点击模态框外部关闭
    window.addEventListener('click', function(event) {
        if (event.target === sessionModal) {
            closeSessionModal();
        }
        if (event.target === paramsModal) {
            closeParamsModal();
        }
    });

    cancelSessionButton.addEventListener('click', closeSessionModal);

    saveSessionButton.addEventListener('click', saveSession);

    // 初始化工具面板显示状态
    function initToolsPanel() {
        const isMobileView = window.innerWidth <= 992;

        if (!isMobileView) {
            // 在桌面设备上，默认显示工具面板
            toolsPanel.style.display = 'flex';
        } else {
            // 在移动设备上，工具面板默认隐藏，通过类控制
            toolsPanel.classList.remove('open');
        }
    }

    // 监听窗口大小变化，调整工具面板显示
    window.addEventListener('resize', function() {
        initToolsPanel();
    });

    // 初始化
    fetchSessions();
    fetchTools();
    fetchLLMParams();
    initToolsPanel();

    // 加载当前会话的历史消息
    loadSessionMessages(currentSessionId);

    scrollToBottom();
});
