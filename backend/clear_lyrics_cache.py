"""
Script to clear lyrics cache
Run this to remove all cached lyrics from the database
"""

import sqlite3
import os

DB_PATH = "./users.db"

def clear_cache():
    if not os.path.exists(DB_PATH):
        print("Database doesn't exist.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("DELETE FROM lyrics")
        conn.commit()
        print(f"✅ Successfully cleared lyrics cache. Deleted {cursor.rowcount} entries.")
    except Exception as e:
        print(f"❌ Error clearing cache: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    clear_cache()
