import React, { useState, useEffect, useRef } from 'react';
import { Track, Playlist } from './types';
import { 
  PlayIcon, PauseIcon, SkipForwardIcon, SkipBackIcon, SearchIcon,
  HomeIcon, PlaylistIcon, HeartIcon, RadioIcon, LibraryIcon,
  DownloadIcon, SendIcon, YoutubeIcon, CheckIcon,
  MenuIcon, CloseIcon, StarIcon, UsersIcon, LockIcon, PlusIcon, ChartIcon, CopyIcon,
  ChevronDownIcon, RepeatIcon, LyricsIcon
} from './components/Icons';
import { Visualizer } from './components/Visualizer';

// --- DATA ---
const MOCK_TRACKS: Track[] = [
  { id: '1', title: 'Тишина', artist: 'Скриптонит', duration: '2:34', coverUrl: 'https://picsum.photos/300/300?random=1', genre: 'Hip-Hop' },
  { id: '2', title: 'Industrial Noise', artist: 'Factory Floor', duration: '4:12', coverUrl: 'https://picsum.photos/300/300?random=2', genre: 'Industrial' },
  { id: '3', title: 'Symphony No. 9', artist: 'Beethoven', duration: '9:15', coverUrl: 'https://picsum.photos/300/300?random=3', genre: 'Classical' },
  { id: '4', title: 'Hard Bass', artist: 'Gopnik Squad', duration: '3:00', coverUrl: 'https://picsum.photos/300/300?random=4', genre: 'Dance' },
  { id: '5', title: 'Lo-Fi Study', artist: 'Chill Cow', duration: '2:45', coverUrl: 'https://picsum.photos/300/300?random=5', genre: 'Lo-Fi' },
  { id: '6', title: 'Красный Свет', artist: 'Delfin', duration: '3:50', coverUrl: 'https://picsum.photos/300/300?random=6', genre: 'Alternative' },
  { id: '7', title: 'Техно', artist: 'Plastikman', duration: '5:20', coverUrl: 'https://picsum.photos/300/300?random=7', genre: 'Techno' },
  { id: '8', title: 'Ambient 1', artist: 'Brian Eno', duration: '6:10', coverUrl: 'https://picsum.photos/300/300?random=8', genre: 'Ambient' },
  { id: '9', title: 'Krautrock 404', artist: 'Can', duration: '7:20', coverUrl: 'https://picsum.photos/300/300?random=9', genre: 'Rock' },
  { id: '10', title: 'Glitch System', artist: 'Alva Noto', duration: '5:05', coverUrl: 'https://picsum.photos/300/300?random=10', genre: 'Industrial' },
];

const MOCK_LYRICS = "Это просто текст песни.\nСлучайный набор слов.\nВ стиле брутализм.\n\nЧерное на белом.\nБелое на черном.\nРитм. Бит. Бас.\n\nПовторить.\nПовторить.\nЕще раз.";

type TabId = 'home' | 'playlists' | 'favorites' | 'radio' | 'library';
type MenuView = 'main' | 'subscription' | 'referrals' | 'admin';
type AdminTab = 'stats' | 'users' | 'broadcast';
type SearchFilter = 'all' | 'artist' | 'title';

const App: React.FC = () => {
  const [currentTrack, setCurrentTrack] = useState<Track>(MOCK_TRACKS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  
  // Library State
  const [youtubeLink, setYoutubeLink] = useState('');
  const [isDownloadingYT, setIsDownloadingYT] = useState(false);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([
     { id: 'loc1', title: 'Voice Message', artist: 'Saved', duration: '0:45', coverUrl: 'https://picsum.photos/300/300?random=99', genre: 'Voice' }
  ]);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set(['loc1']));
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Playlist State
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [playlistSelectionTrackId, setPlaylistSelectionTrackId] = useState<string | null>(null);

  // Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [isPremium, setIsPremium] = useState(false);
  
  // Admin State
  const [adminTab, setAdminTab] = useState<AdminTab>('stats');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  // Player State
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  // Refs for intervals
  const progressInterval = useRef<number | null>(null);
  const toastTimeout = useRef<number | null>(null);

  // --- LOGIC ---

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = window.setTimeout(() => setToastMessage(null), 3000);
  };

  const handlePlayPause = (e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const handleNext = (e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    const currentIndex = MOCK_TRACKS.findIndex(t => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % MOCK_TRACKS.length;
    setCurrentTrack(MOCK_TRACKS[nextIndex]);
    setIsPlaying(true);
    setProgress(0);
  };

  const handlePrev = (e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    const currentIndex = MOCK_TRACKS.findIndex(t => t.id === currentTrack.id);
    const prevIndex = (currentIndex - 1 + MOCK_TRACKS.length) % MOCK_TRACKS.length;
    setCurrentTrack(MOCK_TRACKS[prevIndex]);
    setIsPlaying(true);
    setProgress(0);
  };

  const handleTrackSelect = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
  };

  const handleYoutubeDownload = () => {
    if (!youtubeLink) return;
    setIsDownloadingYT(true);
    
    // Simulate API call
    setTimeout(() => {
        const newTrack: Track = {
            id: `yt-${Date.now()}`,
            title: 'YouTube Rip ' + Math.floor(Math.random() * 100),
            artist: 'Imported',
            duration: '3:33',
            coverUrl: 'https://picsum.photos/300/300?random=100',
            genre: 'Import'
        };
        setLibraryTracks(prev => [newTrack, ...prev]);
        setDownloadedIds(prev => new Set(prev).add(newTrack.id));
        setYoutubeLink('');
        setIsDownloadingYT(false);
        showToast('АУДИО ЗАГРУЖЕНО В МЕДИАТЕКУ');
    }, 1500);
  };

  const handleDownloadToApp = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    if (downloadedIds.has(track.id)) return;
    
    showToast('ЗАГРУЗКА В ПРИЛОЖЕНИЕ...');
    setTimeout(() => {
        setDownloadedIds(prev => new Set(prev).add(track.id));
        if (!libraryTracks.find(t => t.id === track.id)) {
            setLibraryTracks(prev => [track, ...prev]);
        }
        showToast('СОХРАНЕНО ЛОКАЛЬНО');
    }, 1000);
  };

  const handleDownloadToChat = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    showToast('ОТПРАВКА В ЧАТ...');
    setTimeout(() => {
        showToast('ФАЙЛ ОТПРАВЛЕН');
    }, 1500);
  };

  const handleBuyPremium = () => {
      showToast('ОБРАБОТКА ПЛАТЕЖА...');
      setTimeout(() => {
          setIsPremium(true);
          showToast('ТЕПЕРЬ ТЫ ЭЛИТА');
      }, 1500);
  }

  const handleCopyReferral = () => {
      navigator.clipboard.writeText('https://t.me/zvuk_bot?start=ref123');
      showToast('ССЫЛКА СКОПИРОВАНА');
  }
  
  const handleCreatePlaylist = () => {
      if (!newPlaylistTitle.trim()) return;
      
      const newPlaylist: Playlist = {
          id: `pl-${Date.now()}`,
          title: newPlaylistTitle,
          coverUrl: `https://picsum.photos/300/300?random=${Date.now()}`,
          trackIds: []
      };
      
      setPlaylists(prev => [newPlaylist, ...prev]);
      setNewPlaylistTitle('');
      setIsCreatingPlaylist(false);
      showToast('ПЛЕЙЛИСТ СОЗДАН');
  };

  const handleOpenAddToPlaylist = (e: React.MouseEvent, trackId: string) => {
      e.stopPropagation();
      setPlaylistSelectionTrackId(trackId);
  };

  const handleAddToPlaylist = (playlistId: string) => {
      if (!playlistSelectionTrackId) return;
      
      setPlaylists(prev => prev.map(pl => {
          if (pl.id === playlistId && !pl.trackIds.includes(playlistSelectionTrackId)) {
              return { ...pl, trackIds: [...pl.trackIds, playlistSelectionTrackId] };
          }
          return pl;
      }));
      
      setPlaylistSelectionTrackId(null);
      showToast('ТРЕК ДОБАВЛЕН');
  };

  // Simulated progress
  useEffect(() => {
    if (isPlaying) {
      progressInterval.current = window.setInterval(() => {
        setProgress(prev => (prev >= 100 ? 0 : prev + 0.5));
      }, 500);
    } else if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [isPlaying]);

  // --- OVERLAYS ---
  
  const renderAddToPlaylistOverlay = () => {
      if (!playlistSelectionTrackId) return null;

      return (
          <div className="fixed inset-0 z-[60] bg-lebedev-black/90 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-lebedev-black border-2 border-lebedev-white w-full max-w-sm flex flex-col shadow-2xl">
                  <div className="p-4 border-b border-lebedev-white flex justify-between items-center">
                      <span className="font-bold uppercase">Добавить в...</span>
                      <button onClick={() => setPlaylistSelectionTrackId(null)}><CloseIcon className="w-6 h-6"/></button>
                  </div>
                  <div className="p-2 max-h-80 overflow-y-auto">
                      {playlists.length === 0 ? (
                          <div className="p-4 text-center text-lebedev-gray text-xs uppercase">Нет плейлистов</div>
                      ) : (
                          playlists.map(pl => (
                              <button 
                                key={pl.id}
                                onClick={() => handleAddToPlaylist(pl.id)}
                                className="w-full text-left p-4 hover:bg-lebedev-white hover:text-lebedev-black transition-colors border-b border-lebedev-white/10 last:border-0 font-bold uppercase"
                              >
                                  {pl.title}
                              </button>
                          ))
                      )}
                  </div>
                  <button 
                    onClick={() => { setPlaylistSelectionTrackId(null); setActiveTab('playlists'); setIsCreatingPlaylist(true); }}
                    className="p-4 bg-lebedev-white text-lebedev-black uppercase font-black hover:bg-lebedev-red hover:text-white transition-colors"
                  >
                      Создать новый
                  </button>
              </div>
          </div>
      );
  };

  const renderCreatePlaylistModal = () => {
      if (!isCreatingPlaylist) return null;
      
      return (
          <div className="fixed inset-0 z-[60] bg-lebedev-black/90 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-lebedev-black border-2 border-lebedev-white w-full max-w-sm p-6 shadow-2xl">
                  <h3 className="text-xl font-black uppercase mb-4 text-lebedev-red">Новый плейлист</h3>
                  <input 
                    type="text" 
                    placeholder="НАЗВАНИЕ..."
                    value={newPlaylistTitle}
                    onChange={(e) => setNewPlaylistTitle(e.target.value)}
                    className="w-full bg-transparent border-b-2 border-lebedev-white p-2 mb-6 text-lg font-bold uppercase focus:outline-none focus:border-lebedev-red placeholder-lebedev-gray/50"
                    autoFocus
                  />
                  <div className="flex gap-4">
                      <button 
                        onClick={() => setIsCreatingPlaylist(false)}
                        className="flex-1 p-3 border border-lebedev-white font-bold uppercase hover:bg-lebedev-white hover:text-lebedev-black transition-colors"
                      >
                          Отмена
                      </button>
                      <button 
                        onClick={handleCreatePlaylist}
                        className="flex-1 p-3 bg-lebedev-white text-lebedev-black font-bold uppercase hover:bg-lebedev-red hover:text-white transition-colors"
                      >
                          Создать
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  // --- MENU COMPONENT ---
  const renderMenuOverlay = () => {
    if (!isMenuOpen) return null;

    const MenuButton = ({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) => (
        <button 
            onClick={onClick}
            className="flex items-center gap-4 w-full p-6 border-b border-lebedev-white bg-transparent active:bg-lebedev-white active:text-lebedev-black transition-colors group"
        >
            <Icon className="w-8 h-8 stroke-1" />
            <span className="text-2xl font-black uppercase tracking-widest">{label}</span>
        </button>
    );

    const renderMenuContent = () => {
        switch (menuView) {
            case 'subscription':
                return (
                    <div className="flex flex-col h-full">
                        <div className="p-6 border-b border-lebedev-white">
                            <h2 className="text-4xl font-black uppercase text-lebedev-red mb-2">Подписка</h2>
                            <p className="text-lebedev-gray font-mono uppercase text-sm">Твой текущий статус</p>
                        </div>
                        <div className="flex-1 p-6 flex flex-col justify-center items-center gap-8">
                            <div className="text-center">
                                <div className="text-xl text-lebedev-gray mb-2">ТЕКУЩИЙ ПЛАН</div>
                                <div className="text-5xl font-black uppercase">{isPremium ? 'МАЖОР' : 'БОМЖ'}</div>
                            </div>
                            
                            {!isPremium && (
                                <div className="w-full border-2 border-lebedev-white p-6 relative">
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lebedev-black px-2 text-lebedev-red font-bold">РЕКОМЕНДУЕМ</div>
                                    <div className="text-center mb-6">
                                        <div className="text-3xl font-black">999₽</div>
                                        <div className="text-sm text-lebedev-gray">В МЕСЯЦ</div>
                                    </div>
                                    <ul className="text-sm space-y-2 mb-6 font-mono text-lebedev-gray">
                                        <li>+ БЕЗ РЕКЛАМЫ</li>
                                        <li>+ ВЫСОКОЕ КАЧЕСТВО</li>
                                        <li>+ УВАЖЕНИЕ ПАЦАНОВ</li>
                                    </ul>
                                    <button 
                                        onClick={handleBuyPremium}
                                        className="w-full bg-lebedev-white text-lebedev-black p-4 font-black uppercase hover:bg-lebedev-red hover:text-white transition-colors"
                                    >
                                        КУПИТЬ
                                    </button>
                                </div>
                            )}
                            {isPremium && (
                                <div className="text-lebedev-red font-bold uppercase tracking-widest animate-pulse">
                                    СПАСИБО ЗА БАБКИ
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'referrals':
                return (
                    <div className="flex flex-col h-full">
                         <div className="p-6 border-b border-lebedev-white">
                            <h2 className="text-4xl font-black uppercase text-lebedev-red mb-2">Рефералы</h2>
                            <p className="text-lebedev-gray font-mono uppercase text-sm">Зови друзей</p>
                        </div>
                        <div className="flex-1 p-6 flex flex-col gap-6">
                            <div className="bg-lebedev-white/10 p-6 text-center">
                                <div className="text-6xl font-black mb-2">0</div>
                                <div className="text-lebedev-gray text-xs tracking-widest uppercase">Приглашено друзей</div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-lebedev-gray">Твоя ссылка</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-transparent border border-lebedev-white p-3 font-mono text-xs truncate">
                                        https://t.me/zvuk_bot?start=ref123
                                    </div>
                                    <button 
                                        onClick={handleCopyReferral}
                                        className="bg-lebedev-white text-lebedev-black p-3 hover:bg-lebedev-red hover:text-white"
                                    >
                                        <CopyIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-auto border-t border-lebedev-white/20 pt-6">
                                <p className="text-center text-xs text-lebedev-gray uppercase leading-relaxed">
                                    За каждого друга ты ничего не получишь.<br/>
                                    Но нам будет приятно.
                                </p>
                            </div>
                        </div>
                    </div>
                );
            case 'admin':
                return (
                    <div className="flex flex-col h-full">
                         <div className="p-6 border-b border-lebedev-white">
                            <h2 className="text-4xl font-black uppercase text-lebedev-red mb-2">Админка</h2>
                            <div className="flex gap-4 mt-6 text-xs font-bold uppercase tracking-widest">
                                <button 
                                    onClick={() => setAdminTab('stats')} 
                                    className={`pb-1 ${adminTab === 'stats' ? 'text-lebedev-red border-b-2 border-lebedev-red' : 'text-lebedev-gray'}`}
                                >
                                    Статистика
                                </button>
                                <button 
                                    onClick={() => setAdminTab('users')} 
                                    className={`pb-1 ${adminTab === 'users' ? 'text-lebedev-red border-b-2 border-lebedev-red' : 'text-lebedev-gray'}`}
                                >
                                    Управление
                                </button>
                                <button 
                                    onClick={() => setAdminTab('broadcast')} 
                                    className={`pb-1 ${adminTab === 'broadcast' ? 'text-lebedev-red border-b-2 border-lebedev-red' : 'text-lebedev-gray'}`}
                                >
                                    Рассылка
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto bg-lebedev-white/5">
                            {adminTab === 'stats' && (
                                <div className="p-6 grid grid-cols-2 gap-4">
                                    <div className="bg-lebedev-black border border-lebedev-white p-4">
                                        <div className="text-lebedev-gray text-[10px] uppercase mb-2">Всего юзеров</div>
                                        <div className="text-3xl font-black">14,203</div>
                                    </div>
                                    <div className="bg-lebedev-black border border-lebedev-white p-4">
                                         <div className="text-lebedev-gray text-[10px] uppercase mb-2">Premium</div>
                                        <div className="text-3xl font-black text-lebedev-red">1,337</div>
                                    </div>
                                    <div className="bg-lebedev-black border border-lebedev-white p-4 col-span-2">
                                         <div className="text-lebedev-gray text-[10px] uppercase mb-2">Реферальная сеть</div>
                                        <div className="flex justify-between items-end">
                                            <div className="text-3xl font-black">5,400</div>
                                            <div className="text-xs text-green-500 font-bold uppercase">+12% за неделю</div>
                                        </div>
                                    </div>
                                     <div className="bg-lebedev-black border border-lebedev-white p-4 col-span-2 h-40 flex items-center justify-center relative overflow-hidden">
                                        <div className="absolute inset-0 flex items-end justify-between px-2 pb-2 opacity-20 gap-1">
                                            {[30,50,40,70,60,80,50,90,70,80].map((h, i) => (
                                                <div key={i} style={{height: `${h}%`}} className="w-full bg-lebedev-red"></div>
                                            ))}
                                        </div>
                                        <span className="text-lebedev-white font-mono text-xs uppercase z-10 font-bold tracking-widest relative">График активности</span>
                                    </div>
                                </div>
                            )}

                            {adminTab === 'users' && (
                                <div className="p-4 space-y-4">
                                     <div className="flex items-center gap-2 bg-lebedev-black border border-lebedev-white/30 p-2 mb-4">
                                        <SearchIcon className="w-4 h-4 text-lebedev-gray"/>
                                        <input type="text" placeholder="ПОИСК ЮЗЕРА..." className="bg-transparent uppercase text-xs font-bold w-full outline-none placeholder-lebedev-gray/50"/>
                                     </div>
                                     {/* Mock Users */}
                                     {[1,2,3,4,5,6].map(i => (
                                         <div key={i} className="bg-lebedev-black border border-lebedev-white/20 p-4 flex justify-between items-center hover:border-lebedev-white transition-colors">
                                             <div>
                                                 <div className="font-bold text-sm">@user_{1000 + i}</div>
                                                 <div className="text-[10px] text-lebedev-gray uppercase font-mono">{i % 2 === 0 ? 'FREE ACCOUNT' : 'PREMIUM PLUS'}</div>
                                             </div>
                                             <div className="flex gap-2">
                                                 <button 
                                                    onClick={() => showToast(`ПОДПИСКА ВЫДАНА @user_${1000+i}`)}
                                                    className="px-3 py-1 border border-lebedev-white text-[10px] font-bold hover:bg-lebedev-white hover:text-black uppercase transition-colors"
                                                 >
                                                    SUB
                                                 </button>
                                                 <button 
                                                    onClick={() => showToast(`АДМИНКА ВЫДАНА @user_${1000+i}`)}
                                                    className="px-3 py-1 border border-lebedev-red text-lebedev-red text-[10px] font-bold hover:bg-lebedev-red hover:text-white uppercase transition-colors"
                                                 >
                                                    ADM
                                                 </button>
                                             </div>
                                         </div>
                                     ))}
                                </div>
                            )}

                            {adminTab === 'broadcast' && (
                                <div className="p-6 flex flex-col gap-4">
                                    <div className="bg-lebedev-white/10 p-4 text-xs text-lebedev-gray mb-4 border-l-4 border-lebedev-red font-mono">
                                        ВАШЕ СООБЩЕНИЕ БУДЕТ ОТПРАВЛЕНО ВСЕМ ПОЛЬЗОВАТЕЛЯМ БОТА (14,203). БУДЬТЕ АККУРАТНЫ.
                                    </div>
                                    <textarea 
                                        value={broadcastMessage}
                                        onChange={(e) => setBroadcastMessage(e.target.value)}
                                        className="w-full h-40 bg-transparent border-2 border-lebedev-white p-4 text-sm font-bold uppercase focus:border-lebedev-red outline-none resize-none placeholder-lebedev-gray/30"
                                        placeholder="ВВЕДИТЕ ТЕКСТ РАССЫЛКИ..."
                                    />
                                    <button 
                                        onClick={() => {
                                            if(!broadcastMessage) {
                                                showToast('ВВЕДИТЕ ТЕКСТ');
                                                return;
                                            }
                                            showToast('РАССЫЛКА ЗАПУЩЕНА');
                                            setBroadcastMessage('');
                                        }}
                                        className="w-full bg-lebedev-white text-lebedev-black p-4 font-black uppercase hover:bg-lebedev-red hover:text-white transition-colors"
                                    >
                                        ОТПРАВИТЬ ВСЕМ
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="flex flex-col mt-4">
                        <MenuButton icon={StarIcon} label="Подписка" onClick={() => setMenuView('subscription')} />
                        <MenuButton icon={UsersIcon} label="Рефералы" onClick={() => setMenuView('referrals')} />
                        <MenuButton icon={LockIcon} label="Админ панель" onClick={() => setMenuView('admin')} />
                    </div>
                );
        }
    }

    return (
        <div className="fixed inset-0 z-[70] bg-lebedev-black flex flex-col animate-in slide-in-from-right duration-300">
             <div className="flex items-center justify-between p-6 border-b border-lebedev-white">
                <span className="text-xl font-black uppercase text-lebedev-gray">Меню</span>
                <button onClick={() => setIsMenuOpen(false)}>
                    <CloseIcon className="w-8 h-8 text-lebedev-white hover:text-lebedev-red transition-colors" />
                </button>
             </div>
             <div className="flex-1 overflow-y-auto">
                 {menuView !== 'main' && (
                    <div className="px-6 pt-4">
                        <button onClick={() => setMenuView('main')} className="text-lebedev-gray text-xs font-bold uppercase hover:text-white">
                            ← Назад
                        </button>
                    </div>
                 )}
                 {renderMenuContent()}
             </div>
        </div>
    );
  };

    const renderFullPlayer = () => {
        if (!isPlayerOpen) return null;

        return (
            <div className="fixed inset-0 z-50 bg-lebedev-black flex flex-col animate-in slide-in-from-bottom duration-300">
                {/* Header */}
                <div className="p-4 pt-6 flex justify-between items-center shrink-0">
                    <button onClick={() => setIsPlayerOpen(false)} className="text-lebedev-white hover:text-lebedev-red transition-colors">
                        <ChevronDownIcon className="w-8 h-8" />
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-lebedev-gray">Сейчас играет</span>
                        <span className="text-xs font-bold uppercase">{currentTrack.artist}</span>
                    </div>
                    <button 
                        onClick={(e) => handleOpenAddToPlaylist(e, currentTrack.id)}
                        className="w-8 h-8 flex items-center justify-center hover:text-lebedev-red transition-colors"
                    >
                        <PlusIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
                    {!showLyrics ? (
                        // Cover Art View
                        <div className="w-full aspect-square relative shadow-2xl border-4 border-lebedev-white">
                            <img 
                                src={currentTrack.coverUrl} 
                                alt={currentTrack.title} 
                                className="w-full h-full object-cover grayscale contrast-125"
                            />
                            {/* Decorative elements */}
                            <div className="absolute top-0 left-0 bg-lebedev-red text-white text-xs font-black p-1">HI-FI</div>
                        </div>
                    ) : (
                        // Lyrics View
                        <div className="w-full h-full border-2 border-lebedev-white/20 p-6 overflow-y-auto text-center flex flex-col items-center">
                             <div className="text-xl font-black uppercase leading-relaxed whitespace-pre-line">
                                {MOCK_LYRICS}
                             </div>
                        </div>
                    )}
                </div>

                {/* Track Info */}
                <div className="px-8 pb-4">
                    <div className="flex justify-between items-end mb-1">
                        <div className="flex flex-col overflow-hidden mr-4">
                            <h2 className="text-2xl font-black uppercase truncate leading-none mb-1">{currentTrack.title}</h2>
                            <p className="text-lg text-lebedev-red font-bold uppercase truncate leading-none">{currentTrack.artist}</p>
                        </div>
                        <button className="mb-1 text-lebedev-gray hover:text-lebedev-red">
                            <HeartIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Controls Area */}
                <div className="px-6 pb-12">
                     {/* Progress */}
                     <div className="mb-6">
                        <div className="w-full h-2 bg-lebedev-white/20 cursor-pointer group relative">
                             <div 
                                className="h-full bg-lebedev-white group-hover:bg-lebedev-red transition-colors" 
                                style={{ width: `${progress}%` }}
                             />
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] font-mono text-lebedev-gray">
                            <span>0:{(progress * 0.01 * 200).toFixed(0).padStart(2, '0')}</span>
                            <span>{currentTrack.duration}</span>
                        </div>
                     </div>

                     {/* Buttons */}
                     <div className="flex items-center justify-between">
                        <button 
                            className={`text-lebedev-gray hover:text-lebedev-white transition-colors`}
                            onClick={() => showToast('ПОВТОР ВКЛЮЧЕН')}
                        >
                            <RepeatIcon className="w-6 h-6" />
                        </button>

                        <div className="flex items-center gap-6">
                            <button onClick={handlePrev} className="active:scale-90 transition-transform">
                                <SkipBackIcon className="w-8 h-8 fill-current" />
                            </button>
                            <button 
                                onClick={handlePlayPause}
                                className="w-20 h-20 bg-lebedev-white text-lebedev-black rounded-full flex items-center justify-center hover:bg-lebedev-red hover:text-white transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                            >
                                {isPlaying ? <PauseIcon className="w-8 h-8 fill-current" /> : <PlayIcon className="w-8 h-8 ml-1 fill-current" />}
                            </button>
                            <button onClick={handleNext} className="active:scale-90 transition-transform">
                                <SkipForwardIcon className="w-8 h-8 fill-current" />
                            </button>
                        </div>

                        <button 
                            onClick={() => setShowLyrics(!showLyrics)}
                            className={`${showLyrics ? 'text-lebedev-red' : 'text-lebedev-gray'} hover:text-lebedev-white transition-colors`}
                        >
                            <LyricsIcon className="w-6 h-6" />
                        </button>
                     </div>
                </div>
            </div>
        );
    };

  // --- COMPONENT HELPERS ---

  const renderTrackItem = (track: Track, index: number) => {
    const isActive = track.id === currentTrack.id;
    const isDownloaded = downloadedIds.has(track.id);

    return (
        <div 
            key={track.id}
            onClick={() => handleTrackSelect(track)}
            className={`
                flex items-center justify-between p-4 cursor-pointer active:bg-lebedev-white/20 group relative
                ${isActive ? 'bg-lebedev-white text-lebedev-black' : 'bg-transparent text-lebedev-white'}
            `}
        >
            <div className="flex items-center gap-4 flex-1 min-w-0 mr-2">
                <span className={`text-sm font-bold w-6 shrink-0 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                    {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex flex-col min-w-0">
                    <span className={`text-lg font-black uppercase leading-tight truncate ${isActive ? 'text-lebedev-black' : 'text-lebedev-white'}`}>
                        {track.title}
                    </span>
                    <span className={`text-xs uppercase tracking-widest truncate ${isActive ? 'text-lebedev-black/70' : 'text-lebedev-gray'}`}>
                        {track.artist}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-4 shrink-0">
                {isActive && <div className="mr-2"><Visualizer isPlaying={isPlaying} /></div>}
                
                {/* Actions */}
                <div className="flex items-center gap-3">
                     <button 
                        onClick={(e) => handleOpenAddToPlaylist(e, track.id)}
                        className={`p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors ${isActive ? 'text-black' : 'text-gray-400'}`}
                        title="В плейлист"
                    >
                        <PlusIcon className="w-5 h-5" />
                    </button>
                    
                    <button 
                        onClick={(e) => handleDownloadToChat(e, track)}
                        className={`p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors ${isActive ? 'text-black' : 'text-gray-400'}`}
                        title="Отправить в чат"
                    >
                        <SendIcon className="w-5 h-5" />
                    </button>
                    
                    <button 
                        onClick={(e) => handleDownloadToApp(e, track)}
                        className={`p-1.5 rounded-full hover:bg-lebedev-red hover:text-white transition-colors ${isActive ? 'text-black' : 'text-gray-400'}`}
                        title="Скачать в приложение"
                        disabled={isDownloaded}
                    >
                        {isDownloaded ? (
                            <CheckIcon className="w-5 h-5 opacity-100" />
                        ) : (
                            <DownloadIcon className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
  };

  // --- RENDER CONTENT VIEWS ---
  
  const renderHome = () => {
    // If search term is present, show search results as list
    if (searchTerm) {
        const visibleTracks = MOCK_TRACKS.filter(t => {
            const term = searchTerm.toLowerCase();
            if (searchFilter === 'all') {
                return t.title.toLowerCase().includes(term) || t.artist.toLowerCase().includes(term);
            } else if (searchFilter === 'artist') {
                return t.artist.toLowerCase().includes(term);
            } else if (searchFilter === 'title') {
                return t.title.toLowerCase().includes(term);
            }
            return true;
        });

        return (
             <>
                <div className="p-0 border-b-2 border-lebedev-white bg-lebedev-black shrink-0 sticky top-0 z-10">
                    <div className="relative group flex items-center">
                        <div className="pl-4 text-lebedev-gray">
                            <SearchIcon className="w-5 h-5" />
                        </div>
                        <input 
                            type="text" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="ПОИСК..."
                            className="w-full bg-transparent text-lg p-4 uppercase placeholder-lebedev-gray/40 focus:outline-none text-lebedev-white font-bold tracking-wide rounded-none"
                            autoFocus
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 divide-y divide-lebedev-white/20">
                    {visibleTracks.length === 0 ? (
                        <div className="p-8 text-center text-lebedev-gray text-xl uppercase font-bold tracking-widest opacity-50">
                            Ничего нет.
                        </div>
                    ) : (
                        visibleTracks.map((track, index) => renderTrackItem(track, index))
                    )}
                </div>
            </>
        );
    }

    // Genre View
    if (selectedGenre) {
        const genreTracks = MOCK_TRACKS.filter(t => t.genre === selectedGenre);
        return (
            <div className="flex flex-col h-full animate-in slide-in-from-right duration-300">
                <button 
                    onClick={() => setSelectedGenre(null)}
                    className="p-4 flex items-center gap-2 font-bold uppercase hover:text-lebedev-red transition-colors sticky top-0 bg-lebedev-black z-20 border-b border-lebedev-white"
                >
                   <ChevronDownIcon className="w-6 h-6 rotate-90" /> Назад
                </button>
                <div className="p-6 border-b border-lebedev-white bg-lebedev-white text-lebedev-black sticky top-[57px] z-10">
                    <h2 className="text-4xl font-black uppercase tracking-tighter">{selectedGenre}</h2>
                    <p className="text-xs uppercase tracking-widest font-bold mt-1 opacity-60">{genreTracks.length} tracks</p>
                </div>
                <div className="divide-y divide-lebedev-white/20 pb-8">
                     {genreTracks.map((t, i) => renderTrackItem(t, i))}
                </div>
            </div>
        )
    }

    // Default Home View (Carousel + Genres)
    const uniqueGenres = Array.from(new Set(MOCK_TRACKS.map(t => t.genre)));
    const popularTracks = MOCK_TRACKS.slice(0, 5); // Just take first 5 as popular

    return (
        <div className="flex flex-col gap-8 pb-8 animate-in fade-in duration-300">
            {/* Search Bar (Compact) */}
            <div className="p-4 border-b border-lebedev-white">
                 <div className="relative group flex items-center bg-lebedev-white/10 p-2 border border-transparent hover:border-lebedev-white/30 transition-colors">
                    <SearchIcon className="w-5 h-5 text-lebedev-gray ml-2" />
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="ПОИСК..."
                        className="w-full bg-transparent p-2 uppercase placeholder-lebedev-gray/40 focus:outline-none text-lebedev-white font-bold"
                    />
                </div>
            </div>

            {/* Popular Carousel */}
            <div>
                <div className="px-4 mb-4 flex items-center gap-2">
                    <div className="w-2 h-2 bg-lebedev-red animate-pulse" />
                    <h2 className="text-xl font-black uppercase tracking-widest">Популярное</h2>
                </div>
                {/* Horizontal Scroll Container */}
                <div className="flex overflow-x-auto gap-4 px-4 pb-4 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {popularTracks.map(track => (
                        <div 
                            key={track.id} 
                            onClick={() => handleTrackSelect(track)}
                            className="snap-start shrink-0 w-64 cursor-pointer group"
                        >
                            <div className="aspect-square border-2 border-lebedev-white mb-3 relative overflow-hidden bg-lebedev-white/5">
                                <img src={track.coverUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                                <div className="absolute bottom-0 right-0 bg-lebedev-black text-white text-[10px] font-bold px-2 py-1 border-t border-l border-lebedev-white">
                                    {track.duration}
                                </div>
                                <div className="absolute top-0 left-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-lebedev-red rounded-full p-2 text-white shadow-lg">
                                        <PlayIcon className="w-4 h-4 fill-current"/>
                                    </div>
                                </div>
                            </div>
                            <h3 className="font-bold uppercase truncate text-lg leading-none mb-1 group-hover:text-lebedev-red transition-colors">{track.title}</h3>
                            <p className="text-xs text-lebedev-gray uppercase truncate">{track.artist}</p>
                        </div>
                    ))}
                    {/* Padding element for right side */}
                    <div className="w-2 shrink-0"></div>
                </div>
            </div>

            {/* Genres Grid */}
            <div className="px-4">
                <h2 className="text-xl font-black uppercase tracking-widest mb-4 border-b border-lebedev-white/20 pb-2">Жанры</h2>
                <div className="grid grid-cols-2 gap-4">
                    {uniqueGenres.map(genre => (
                        <div 
                            key={genre}
                            onClick={() => setSelectedGenre(genre)}
                            className="aspect-[3/2] border border-lebedev-white relative overflow-hidden group cursor-pointer"
                        >
                            <img 
                                src={`https://picsum.photos/seed/${genre}/400/300`}
                                alt={genre}
                                className="absolute inset-0 w-full h-full object-cover grayscale brightness-50 group-hover:scale-110 group-hover:brightness-75 group-hover:grayscale-0 transition-all duration-700 ease-out"
                            />
                            <div className="absolute inset-0 flex items-center justify-center z-10">
                                <span className="font-black uppercase text-xl tracking-tighter text-white mix-blend-difference group-hover:scale-110 transition-transform duration-300">
                                    {genre}
                                </span>
                            </div>
                             {/* Decoration */}
                            <div className="absolute top-2 right-2 flex gap-0.5 z-20">
                                <div className="w-1 h-1 bg-lebedev-red"/>
                                <div className="w-1 h-1 bg-lebedev-white"/>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  };
  
  const renderPlaylists = () => {
      return (
          <div className="flex flex-col h-full">
               <div className="p-6 border-b-2 border-lebedev-white flex justify-between items-center bg-lebedev-black sticky top-0 z-10">
                   <h2 className="text-2xl font-black uppercase tracking-widest">Плейлисты</h2>
                   <button 
                        onClick={() => setIsCreatingPlaylist(true)}
                        className="flex items-center gap-2 text-lebedev-red font-bold uppercase hover:text-white transition-colors"
                   >
                       <PlusIcon className="w-6 h-6" /> Создать
                   </button>
               </div>
               
               <div className="p-4 grid grid-cols-2 gap-4">
                   {playlists.length === 0 ? (
                        <div className="col-span-2 text-center py-12 text-lebedev-gray opacity-50 uppercase font-bold tracking-widest">
                            Пусто. Создай свой вайб.
                        </div>
                   ) : (
                       playlists.map(pl => (
                           <div key={pl.id} className="group cursor-pointer">
                               <div className="aspect-square border border-lebedev-white mb-2 relative overflow-hidden">
                                   {pl.coverUrl ? (
                                       <img src={pl.coverUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                                   ) : (
                                       <div className="w-full h-full bg-lebedev-white/10 flex items-center justify-center">
                                           <PlaylistIcon className="w-12 h-12 text-lebedev-gray" />
                                       </div>
                                   )}
                                   <div className="absolute bottom-0 left-0 bg-lebedev-black/80 px-2 py-1 text-xs font-mono text-lebedev-red">
                                       {pl.trackIds.length} tracks
                                   </div>
                               </div>
                               <h3 className="font-bold uppercase truncate">{pl.title}</h3>
                           </div>
                       ))
                   )}
               </div>
          </div>
      );
  };

  const renderLibrary = () => {
    return (
        <div className="flex flex-col min-h-full">
            {/* YOUTUBE DOWNLOADER SECTION */}
            <div className="p-6 border-b-4 border-lebedev-white bg-lebedev-black">
                <div className="flex items-center gap-2 mb-4 text-lebedev-red">
                    <YoutubeIcon className="w-6 h-6" />
                    <span className="text-sm font-black uppercase tracking-widest">YouTube Импорт</span>
                </div>
                
                <div className="flex flex-col gap-3">
                    <input 
                        type="text" 
                        value={youtubeLink}
                        onChange={(e) => setYoutubeLink(e.target.value)}
                        placeholder="ВСТАВЬТЕ ССЫЛКУ..."
                        className="w-full bg-transparent border-2 border-lebedev-white p-3 text-sm uppercase placeholder-lebedev-gray/50 focus:outline-none focus:border-lebedev-red font-bold"
                    />
                    <button 
                        onClick={handleYoutubeDownload}
                        disabled={isDownloadingYT || !youtubeLink}
                        className={`
                            w-full p-4 font-black uppercase tracking-widest text-sm transition-all
                            ${isDownloadingYT ? 'bg-lebedev-gray cursor-wait' : 'bg-lebedev-white text-lebedev-black hover:bg-lebedev-red hover:text-white'}
                        `}
                    >
                        {isDownloadingYT ? 'ЗАГРУЗКА...' : 'СКАЧАТЬ'}
                    </button>
                </div>
            </div>

            {/* DOWNLOADED TRACKS HEADER */}
            <div className="p-4 border-b border-lebedev-white/20 bg-lebedev-black sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <LibraryIcon className="w-5 h-5 text-lebedev-gray" />
                    <span className="text-xs font-bold uppercase tracking-widest text-lebedev-gray">
                        Скачано ({libraryTracks.length})
                    </span>
                </div>
            </div>

            {/* DOWNLOADED LIST */}
            <div className="grid grid-cols-1 divide-y divide-lebedev-white/20 flex-1">
                 {libraryTracks.length === 0 ? (
                    <div className="p-8 text-center text-lebedev-gray text-xl uppercase font-bold tracking-widest opacity-50">
                        Пусто.
                    </div>
                 ) : (
                    libraryTracks.map((track, index) => renderTrackItem(track, index))
                 )}
            </div>
        </div>
    );
  };

  const renderPlaceholder = (title: string, desc: string) => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center opacity-60">
        <div className="text-4xl mb-4 font-black uppercase border-b-4 border-lebedev-red pb-2">{title}</div>
        <div className="text-sm font-mono uppercase tracking-widest">{desc}</div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
        case 'home': return renderHome();
        case 'playlists': return renderPlaylists();
        case 'favorites': return renderPlaceholder('Избранное', 'Добавьте треки.');
        case 'radio': return renderPlaceholder('Радио', 'Эфир недоступен.');
        case 'library': return renderLibrary();
        default: return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-lebedev-black text-lebedev-white font-sans flex flex-col overflow-hidden">
      
      {/* FULL PLAYER OVERLAY */}
      {renderFullPlayer()}

      {/* MENU OVERLAY */}
      {renderMenuOverlay()}

      {/* ADD TO PLAYLIST OVERLAY */}
      {renderAddToPlaylistOverlay()}

      {/* CREATE PLAYLIST MODAL */}
      {renderCreatePlaylistModal()}

      {/* TOAST NOTIFICATION */}
      <div 
        className={`
            fixed top-4 left-4 right-4 bg-lebedev-red text-white p-4 z-50 shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]
            transition-all duration-300 transform
            ${toastMessage ? 'translate-y-0 opacity-100' : '-translate-y-24 opacity-0'}
        `}
      >
        <div className="text-xs font-black uppercase tracking-widest text-center">
            {toastMessage}
        </div>
      </div>

      {/* HEADER */}
      <header className="p-4 pt-6 border-b-2 border-lebedev-white flex justify-between items-center bg-lebedev-black z-20 shrink-0">
        <h1 className="text-3xl font-black tracking-tighter uppercase leading-none">
          ЗВУК<span className="text-lebedev-red">.</span>
        </h1>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-lebedev-red rounded-full animate-pulse" />
                <div className="text-[10px] font-mono tracking-widest text-lebedev-gray">ONLINE</div>
           </div>
           <button onClick={() => setIsMenuOpen(true)}>
                <MenuIcon className="w-8 h-8 text-lebedev-white hover:text-lebedev-red transition-colors" />
           </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto pb-48 overscroll-none scroll-smooth">
        {renderContent()}
      </main>

      {/* FIXED BOTTOM AREA WRAPPER */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-col">
        
        {/* MINI PLAYER */}
        <div 
            onClick={() => setIsPlayerOpen(true)}
            className="bg-lebedev-black border-t-2 border-lebedev-white cursor-pointer hover:bg-lebedev-white/5 transition-colors"
        >
            {/* Progress Bar */}
            <div className="w-full h-1 bg-gray-800 relative">
                <div 
                    className="h-full bg-lebedev-red" 
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="flex items-center justify-between p-3 h-16">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <img 
                        src={currentTrack.coverUrl} 
                        alt="cover" 
                        className="w-10 h-10 grayscale object-cover border border-lebedev-white/30 shrink-0" 
                    />
                    <div className="min-w-0 flex flex-col">
                        <div className="text-sm font-bold uppercase truncate leading-none mb-1">
                            {currentTrack.title}
                        </div>
                        <div className="text-[10px] text-lebedev-gray uppercase truncate leading-none">
                            {currentTrack.artist}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 px-2">
                     <button 
                        className="active:scale-90 transition-transform"
                        onClick={(e) => { e.stopPropagation(); handlePrev(e); }}
                     >
                        <SkipBackIcon className="w-6 h-6" />
                     </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); handlePlayPause(e); }} 
                        className="w-10 h-10 bg-lebedev-white text-lebedev-black flex items-center justify-center hover:bg-lebedev-red hover:text-white transition-colors"
                     >
                        {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
                     </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); handleNext(e); }}
                        className="active:scale-90 transition-transform"
                     >
                        <SkipForwardIcon className="w-6 h-6" />
                     </button>
                </div>
            </div>
        </div>

        {/* TAB NAVIGATION */}
        <nav className="h-16 bg-lebedev-black border-t-2 border-lebedev-white grid grid-cols-5 pb-safe">
            {[
                { id: 'home', icon: HomeIcon, label: 'Главная' },
                { id: 'playlists', icon: PlaylistIcon, label: 'Плейлисты' },
                { id: 'favorites', icon: HeartIcon, label: 'Избранное' },
                { id: 'radio', icon: RadioIcon, label: 'Радио' },
                { id: 'library', icon: LibraryIcon, label: 'Медиатека' },
            ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabId)}
                        className={`
                            flex flex-col items-center justify-center gap-1 transition-all duration-200
                            ${isActive ? 'bg-lebedev-white text-lebedev-black' : 'text-lebedev-gray hover:text-lebedev-white active:bg-white/10'}
                        `}
                    >
                        <tab.icon className={`w-6 h-6 ${isActive ? 'stroke-2' : 'stroke-[1.5]'}`} />
                        <span className="text-[9px] font-bold uppercase tracking-wider scale-90">{tab.label}</span>
                    </button>
                )
            })}
        </nav>

      </div>
    </div>
  );
};

export default App;