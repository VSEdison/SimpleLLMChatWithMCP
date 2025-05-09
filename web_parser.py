"""
网页内容获取和解析模块
提供从URL获取网页内容并解析为可读格式的功能
"""

import requests
from bs4 import BeautifulSoup
import re
import html2text
from typing import Dict, Optional, Tuple, Union
from urllib.parse import urlparse

# 请求头信息
HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    "Accept-Encoding": "gzip, deflate",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7"
}

# 默认超时时间（秒）
DEFAULT_TIMEOUT = 10

# HTML转Markdown转换器
html_to_md = html2text.HTML2Text()
html_to_md.ignore_links = False
html_to_md.ignore_images = False
html_to_md.ignore_tables = False
html_to_md.body_width = 0  # 不自动换行


def fetch_url(url: str, timeout: int = DEFAULT_TIMEOUT) -> Tuple[str, str]:
    """
    从URL获取网页内容

    Args:
        url: 网页URL
        timeout: 请求超时时间（秒）

    Returns:
        元组 (内容, 内容类型)
    
    Raises:
        ValueError: URL格式无效
        requests.RequestException: 请求失败
    """
    # 验证URL格式
    parsed_url = urlparse(url)
    if not parsed_url.scheme or not parsed_url.netloc:
        raise ValueError(f"无效的URL: {url}")
    
    # 确保URL有协议前缀
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=timeout)
        response.raise_for_status()  # 如果状态码不是200，抛出异常
        
        # 获取内容类型
        content_type = response.headers.get('Content-Type', '').lower()
        
        # 如果是HTML内容，返回文本
        if 'text/html' in content_type:
            return response.text, 'html'
        # 如果是JSON内容，返回文本
        elif 'application/json' in content_type:
            return response.text, 'json'
        # 如果是纯文本内容，返回文本
        elif 'text/plain' in content_type:
            return response.text, 'text'
        # 其他类型，返回内容类型信息
        else:
            return f"不支持的内容类型: {content_type}", 'unsupported'
    
    except requests.RequestException as e:
        raise requests.RequestException(f"获取URL内容失败: {str(e)}")


def parse_html(html_content: str, extract_text_only: bool = False) -> str:
    """
    解析HTML内容，提取主要文本内容

    Args:
        html_content: HTML内容
        extract_text_only: 是否只提取文本内容（去除HTML标签）

    Returns:
        解析后的内容
    """
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # 移除脚本和样式元素
        for script_or_style in soup(['script', 'style', 'iframe', 'noscript']):
            script_or_style.decompose()
        
        # 移除注释
        for comment in soup.find_all(string=lambda text: isinstance(text, str) and '<!--' in text):
            comment.extract()
        
        # 如果只需要文本内容
        if extract_text_only:
            # 获取所有文本并清理
            text = soup.get_text(separator='\n')
            # 清理多余的空白行
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            return '\n'.join(lines)
        
        # 否则返回清理后的HTML
        return str(soup)
    
    except Exception as e:
        return f"解析HTML内容失败: {str(e)}"


def html_to_markdown(html_content: str) -> str:
    """
    将HTML内容转换为Markdown格式

    Args:
        html_content: HTML内容

    Returns:
        Markdown格式的内容
    """
    try:
        # 使用html2text转换为Markdown
        markdown = html_to_md.handle(html_content)
        
        # 清理多余的空行
        lines = [line for line in markdown.splitlines() if line.strip()]
        cleaned_markdown = '\n'.join(lines)
        
        return cleaned_markdown
    
    except Exception as e:
        return f"转换为Markdown失败: {str(e)}"


def extract_main_content(html_content: str) -> str:
    """
    尝试提取网页的主要内容区域

    Args:
        html_content: HTML内容

    Returns:
        主要内容区域的HTML
    """
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # 移除导航、页脚、侧边栏等常见非主要内容区域
        for tag in soup.find_all(['nav', 'footer', 'aside']):
            tag.decompose()
        
        # 尝试查找主要内容区域
        main_content = None
        
        # 按优先级查找可能的主要内容容器
        for selector in ['main', 'article', '#content', '.content', '#main', '.main', '.post', '.article']:
            found = soup.select(selector)
            if found:
                main_content = found[0]
                break
        
        # 如果找不到明确的主要内容区域，使用body
        if not main_content:
            main_content = soup.body
        
        # 如果连body都没有，返回整个文档
        if not main_content:
            return str(soup)
        
        return str(main_content)
    
    except Exception as e:
        return html_content  # 出错时返回原始内容


def fetch_and_parse_url(url: str, format: str = 'markdown', max_length: int = 8000) -> str:
    """
    获取并解析URL内容

    Args:
        url: 网页URL
        format: 输出格式，可选值: 'markdown', 'text', 'html'
        max_length: 最大内容长度

    Returns:
        解析后的内容
    """
    try:
        # 获取URL内容
        content, content_type = fetch_url(url)
        
        # 如果不是HTML，直接返回
        if content_type != 'html':
            return content[:max_length] if len(content) > max_length else content
        
        # 提取主要内容
        main_content = extract_main_content(content)
        
        # 根据请求的格式处理内容
        if format == 'markdown':
            result = html_to_markdown(main_content)
        elif format == 'text':
            result = parse_html(main_content, extract_text_only=True)
        else:  # html
            result = main_content
        
        # 限制内容长度
        if len(result) > max_length:
            result = result[:max_length] + f"\n\n... (内容已截断，完整内容超过{max_length}字符)"
        
        return result
    
    except Exception as e:
        return f"获取或解析URL内容失败: {str(e)}"


if __name__ == "__main__":
    # 测试代码
    test_url = "https://www.example.com"
    result = fetch_and_parse_url(test_url)
    print(result)
