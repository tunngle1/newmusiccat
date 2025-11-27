import httpx
from bs4 import BeautifulSoup
import re
from typing import List, Dict, Optional
import urllib.parse

class HitmoParser:
    """
    Lightweight parser for Hitmo using httpx and BeautifulSoup.
    Suitable for Vercel/Serverless environments.
    """
    
    BASE_URL = "https://rus.hitmotop.com"
    SEARCH_URL = f"{BASE_URL}/search"
    
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
    def search(self, query: str, limit: int = 20, page: int = 1) -> List[Dict]:
        """
        Search for tracks
        """
        try:
            params = {
                'q': query,
                'start': (page - 1) * 48 # Hitmo usually shows 48 tracks per page
            }
            
            with httpx.Client(headers=self.headers, timeout=10.0) as client:
                response = client.get(self.SEARCH_URL, params=params)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                tracks = []
                
                # Find all track blocks
                # Based on typical structure, tracks are usually in li.tracks__item or similar
                # We'll look for the specific structure we saw in the markdown
                
                track_elements = soup.select('.tracks__item')
                
                for el in track_elements:
                    if len(tracks) >= limit:
                        break
                        
                    try:
                        # Extract basic info
                        title_el = el.select_one('.track__title')
                        artist_el = el.select_one('.track__desc')
                        time_el = el.select_one('.track__fulltime')
                        download_el = el.select_one('a.track__download-btn')
                        cover_el = el.select_one('.track__img')
                        
                        if not (title_el and download_el):
                            continue
                            
                        title = title_el.text.strip()
                        artist = artist_el.text.strip() if artist_el else "Unknown"
                        duration_str = time_el.text.strip() if time_el else "00:00"
                        
                        # Parse duration to seconds
                        try:
                            mins, secs = map(int, duration_str.split(':'))
                            duration = mins * 60 + secs
                        except:
                            duration = 0
                            
                        # URL
                        url = download_el.get('href')
                        if not url:
                            continue
                            
                        # ID
                        # Try to get from data-id or extract from URL
                        track_id = el.get('data-track-id')
                        if not track_id:
                            # Fallback: hash of artist+title
                            track_id = f"gen_{abs(hash(artist + title))}"
                            
                        # Cover
                        image = None
                        
                        # Try to get high quality cover from iTunes
                        try:
                            image = self._get_itunes_cover(artist, title)
                        except Exception as e:
                            print(f"iTunes cover error: {e}")
                            
                        # Fallback to Hitmo cover if iTunes failed
                        if not image and cover_el:
                            style = cover_el.get('style', '')
                            # Extract url('...') from style
                            match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
                            if match:
                                image = match.group(1)
                        
                        if not image:
                            # Fallback image
                            image = f"https://ui-avatars.com/api/?name={urllib.parse.quote(artist)}&size=200&background=random"
                            
                        tracks.append({
                            'id': track_id,
                            'title': title,
                            'artist': artist,
                            'duration': duration,
                            'url': url,
                            'image': image
                        })
                        
                    except Exception as e:
                        print(f"Error parsing track: {e}")
                        continue
                        
                return tracks
                
        except Exception as e:
            print(f"Search error: {e}")
            return []

    def _get_itunes_cover(self, artist: str, title: str) -> Optional[str]:
        """
        Get high quality cover from iTunes API
        """
        try:
            term = f"{artist} {title}"
            params = {
                'term': term,
                'media': 'music',
                'entity': 'song',
                'limit': 1
            }
            
            with httpx.Client(timeout=3.0) as client:
                response = client.get("https://itunes.apple.com/search", params=params)
                if response.status_code == 200:
                    data = response.json()
                    if data['resultCount'] > 0:
                        # Get artwork url and replace size with 600x600
                        artwork = data['results'][0].get('artworkUrl100')
                        if artwork:
                            return artwork.replace('100x100bb', '600x600bb')
            return None
        except:
            return None

    def close(self):
        pass
