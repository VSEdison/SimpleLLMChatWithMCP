import sqlite3

# 连接到数据库
conn = sqlite3.connect('conversations.db')
cursor = conn.cursor()

# 获取所有表名
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

print("数据库中的表:")
for table in tables:
    table_name = table[0]
    print(f"\n表名: {table_name}")
    
    # 获取表结构
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    print("列信息:")
    for column in columns:
        print(f"  {column}")
    
    # 获取表中的数据
    cursor.execute(f"SELECT * FROM {table_name} LIMIT 5")
    rows = cursor.fetchall()
    print(f"数据示例 (最多5行):")
    for row in rows:
        print(f"  {row}")

# 关闭连接
conn.close()
