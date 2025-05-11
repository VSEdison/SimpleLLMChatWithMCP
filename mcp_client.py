"""
MCP客户端实现，负责与LLM API通信并处理MCP工具调用
"""

import os
import json
import asyncio
import requests
from typing import Dict, List, Any, Optional, Tuple, AsyncGenerator
from pathlib import Path
from dotenv import load_dotenv

from fastmcp import Client

# 加载环境变量
load_dotenv()

class LLMClient:
    """
    LLM客户端，负责与LLM API通信
    """

    def __init__(self):
        """
        初始化LLM客户端
        """
        self.api_url = os.getenv("LLM_API_URL", "https://api.openai.com/v1/chat/completions")
        self.api_model = os.getenv("LLM_API_MODEL", "gpt-3.5-turbo")
        self.api_key = os.getenv("LLM_API_KEY", "")

        if not self.api_key:
            print("警告: 未设置API密钥，请在.env文件中设置LLM_API_KEY")

        self.conversation_history = []
        self.system_message = "你是一个由FastMcpLLM提供支持的AI助手。你可以通过MCP协议调用各种工具来扩展你的能力。请确保使用中文进行回答。"

    def add_message(self, role: str, content: str) -> None:
        """
        添加消息到对话历史

        Args:
            role: 消息角色 (user, assistant, system)
            content: 消息内容
        """
        self.conversation_history.append({"role": role, "content": content})

    def clear_history(self) -> None:
        """
        清除对话历史
        """
        self.conversation_history = []

    def set_system_message(self, message: str) -> None:
        """
        设置系统消息

        Args:
            message: 系统消息内容
        """
        self.system_message = message

    def get_messages(self) -> List[Dict[str, str]]:
        """
        获取完整的消息列表，包括系统消息

        Returns:
            消息列表
        """
        messages = [{"role": "system", "content": self.system_message}]
        messages.extend(self.conversation_history)
        return messages

    async def call_llm_api(self, messages: Optional[List[Dict[str, str]]] = None):
        """
        调用LLM API (支持流式响应)

        Args:
            messages: 消息列表，如果为None则使用当前对话历史

        Yields:
            API响应的文本块
        """
        if messages is None:
            messages = self.get_messages()

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        data = {
            "model": self.api_model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens" : 40960,
            "stream": True  # 启用流式响应
        }
        
        try:
            # 使用 aiohttp 进行异步请求
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=data) as response:
                    response.raise_for_status()
                    async for line in response.content:
                        if line.strip():
                            line_str = line.decode('utf-8').strip()
                            if line_str.startswith('data: '):
                                line_str = line_str[len('data: '):]
                            if line_str == '[DONE]' or line_str == '[ERROR]':
                                break
                            try:
                                chunk = json.loads(line_str)
                                if chunk.get("choices") and chunk["choices"][0].get("delta") and chunk["choices"][0]["delta"].get("content"):
                                    yield chunk["choices"][0]["delta"]["content"]
                            except json.JSONDecodeError:
                                # 某些流式API可能会发送非JSON的keep-alive消息，忽略它们
                                # print(f"Skipping non-JSON line: {line_str}")
                                pass
                            except Exception as e:
                                print(f"Error processing chunk: {line_str}, error: {e}")
                                yield f"错误: 解析块时出错 {e}"
        except Exception as e:
            print(f"API调用失败: {str(e)}")
            yield f"错误: {str(e)}"

    async def get_response(self, user_message: str):
        """
        获取LLM对用户消息的流式响应

        Args:
            user_message: 用户消息

        Yields:
            LLM响应的文本块
        """
        self.add_message("user", user_message)
        full_response = ""
        async for chunk in self.call_llm_api():
            if isinstance(chunk, str) and chunk.startswith("错误:"):
                yield chunk
                return
            full_response += chunk
            yield chunk
        
        self.add_message("assistant", full_response)


class MCPLLMClient:
    """
    MCP LLM客户端，结合MCP和LLM功能
    """

    def __init__(self, mcp_servers_file: str = "mcpServers.json"):
        """
        初始化MCP LLM客户端

        Args:
            mcp_servers_file: MCP服务器配置文件路径
        """
        self.llm_client = LLMClient()
        self.mcp_servers_file = mcp_servers_file
        self.mcp_clients = {}  # 存储多个MCP客户端
        self.tools_map = {}    # 存储工具名称到客户端的映射
        self.all_tools = []    # 存储所有工具

    def _load_mcp_servers(self) -> Dict[str, Dict[str, Any]]:
        """
        从配置文件加载MCP服务器配置

        Returns:
            mcpServers配置字典
        """
        try:
            with open(self.mcp_servers_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return config.get('mcpServers', {})
        except Exception as e:
            print(f"加载MCP服务器配置时出错: {str(e)}")
            return {}

    async def initialize(self) -> None:
        """
        初始化MCP客户端
        """
        # 加载MCP服务器配置
        mcp_servers = self._load_mcp_servers()

        if not mcp_servers:
            print("警告: 未找到MCP服务器配置")
            return

        # 初始化所有MCP服务器
        for name, server_config in mcp_servers.items():
            try:
                # 创建客户端配置
                client_config = {
                    'mcpServers': {
                        name: server_config
                    }
                }

                # 创建客户端
                client = Client(client_config)

                # 连接客户端
                await client.__aenter__()
                self.mcp_clients[name] = client

                print(f"已连接到MCP服务器: {name}")

                # 获取工具列表
                tools = await client.list_tools()
                for tool in tools:
                    self.tools_map[tool.name] = name

                # 如果是本地服务器，获取系统提示词
                if name == 'FastMcpLLM':
                    try:
                        prompts = await client.list_prompts()
                        if "system_prompt" in prompts:
                            prompt = await client.get_prompt("system_prompt")
                            if prompt and hasattr(prompt, "text"):
                                self.llm_client.set_system_message(prompt.text)
                    except Exception as e:
                        print(f"获取系统提示词时出错: {str(e)}")

            except Exception as e:
                print(f"初始化MCP服务器 {name} 时出错: {str(e)}")

        # 更新所有工具列表
        await self._update_all_tools()

    async def _update_all_tools(self) -> None:
        """
        更新所有工具列表
        """
        self.all_tools = []
        for name, client in self.mcp_clients.items():
            try:
                tools = await client.list_tools()
                for tool in tools:
                    # 添加服务器名称前缀，以区分不同服务器的同名工具
                    if name != 'FastMcpLLM':  # 本地工具不加前缀
                        tool.name = f"{name}:{tool.name}"
                        tool.description = f"[{name}] {tool.description}"
                    self.all_tools.append(tool)
            except Exception as e:
                print(f"获取服务器 {name} 的工具列表时出错: {str(e)}")

    async def close(self) -> None:
        """
        关闭所有MCP客户端
        """
        for name, client in self.mcp_clients.items():
            try:
                await client.__aexit__(None, None, None)
                print(f"已关闭MCP服务器: {name}")
            except Exception as e:
                print(f"关闭MCP服务器 {name} 时出错: {str(e)}")

    async def process_message(self, user_message: str) -> AsyncGenerator[str, None]:
        """
        处理用户消息，包括可能的工具调用，并以流式方式返回响应。

        Args:
            user_message: 用户消息

        Yields:
            处理后的响应文本块
        """
        if not self.mcp_clients:
            yield "错误: MCP客户端未初始化"
            return

        self.llm_client.add_message("user", user_message)

        try:
            tool_descriptions = []
            for tool in self.all_tools:
                description = f"工具名称: {tool.name}\n描述: {tool.description}\n参数: {tool.inputSchema}\n"
                tool_descriptions.append(description)

            tools_info = "\n".join(tool_descriptions)
            system_message_content = f"{self.llm_client.system_message}\n\n你有以下工具可以使用:\n{tools_info}\n\n如果需要使用工具，请使用以下格式（在你的思考过程之后）：\n<tool>\n{{\n  \"name\": \"工具名称\",\n  \"parameters\": {{\n    \"参数1\": \"值1\",\n    \"参数2\": \"值2\"\n  }}\n}}\n</tool>\nLLM在生成工具调用后应该停止输出，等待工具执行结果。"

            current_messages = [{"role": "system", "content": system_message_content}]
            current_messages.extend(self.llm_client.conversation_history)

            # Stream 1: Initial LLM response
            initial_llm_response_buffer = ""
            # print("Calling LLM with messages:", current_messages)
            async for chunk in self.llm_client.call_llm_api(current_messages):
                if isinstance(chunk, str) and chunk.startswith("错误:"):
                    yield chunk
                    # Attempt to remove the last user message if LLM call failed early
                    if self.llm_client.conversation_history and self.llm_client.conversation_history[-1]["role"] == "user":
                        self.llm_client.conversation_history.pop()
                    return
                initial_llm_response_buffer += chunk
                yield chunk # Stream raw text to client
            
            # Add the full initial assistant message to history (important for context if no tool call or if tool call fails before next LLM)
            # This will be overwritten if a tool call is successful and a new assistant message is generated later.
            self.llm_client.add_message("assistant", initial_llm_response_buffer)

            # Parse the complete initial_llm_response_buffer for tool calls
            import re
            # json is already imported globally

            tool_call_matches = re.findall(r'<tool>(.*?)</tool>', initial_llm_response_buffer, re.DOTALL)
           

            if tool_call_matches:
                # print(initial_llm_response_buffer)
                tool_results_message_for_llm = ""
                for tool_call_json_str in tool_call_matches:
                    tool_call_json_str = tool_call_json_str.strip()
                    
                    # The LLM's output containing the tool call has already been streamed.
                    # Now we process the tool call.

                    parsed_tool_name = None
                    parsed_tool_args = None
                    try:
                        tool_data = json.loads(tool_call_json_str)
                        parsed_tool_name = tool_data.get("name")
                        parsed_tool_args = tool_data.get("parameters", {})
                    except Exception as e:
                        error_msg = f"解析工具调用JSON时出错: {str(e)}"
                        yield f"\n<think>\n内部错误: {error_msg}\n</think>\n"
                        # LLM already added initial_llm_response_buffer to history.
                        return

                    available_tool_names = [tool.name for tool in self.all_tools]
                    if parsed_tool_name and parsed_tool_name in available_tool_names:
                        try:
                            target_server_name = "FastMcpLLM"  # Default server
                            tool_name_on_server = parsed_tool_name

                            if ":" in parsed_tool_name:
                                prefix, name_after_colon = parsed_tool_name.split(":", 1)
                                if prefix in self.mcp_clients:  # Check if prefix is a known server name
                                    target_server_name = prefix
                                    tool_name_on_server = name_after_colon
                            
                            mcp_client_instance = self.mcp_clients.get(target_server_name)
                            if not mcp_client_instance:
                                error_msg = f"错误: 找不到服务器 {target_server_name} 的客户端"
                                yield f"\n<think>\n内部错误: {error_msg}\n</think>\n"
                                return

                            tool_result_list = await mcp_client_instance.call_tool(tool_name_on_server, parsed_tool_args or {})
                            
                            result_text_parts = []
                            for content_item in tool_result_list:
                                if hasattr(content_item, 'text'):
                                    result_text_parts.append(content_item.text)
                                elif hasattr(content_item, 'url'):
                                    result_text_parts.append(f"[图片] {content_item.url}")
                                # else: skip unknown content types or add a placeholder
                            tool_result_str = "\n".join(result_text_parts).strip()

                            # Escape for JSON string compatibility within the XML-like tag
                            escaped_tool_result_str = tool_result_str.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
                            
                            tool_result_message_for_llm = f"<tool_result>\n{{\n  \"name\": \"{parsed_tool_name}\",\n  \"result\": \"{escaped_tool_result_str}\"\n}}\n</tool_result>\n"
                            
                            yield f"{tool_result_message_for_llm}" # Stream the tool result to the client

                            tool_results_message_for_llm += tool_result_message_for_llm

                            # Update conversation history for the next LLM call
                            # The initial assistant message (initial_llm_response_buffer) is already there.
                            # Now add the tool_result as if it's a user message for the LLM.
                            # self.llm_client.add_message("user", tool_result_message_for_llm) 

                        except Exception as e:
                            error_message = f"调用工具 {parsed_tool_name} 时出错: {str(e)}"
                            yield f"\n<think>\n内部错误: {error_message}\n</think>\n"
                            # Add error as tool result for LLM to potentially explain
                            escaped_error_str = str(e).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
                            error_tool_result = f"<tool_result>\n{{\n  \"name\": \"{parsed_tool_name}\",\n  \"error\": \"{escaped_error_str}\"\n}}\n</tool_result>"
                            yield f"\n{error_tool_result}\n"
                            self.llm_client.add_message("user", error_tool_result)
                            
                            # Optionally, call LLM again to explain the error
                            error_explanation_content = ""
                            async for chunk in self.llm_client.call_llm_api():
                                error_explanation_content += chunk
                                yield chunk
                            self.llm_client.add_message("assistant", error_explanation_content)
                    else:
                        # Invalid tool name requested by LLM
                        yield f"\n<think>\n无效的工具: {parsed_tool_name}. 初始回复已发送。\n</think>\n"
                        # The initial_llm_response_buffer (containing the invalid tool call) was already added to history.
                # Stream 2: LLM explanation of tool result
                final_explanation_content = ""
                # print("Calling LLM with tool results:", tool_results_message_for_llm)
                async for chunk in self.process_message(tool_results_message_for_llm): # Uses updated history
                    if isinstance(chunk, str) and chunk.startswith("错误:"):
                        yield chunk
                        return
                    final_explanation_content += chunk
                    yield chunk
                
                # Replace the previous assistant message with the full exchange if tool call was successful
                if self.llm_client.conversation_history and self.llm_client.conversation_history[-2]["role"] == "assistant":
                    self.llm_client.conversation_history[-2]["content"] = initial_llm_response_buffer # Ensure this is the one with the <tool> tag
                self.llm_client.add_message("assistant", final_explanation_content)

                
            # else: No tool call found in the initial LLM response.
            # The initial_llm_response_buffer was already streamed and added to history.
            # Nothing more to do in this case.

        except Exception as e:
            error_message = f"处理消息时出错: {str(e)}"
            print(error_message) # Log to server console
            yield f"错误: {error_message}"
            # Clean up history if an unexpected error occurs
            if self.llm_client.conversation_history and self.llm_client.conversation_history[-1]["role"] == "user":
                 self.llm_client.conversation_history.pop()
            if self.llm_client.conversation_history and self.llm_client.conversation_history[-1]["role"] == "assistant": # if initial response was added
                 self.llm_client.conversation_history.pop()

    def clear_history(self) -> None:
        """
        清除对话历史
        """
        self.llm_client.clear_history()


# 创建全局客户端实例
mcp_llm_client = MCPLLMClient()