"""
Database Migration Script for Lyrics Table
Adds lyrics table to the database
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
    
    # Check if table already exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='lyrics'")
    if cursor.fetchone():
        print("Table 'lyrics' already exists. No migration needed.")
        conn.close()
        return
    
    # Create the lyrics table
    try:
        cursor.execute("""
            CREATE TABLE lyrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT UNIQUE NOT NULL,
                title TEXT,
                artist TEXT,
                lyrics_text TEXT,
                source TEXT DEFAULT 'genius',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create index on track_id for faster lookups
        cursor.execute("CREATE INDEX idx_lyrics_track_id ON lyrics(track_id)")
        
        conn.commit()
        print("✅ Successfully created 'lyrics' table")
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
