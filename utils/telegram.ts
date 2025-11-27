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
 * Инициализация Telegram WebApp
 */
export const initTelegramWebApp = (): TelegramWebApp | null => {
    const webApp = getTelegramWebApp();

    if (webApp) {
        // Уведомляем Telegram, что приложение готово
        webApp.ready();

        // Разворачиваем приложение на весь экран
        webApp.expand();

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
    }

    return webApp;
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
