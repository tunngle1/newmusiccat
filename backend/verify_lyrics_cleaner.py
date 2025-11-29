from lyrics_service import LyricsService

def test_cleaner():
    service = LyricsService("dummy")
    
    garbage = [
        'العربية', 'Svenska', 'azərbaycan', 'עברית', 'हिन्दी', 'srpski'
    ]
    
    dirty_lyrics = "Some real lyrics\n" + "\n".join(garbage) + "\nMore real lyrics"
    
    cleaned = service._clean_lyrics(dirty_lyrics)
    
    print(f"Original:\n{dirty_lyrics!r}")
    print(f"Cleaned:\n{cleaned!r}")
    
    for lang in garbage:
        if lang in cleaned:
            print(f"FAILED: {lang} was not removed")
            return
            
    print("SUCCESS: All garbage languages removed")

if __name__ == "__main__":
    test_cleaner()
