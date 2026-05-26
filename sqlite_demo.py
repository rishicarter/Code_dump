import sqlite3

try:
    connection = sqlite3.connect(":memory:")
    if not connection:
        print(f"No DB Connetion!")
    cursor = connection.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS programmers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), skill VARCHAR(100))
""")
    insert_query = """INSERT INTO programmers (name, skill) VALUES (?, ?)"""
    coders_to_add = [
        ('aa', 'JAVA'),
        ('aab', 'PYTHON'),
        ('ac', 'NodeJS')
    ]
    cursor.executemany(insert_query, coders_to_add)
    connection.commit()
    print(f"{cursor.rowcount=}")
    print("Programmers - ")
    cursor.execute("SELECT name, skill FROM programmers")

    records = cursor.fetchall()
    for r in records:
        print(f"P:{r[0]} | S:{r[1]}")
except Exception as e:
    print(f"{e=}")
finally:
    if 'connection' in locals() and connection:
        cursor.close()
        connection.close()
        print("Connection closed!")