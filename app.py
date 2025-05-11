"""
Quart应用，提供网页对话界面
"""

import os
import asyncio
import subprocess
import signal
import sys
import threading
import json
from quart import Quart, render_template, jsonify, websocket
from dotenv import load_dotenv

from mcp_client import mcp_llm_client

# 加载环境变量
load_dotenv()

# 创建Quart应用
app = Quart(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(24).hex())

# 全局变量
mcp_server_process = None
client_initialized = False
initialization_lock = threading.Lock()

# 启动MCP服务器(这里为前期测试代码，目前已注释)
def start_mcp_server():
    """
    启动MCP服务器
    """
    global mcp_server_process

    # 检查是否已经启动
    if mcp_server_process is not None:
        print("MCP服务器已经在运行中")
        return

    try:
        # 使用subprocess启动MCP服务器
        mcp_server_process = subprocess.Popen(
            [sys.executable, "mcp_server.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )

        print("MCP服务器已启动")

        # 等待服务器初始化
        import time
        time.sleep(2)
    except Exception as e:
        print(f"启动MCP服务器时出错: {str(e)}")

# 停止MCP服务器(这里为前期测试代码，目前已注释)
def stop_mcp_server():
    """
    停止MCP服务器
    """
    global mcp_server_process

    if mcp_server_process is None:
        print("MCP服务器未运行")
        return

    try:
        # 发送终止信号
        mcp_server_process.terminate()

        # 等待进程结束
        mcp_server_process.wait(timeout=5)

        print("MCP服务器已停止")
    except subprocess.TimeoutExpired:
        # 如果超时，强制结束进程
        mcp_server_process.kill()
        print("MCP服务器已强制停止")
    except Exception as e:
        print(f"停止MCP服务器时出错: {str(e)}")
    finally:
        mcp_server_process = None


async def initialize_client():
    """
    初始化MCP客户端
    """
    global client_initialized
    print("初始化MCP客户端")
    with initialization_lock:
        if client_initialized:
            return

        try:
            await mcp_llm_client.initialize()
            client_initialized = True
            print("MCP客户端已初始化")
        except Exception as e:
            print(f"初始化MCP客户端时出错: {str(e)}")


async def cleanup():
    """
    清理资源
    """
    global client_initialized

    try:
        if client_initialized:
            await mcp_llm_client.close()
            client_initialized = False
            print("MCP客户端已关闭")
    except Exception as e:
        print(f"关闭MCP客户端时出错: {str(e)}")

    # stop_mcp_server()


@app.route('/')
async def index():
    """
    主页
    """
    return await render_template('index.html')


# SSE路由已移除，改用WebSocket


@app.route('/api/clear', methods=['POST'])
async def clear_history():
    """
    清除对话历史
    """
    mcp_llm_client.clear_history()
    return jsonify({'status': 'success', 'message': '对话历史已清除'})


@app.route('/api/tools', methods=['GET'])
async def get_tools():
    """
    获取当前可用的工具列表
    """
    # 确保客户端已初始化
    if not client_initialized:
        await initialize_client()

    # 获取工具列表
    tools_by_server = {}
    for name, _ in mcp_llm_client.mcp_clients.items():
        tools_by_server[name] = []

    # 按服务器分组工具
    for tool in mcp_llm_client.all_tools:
        server_name = "FastMcpLLM"  # 默认服务器
        tool_name = tool.name

        # 处理带有服务器前缀的工具名称
        if ":" in tool.name:
            parts = tool.name.split(":", 1)
            server_name = parts[0]
            tool_name = parts[1]

        # 添加到对应服务器的工具列表
        if server_name in tools_by_server:
            tools_by_server[server_name].append({
                "name": tool_name,
                "full_name": tool.name,
                "description": tool.description
            })

    return jsonify({
        'status': 'success',
        'tools_by_server': tools_by_server
    })


@app.websocket('/api/ws')
async def ws():
    """
    WebSocket处理聊天请求
    """
    # 确保客户端已初始化
    if not client_initialized:
        await initialize_client()

    # 接收第一条消息（用户问题）
    try:
        data = await websocket.receive()
        message_data = json.loads(data)
        user_message = message_data.get('message', '')

        if not user_message:
            await websocket.send(json.dumps({'error': '消息不能为空'}))
            return

        # 处理消息流
        async for chunk in mcp_llm_client.process_message(user_message):
            # 发送消息块
            await websocket.send(chunk)

        # 发送一个特殊标记表示流结束
        await websocket.send("[DONE]")
    except asyncio.CancelledError:
        # WebSocket连接被客户端关闭
        print("WebSocket连接被客户端关闭")
        raise
    except Exception as e:
        print(f"WebSocket处理出错: {str(e)}")
        try:
            await websocket.send(f"[ERROR]处理消息时出错: {str(e)}")
        except:
            pass


@app.before_serving
async def before_serving():
    """
    在服务开始前执行的操作
    """
    # 启动MCP服务器
    # start_mcp_server()


@app.after_serving
async def after_serving():
    """
    在服务结束后执行的操作
    """
    # 清理资源
    await cleanup()


if __name__ == '__main__':
    app.run(debug=True)
