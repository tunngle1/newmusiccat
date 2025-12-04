"""
Lyrics Service for fetching song lyrics from multiple sources
"""

import requests
from bs4 import BeautifulSoup
import re
from typing import Optional


class LyricsService:
    def __init__(self):
        """
        Initialize Lyrics Service (no API tokens required)
        """
        pass
    
    def _normalize_query(self, text: str) -> str:
        """
        Normalize track title or artist name for better search results
        
        Args:
            text: Original text
            
        Returns:
            Normalized text
        """
        # Remove common patterns that interfere with search
        patterns = [
            r'\(feat\..*?\)',
            r'\(ft\..*?\)',
            r'\(featuring.*?\)',
            r'\[.*?\]',
            r'\(.*?remix.*?\)',
            r'\(.*?version.*?\)',
            r'\(.*?edit.*?\)',
            r'\(official.*?\)',
        ]
        
        result = text
        for pattern in patterns:
            result = re.sub(pattern, '', result, flags=re.IGNORECASE)
        
        # Clean up extra spaces
        result = re.sub(r'\s+', ' ', result).strip()
        return result
    
    def _fetch_from_lyrics_ovh(self, title: str, artist: str) -> Optional[str]:
        """
        Fetch lyrics from lyrics.ovh API
        
        Args:
            title: Song title
            artist: Artist name
            
        Returns:
            Lyrics text or None if not found
        """
        try:
            print(f"Trying lyrics.ovh for: {artist} - {title}")
            
            # Normalize inputs
            normalized_artist = self._normalize_query(artist)
            normalized_title = self._normalize_query(title)
            
            # URL encode the parameters
            import urllib.parse
            encoded_artist = urllib.parse.quote(normalized_artist)
            encoded_title = urllib.parse.quote(normalized_title)
            
            url = f"https://api.lyrics.ovh/v1/{encoded_artist}/{encoded_title}"
            
            # Increase timeout to 20 seconds
            response = requests.get(url, timeout=20)
            
            if response.status_code == 200:
                data = response.json()
                lyrics = data.get('lyrics')
                
                if lyrics:
                    print(f"✅ Found lyrics on lyrics.ovh ({len(lyrics)} chars)")
                    return lyrics.strip()
            
            print(f"❌ No lyrics found on lyrics.ovh (status: {response.status_code})")
            return None
            
        except requests.exceptions.Timeout:
            print(f"⏱️ lyrics.ovh timeout - server is slow or unavailable")
            return None
        except requests.exceptions.ConnectionError:
            print(f"🔌 lyrics.ovh connection error - check internet connection")
            return None
        except Exception as e:
            print(f"Error fetching from lyrics.ovh: {e}")
            return None
    
    def _fetch_from_duckduckgo(self, title: str, artist: str) -> Optional[str]:
        """
        Search for lyrics using DuckDuckGo and parse from first result
        
        Args:
            title: Song title
            artist: Artist name
            
        Returns:
            Lyrics text or None if not found
        """
        try:
            print(f"Trying DuckDuckGo search for: {artist} - {title}")
            
            # Normalize inputs
            normalized_artist = self._normalize_query(artist)
            normalized_title = self._normalize_query(title)
            
            # Search query
            query = f"{normalized_artist} {normalized_title} lyrics"
            
            # Use DuckDuckGo HTML search
            import urllib.parse
            encoded_query = urllib.parse.quote(query)
            search_url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            
            response = requests.get(search_url, headers=headers, timeout=15)
            
            if response.status_code != 200:
                print(f"❌ DuckDuckGo search failed (status: {response.status_code})")
                return None
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find first result link
            result_links = soup.find_all('a', class_='result__a')
            
            if not result_links:
                print("❌ No search results found on DuckDuckGo")
                return None
            
            # Get first result URL
            first_result_url = result_links[0].get('href')
            
            if not first_result_url:
                print("❌ No URL in first result")
                return None
            
            # Fix relative URLs from DuckDuckGo
            if first_result_url.startswith('//'):
                first_result_url = 'https:' + first_result_url
            elif not first_result_url.startswith('http'):
                first_result_url = 'https://' + first_result_url
            
            # Handle DuckDuckGo redirect URLs
            if 'duckduckgo.com/l/' in first_result_url:
                # Extract the actual URL from the redirect
                import urllib.parse
                parsed = urllib.parse.urlparse(first_result_url)
                params = urllib.parse.parse_qs(parsed.query)
                if 'uddg' in params:
                    first_result_url = urllib.parse.unquote(params['uddg'][0])
                    print(f"Resolved redirect to: {first_result_url[:100]}...")
            
            print(f"Found result: {first_result_url[:100]}...")
            
            # Try to fetch and parse lyrics from the page
            try:
                page_response = requests.get(first_result_url, headers=headers, timeout=15)
                
                if page_response.status_code == 200:
                    page_soup = BeautifulSoup(page_response.text, 'html.parser')
                    
                    # Remove script and style elements
                    for script in page_soup(["script", "style", "nav", "header", "footer", "aside", "form", "button"]):
                        script.decompose()
                    
                    # Try to find lyrics container (common patterns for various sites)
                    lyrics_containers = [
                        # Genius
                        page_soup.find('div', {'data-lyrics-container': 'true'}),
                        page_soup.find('div', class_=re.compile(r'Lyrics__Container', re.IGNORECASE)),
                        # General lyrics patterns
                        page_soup.find('div', class_=re.compile(r'lyrics', re.IGNORECASE)),
                        page_soup.find('div', id=re.compile(r'lyrics', re.IGNORECASE)),
                        # AZLyrics
                        page_soup.find('div', class_=re.compile(r'ringtone', re.IGNORECASE)),
                        # Musixmatch
                        page_soup.find('div', class_=re.compile(r'mxm-lyrics', re.IGNORECASE)),
                        page_soup.find('span', class_=re.compile(r'lyrics__content', re.IGNORECASE)),
                        # MetroLyrics / SongLyrics
                        page_soup.find('div', class_=re.compile(r'lyrics-body', re.IGNORECASE)),
                        page_soup.find('div', class_=re.compile(r'lyric-body', re.IGNORECASE)),
                        page_soup.find('p', class_=re.compile(r'verse', re.IGNORECASE)),
                        # Some sites use <pre> for lyrics
                        page_soup.find('pre'),
                    ]
                    
                    # Try each container
                    for container in lyrics_containers:
                        if container:
                            text = container.get_text(separator='\n', strip=True)
                            if len(text) > 100:  # Reasonable lyrics length
                                cleaned = self._clean_lyrics(text)
                                if cleaned and len(cleaned) > 100:
                                    print(f"✅ Found lyrics via DuckDuckGo ({len(cleaned)} chars)")
                                    return cleaned
                    
                    # Fallback: try to find the largest text block on the page
                    # This helps with sites that don't use standard selectors
                    print("⚠️ No standard lyrics container found, trying fallback method...")
                    all_divs = page_soup.find_all(['div', 'article', 'section'])
                    
                    best_candidate = None
                    max_lyrics_score = 0
                    
                    for div in all_divs:
                        text = div.get_text(separator='\n', strip=True)
                        
                        # Skip if too short
                        if len(text) < 200:
                            continue
                        
                        # Calculate "lyrics score" based on characteristics
                        lines = [l.strip() for l in text.split('\n') if l.strip()]
                        
                        # Heuristics for lyrics:
                        # 1. Has multiple short-medium lines (typical for song verses)
                        short_lines = sum(1 for l in lines if 5 < len(l) < 100)
                        # 2. Not too many long lines (likely article text)
                        long_lines = sum(1 for l in lines if len(l) > 200)
                        # 3. Has some empty lines (verse breaks)
                        empty_ratio = text.count('\n\n') / max(len(text), 1)
                        
                        # Calculate score
                        score = short_lines * 2 - long_lines * 3 + empty_ratio * 50
                        
                        if score > max_lyrics_score and long_lines < 5:
                            max_lyrics_score = score
                            best_candidate = text
                    
                    if best_candidate:
                        cleaned = self._clean_lyrics(best_candidate)
                        if cleaned and len(cleaned) > 100:
                            print(f"✅ Found lyrics via fallback method ({len(cleaned)} chars)")
                            return cleaned
                    
                    print("❌ Could not extract lyrics from page")
            except Exception as e:
                print(f"Error fetching result page: {e}")
            
            return None
            
        except Exception as e:
            print(f"Error with DuckDuckGo search: {e}")
            return None
    
    def get_lyrics(self, title: str, artist: str) -> Optional[str]:
        """
        Fetch lyrics for a song from multiple sources (lyrics.ovh -> DuckDuckGo)
        
        Args:
            title: Song title
            artist: Artist name
            
        Returns:
            Lyrics text or None if not found
        """
        try:
            print(f"Searching lyrics for: {artist} - {title}")
            
            # Normalize inputs for better search
            normalized_title = self._normalize_query(title)
            normalized_artist = self._normalize_query(artist)
            
            # 1. Try lyrics.ovh first (fast and reliable)
            print("Trying primary source: lyrics.ovh")
            lyrics = self._fetch_from_lyrics_ovh(title, artist)
            
            if lyrics:
                return lyrics
            
            # 2. Fallback to DuckDuckGo search
            print("Trying fallback source: DuckDuckGo search")
            lyrics = self._fetch_from_duckduckgo(title, artist)
            
            if lyrics:
                return lyrics
            
            print("❌ All sources exhausted, no lyrics found")
            return None
            
        except Exception as e:
            print(f"Error fetching lyrics: {e}")
            # Try DuckDuckGo as last resort
            try:
                return self._fetch_from_duckduckgo(title, artist)
            except:
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
        # First check: if lyrics look like a playlist (many lines with " - " separator)
        lines_with_dash = sum(1 for line in lyrics.split('\n') if ' - ' in line and len(line) < 100)
        total_lines = len([l for l in lyrics.split('\n') if l.strip()])
        
        # If more than 30% of lines have " - " pattern, it's likely a playlist
        if total_lines > 20 and lines_with_dash / max(total_lines, 1) > 0.3:
            print("Detected playlist format, rejecting lyrics")
            return ""
        
        # Check for common playlist indicators
        playlist_keywords = ['playlist', 'tracklist', 'feel free to comment', 'must play', 'explicit']
        keyword_count = sum(1 for keyword in playlist_keywords if keyword.lower() in lyrics.lower())
        if keyword_count >= 2:
            print("Detected playlist keywords, rejecting lyrics")
            return ""
        
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
            
            # Filter out "Read More"
            if re.match(r'^Read More$', line, re.IGNORECASE):
                continue
            
            # Filter out track descriptions (multiple patterns)
            # Pattern 1: Starts with quote, contains "is the", "is a", "is about"
            if re.match(r'^[\""].*?[\""]?\s+is\s+(the|a|about)', line, re.IGNORECASE):
                continue
            # Pattern 2: Contains "…" (ellipsis) - often part of descriptions
            if '…' in line and len(line) > 100:
                continue
            # Pattern 3: Ends with ellipsis
            if line.endswith('…'):
                continue
                
            # Common languages headers and garbage
            garbage_lines = [
                'English', 'Russian', 'Español', 'Deutsch', 'Français', 'Italiano', 'Português',
                'Slovenčina', 'Ελληνικά', 'فارسی', 'Magyar', 'Türkçe', 'Русский (Russian)', 
                'Română', 'Polski', 'Українська', '日本語', '한국어',
                'العربية', 'Svenska', 'azərbaycan', 'עברית', 'हिन्दी', 'srpski',
                'Česky', 'Македонски', 'עברית (Hebrew)'
            ]
            if line in garbage_lines:
                continue

            # Filter out bracketed annotations (improved pattern)
            # Matches: [Verse 1], [Chorus], [Pont : version 1], [Couplet 1 : Tito Prince], etc.
            if re.match(r'^\[.+\]$', line):
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

