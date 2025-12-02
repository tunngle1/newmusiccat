import httpx
from bs4 import BeautifulSoup
import re
from typing import List, Dict, Optional
import urllib.parse
import asyncio
import os
import random

class HitmoParser:
    """
    Lightweight parser for Hitmo using httpx and BeautifulSoup.
    Suitable for Vercel/Serverless environments.
    Supports proxy rotation and custom user agents.
    """
    
    BASE_URL = "https://rus.hitmotop.com"
    SEARCH_URL = f"{BASE_URL}/search"
    
    def __init__(self):
        # Load proxy list from environment
        proxy_list_str = os.getenv("PROXY_LIST", "")
        self.proxy_list = [p.strip() for p in proxy_list_str.split(",") if p.strip()]
        
        # Default headers (fallback)
        self.default_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': self.BASE_URL,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        }
    
    def _get_random_proxy(self) -> Optional[str]:
        """Get random proxy from the list"""
        if not self.proxy_list:
            return None
        return random.choice(self.proxy_list)
    
    def _prepare_headers(self, user_agent: Optional[str] = None) -> dict:
        """Prepare headers with custom user agent if provided"""
        headers = self.default_headers.copy()
        if user_agent:
            headers['User-Agent'] = user_agent
        return headers
        
    async def search(self, query: str, limit: int = 20, page: int = 1, user_agent: Optional[str] = None) -> List[Dict]:
        """
        Search for tracks (Async)
        
        Args:
            query: Search query
            limit: Number of results
            page: Page number
            user_agent: Custom user agent from real user (optional)
        """
        try:
            params = {
                'q': query,
                'start': (page - 1) * limit # Use limit for offset calculation
            }
            
            # Prepare headers with custom user agent
            headers = self._prepare_headers(user_agent)
            
            # Get random proxy if available
            proxy = self._get_random_proxy()
            proxies = {"http://": proxy, "https://": proxy} if proxy else None
            
            async with httpx.AsyncClient(
                headers=headers, 
                timeout=10.0,
                proxies=proxies
            ) as client:
                response = await client.get(self.SEARCH_URL, params=params)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                tracks_data = []
                
                track_elements = soup.select('.tracks__item')
                
                # 1. Parse basic info
                for el in track_elements:
                    if len(tracks_data) >= limit:
                        break
                        
                    try:
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
                        
                        try:
                            mins, secs = map(int, duration_str.split(':'))
                            duration = mins * 60 + secs
                        except:
                            duration = 0
                            
                        url = download_el.get('href')
                        if not url:
                            continue
                            
                        track_id = el.get('data-track-id')
                        if not track_id:
                            track_id = f"gen_{abs(hash(artist + title))}"
                            
                        # Extract fallback cover from style
                        fallback_image = None
                        if cover_el:
                            style = cover_el.get('style', '')
                            match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
                            if match:
                                fallback_image = match.group(1)
                        
                        tracks_data.append({
                            'id': track_id,
                            'title': title,
                            'artist': artist,
                            'duration': duration,
                            'url': url,
                            'fallback_image': fallback_image,
                            'image': None # Will be filled later
                        })
                        
                    except Exception as e:
                        print(f"Error parsing track: {e}")
                        continue
                
                # 2. Fetch covers (Deezer -> iTunes) in parallel
                tasks = []
                for track in tracks_data:
                    tasks.append(self._get_best_cover(client, track['artist'], track['title']))
                
                covers = await asyncio.gather(*tasks)
                
                # 3. Merge covers
                final_tracks = []
                for track, cover in zip(tracks_data, covers):
                    image = cover
                    if not image:
                        image = track['fallback_image']
                    if not image:
                        image = f"https://ui-avatars.com/api/?name={urllib.parse.quote(track['artist'])}&size=200&background=random"
                    
                    track['image'] = image
                    del track['fallback_image'] # Clean up
                    final_tracks.append(track)
                    
                return final_tracks
                
        except Exception as e:
            print(f"Search error: {e}")
            return []

    async def _get_deezer_cover(self, client: httpx.AsyncClient, artist: str, title: str) -> Optional[str]:
        """
        Get high quality cover from Deezer API
        """
        try:
            query = f'artist:"{artist}" track:"{title}"'
            resp = await client.get("https://api.deezer.com/search", params={"q": query, "limit": 1})
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("data"):
                album = data["data"][0].get("album", {})
                return album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium")
            return None
        except:
            return None

    async def _get_itunes_cover(self, client: httpx.AsyncClient, artist: str, title: str) -> Optional[str]:
        """
        Get high quality cover from iTunes API (Async)
        """
        try:
            term = f"{artist} {title}"
            params = {
                'term': term,
                'media': 'music',
                'entity': 'song',
                'limit': 1
            }
            
            # Use the existing client session
            response = await client.get("https://itunes.apple.com/search", params=params)
            
            if response.status_code == 200:
                data = response.json()
                if data['resultCount'] > 0:
                    artwork = data['results'][0].get('artworkUrl100')
                    if artwork:
                        return re.sub(r'\d+x\d+bb', '1000x1000bb', artwork)
            return None
        except:
            return None

    async def _get_best_cover(self, client: httpx.AsyncClient, artist: str, title: str) -> Optional[str]:
        """
        Try Deezer first, then iTunes
        """
        cover = await self._get_deezer_cover(client, artist, title)
        if cover:
            return cover
        return await self._get_itunes_cover(client, artist, title)
    
    async def get_genre_tracks(self, genre_id: int, limit: int = 20, page: int = 1, user_agent: Optional[str] = None) -> List[Dict]:
        """
        Get tracks from a specific genre (Async)
        """
        try:
            url = f"{self.BASE_URL}/genre/{genre_id}"
            params = {
                'start': (page - 1) * limit
            }
            
            # Prepare headers with custom user agent
            headers = self._prepare_headers(user_agent)
            
            # Get random proxy if available
            proxy = self._get_random_proxy()
            proxies = {"http://": proxy, "https://": proxy} if proxy else None
            
            async with httpx.AsyncClient(
                headers=headers, 
                timeout=10.0, 
                follow_redirects=True,
                proxies=proxies
            ) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                tracks_data = []
                
                track_elements = soup.select('.tracks__item')
                
                for el in track_elements:
                    if len(tracks_data) >= limit:
                        break
                        
                    try:
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
                        
                        try:
                            mins, secs = map(int, duration_str.split(':'))
                            duration = mins * 60 + secs
                        except:
                            duration = 0
                            
                        url = download_el.get('href')
                        if not url:
                            continue
                            
                        track_id = el.get('data-track-id')
                        if not track_id:
                            track_id = f"gen_{abs(hash(artist + title))}"
                            
                        fallback_image = None
                        if cover_el:
                            style = cover_el.get('style', '')
                            match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
                            if match:
                                fallback_image = match.group(1)
                        
                        tracks_data.append({
                            'id': track_id,
                            'title': title,
                            'artist': artist,
                            'duration': duration,
                            'url': url,
                            'fallback_image': fallback_image,
                            'image': None
                        })
                        
                    except Exception as e:
                        print(f"Error parsing track: {e}")
                        continue
                
                # Fetch covers in parallel
                tasks = []
                for track in tracks_data:
                    tasks.append(self._get_best_cover(client, track['artist'], track['title']))
                
                covers = await asyncio.gather(*tasks)
                
                final_tracks = []
                for track, cover in zip(tracks_data, covers):
                    image = cover
                    if not image:
                        image = track['fallback_image']
                    if not image:
                        image = f"https://ui-avatars.com/api/?name={urllib.parse.quote(track['artist'])}&size=200&background=random"
                    
                    track['image'] = image
                    del track['fallback_image']
                    final_tracks.append(track)
                    
                return final_tracks
                
        except Exception as e:
            print(f"Genre tracks error: {e}")
            return []

    def get_radio_stations(self) -> List[Dict]:
        """
        Get list of popular radio stations
        Since Hitmo doesn't have a dedicated radio section, we'll provide popular Russian radio streams
        """
        # Popular Russian radio stations with direct stream URLs
        stations = [
            {
                'id': 'rusradio',
                'name': 'Русское Радио',
                'genre': 'Поп',
                'url': 'https://rusradio.hostingradio.ru/rusradio96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6891q.png'
            },
            {
                'id': 'avtoradio',
                'name': 'Авторадио',
                'genre': 'Поп',
                'url': 'https://pub0302.101.ru:8443/stream/air/aac/64/100',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6891q.png'
            },
            {
                'id': 'europaplus',
                'name': 'Европа Плюс',
                'genre': 'Поп',
                'url': 'https://ep128.hostingradio.ru:8030/ep128',
                'image': 'https://cdn-profiles.tunein.com/s8439/images/logog.png'
            },
            {
                'id': 'retrofm',
                'name': 'Ретро FM',
                'genre': 'Ретро',
                'url': 'https://retro.hostingradio.ru:8043/retro128',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6884q.png'
            },
            {
                'id': 'dorozhnoe',
                'name': 'Дорожное Радио',
                'genre': 'Шансон',
                'url': 'https://dorognoe.hostingradio.ru/dorognoe96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6894q.png'
            },
            {
                'id': 'vestifm',
                'name': 'Вести FM',
                'genre': 'Новости',
                'url': 'https://icecast-vgtrk.cdnvideo.ru/vestifm_mp3_128kbps',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6895q.png'
            },
            {
                'id': 'mayak',
                'name': 'Радио Маяк',
                'genre': 'Разговорное',
                'url': 'https://icecast-vgtrk.cdnvideo.ru/mayakfm_mp3_128kbps',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6896q.png'
            },
            {
                'id': 'radiovanya',
                'name': 'Радио Ваня',
                'genre': 'Поп',
                'url': 'https://icecast-van.cdnvideo.ru/radio_vanya',
                'image': 'https://cdn-radiotime-logos.tunein.com/s102736q.png'
            },
            {
                'id': 'radiorecord',
                'name': 'Радио Рекорд',
                'genre': 'Электроника',
                'url': 'https://radiorecord.hostingradio.ru/rr_main96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s25419q.png'
            },
            {
                'id': 'nashe',
                'name': 'Наше Радио',
                'genre': 'Рок',
                'url': 'https://nashe1.hostingradio.ru/nashe-128.mp3',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6889q.png'
            },
            {
                'id': 'dfm',
                'name': 'DFM',
                'genre': 'Танцевальная',
                'url': 'https://dfm.hostingradio.ru/dfm96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6881q.png'
            },
            {
                'id': 'hitfm',
                'name': 'Хит FM',
                'genre': 'Хиты',
                'url': 'https://hitfm.hostingradio.ru/hitfm96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6887q.png'
            },
            {
                'id': 'chanson',
                'name': 'Радио Шансон',
                'genre': 'Шансон',
                'url': 'https://chanson.hostingradio.ru:8041/chanson128.mp3',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6885q.png'
            },
            {
                'id': 'humorfm',
                'name': 'Юмор FM',
                'genre': 'Юмор',
                'url': 'https://pub0302.101.ru:8443/stream/air/aac/64/104',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6892q.png'
            },
            {
                'id': 'energy',
                'name': 'Радио ENERGY',
                'genre': 'Хиты',
                'url': 'https://pub0302.101.ru:8443/stream/air/aac/64/99',
                'image': 'https://cdn-radiotime-logos.tunein.com/s24939q.png'
            },
            {
                'id': 'likefm',
                'name': 'Like FM',
                'genre': 'Хиты',
                'url': 'https://pub0302.101.ru:8443/stream/air/aac/64/202',
                'image': 'https://cdn-radiotime-logos.tunein.com/s259461q.png'
            },
            {
                'id': 'comedy',
                'name': 'Comedy Radio',
                'genre': 'Юмор',
                'url': 'https://pub0302.101.ru:8443/stream/air/aac/64/202',
                'image': 'https://cdn-radiotime-logos.tunein.com/s185072q.png'
            },
            {
                'id': 'relaxfm',
                'name': 'Relax FM',
                'genre': 'Релакс',
                'url': 'https://pub0302.101.ru:8443/stream/air/aac/64/200',
                'image': 'https://cdn-radiotime-logos.tunein.com/s89642q.png'
            },
            {
                'id': 'romantika',
                'name': 'Радио Romantika',
                'genre': 'Романтика',
                'url': 'https://pub0302.101.ru:8443/stream/air/aac/64/204',
                'image': 'https://cdn-radiotime-logos.tunein.com/s133641q.png'
            },
            {
                'id': 'jazz',
                'name': 'Радио JAZZ',
                'genre': 'Джаз',
                'url': 'https://nashe1.hostingradio.ru/jazz-128.mp3',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6888q.png'
            },
            {
                'id': 'classic',
                'name': 'Радио Classic',
                'genre': 'Классика',
                'url': 'https://nashe1.hostingradio.ru/classic-128.mp3',
                'image': 'https://cdn-radiotime-logos.tunein.com/s29505q.png'
            },
            {
                'id': 'montecarlo',
                'name': 'Monte Carlo',
                'genre': 'Лаунж',
                'url': 'https://montecarlo.hostingradio.ru/montecarlo96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6890q.png'
            },
            {
                'id': 'maximum',
                'name': 'Радио MAXIMUM',
                'genre': 'Рок',
                'url': 'https://maximum.hostingradio.ru/maximum96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6886q.png'
            },
            {
                'id': 'radio7',
                'name': 'Радио 7',
                'genre': 'Поп',
                'url': 'https://radio7.hostingradio.ru/radio7_96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6893q.png'
            },
            {
                'id': 'newradio',
                'name': 'Новое Радио',
                'genre': 'Поп',
                'url': 'https://icecast-newradio.cdnvideo.ru/newradio',
                'image': 'https://cdn-radiotime-logos.tunein.com/s268066q.png'
            },
            {
                'id': 'montecarlo',
                'name': 'Монте-Карло',
                'genre': 'Релакс',
                'url': 'https://montecarlo.hostingradio.ru/montecarlo96.aacp',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6883q.png'
            },
            {
                'id': 'relaxfm',
                'name': 'Relax FM',
                'genre': 'Релакс',
                'url': 'https://relaxfm.hostingradio.ru/relax128.mp3',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6886q.png'
            },
            {
                'id': 'radiorossii',
                'name': 'Радио Россия',
                'genre': 'Разговорное',
                'url': 'https://icecast-vgtrk.cdnvideo.ru/rrzonam_mp3_192kbps',
                'image': 'https://cdn-radiotime-logos.tunein.com/s6933q.png'
            }
        ]
        
        return stations

    def close(self):
        pass
