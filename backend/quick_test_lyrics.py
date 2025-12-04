"""
Quick test for lyrics service
"""

from lyrics_service import LyricsService

service = LyricsService()

# Test with a popular song
print("Testing lyrics search...")
print("=" * 80)

title = "Bohemian Rhapsody"
artist = "Queen"

print(f"Searching for: {artist} - {title}")
print("-" * 80)

lyrics = service.get_lyrics(title, artist)

if lyrics:
    print(f"\n✅ Found lyrics! Length: {len(lyrics)} characters")
    print(f"\nFirst 500 characters:")
    print(lyrics[:500])
    print("\n...")
    print(f"\nLast 500 characters:")
    print(lyrics[-500:])
else:
    print("\n❌ No lyrics found")
