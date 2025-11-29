import React, { useState, useEffect } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { ViewState } from './types';
import BottomNav from './components/BottomNav';
import MiniPlayer from './components/MiniPlayer';
import FullPlayer from './components/FullPlayer';
import HomeView from './views/HomeView';
import PlaylistsView from './views/PlaylistsView';
import FavoritesView from './views/FavoritesView';
import LibraryView from './views/LibraryView';
import AdminView from './views/AdminView';
import { initTelegramWebApp } from './utils/telegram';

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.HOME);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const { currentTrack, resetSearch, user } = usePlayer();

  const handleNavigate = (view: ViewState) => {
    if (view === ViewState.HOME && currentView === ViewState.HOME) {
      resetSearch();
    }
    setCurrentView(view);
  };

  // Инициализация Telegram WebApp
  useEffect(() => {
    initTelegramWebApp();

    // Request persistent storage to prevent automatic cleanup
    const requestPersistentStorage = async () => {
      if (navigator.storage && navigator.storage.persist) {
        try {
          const isPersisted = await navigator.storage.persist();
          console.log(`🔒 Persistent storage: ${isPersisted ? 'GRANTED ✅' : 'DENIED ❌'}`);

          if (isPersisted) {
            console.log('✅ Downloaded tracks will be protected from automatic cleanup');
          } else {
            console.warn('⚠️ Storage may be cleared automatically. Download tracks at your own risk.');
          }
        } catch (error) {
          console.error('Error requesting persistent storage:', error);
        }
      }

      // Check if storage is already persisted
      if (navigator.storage && navigator.storage.persisted) {
        try {
          const isPersisted = await navigator.storage.persisted();
          console.log(`📦 Storage persistence status: ${isPersisted}`);
        } catch (error) {
          console.error('Error checking storage persistence:', error);
        }
      }

      // Log storage usage
      if (navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          const usedMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2);
          const quotaMB = ((estimate.quota || 0) / 1024 / 1024).toFixed(2);
          console.log(`💾 Storage used: ${usedMB} MB / ${quotaMB} MB`);
        } catch (error) {
          console.error('Error estimating storage:', error);
        }
      }
    };

    requestPersistentStorage();
  }, []);

  // Prevent background scroll when player is open
  useEffect(() => {
    if (isFullPlayerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullPlayerOpen]);

  const renderView = () => {
    switch (currentView) {
      case ViewState.HOME:
        return <HomeView />;
      case ViewState.PLAYLISTS:
        return <PlaylistsView />;
      case ViewState.FAVORITES:
        return <FavoritesView />;
      case ViewState.LIBRARY:
        return <LibraryView />;
      case ViewState.ADMIN:
        return <AdminView onBack={() => setCurrentView(ViewState.HOME)} />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="relative min-h-screen bg-black text-white pb-24 overflow-x-hidden">
      {/* Background Gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent z-0 pointer-events-none" />

      {/* Main Content Area */}
      <main className="w-full max-w-md mx-auto min-h-screen relative z-10">
        {renderView()}
      </main>

      {/* Floating UI Elements */}
      <div className="fixed bottom-0 w-full max-w-md left-1/2 transform -translate-x-1/2 z-50">
        {!isFullPlayerOpen && currentTrack && (
          <MiniPlayer onExpand={() => setIsFullPlayerOpen(true)} />
        )}
        <BottomNav currentView={currentView} onNavigate={handleNavigate} />
      </div>

      {/* Admin Button (Only for Admins) */}
      {user?.is_admin && currentView !== ViewState.ADMIN && (
        <button
          onClick={() => setCurrentView(ViewState.ADMIN)}
          className="fixed top-4 right-4 z-40 p-2 glass-button text-blue-400 rounded-full hover:text-blue-300"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </button>
      )}

      {/* Full Screen Player Modal */}
      {isFullPlayerOpen && (
        <FullPlayer onCollapse={() => setIsFullPlayerOpen(false)} />
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <PlayerProvider>
      <AppContent />
    </PlayerProvider>
  );
};

export default App;