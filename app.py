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
from quart import Quart, render_template, jsonify, websocket, request
from dotenv import load_dotenv

from mcp_client import mcp_llm_client
import db_utils

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

    print("初始化MCP客户端", initialization_lock.locked())
    if(initialization_lock.locked()) :
        return
    with initialization_lock:
        print("inside lock")
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
    清除当前会话的对话历史
    """
    mcp_llm_client.clear_history()
    return jsonify({'status': 'success', 'message': '对话历史已清除'})


@app.route('/api/sessions', methods=['GET'])
async def get_sessions():
    """
    获取所有会话
    """
    sessions = mcp_llm_client.get_sessions()
    return jsonify({
        'status': 'success',
        'sessions': sessions,
        'current_session_id': mcp_llm_client.current_session_id
    })


@app.route('/api/sessions', methods=['POST'])
async def create_session():
    """
    创建新会话
    """
    data = await request.get_json()
    name = data.get('name', '新会话')

    session_id = mcp_llm_client.create_session(name)

    return jsonify({
        'status': 'success',
        'session_id': session_id,
        'message': f'已创建会话: {name}'
    })


@app.route('/api/sessions/<int:session_id>', methods=['PUT'])
async def update_session(session_id):
    """
    更新会话信息
    """
    data = await request.get_json()
    name = data.get('name')

    if name:
        success = mcp_llm_client.rename_session(session_id, name)
        if success:
            return jsonify({
                'status': 'success',
                'message': f'已重命名会话: {name}'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': '重命名会话失败'
            }), 400

    return jsonify({
        'status': 'error',
        'message': '缺少必要参数'
    }), 400


@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
async def delete_session(session_id):
    """
    删除会话
    """
    success = mcp_llm_client.delete_session(session_id)

    if success:
        return jsonify({
            'status': 'success',
            'message': '已删除会话'
        })
    else:
        return jsonify({
            'status': 'error',
            'message': '删除会话失败，可能是最后一个会话或会话不存在'
        }), 400


@app.route('/api/sessions/switch/<int:session_id>', methods=['POST'])
async def switch_session(session_id):
    """
    切换会话
    """
    try:
        mcp_llm_client.switch_session(session_id)
        return jsonify({
            'status': 'success',
            'message': '已切换会话'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'切换会话失败: {str(e)}'
        }), 400


@app.route('/api/sessions/<int:session_id>/messages', methods=['GET'])
async def get_session_messages(session_id):
    """
    获取会话的历史消息
    """
    try:
        # 获取会话的历史消息
        conversations = db_utils.get_conversations(session_id)

        # 转换为前端需要的格式
        messages = []
        for conv in conversations:
            messages.append({
                'role': conv['role'],
                'content': conv['content']
            })

        return jsonify({
            'status': 'success',
            'messages': messages
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'获取会话历史消息失败: {str(e)}'
        }), 400


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


@app.route('/api/llm-params', methods=['GET'])
async def get_llm_params():
    """
    获取当前LLM参数设置
    """
    params = mcp_llm_client.get_llm_params()
    return jsonify({
        'status': 'success',
        'params': params
    })


@app.route('/api/llm-params', methods=['POST'])
async def set_llm_params():
    """
    设置LLM参数
    """
    data = await request.get_json()

    # 更新temperature参数
    if 'temperature' in data:
        try:
            temperature = float(data['temperature'])
            mcp_llm_client.set_temperature(temperature)
        except (ValueError, TypeError) as e:
            return jsonify({
                'status': 'error',
                'message': f'无效的temperature值: {str(e)}'
            }), 400

    # 更新max_tokens参数
    if 'max_tokens' in data:
        try:
            max_tokens = int(data['max_tokens'])
            mcp_llm_client.set_max_tokens(max_tokens)
        except (ValueError, TypeError) as e:
            return jsonify({
                'status': 'error',
                'message': f'无效的max_tokens值: {str(e)}'
            }), 400

    # 返回更新后的参数
    params = mcp_llm_client.get_llm_params()
    return jsonify({
        'status': 'success',
        'message': '参数已更新',
        'params': params
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
        session_id = message_data.get('session_id', mcp_llm_client.current_session_id)

        if not user_message:
            await websocket.send(json.dumps({'error': '消息不能为空'}))
            return

        # 如果指定了会话ID且与当前会话不同，则切换会话
        if session_id != mcp_llm_client.current_session_id:
            try:
                mcp_llm_client.switch_session(session_id)
            except Exception as e:
                await websocket.send(f"[ERROR]切换会话失败: {str(e)}")
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
