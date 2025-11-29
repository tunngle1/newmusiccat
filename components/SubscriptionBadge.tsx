import React from 'react';
import { User } from '../types';

interface SubscriptionBadgeProps {
    user: User | null;
}

const SubscriptionBadge: React.FC<SubscriptionBadgeProps> = ({ user }) => {
    if (!user?.subscription_status) return null;

    const { reason, days_left } = user.subscription_status;

    // Показываем только для пробного периода
    if (reason !== 'trial') return null;

    const getDaysWord = (days: number): string => {
        if (days === 1) return 'день';
        if (days >= 2 && days <= 4) return 'дня';
        return 'дней';
    };

    const isExpiringSoon = days_left !== undefined && days_left <= 1;

    return (
        <div className="mb-4 px-4">
            <div className="rounded-xl p-3 bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🎁</span>
                    <span className="text-sm font-medium text-gray-300">
                        Пробный период: <span className="text-white">{days_left} {getDaysWord(days_left || 0)}</span>
                    </span>
                </div>

                {isExpiringSoon && (
                    <span className="text-xs px-2 py-1 rounded-md bg-white/10 text-gray-300">
                        Скоро истечет
                    </span>
                )}
            </div>
        </div>
    );
};

export default SubscriptionBadge;
