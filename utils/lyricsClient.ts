export interface LyricsFetchResult {
  source: string;
  lyrics: string;
}

const cleanLyrics = (raw: string) =>
  raw
    .replace(/\r/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const fetchHtml = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'ru,ru-RU;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    }
  });
  if (!res.ok) return null;
  return res.text();
};

const tryLyricsOvh = async (title: string, artist: string): Promise<LyricsFetchResult | null> => {
  try {
    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.lyrics) {
      return { source: 'lyrics.ovh', lyrics: cleanLyrics(data.lyrics) };
    }
  } catch {
    return null;
  }
  return null;
};

const tryGenius = async (title: string, artist: string): Promise<LyricsFetchResult | null> => {
  const token = (import.meta as any)?.env?.VITE_GENIUS_TOKEN || (globalThis as any)?.process?.env?.GENIUS_TOKEN;
  if (!token) return null;

  try {
    const search = await fetch(
      `https://api.genius.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!search.ok) return null;
    const searchJson = await search.json();
    const url = searchJson?.response?.hits?.[0]?.result?.url as string | undefined;
    if (!url) return null;

    const html = await fetchHtml(url);
    if (!html) return null;

    const containers = html.match(/<div class="Lyrics__Container[\s\S]*?<\/div>/gi);
    if (containers && containers.length) {
      const joined = containers.join('\n');
      return { source: 'genius', lyrics: cleanLyrics(joined) };
    }
  } catch {
    return null;
  }
  return null;
};

const extractCandidate = (html: string) => {
  const divCandidate = html.match(/<div[^>]*(lyrics|Lyrics__Container|songLyricsV2|Lyric__container)[^>]*>([\s\S]*?)<\/div>/i)?.[2];
  const preCandidate = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  const pCandidate = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  return divCandidate || preCandidate || pCandidate || null;
};

const tryTextPesni = async (title: string, artist: string): Promise<LyricsFetchResult | null> => {
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const searchHtml = await fetchHtml(`https://text-pesni.com/search?q=${q}`);
    if (!searchHtml) return null;

    const link = searchHtml.match(/<a[^>]+href="([^"]*\/text-pesni\/[^"]+)"[^>]*class="search-link"/i)?.[1];
    if (!link) return null;

    const pageHtml = await fetchHtml(link.startsWith('http') ? link : `https://text-pesni.com${link}`);
    if (!pageHtml) return null;
    const textCandidate = pageHtml.match(/<div class="text"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if (textCandidate) {
      return { source: 'text-pesni', lyrics: cleanLyrics(textCandidate) };
    }
  } catch {
    return null;
  }
  return null;
};

const tryTekstyPesen = async (title: string, artist: string): Promise<LyricsFetchResult | null> => {
  try {
    const q = encodeURIComponent(`${title} ${artist}`);
    const searchHtml = await fetchHtml(`https://teksty-pesen.ru/search?q=${q}`);
    if (!searchHtml) return null;

    const link = searchHtml.match(/<a[^>]+href="([^"]*\/text\/[^"]+)"[^>]*>/i)?.[1];
    if (!link) return null;

    const fullLink = link.startsWith('http') ? link : `https://teksty-pesen.ru${link}`;
    const pageHtml = await fetchHtml(fullLink);
    if (!pageHtml) return null;

    const textCandidate =
      pageHtml.match(/<div class="text"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
      pageHtml.match(/<div class="lyrics"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if (textCandidate) {
      return { source: 'teksty-pesen', lyrics: cleanLyrics(textCandidate) };
    }
  } catch {
    return null;
  }
  return null;
};

const tryDuckDuckGo = async (title: string, artist: string): Promise<LyricsFetchResult | null> => {
  const queries = [
    `${title} ${artist} lyrics`,
    `${title} ${artist} текст песни`,
    `${artist} ${title} текст песни`,
    `${title} текст Soltwine` // пробуем вариант без слова lyrics
  ];

  const getLink = (html: string) => {
    const encodedLink = html.match(/\/l\/\?kh=[^"]*?&uddg=([^"&]+)/i)?.[1];
    const directLink = encodedLink ? decodeURIComponent(encodedLink) : null;
    const fallbackLink = html.match(/https?:\/\/[^\s"]*(lyrics|songlyrics|azlyrics|musixmatch|text-pesni|tekst-pesni|amalgama)[^\s"]*/i)?.[0];
    return (directLink || fallbackLink)?.replace(/&amp;/g, '&') || null;
  };

  for (const q of queries) {
    try {
      const html = await fetchHtml(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
      if (!html) continue;
      const link = getLink(html);
      if (!link) continue;

      const pageHtml = await fetchHtml(link);
      if (!pageHtml) continue;
      const textCandidate = extractCandidate(pageHtml);

      if (textCandidate) {
        return { source: 'duckduckgo', lyrics: cleanLyrics(textCandidate) };
      }
    } catch {
      continue;
    }
  }

  return null;
};

export const fetchLyrics = async (title: string, artist: string): Promise<LyricsFetchResult> => {
  // Order: quick public API → RU-friendly sites → search (with RU query) → Genius (if token provided)
  const attempts = [tryLyricsOvh, tryTextPesni, tryTekstyPesen, tryDuckDuckGo, tryGenius];

  for (const attempt of attempts) {
    const res = await attempt(title, artist);
    if (res?.lyrics) return res;
  }

  throw new Error('Текст песни не найден в доступных источниках.');
};
