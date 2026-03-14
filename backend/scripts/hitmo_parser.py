"""
Hitmo Music Parser - Selenium Implementation
Парсер для извлечения музыки с сайта rus.hitmotop.com
Использует Selenium для работы с JavaScript-контентом
"""

from typing import List, Dict, Optional
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
import time
import os


class HitmoParser:
    """Парсер для поиска и получения музыки с Hitmo"""
    
    BASE_URL = "https://rus.hitmotop.com"
    SEARCH_URL = f"{BASE_URL}/search"
    
    def __init__(self):
        """Инициализация парсера"""
        self.driver = None
        print("[Hitmo] Parser initialized")
    
    def _init_driver(self):
        """Инициализация Selenium WebDriver"""
        if self.driver is None:
            try:
                print("[Hitmo] Initializing Chrome Driver...")
                chrome_options = Options()
                chrome_options.add_argument('--headless')
                chrome_options.add_argument('--no-sandbox')
                chrome_options.add_argument('--disable-dev-shm-usage')
                chrome_options.add_argument('--disable-gpu')
                chrome_options.add_argument('--window-size=1920,1080')
                chrome_options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                
                # Force install/update driver
                driver_path = ChromeDriverManager().install()
                print(f"[Hitmo] Driver path from manager: {driver_path}")
                
                # Fix for WinError 193: webdriver-manager might return a non-executable file
                if not driver_path.endswith(".exe"):
                    # Check in the same directory
                    driver_dir = os.path.dirname(driver_path)
                    potential_exe = os.path.join(driver_dir, "chromedriver.exe")
                    
                    if os.path.exists(potential_exe):
                        driver_path = potential_exe
                    else:
                        # Search in the directory tree
                        print("[Hitmo] Searching for chromedriver.exe...")
                        found = False
                        for root, dirs, files in os.walk(os.path.dirname(driver_dir)):
                            if "chromedriver.exe" in files:
                                driver_path = os.path.join(root, "chromedriver.exe")
                                found = True
                                break
                        if not found:
                            print("[Hitmo] WARNING: chromedriver.exe not found in search paths")

                print(f"[Hitmo] Final driver path: {driver_path}")
                
                service = Service(driver_path)
                self.driver = webdriver.Chrome(service=service, options=chrome_options)
                print("[Hitmo] WebDriver initialized successfully")
            except Exception as e:
                print(f"[Hitmo] Error initializing driver: {e}")
                raise
    
    def search(self, query: str, limit: int = 20, page: int = 1) -> List[Dict]:
        """
        Поиск треков по запросу
        
        Args:
            query: Поисковый запрос
            limit: Максимальное количество результатов
            page: Номер страницы (начинается с 1)
            
        Returns:
            Список треков
        """
        try:
            self._init_driver()
            
            print(f"[Hitmo] Searching for: {query}, page: {page}")
            
            # Hitmo использует параметр start для пагинации
            # Используем limit как шаг пагинации, чтобы не было разрывов
            start = (page - 1) * limit
            
            # Переходим на страницу поиска
            search_url = f"{self.SEARCH_URL}?q={query}&start={start}"
            self.driver.get(search_url)
            
            # Ждем загрузки страницы
            time.sleep(2)
            
            # Пытаемся найти треки
            try:
                WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, '.track, [data-id]'))
                )
            except:
                print("[Hitmo] No tracks found on page (timeout)")
                # Сохраним скриншот для отладки
                try:
                    self.driver.save_screenshot('debug_screenshot.png')
                    print("[Hitmo] Saved debug_screenshot.png")
                except:
                    pass
                return []
            
            # Извлекаем треки через JavaScript
            tracks = self.driver.execute_script('''
                const trackElements = document.querySelectorAll('.track, li[data-id], div[data-id]');
                const results = [];
                
                trackElements.forEach((el, index) => {
                    try {
                        // Название и исполнитель
                        let title = '';
                        let artist = '';
                        
                        const titleEl = el.querySelector('.track__title, .title, [class*="title"]');
                        const artistEl = el.querySelector('.track__desc, .artist, [class*="artist"]');
                        
                        if (titleEl) title = titleEl.textContent.trim();
                        if (artistEl) artist = artistEl.textContent.trim();
                        
                        // Если не нашли, пробуем извлечь из текста
                        if (!title || !artist) {
                            const text = el.textContent.trim();
                            if (text.includes(' - ')) {
                                const parts = text.split(' - ');
                                if (!artist) artist = parts[0].trim();
                                if (!title) title = parts[1] ? parts[1].trim() : parts[0].trim();
                            }
                        }

                        // ID трека
                        let id = el.getAttribute('data-id') || el.id;
                        
                        // Если ID нет, генерируем хэш из названия и исполнителя
                        if (!id && title && artist) {
                            const str = artist + title;
                            let hash = 0;
                            for (let i = 0; i < str.length; i++) {
                                const char = str.charCodeAt(i);
                                hash = ((hash << 5) - hash) + char;
                                hash = hash & hash;
                            }
                            id = `gen_${Math.abs(hash)}`;
                        } else if (!id) {
                             id = `track_${index}_${Date.now()}`;
                        }
                        
                        // Длительность
                        let duration = 180; // default
                        const durationEl = el.querySelector('.track__time, .duration, [class*="time"]');
                        if (durationEl) {
                            const timeText = durationEl.textContent.trim();
                            const parts = timeText.split(':');
                            if (parts.length === 2) {
                                duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                            }
                        }
                        
                        // URL аудио
                        let audioUrl = '';
                        const downloadBtn = el.querySelector('a[href*=".mp3"], a[href*=".m4a"], [data-url]');
                        if (downloadBtn) {
                            audioUrl = downloadBtn.getAttribute('href') || downloadBtn.getAttribute('data-url') || '';
                        }
                        
                        // Обложка
                        let imageUrl = '';
                        const img = el.querySelector('img');
                        if (img) {
                            imageUrl = img.src || img.getAttribute('data-src') || '';
                        }
                        
                        // Если картинки нет, ищем в background-image
                        if (!imageUrl) {
                            const imgDiv = el.querySelector('.track__img, .track__cover, .cover, [class*="img"]');
                            if (imgDiv) {
                                const style = window.getComputedStyle(imgDiv);
                                const bgImage = style.backgroundImage;
                                if (bgImage && bgImage !== 'none') {
                                    // Extract url(...) content
                                    const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
                                    if (match && match[1]) {
                                        imageUrl = match[1];
                                    }
                                }
                            }
                        }
                        
                        if (title && artist) {
                            results.push({
                                id: id,
                                title: title,
                                artist: artist,
                                duration: duration,
                                url: audioUrl,
                                image: imageUrl
                            });
                        }
                    } catch (e) {
                        console.error('Error parsing track:', e);
                    }
                });
                
                return results;
            ''')
            
            # Обрабатываем результаты с удалением дубликатов
            formatted_tracks = []
            seen_tracks = set()
            
            for track in tracks:
                # Нормализуем для сравнения
                artist_norm = track['artist'].lower().strip()
                title_norm = track['title'].lower().strip()
                track_key = (artist_norm, title_norm)
                
                if track_key in seen_tracks:
                    continue
                
                formatted_track = self._format_track(track)
                if formatted_track:
                    formatted_tracks.append(formatted_track)
                    seen_tracks.add(track_key)
                    
                    print(f"[Hitmo] Found: {track['artist']} - {track['title']}")
                    print(f"[Hitmo] URL: {formatted_track['url']}")
                    print(f"[Hitmo] Image: {formatted_track['image']}")
                
                if len(formatted_tracks) >= limit:
                    break
            
            print(f"[Hitmo] Total unique tracks found: {len(formatted_tracks)}")
            return formatted_tracks
            
        except Exception as e:
            print(f"[Hitmo] Search error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _format_track(self, track: dict) -> Optional[Dict]:
        """Форматирование трека"""
        try:
            # Проверяем обязательные поля
            if not track.get('title') or not track.get('artist'):
                return None
            
            # Формируем полный URL для аудио
            audio_url = track.get('url', '')
            if audio_url and not audio_url.startswith('http'):
                audio_url = self.BASE_URL + audio_url
            
            # Формируем полный URL для изображения
            image_url = track.get('image', '')
            if image_url and not image_url.startswith('http'):
                image_url = self.BASE_URL + image_url
            
            # Если нет изображения, используем placeholder
            if not image_url:
                image_url = f"https://ui-avatars.com/api/?name={track['artist']}+{track['title']}&size=400&background=random"
            
            return {
                'id': track['id'],
                'title': track['title'],
                'artist': track['artist'],
                'duration': track.get('duration', 180),
                'url': audio_url,
                'image': image_url
            }
        except Exception as e:
            print(f"[Hitmo] Error formatting track: {e}")
            return None
    
    def close(self):
        """Закрытие WebDriver"""
        try:
            if self.driver:
                self.driver.quit()
                self.driver = None
                print("[Hitmo] WebDriver closed")
        except Exception as e:
            print(f"[Hitmo] Error closing driver: {e}")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
