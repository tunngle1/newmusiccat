"""
Database Migration Script
Adds is_blocked column to users table
"""

import sqlite3
import os

DB_PATH = "./users.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print("Database doesn't exist yet. No migration needed.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if column already exists
    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'is_blocked' in columns:
        print("Column 'is_blocked' already exists. No migration needed.")
        conn.close()
        return
    
    # Add the new column
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT 0")
        conn.commit()
        print("✅ Successfully added 'is_blocked' column to users table")
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
