"""
Test script for lyrics service with multiple sources
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lyrics_service import LyricsService
from dotenv import load_dotenv

load_dotenv()

def test_lyrics_service():
    """Test lyrics fetching from multiple sources"""
    
    service = LyricsService()
    
    # Test cases
    test_tracks = [
        ("Bohemian Rhapsody", "Queen"),  # Popular track
        ("Shape of You", "Ed Sheeran"),  # Popular track
        ("Blinding Lights", "The Weeknd"),  # Recent popular track
    ]
    
    print("=" * 80)
    print("TESTING LYRICS SERVICE")
    print("=" * 80)
    
    for title, artist in test_tracks:
        print(f"\n{'=' * 80}")
        print(f"Testing: {artist} - {title}")
        print(f"{'=' * 80}")
        
        lyrics = service.get_lyrics(title, artist)
        
        if lyrics:
            print(f"\n✅ SUCCESS! Found lyrics ({len(lyrics)} characters)")
            print(f"\nFirst 200 characters:")
            print(lyrics[:200])
            print("...")
        else:
            print(f"\n❌ FAILED: No lyrics found")
        
        print("\n" + "-" * 80)

if __name__ == "__main__":
    test_lyrics_service()
