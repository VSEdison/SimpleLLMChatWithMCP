"""
MCP服务器实现，提供工具函数供LLM调用
"""

import os
import datetime
from pathlib import Path
from typing import Dict

from fastmcp import FastMCP, Context

from baidusearch.baidusearch import search
from web_parser import fetch_and_parse_url

# 创建MCP服务器实例
mcp = FastMCP(
    name="FastMcpLLM",
    instructions="这是一个支持MCP的LLM对话工具，可以通过工具函数扩展LLM的能力。"
)

@mcp.tool()
async def search_web(query: str, num_results: int, ctx: Context) -> str:
    """搜索网络获取信息，搜索完成后，你可以使用fetch_web_content工具获取具体网页的详细内容

Args:
    query: 搜索查询
    num_results: 返回结果的数量

Returns:
    搜索结果
"""
    await ctx.info(f"正在搜索: {query}")
    # 这里应该实现实际的搜索功能，这里只是模拟

    # 搜索关键字 "Full Stack Developer"
    results = search(query, num_results=num_results)
    return results

@mcp.tool()
async def get_current_time(ctx: Context, format: str = "%Y-%m-%d %H:%M:%S") -> str:
    """获取当前时间，如果是跟当前时间有关的问题，确保先使用本工具

Args:
    format: 时间格式字符串，默认为 "%Y-%m-%d %H:%M:%S"

Returns:
    当前时间的字符串表示
"""
    await ctx.info("获取当前时间")
    current_time = datetime.datetime.now().strftime(format)
    return f"当前时间是: {current_time}"

@mcp.tool()
async def read_file(file_path: str, ctx: Context) -> str:
    """读取文件内容

Args:
    file_path: 文件路径

Returns:
    文件内容
"""
    await ctx.info(f"读取文件: {file_path}")
    try:
        path = Path(file_path)
        if not path.exists():
            return f"错误: 文件 '{file_path}' 不存在"

        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        return content
    except Exception as e:
        return f"读取文件时出错: {str(e)}"

@mcp.tool()
async def write_file(file_path: str, content: str, ctx: Context) -> str:
    """写入文件内容

Args:
    file_path: 文件路径
    content: 要写入的内容

Returns:
    操作结果
"""
    await ctx.info(f"写入文件: {file_path}")
    try:
        path = Path(file_path)

        # 确保目录存在
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

        return f"成功写入文件: {file_path}"
    except Exception as e:
        return f"写入文件时出错: {str(e)}"

@mcp.tool()
async def fetch_web_content(url: str, ctx: Context, format: str = "markdown", max_length: int = 8000) -> str:
    """获取并解析网页内容，当没有具体网址时，你可以先使用search_web工具搜索相关信息，获取网页链接，再使用本工具获取具体网页的详细内容

Args:
    url: 网页URL
    format: 输出格式，可选值: 'markdown', 'text', 'html'
    max_length: 最大内容长度

Returns:
    解析后的网页内容
"""
    await ctx.info(f"正在获取网页内容: {url}")
    try:
        result = fetch_and_parse_url(url, format=format, max_length=max_length)
        return result
    except Exception as e:
        return f"获取网页内容失败: {str(e)}"

@mcp.resource("config://env")
async def get_env_config() -> Dict[str, str]:
    """获取环境配置信息（不包含敏感信息）

Returns:
    环境配置信息
"""
    # 过滤掉敏感信息，只返回安全的配置
    safe_env = {
        "LLM_API_URL": os.getenv("LLM_API_URL", ""),
        "LLM_API_MODEL": os.getenv("LLM_API_MODEL", ""),
        "DEBUG": os.getenv("DEBUG", "False")
    }
    return safe_env

@mcp.prompt()
def system_prompt() -> str:
    """系统提示词

Returns:
    系统提示词
"""
    return """你是一个由FastMcpLLM提供支持的AI助手。
你可以通过MCP协议调用各种工具来扩展你的能力。
请尽可能地帮助用户解决问题，并在需要时使用工具。
"""

if __name__ == "__main__":
    # 运行MCP服务器
    mcp.run()