import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, Gift, Star } from 'lucide-react';

interface Notification {
    id: string;
    type: 'success' | 'error' | 'info' | 'referral' | 'premium';
    title: string;
    message: string;
    duration?: number;
}

interface NotificationContextType {
    showNotification: (notification: Omit<Notification, 'id'>) => void;
    showReferralJoined: (username: string) => void;
    showReferralPurchased: (username: string, bonus: number) => void;
    showPremiumActivated: (expiresAt: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const showNotification = useCallback((notification: Omit<Notification, 'id'>) => {
        const id = Date.now().toString();
        const newNotification = { ...notification, id };

        setNotifications(prev => [...prev, newNotification]);

        // Auto remove after duration
        const duration = notification.duration || 5000;
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, duration);
    }, []);

    const showReferralJoined = useCallback((username: string) => {
        showNotification({
            type: 'referral',
            title: '🎉 Новый реферал!',
            message: `${username} зарегистрировался по вашей ссылке`,
            duration: 6000
        });
    }, [showNotification]);

    const showReferralPurchased = useCallback((username: string, bonus: number) => {
        showNotification({
            type: 'premium',
            title: '💎 Бонус получен!',
            message: `${username} оформил подписку! Вы получили +${bonus} дней Premium`,
            duration: 8000
        });
    }, [showNotification]);

    const showPremiumActivated = useCallback((expiresAt: string) => {
        const date = new Date(expiresAt);
        const formattedDate = date.toLocaleDateString('ru-RU');

        showNotification({
            type: 'success',
            title: '✨ Premium активирован!',
            message: `Ваша подписка активна до ${formattedDate}`,
            duration: 7000
        });
    }, [showNotification]);

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'success':
                return <CheckCircle size={20} className="text-green-400" />;
            case 'error':
                return <AlertCircle size={20} className="text-red-400" />;
            case 'referral':
                return <Gift size={20} className="text-purple-400" />;
            case 'premium':
                return <Star size={20} className="text-yellow-400" />;
            default:
                return <Info size={20} className="text-blue-400" />;
        }
    };

    const getBackgroundClass = (type: Notification['type']) => {
        switch (type) {
            case 'success':
                return 'bg-green-600 border-green-700 text-white';
            case 'error':
                return 'bg-red-600 border-red-700 text-white';
            case 'referral':
                return 'bg-purple-600 border-purple-700 text-white';
            case 'premium':
                return 'bg-yellow-500 border-yellow-600 text-black';
            default:
                return 'bg-blue-600 border-blue-700 text-white';
        }
    };

    return (
        <NotificationContext.Provider value={{
            showNotification,
            showReferralJoined,
            showReferralPurchased,
            showPremiumActivated
        }}>
            {children}

            {/* Notification Container */}
            <div className="fixed top-4 right-4 z-[9999] space-y-3 max-w-sm">
                {notifications.map(notification => (
                    <div
                        key={notification.id}
                        className={`border ${getBackgroundClass(notification.type)} p-4 rounded-xl shadow-lg animate-slide-in-right cursor-pointer`}
                        onClick={() => removeNotification(notification.id)}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                                {getIcon(notification.type)}
                            </div>
                            {/*
                              text colors come from wrapper (getBackgroundClass); enforce inner text to inherit
                            */}
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-sm mb-1" style={{ color: 'inherit' }}>
                                    {notification.title}
                                </h4>
                                <p className="text-xs" style={{ color: 'inherit' }}>
                                    {notification.message}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within NotificationProvider');
    }
    return context;
};
