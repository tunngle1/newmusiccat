import React, { useState, useEffect, useRef } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { NotificationProvider } from './context/NotificationContext';
import { ViewState } from './types';
import BottomNav from './components/BottomNav';
import MiniPlayer from './components/MiniPlayer';
import FullPlayer from './components/FullPlayer';
import SubscriptionBlocker from './components/SubscriptionBlocker';
import HomeView from './views/HomeView';
import PlaylistsView from './views/PlaylistsView';
import FavoritesView from './views/FavoritesView';
import RadioView from './views/RadioView';
import LibraryView from './views/LibraryView';
import AdminView from './views/AdminView';
import ReferralView from './views/ReferralView';
import { initTelegramWebApp } from './utils/telegram';
import { API_BASE_URL } from './constants';

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.HOME);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const { currentTrack, resetSearch, user, refreshSubscriptionStatus } = usePlayer();

  const handleNavigate = (view: ViewState) => {
    if (view === ViewState.HOME && currentView === ViewState.HOME) {
      resetSearch();
    }
    setCurrentView(view);
  };

  // Проверка доступа
  const hasAccess = user?.subscription_status?.has_access ?? true;

  // Инициализация Telegram WebApp
  useEffect(() => {
    initTelegramWebApp();

    // Handle referral registration from start parameter
    const handleReferral = async () => {
      if (!user) return;

      const initData = window.Telegram?.WebApp?.initDataUnsafe;
      const startParam = (initData as any)?.start_param;

      if (startParam && startParam.startsWith('REF')) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/api/referral/register?user_id=${user.id}&referral_code=${startParam}`,
            { method: 'POST' }
          );

          if (response.ok) {
            console.log('✅ Referral registered successfully');
            // Optionally show notification to user
          }
        } catch (error) {
          console.error('Failed to register referral:', error);
        }
      }
    };

    handleReferral();

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
  }, [user]);

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

  // Handle swipe down from top to close WebApp
  useEffect(() => {
    let touchStartY: number | null = null;

    const onTouchStart = (e: TouchEvent) => {
      // Only track if touch starts in top 50px
      if (e.touches[0].clientY < 50) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartY === null) return;

      const touchEndY = e.changedTouches[0].clientY;
      const diffY = touchEndY - touchStartY;

      // If swiped down more than 100px from top
      if (diffY > 100) {
        // Close WebApp
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.close();
        }
      }

      touchStartY = null;
    };

    document.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // Detect keyboard open state
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const initialHeightRef = useRef(window.innerHeight);

  useEffect(() => {
    // Update initial height on mount (and potentially on orientation change if needed)
    initialHeightRef.current = window.innerHeight;

    const handleResize = () => {
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height;
        // Use the stored initial height for comparison
        // If current viewport is significantly smaller than initial window height
        if (currentHeight < initialHeightRef.current * 0.85) { // Increased sensitivity to 0.85
          setIsKeyboardOpen(true);
        } else {
          setIsKeyboardOpen(false);
        }
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  // Если нет доступа, показываем блокировщик
  if (!hasAccess) {
    return <SubscriptionBlocker user={user} onRefresh={refreshSubscriptionStatus} />;
  }
  const renderView = () => {
    switch (currentView) {
      case ViewState.HOME:
        return <HomeView onNavigate={handleNavigate} />;
      case ViewState.PLAYLISTS:
        return <PlaylistsView />;
      case ViewState.FAVORITES:
        return <FavoritesView />;
      case ViewState.RADIO:
        return <RadioView />;
      case ViewState.LIBRARY:
        return <LibraryView />;
      case ViewState.ADMIN:
        return <AdminView onBack={() => setCurrentView(ViewState.HOME)} />;
      case ViewState.REFERRAL:
        return <ReferralView onBack={() => setCurrentView(ViewState.HOME)} />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="relative min-h-tg-screen bg-black text-white pb-24 overflow-x-hidden">
      {/* Background Gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent z-0 pointer-events-none" />

      {/* Main Content Area */}
      <main className="w-full max-w-md mx-auto min-h-tg-screen relative z-10">
        {renderView()}
      </main>

      {/* Floating UI Elements */}
      <div className={`fixed bottom-0 w-full max-w-md left-1/2 transform -translate-x-1/2 z-50 floating-container transition-all duration-300 ${isKeyboardOpen ? 'opacity-0 pointer-events-none translate-y-20' : ''}`}>
        {!isFullPlayerOpen && currentTrack && (
          <MiniPlayer onExpand={() => setIsFullPlayerOpen(true)} />
        )}
        <BottomNav currentView={currentView} onNavigate={handleNavigate} />
      </div>

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
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </PlayerProvider>
  );
};

export default App;