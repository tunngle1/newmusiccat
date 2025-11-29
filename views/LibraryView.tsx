import React, { useRef, useEffect, useState } from 'react';
import { Upload, FileAudio, Music2, Trash2, Play, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types';
import { storage } from '../utils/storage';

const LibraryView: React.FC = () => {
  const { addTrack, playTrack, currentTrack, isPlaying, removeDownloadedTrack, togglePlay, markTrackAsDownloaded } = usePlayer();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [storageInfo, setStorageInfo] = useState<{
    usedMB: string;
    quotaMB: string;
    remainingMB: number;
    estimatedTracks: number;
    isPersisted: boolean;
  } | null>(null);

  // YouTube State
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isYoutubeLoading, setIsYoutubeLoading] = useState(false);
  const [isDownloadingApp, setIsDownloadingApp] = useState(false);
  const [isDownloadingChat, setIsDownloadingChat] = useState(false);
  const [foundYoutubeTrack, setFoundYoutubeTrack] = useState<Track | null>(null);

  const handleYoutubeSearch = async () => {
    if (!youtubeUrl.trim()) return;
    setIsYoutubeLoading(true);
    setFoundYoutubeTrack(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/youtube/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl })
      });
      if (!response.ok) throw new Error('Не удалось найти видео');
      const track = await response.json();
      setFoundYoutubeTrack(track);
    } catch (e) {
      alert('Ошибка: ' + e);
    } finally {
      setIsYoutubeLoading(false);
    }
  };

  const handleYoutubeDownload = async (target: 'app' | 'chat') => {
    if (!foundYoutubeTrack) return;

    try {
      if (target === 'app') {
        setIsDownloadingApp(true);
        // Download to App via Server File Download (Reliable)
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const downloadUrl = `${apiUrl}/api/youtube/download_file?url=${encodeURIComponent(youtubeUrl)}`;

        const audioRes = await fetch(downloadUrl);
        if (!audioRes.ok) throw new Error('Failed to download audio file from server');

        const audioBlob = await audioRes.blob();
        const objectUrl = URL.createObjectURL(audioBlob);

        // Try to get cover blob
        let coverBlob = null;
        try {
          const coverRes = await fetch(foundYoutubeTrack.image);
          coverBlob = await coverRes.blob();
        } catch (e) { console.warn("Failed to fetch cover", e); }

        const newTrack: Track = {
          ...foundYoutubeTrack,
          audioUrl: objectUrl,
          coverUrl: foundYoutubeTrack.image, // Keep original URL as fallback
          isLocal: true
        };

        addTrack(newTrack);
        await storage.saveTrack(newTrack, audioBlob, coverBlob);
        markTrackAsDownloaded(newTrack.id);

        setLibraryTracks(prev => [newTrack, ...prev]);
        setYoutubeUrl('');
        setFoundYoutubeTrack(null);

        // Auto-play the new track
        playTrack(newTrack);

        alert('Трек сохранен и запущен!');
      } else {
        setIsDownloadingChat(true);
        // Download to Chat
        const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (!user) {
          alert('Ошибка: Не удалось определить пользователя Telegram');
          return;
        }

        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/download/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            track: foundYoutubeTrack
          })
        });

        if (!response.ok) throw new Error('Ошибка отправки в чат');
        alert('Трек отправлен в чат!');
        setYoutubeUrl('');
        setFoundYoutubeTrack(null);
      }
    } catch (e) {
      alert('Ошибка загрузки: ' + e);
    } finally {
      setIsDownloadingApp(false);
      setIsDownloadingChat(false);
    }
  };

  useEffect(() => {
    loadLibraryTracks();
    loadStorageInfo();
  }, []);

  const loadLibraryTracks = async () => {
    const tracks = await storage.getAllTracks();
    // Filter only downloaded tracks (isLocal = true) and sort by newest
    const downloadedTracks = tracks.filter(t => t.isLocal);
    setLibraryTracks(downloadedTracks.reverse());
  };

  const loadStorageInfo = async () => {
    try {
      let isPersisted = false;
      if (navigator.storage && navigator.storage.persisted) {
        isPersisted = await navigator.storage.persisted();
      }

      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        const usedBytes = estimate.usage || 0;
        const quotaBytes = estimate.quota || 0;
        const remainingBytes = quotaBytes - usedBytes;

        const usedMB = (usedBytes / 1024 / 1024).toFixed(2);
        const quotaMB = (quotaBytes / 1024 / 1024).toFixed(2);
        const remainingMB = remainingBytes / 1024 / 1024;

        // Average track size ~8MB
        const estimatedTracks = Math.floor(remainingMB / 8);

        setStorageInfo({ usedMB, quotaMB, remainingMB, estimatedTracks, isPersisted });
      }
    } catch (error) {
      console.error('Error loading storage info:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file: File) => {
        // Создаем временный URL для локального файла
        const objectUrl = URL.createObjectURL(file);

        // Попытка извлечь метаданные (здесь упрощенно используем имя файла)
        const nameParts = file.name.replace(/\.[^/.]+$/, "").split('-');
        const artist = nameParts.length > 1 ? nameParts[0].trim() : 'Неизвестный исполнитель';
        const title = nameParts.length > 1 ? nameParts[1].trim() : nameParts[0].trim();

        const newTrack: Track = {
          id: `local_${Date.now()}_${Math.random()}`,
          title,
          artist,
          coverUrl: `https://picsum.photos/400/400?random=${Date.now()}`,
          audioUrl: objectUrl,
          duration: 0,
          isLocal: true
        };

        addTrack(newTrack);
        // Можно также сохранять загруженные файлы в storage, но пока оставим только в памяти
      });
    }
  };

  const handleDelete = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    if (confirm('Удалить этот трек из загрузок?')) {
      await removeDownloadedTrack(trackId);
      setLibraryTracks(prev => prev.filter(t => t.id !== trackId));
      // Reload storage info after deletion
      loadStorageInfo();
    }
  };

  return (
    <div className="px-4 py-8 space-y-6 animate-fade-in-up pb-24">
      <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
        Медиатека
      </h1>

      {/* Storage Info Card */}
      {storageInfo && (
        <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Хранилище</h3>
              <p className="text-xs text-gray-400">
                Использовано: {storageInfo.usedMB} МБ / {storageInfo.quotaMB} МБ
              </p>
              <p className="text-xs text-blue-400 mt-1 font-medium">
                Можно скачать еще ~{storageInfo.estimatedTracks} треков
              </p>
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${storageInfo.isPersisted
              ? 'bg-green-500/20 text-green-400'
              : 'bg-yellow-500/20 text-yellow-400'
              }`}>
              {storageInfo.isPersisted ? '🔒 Защищено' : '⚠️ Не защищено'}
            </div>
          </div>
          {!storageInfo.isPersisted && (
            <p className="text-xs text-gray-500 mt-2">
              💡 Данные могут быть удалены при нехватке места. Не очищайте кэш Telegram вручную.
            </p>
          )}
        </div>
      )}

      {/* YouTube Download Section */}
      <div className="bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-white/10 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="text-red-500">▶</span> Скачать с YouTube
        </h3>

        <div className="flex gap-2">
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Ссылка на видео..."
            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50"
          />
          <button
            onClick={handleYoutubeSearch}
            disabled={isYoutubeLoading || !youtubeUrl}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isYoutubeLoading ? <Loader2 size={16} className="animate-spin" /> : 'Найти'}
          </button>
        </div>

        {foundYoutubeTrack && (
          <div className="bg-black/20 rounded-lg p-3 flex items-center gap-3 mt-2">
            <img src={foundYoutubeTrack.image} alt="Cover" className="w-10 h-10 rounded object-cover" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{foundYoutubeTrack.title}</div>
              <div className="text-xs text-gray-400 truncate">{foundYoutubeTrack.artist}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleYoutubeDownload('app')}
                disabled={isDownloadingApp || isDownloadingChat}
                className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50"
                title="Скачать в приложение"
              >
                {isDownloadingApp ? <Loader2 size={18} className="animate-spin" /> : <FileAudio size={18} />}
              </button>
              <button
                onClick={() => handleYoutubeDownload('chat')}
                disabled={isDownloadingApp || isDownloadingChat}
                className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 disabled:opacity-50"
                title="Отправить в чат"
              >
                {isDownloadingChat ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="w-full h-24 border-2 border-dashed border-gray-700 rounded-2xl flex flex-col items-center justify-center bg-gray-900/30 hover:bg-gray-800/50 transition-colors cursor-pointer group"
      >
        <Upload size={24} className="text-gray-500 group-hover:text-blue-400 mb-2 transition-colors" />
        <span className="text-sm font-medium text-gray-400 group-hover:text-gray-300">Загрузить файл</span>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="audio/*"
          multiple
          className="hidden"
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-200">
          <Music2 size={20} className="text-blue-500" />
          <span>Скачанные треки</span>
          <span className="text-xs text-gray-500 font-normal ml-2">({libraryTracks.length})</span>
        </h2>

        {libraryTracks.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm bg-white/5 rounded-2xl">
            <Music2 size={32} className="mx-auto mb-3 opacity-20" />
            <p>Здесь пока пусто.</p>
            <p className="text-xs mt-1">Скачивайте музыку, чтобы слушать её офлайн.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {libraryTracks.map(track => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  onClick={() => {
                    if (currentTrack?.id === track.id) {
                      togglePlay();
                    } else {
                      playTrack(track, libraryTracks);
                    }
                  }}
                  className={`flex items-center p-3 rounded-xl transition-all cursor-pointer ${isCurrent ? 'bg-white/10 border border-white/5' : 'bg-gray-800/30 border border-transparent hover:bg-gray-800/50'
                    }`}
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 mr-3">
                    <img
                      src={track.coverUrl}
                      alt={track.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(track.artist)}&size=200&background=random`;
                      }}
                    />
                    <div className={`absolute inset-0 bg-black/40 flex items-center justify-center ${isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}>
                      {isCurrent && isPlaying ? (
                        <div className="flex space-x-[2px] items-end h-3">
                          <div className="w-[2px] bg-white animate-bounce h-2"></div>
                          <div className="w-[2px] bg-white animate-bounce h-3 delay-75"></div>
                          <div className="w-[2px] bg-white animate-bounce h-2 delay-150"></div>
                        </div>
                      ) : (
                        <Play size={16} fill="white" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium truncate ${isCurrent ? 'text-blue-400' : 'text-white'}`}>{track.title}</h4>
                    <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, track.id)}
                    className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryView;