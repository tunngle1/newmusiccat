/**
 * Telegram WebApp Utilities
 * Утилиты для работы с Telegram Mini App SDK
 */

// Типы для Telegram WebApp
interface TelegramWebApp {
    initData: string;
    initDataUnsafe: {
        user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
        };
        query_id?: string;
        auth_date?: number;
        hash?: string;
    };
    version: string;
    platform: string;
    colorScheme: 'light' | 'dark';
    themeParams: {
        bg_color?: string;
        text_color?: string;
        hint_color?: string;
        link_color?: string;
        button_color?: string;
        button_text_color?: string;
    };
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    headerColor: string;
    backgroundColor: string;
    BackButton: {
        isVisible: boolean;
        onClick: (callback: () => void) => void;
        offClick: (callback: () => void) => void;
        show: () => void;
        hide: () => void;
    };
    MainButton: {
        text: string;
        color: string;
        textColor: string;
        isVisible: boolean;
        isActive: boolean;
        isProgressVisible: boolean;
        setText: (text: string) => void;
        onClick: (callback: () => void) => void;
        offClick: (callback: () => void) => void;
        show: () => void;
        hide: () => void;
        enable: () => void;
        disable: () => void;
        showProgress: (leaveActive: boolean) => void;
        hideProgress: () => void;
        setParams: (params: any) => void;
    };
    HapticFeedback: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
    };
    ready: () => void;
    expand: () => void;
    close: () => void;
    enableClosingConfirmation: () => void;
    disableClosingConfirmation: () => void;
    showPopup: (params: {
        title?: string;
        message: string;
        buttons?: {
            id?: string;
            type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive';
            text?: string;
        }[];
    }, callback?: (buttonId: string) => void) => void;
    showAlert: (message: string, callback?: () => void) => void;
    showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
    openInvoice: (url: string, callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void) => void;
}

declare global {
    interface Window {
        Telegram?: {
            WebApp: TelegramWebApp;
        };
    }
}

/**
 * Получить экземпляр Telegram WebApp
 */
export const getTelegramWebApp = (): TelegramWebApp | null => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        return window.Telegram.WebApp;
    }
    return null;
};

/**
 * Проверка, запущено ли приложение в Telegram
 */
export const isTelegramWebApp = (): boolean => {
    return getTelegramWebApp() !== null;
};

/**
 * Инициализация Viewport (высоты экрана)
 */
export const initViewport = () => {
    const webApp = getTelegramWebApp();

    const setViewportHeight = () => {
        // Если мы в Telegram WebApp
        if (webApp) {
            // Используем viewportStableHeight если доступен, иначе viewportHeight
            const height = webApp.viewportStableHeight || webApp.viewportHeight || window.innerHeight;
            document.documentElement.style.setProperty('--tg-viewport-height', `${height}px`);
            document.documentElement.style.setProperty('--tg-viewport-stable-height', `${webApp.viewportStableHeight || height}px`);
        } else {
            // Fallback для обычного браузера
            document.documentElement.style.setProperty('--tg-viewport-height', `${window.innerHeight}px`);
            document.documentElement.style.setProperty('--tg-viewport-stable-height', `${window.innerHeight}px`);
        }
    };

    // Устанавливаем начальную высоту
    setViewportHeight();

    // Слушаем изменение размера (для Telegram WebApp)
    if (webApp) {
        webApp.onEvent('viewportChanged', setViewportHeight);
    }

    // Слушаем обычный resize
    window.addEventListener('resize', setViewportHeight);

    return () => {
        if (webApp) {
            webApp.offEvent('viewportChanged', setViewportHeight);
        }
        window.removeEventListener('resize', setViewportHeight);
    };
};

/**
 * Инициализация Telegram WebApp
 */
export const initTelegramWebApp = (): TelegramWebApp | null => {
    const webApp = getTelegramWebApp();

    if (webApp) {
        // Уведомляем Telegram, что приложение готово
        webApp.ready();

        // Разворачиваем приложение на весь экран
        webApp.expand();

        // Инициализируем viewport
        initViewport();

        // Отключаем вертикальные свайпы (свайп вниз для закрытия)
        disableVerticalSwipes();

        // Устанавливаем цвета темы
        if (webApp.colorScheme === 'dark') {
            document.documentElement.classList.add('dark');
        }

        console.log('Telegram WebApp initialized:', {
            version: webApp.version,
            platform: webApp.platform,
            colorScheme: webApp.colorScheme,
        });
    } else {
        console.warn('Not running in Telegram WebApp environment');
        // Даже если не в Telegram, инициализируем viewport для корректной работы 100vh
        initViewport();
    }

    return webApp;
};

/**
 * Отключить вертикальные свайпы в Telegram (свайп вниз для закрытия)
 */
export const disableVerticalSwipes = () => {
    const webApp = getTelegramWebApp();
    if (webApp && (webApp as any).disableVerticalSwipes) {
        (webApp as any).disableVerticalSwipes();
        console.log('Vertical swipes disabled');
    }
};

/**
 * Включить вертикальные свайпы в Telegram
 */
export const enableVerticalSwipes = () => {
    const webApp = getTelegramWebApp();
    if (webApp && (webApp as any).enableVerticalSwipes) {
        (webApp as any).enableVerticalSwipes();
        console.log('Vertical swipes enabled');
    }
};

/**
 * Получить данные пользователя Telegram
 */
export const getTelegramUser = () => {
    const webApp = getTelegramWebApp();
    return webApp?.initDataUnsafe?.user || null;
};

/**
 * Показать кнопку "Назад"
 */
export const showBackButton = (callback: () => void) => {
    const webApp = getTelegramWebApp();
    if (webApp) {
        webApp.BackButton.onClick(callback);
        webApp.BackButton.show();
    }
};

/**
 * Скрыть кнопку "Назад"
 */
export const hideBackButton = () => {
    const webApp = getTelegramWebApp();
    if (webApp) {
        webApp.BackButton.hide();
    }
};

/**
 * Тактильная обратная связь
 */
export const hapticFeedback = {
    light: () => getTelegramWebApp()?.HapticFeedback.impactOccurred('light'),
    medium: () => getTelegramWebApp()?.HapticFeedback.impactOccurred('medium'),
    heavy: () => getTelegramWebApp()?.HapticFeedback.impactOccurred('heavy'),
    success: () => getTelegramWebApp()?.HapticFeedback.notificationOccurred('success'),
    error: () => getTelegramWebApp()?.HapticFeedback.notificationOccurred('error'),
    warning: () => getTelegramWebApp()?.HapticFeedback.notificationOccurred('warning'),
    selection: () => getTelegramWebApp()?.HapticFeedback.selectionChanged(),
};

/**
 * Получить цветовую схему
 */
export const getColorScheme = (): 'light' | 'dark' => {
    const webApp = getTelegramWebApp();
    return webApp?.colorScheme || 'dark';
};

/**
 * Получить параметры темы
 */
export const getThemeParams = () => {
    const webApp = getTelegramWebApp();
    return webApp?.themeParams || {};
};
