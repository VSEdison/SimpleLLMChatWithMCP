# FastMcpLLM - 支持MCP的LLM对话工具

FastMcpLLM是一个支持MCP（Model Context Protocol）的LLM对话工具，使用fastmcp库实现。它允许LLM通过MCP协议调用各种工具，扩展LLM的能力。

## 功能特点

- 使用requests调用OpenAI格式的LLM API
- 通过MCP协议提供工具调用能力
- 支持从环境变量配置LLM API的URL、模型和密钥
- 支持同时使用多个MCP服务器的工具
- 提供命令行交互界面
- 提供Quart异步网页对话界面
- 支持对话历史管理
- 支持折叠/展开LLM的思考过程和工具调用

## 项目结构

- `.env` - 环境变量配置文件
- `mcp_server.py` - MCP服务器实现
- `mcp_client.py` - MCP客户端实现
- `run.py` - 命令行交互入口
- `app.py` - Flask网页应用入口
- `mcpServers.json` - MCP服务器配置文件
- `templates/` - HTML模板目录
- `static/` - 静态资源目录（CSS、JavaScript）
- `requirements.txt` - 项目依赖项
- `README.md` - 项目说明文档

## 安装

1. 克隆项目仓库：

```bash
git clone https://github.com/yourusername/FastMcpLLM.git
cd FastMcpLLM
```

2. 安装依赖项：

```bash
pip install -r requirements.txt
```

3. 配置环境变量：

编辑`.env`文件，设置LLM API的URL、模型和密钥：

```
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_MODEL=gpt-3.5-turbo
LLM_API_KEY=your_api_key_here
```

## 使用方法

### 命令行界面

1. 运行命令行程序：

```bash
python run.py
```

2. 在命令行界面中与LLM对话：

```
欢迎使用FastMcpLLM对话工具！
输入 'exit' 或 'quit' 退出，输入 'clear' 清除对话历史

用户: 你好，请介绍一下你自己

助手: 你好！我是由FastMcpLLM提供支持的AI助手。我可以通过MCP协议调用各种工具来扩展我的能力，帮助你完成各种任务。

我可以：
- 搜索网络获取信息
- 获取当前时间
- 读取和写入文件
- 以及更多功能

如果你需要我使用这些工具，只需告诉我你想要完成什么任务，我会尽力帮助你。有什么我可以帮你的吗？
```

3. 退出程序：

```
用户: exit
```

### 网页界面

1. 运行Quart应用：

```bash
python app.py
```

2. 在浏览器中访问：

```
http://127.0.0.1:5000
```

3. 在网页界面中与LLM对话：
   - 在文本框中输入消息
   - 点击"发送"按钮或按Enter发送消息
   - 点击"清除对话"按钮清除对话历史
   - 点击"思考过程"或"工具调用"标题可以展开/折叠详细内容

### 使用工具

你可以要求LLM使用可用的工具，例如：

```
用户: 请告诉我现在的时间

助手: 我会为你查询当前时间。

使用工具: get_current_time
参数: {}

工具 get_current_time 的调用结果:
当前时间是: 2025-05-08 12:45:30

现在的时间是2025年5月8日12点45分30秒。有什么其他我可以帮助你的吗？
```

## 可用工具

### 本地工具

FastMcpLLM提供以下工具：

1. `search_web` - 搜索网络获取信息
2. `get_current_time` - 获取当前时间
3. `read_file` - 读取文件内容
4. `write_file` - 写入文件内容
5. `fetch_web_content` - 解析网页内容

### 外部工具

系统还支持使用外部MCP服务器提供的工具，例如：

1. `Context7:search` - Context7提供的搜索工具
2. 其他外部MCP服务器提供的工具

## 配置MCP服务器

你可以通过编辑`mcpServers.json`文件来配置MCP服务器。我们统一使用`mcpServers`格式来配置所有的MCP服务器，包括本地服务器和外部服务器：

```json
{
  "mcpServers": {
    "FastMcpLLM": {
      "command": "python",
      "args": ["mcp_server.py"]
    },
    "Context7": {
      "command": "npx",
      "args": [
        "-y",
        "@upstash/context7-mcp@latest"
      ]
    }
  }
}
```

在这个配置中：

- `FastMcpLLM` 是我们自己实现的本地MCP服务器
- `Context7` 是外部提供的MCP服务

你可以根据需要添加更多的MCP服务器，只需在`mcpServers`对象中添加新的条目即可。

## 自定义

你可以通过修改`mcp_server.py`文件添加更多工具，或者修改现有工具的实现。

## 许可证

MIT
