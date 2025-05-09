"""
主程序入口，负责初始化MCP客户端和服务器，并提供命令行交互界面
"""

import asyncio
import subprocess
import signal
import sys
from dotenv import load_dotenv

from mcp_client import mcp_llm_client

# 加载环境变量
load_dotenv()

# 全局变量
mcp_server_process = None


async def start_mcp_server():
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
        await asyncio.sleep(2)
    except Exception as e:
        print(f"启动MCP服务器时出错: {str(e)}")


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
    try:
        await mcp_llm_client.initialize()
        print("MCP客户端已初始化")
    except Exception as e:
        print(f"初始化MCP客户端时出错: {str(e)}")


async def cleanup():
    """
    清理资源
    """
    try:
        await mcp_llm_client.close()
        print("MCP客户端已关闭")
    except Exception as e:
        print(f"关闭MCP客户端时出错: {str(e)}")

    stop_mcp_server()


async def chat_loop():
    """
    聊天循环
    """
    print("\n欢迎使用FastMcpLLM对话工具！")
    print("输入 'exit' 或 'quit' 退出，输入 'clear' 清除对话历史\n")

    while True:
        try:
            # 获取用户输入
            user_input = input("\n用户: ")

            # 检查是否退出
            if user_input.lower() in ["exit", "quit"]:
                break

            # 检查是否清除历史
            if user_input.lower() == "clear":
                mcp_llm_client.clear_history()
                print("对话历史已清除")
                continue

            # 处理用户消息
            print("\n助手: ", end="", flush=True)
            response = await mcp_llm_client.process_message(user_input)
            print(response)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"\n处理消息时出错: {str(e)}")


async def main():
    """
    主函数
    """
    try:
        # 启动MCP服务器
        await start_mcp_server()

        # 初始化MCP客户端
        await initialize_client()

        # 启动聊天循环
        await chat_loop()
    finally:
        # 清理资源
        await cleanup()


if __name__ == "__main__":
    # 设置信号处理
    def signal_handler(*_):
        print("\n正在退出...")
        asyncio.run(cleanup())
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    # 运行主函数
    asyncio.run(main())