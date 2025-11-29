import React, { useState } from 'react';
import { User } from '../types';
import PaymentView from '../views/PaymentView';

interface SubscriptionBlockerProps {
    user: User | null;
    onRefresh: () => void;
}

const SubscriptionBlocker: React.FC<SubscriptionBlockerProps> = ({ user, onRefresh }) => {
    const [showPayment, setShowPayment] = useState(false);

    const handleContactAdmin = () => {
        if (window.Telegram?.WebApp?.showAlert) {
            window.Telegram.WebApp.showAlert('Для получения премиум-подписки свяжитесь с администратором через бота');
        }
    };

    const getBlockMessage = () => {
        if (!user?.subscription_status) {
            return {
                title: 'Доступ ограничен',
                message: 'Не удалось проверить статус подписки',
                icon: '🔒'
            };
        }

        const { reason } = user.subscription_status;

        switch (reason) {
            case 'blocked':
                return {
                    title: 'Доступ заблокирован',
                    message: 'Ваш аккаунт был заблокирован администратором. Для получения дополнительной информации свяжитесь с поддержкой.',
                    icon: '🚫'
                };
            case 'expired':
                return {
                    title: 'Пробный период истек',
                    message: 'Ваш 3-дневный пробный период закончился. Для продолжения использования сервиса необходимо оформить премиум-подписку.',
                    icon: '⏰'
                };
            default:
                return {
                    title: 'Требуется подписка',
                    message: 'Для использования сервиса необходима активная подписка.',
                    icon: '💎'
                };
        }
    };

    const blockInfo = getBlockMessage();
    const isBlocked = user?.subscription_status?.reason === 'blocked';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black">
            <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/40 via-black to-black" />

            <div className="relative w-full max-w-md">
                <div className="glass-heavy rounded-3xl p-8 text-center space-y-6">
                    <div className="text-7xl mb-4 animate-pulse">
                        {blockInfo.icon}
                    </div>

                    <h1 className="text-3xl font-bold text-white mb-2">
                        {blockInfo.title}
                    </h1>

                    <p className="text-gray-300 text-lg leading-relaxed">
                        {blockInfo.message}
                    </p>

                    <div className="space-y-3 pt-4">
                        {!isBlocked && (
                            <button
                                onClick={() => setShowPayment(true)}
                                className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-blue-500/20"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                    </svg>
                                    Оформить подписку
                                </div>
                            </button>
                        )}

                        <button
                            onClick={handleContactAdmin}
                            className="w-full glass-button py-4 px-6 rounded-xl text-white font-semibold text-lg hover:scale-105 transition-transform"
                        >
                            <div className="flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                                Связаться с администратором
                            </div>
                        </button>

                        {!isBlocked && (
                            <button
                                onClick={onRefresh}
                                className="w-full py-4 px-6 rounded-xl text-gray-400 font-semibold hover:text-white hover:bg-white/5 transition-all"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                    </svg>
                                    Обновить статус
                                </div>
                            </button>
                        )}
                    </div>

                    {user && (
                        <div className="mt-6 pt-6 border-t border-white/10 text-sm text-gray-500">
                            <p>ID: {user.id}</p>
                            <p>@{user.username}</p>
                        </div>
                    )}
                </div>
            </div>

            {showPayment && (
                <PaymentView
                    user={user}
                    onClose={() => setShowPayment(false)}
                />
            )}
        </div>
    );
};


export default SubscriptionBlocker;
