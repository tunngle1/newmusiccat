import httpx
from bs4 import BeautifulSoup
import asyncio

async def main():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://rus.hitmotop.com',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    url = "https://rus.hitmotop.com/genres"
    
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        print(f"Fetching {url}...")
        response = await client.get(url)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            # Look for genre links. Usually they look like /genre/123
            links = soup.find_all('a', href=True)
            
            genres = []
            for link in links:
                href = link['href']
                if '/genre/' in href:
                    text = link.text.strip()
                    try:
                        genre_id = int(href.split('/')[-1])
                        genres.append((text, genre_id))
                    except ValueError:
                        pass
            
            # Sort by ID
            genres.sort(key=lambda x: x[1])
            
            print(f"Found {len(genres)} genres:")
            for name, gid in genres:
                print(f"{gid}: {name}")

if __name__ == "__main__":
    asyncio.run(main())
