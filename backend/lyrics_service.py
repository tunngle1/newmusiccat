"""
Lyrics Service for fetching song lyrics from Genius API
"""

import requests
from bs4 import BeautifulSoup
import re
from typing import Optional


class LyricsService:
    def __init__(self, genius_token: str):
        """
        Initialize Genius API client
        
        Args:
            genius_token: Genius API access token
        """
        self.token = genius_token
        self.base_url = "https://api.genius.com"
        self.headers = {
            'Authorization': f'Bearer {self.token}',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    
    def get_lyrics(self, title: str, artist: str) -> Optional[str]:
        """
        Fetch lyrics for a song from Genius
        
        Args:
            title: Song title
            artist: Artist name
            
        Returns:
            Lyrics text or None if not found
        """
        try:
            print(f"Searching lyrics for: {artist} - {title}")
            
            # 1. Search for the song
            search_url = f"{self.base_url}/search"
            params = {'q': f"{title} {artist}"}
            
            response = requests.get(search_url, headers=self.headers, params=params, timeout=10)
            
            if response.status_code != 200:
                print(f"Search failed with status {response.status_code}")
                return None
            
            data = response.json()
            
            if not data.get('response') or not data['response'].get('hits'):
                print(f"No results found for: {artist} - {title}")
                return None
            
            # Get the first result
            song_info = data['response']['hits'][0]['result']
            song_url = song_info.get('url')
            
            if not song_url:
                print("No song URL found")
                return None
            
            print(f"Found song: {song_info.get('title')} by {song_info.get('primary_artist', {}).get('name')}")
            
            # 2. Scrape lyrics from the song page
            lyrics = self._scrape_lyrics(song_url)
            
            if lyrics:
                print(f"Successfully fetched lyrics ({len(lyrics)} chars)")
            else:
                print("Failed to scrape lyrics from page")
            
            return lyrics
            
        except Exception as e:
            print(f"Error fetching lyrics: {e}")
            return None
    
    def _scrape_lyrics(self, url: str) -> Optional[str]:
        """
        Scrape lyrics from Genius song page
        
        Args:
            url: Genius song page URL
            
        Returns:
            Lyrics text or None
        """
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                return None
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find lyrics container (Genius uses different div classes)
            lyrics_divs = soup.find_all('div', {'data-lyrics-container': 'true'})
            
            if not lyrics_divs:
                # Try alternative selectors
                lyrics_divs = soup.find_all('div', class_=re.compile(r'Lyrics__Container'))
            
            if not lyrics_divs:
                return None
            
            # Extract text from all lyrics divs
            lyrics_parts = []
            for div in lyrics_divs:
                # Get text and preserve line breaks
                text = div.get_text(separator='\n', strip=True)
                lyrics_parts.append(text)
            
            lyrics = '\n\n'.join(lyrics_parts)
            
            # Clean up
            lyrics = self._clean_lyrics(lyrics)
            
            return lyrics if lyrics else None
            
        except Exception as e:
            print(f"Error scraping lyrics: {e}")
            return None
    
    def _clean_lyrics(self, lyrics: str) -> str:
        """
        Clean up lyrics text by removing unnecessary elements
        
        Args:
            lyrics: Raw lyrics text
            
        Returns:
            Cleaned lyrics text
        """
        lines = lyrics.split('\n')
        cleaned_lines = []
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines (will be handled by join later)
            if not line:
                cleaned_lines.append("")
                continue
            
            # Filter out Genius metadata
            if re.match(r'^\d+\s*Contributors', line, re.IGNORECASE):
                continue
            if re.match(r'^Translations', line, re.IGNORECASE):
                continue
            # Common languages headers
            if line in ['English', 'Russian', 'Español', 'Deutsch', 'Français', 'Italiano', 'Português']:
                continue
            # "Song Title Lyrics" header
            if re.match(r'^.*? Lyrics$', line, re.IGNORECASE):
                continue
            # "Embed" at the end
            if re.match(r'^Embed$', line, re.IGNORECASE):
                continue
                
            cleaned_lines.append(line)
        
        # Rejoin lines
        lyrics = '\n'.join(cleaned_lines)
        
        # Remove extra whitespace (more than 2 newlines)
        lyrics = re.sub(r'\n{3,}', '\n\n', lyrics)
        
        return lyrics.strip()

