import asyncio
from backend.hitmo_parser_light import HitmoParser

async def test_deep_search():
    parser = HitmoParser()
    query = "Role Model"
    
    print(f"--- Simulating Deep Search for '{query}' ---")
    
    all_tracks = []
    # Simulate the backend loop
    for p in range(1, 4):
        print(f"Fetching page {p}...")
        tracks = await parser.search(query, limit=48, page=p)
        print(f"Page {p}: Found {len(tracks)} tracks")
        all_tracks.extend(tracks)
        if len(tracks) < 20:
            break
            
    print(f"Total tracks fetched: {len(all_tracks)}")
    
    # Filter by artist
    by_artist = [t for t in all_tracks if query.lower() in t['artist'].lower()]
    print(f"Filtered by Artist '{query}': {len(by_artist)} matches")
    
    for i, track in enumerate(by_artist[:5]):
        print(f"{i+1}. {track['artist']} - {track['title']}")

if __name__ == "__main__":
    asyncio.run(test_deep_search())
