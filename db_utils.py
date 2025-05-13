"""
数据库工具模块，用于管理对话数据库
"""

import sqlite3
import datetime
from typing import List, Dict, Any, Optional, Tuple

# 数据库文件路径
DB_FILE = 'conversations.db'

def init_db():
    """
    初始化数据库，创建必要的表
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 创建会话表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 创建对话表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        role VARCHAR(20) NOT NULL,
        timestamp DATETIME
    )
    ''')

    # 添加默认会话（如果不存在）
    cursor.execute('SELECT COUNT(*) FROM sessions')
    if cursor.fetchone()[0] == 0:
        cursor.execute(
            'INSERT INTO sessions (name) VALUES (?)',
            ('默认会话',)
        )

    conn.commit()
    conn.close()

def get_sessions() -> List[Dict[str, Any]]:
    """
    获取所有会话
    
    Returns:
        会话列表
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT id, name, created_at, updated_at,
           (SELECT COUNT(*) FROM conversations WHERE session_id = sessions.id) as message_count
    FROM sessions
    ORDER BY updated_at DESC
    ''')
    
    sessions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return sessions

def create_session(name: str) -> int:
    """
    创建新会话
    
    Args:
        name: 会话名称
        
    Returns:
        新会话的ID
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    now = datetime.datetime.now()
    cursor.execute(
        'INSERT INTO sessions (name, created_at, updated_at) VALUES (?, ?, ?)',
        (name, now, now)
    )
    
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return session_id

def update_session(session_id: int, name: Optional[str] = None) -> bool:
    """
    更新会话信息
    
    Args:
        session_id: 会话ID
        name: 新的会话名称
        
    Returns:
        是否更新成功
    """
    if name is None:
        return False
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    now = datetime.datetime.now()
    cursor.execute(
        'UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?',
        (name, now, session_id)
    )
    
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return success

def delete_session(session_id: int) -> bool:
    """
    删除会话及其所有对话
    
    Args:
        session_id: 会话ID
        
    Returns:
        是否删除成功
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # 检查是否为最后一个会话
    cursor.execute('SELECT COUNT(*) FROM sessions')
    if cursor.fetchone()[0] <= 1:
        conn.close()
        return False  # 不允许删除最后一个会话
    
    # 删除会话的所有对话
    cursor.execute('DELETE FROM conversations WHERE session_id = ?', (session_id,))
    
    # 删除会话
    cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return success

def get_conversations(session_id: int) -> List[Dict[str, Any]]:
    """
    获取指定会话的所有对话
    
    Args:
        session_id: 会话ID
        
    Returns:
        对话列表
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
    SELECT id, content, role, timestamp
    FROM conversations
    WHERE session_id = ?
    ORDER BY id
    ''', (session_id,))
    
    conversations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return conversations

def add_message(session_id: int, role: str, content: str) -> int:
    """
    添加消息到指定会话
    
    Args:
        session_id: 会话ID
        role: 消息角色
        content: 消息内容
        
    Returns:
        新消息的ID
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    now = datetime.datetime.now()
    cursor.execute(
        'INSERT INTO conversations (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)',
        (session_id, role, content, now)
    )
    
    message_id = cursor.lastrowid
    
    # 更新会话的更新时间
    cursor.execute(
        'UPDATE sessions SET updated_at = ? WHERE id = ?',
        (now, session_id)
    )
    
    conn.commit()
    conn.close()
    
    return message_id

def clear_conversations(session_id: int) -> bool:
    """
    清除指定会话的所有对话
    
    Args:
        session_id: 会话ID
        
    Returns:
        是否清除成功
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM conversations WHERE session_id = ?', (session_id,))
    
    success = True
    conn.commit()
    conn.close()
    
    return success

# 初始化数据库
init_db()
