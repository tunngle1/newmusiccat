import React from 'react';
import { User } from '../types';

interface SubscriptionBadgeProps {
    user: User | null;
}

const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({ user }) => {
    if (!user?.subscription_status) return null;

    const { reason, days_left } = user.subscription_status;

    // Не показываем бадж для админов
    if (reason === 'admin') return null;

    const getBadgeConfig = () => {
        switch (reason) {
            case 'premium_pro':
                return {
                    text: '👑 Premium Pro',
                    bgColor: 'from-purple-500/20 to-pink-500/20',
                    borderColor: 'border-purple-500/30',
                    textColor: 'text-purple-300',
                    glow: 'shadow-purple-500/20'
                };
            case 'premium':
                return {
                    text: '💎 Premium',
                    bgColor: 'from-yellow-500/20 to-amber-500/20',
                    borderColor: 'border-yellow-500/30',
                    textColor: 'text-yellow-300',
                    glow: 'shadow-yellow-500/20'
                };
            case 'trial':
                const isExpiringSoon = days_left !== undefined && days_left <= 1;
                return {
                    text: `🎁 Пробный период: ${days_left} ${getDaysWord(days_left || 0)}`,
                    bgColor: isExpiringSoon ? 'from-red-500/20 to-orange-500/20' : 'from-blue-500/20 to-cyan-500/20',
                    borderColor: isExpiringSoon ? 'border-red-500/30' : 'border-blue-500/30',
                    textColor: isExpiringSoon ? 'text-red-300' : 'text-blue-300',
                    glow: isExpiringSoon ? 'shadow-red-500/20' : 'shadow-blue-500/20',
                    warning: isExpiringSoon
                };
            default:
                return null;
        }
    };

    const getDaysWord = (days: number): string => {
        if (days === 1) return 'день';
        if (days >= 2 && days <= 4) return 'дня';
        return 'дней';
    };

    const config = getBadgeConfig();
    if (!config) return null;

    return (
        <div className="mb-4 px-4">
            <div
                className={`
          glass rounded-2xl p-4 border
          bg-gradient-to-r ${config.bgColor}
          ${config.borderColor}
          shadow-lg ${config.glow}
          transition-all duration-300
          ${config.warning ? 'animate-pulse' : ''}
        `}
            >
                <div className="flex items-center justify-between">
                    <span className={`font-semibold ${config.textColor}`}>
                        {config.text}
                    </span>

                    {config.warning && (
                        <span className="text-xs text-red-400 font-medium">
                            ⚠️ Скоро истечет
                        </span>
                    )}
                </div>

                {reason === 'trial' && days_left !== undefined && days_left > 1 && (
                    <p className="text-xs text-gray-400 mt-2">
                        Оформите премиум-подписку для продолжения использования сервиса
                    </p>
                )}
            </div>
        </div>
    );
};

export default SubscriptionBadge;
