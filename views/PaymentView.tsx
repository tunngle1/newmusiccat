import React, { useState } from 'react';
import { User, SubscriptionPlan } from '../types';
import { Loader, Check, Star, Zap } from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { useTonConnectUI, TonConnectButton } from '@tonconnect/ui-react';

// Планы подписки
const PLANS: SubscriptionPlan[] = [
    {
        id: 'month',
        name: '1 Месяц',
        priceStars: 100,
        priceTon: 1.0,
        duration: '30 дней',
        features: ['Безлимитное скачивание', 'Доступ к эксклюзивам', 'Поддержка авторов']
    },
    {
        id: 'year',
        name: '1 Год',
        priceStars: 1000,
        priceTon: 10.0,
        duration: '365 дней',
        features: ['Все преимущества', 'Выгоднее на 20%', 'Золотой бейдж']
    }
];

interface PaymentViewProps {
    user: User | null;
    onClose: () => void;
}

const PaymentView: React.FC<PaymentViewProps> = ({ user, onClose }) => {
    const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(PLANS[0]);
    const [isLoading, setIsLoading] = useState(false);
    const [tonConnectUI] = useTonConnectUI();

    const handleStarsPayment = async () => {
        setIsLoading(true);
        try {
            // 1. Создаем инвойс на бэкенде
            const response = await fetch(`${API_BASE_URL}/api/payment/stars/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user?.id,
                    plan: selectedPlan.id
                })
            });

            const data = await response.json();

            if (data.status === 'ok' && data.invoice_link) {
                // 2. Открываем инвойс через WebApp
                window.Telegram.WebApp.openInvoice(data.invoice_link, (status) => {
                    if (status === 'paid') {
                        window.Telegram.WebApp.showAlert('Оплата прошла успешно! Премиум активирован.');
                        onClose();
                    } else if (status === 'cancelled') {
                        // Пользователь отменил
                    } else {
                        window.Telegram.WebApp.showAlert('Ошибка при оплате.');
                    }
                    setIsLoading(false);
                });
            } else {
                throw new Error('Failed to create invoice');
            }
        } catch (error) {
            console.error('Payment error:', error);
            window.Telegram.WebApp.showAlert('Ошибка соединения с сервером.');
            setIsLoading(false);
        }
    };

    const handleTonPayment = async () => {
        if (!tonConnectUI.connected) {
            window.Telegram.WebApp.showAlert('Пожалуйста, подключите кошелек TON');
            return;
        }

        setIsLoading(true);
        try {
            // Сумма в нано-тонах (1 TON = 1,000,000,000 nanotons)
            const amountNano = (selectedPlan.priceTon * 1000000000).toString();

            // Адрес получателя (магазина) - должен быть в .env на бэкенде, но здесь нужен для формирования транзакции
            // В реальном приложении лучше получать параметры транзакции с бэкенда
            // Для теста используем адрес из бэкенда (нужно сделать endpoint для получения конфига)
            // Пока хардкод для теста (замените на свой тестовый кошелек!)
            const destinationAddress = "0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC"; // ЗАГЛУШКА!

            const transaction = {
                validUntil: Math.floor(Date.now() / 1000) + 600, // 10 минут
                messages: [
                    {
                        address: destinationAddress,
                        amount: amountNano,
                        // payload: ... (можно добавить комментарий с ID пользователя)
                    }
                ]
            };

            const result = await tonConnectUI.sendTransaction(transaction);

            // Отправляем BOC на бэкенд для проверки
            const response = await fetch(`${API_BASE_URL}/api/payment/ton/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user?.id,
                    plan: selectedPlan.id,
                    boc: result.boc
                })
            });

            const data = await response.json();
            if (data.status === 'ok') {
                window.Telegram.WebApp.showAlert('Оплата TON успешна! Премиум активирован.');
                onClose();
            } else {
                window.Telegram.WebApp.showAlert('Ошибка проверки транзакции.');
            }

        } catch (error) {
            console.error('TON Payment error:', error);
            if (error instanceof Error && error.message.includes('User rejected')) {
                // User cancelled
            } else {
                window.Telegram.WebApp.showAlert('Ошибка при оплате TON: ' + (error as Error).message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-md bg-[#1c1c1e] rounded-t-3xl sm:rounded-3xl p-6 space-y-6 animate-slide-up">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-white">Premium Подписка</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        ✕
                    </button>
                </div>

                {/* Выбор плана */}
                <div className="grid grid-cols-2 gap-4">
                    {PLANS.map((plan) => (
                        <button
                            key={plan.id}
                            onClick={() => setSelectedPlan(plan)}
                            className={`
                                relative p-4 rounded-xl border-2 text-left transition-all
                                ${selectedPlan.id === plan.id
                                    ? 'border-blue-500 bg-blue-500/10'
                                    : 'border-white/10 bg-white/5 hover:bg-white/10'}
                            `}
                        >
                            {selectedPlan.id === plan.id && (
                                <div className="absolute -top-3 -right-3 bg-blue-500 rounded-full p-1">
                                    <Check size={12} className="text-white" />
                                </div>
                            )}
                            <div className="text-sm text-gray-400">{plan.duration}</div>
                            <div className="text-xl font-bold text-white mt-1">{plan.name}</div>
                            <div className="text-blue-400 font-medium mt-2">
                                {plan.priceStars} ⭐ / {plan.priceTon} TON
                            </div>
                        </button>
                    ))}
                </div>

                {/* Описание преимуществ */}
                <div className="space-y-3 bg-white/5 rounded-xl p-4">
                    {selectedPlan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-gray-300">
                            <Check size={16} className="text-green-400" />
                            <span>{feature}</span>
                        </div>
                    ))}
                </div>

                {/* Кнопки оплаты */}
                <div className="space-y-3 pt-2">
                    <button
                        onClick={handleStarsPayment}
                        disabled={isLoading}
                        className="w-full py-4 bg-[#007AFF] hover:bg-[#0066CC] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? (
                            <Loader size={20} className="animate-spin" />
                        ) : (
                            <>
                                <Star size={20} fill="currentColor" />
                                Оплатить {selectedPlan.priceStars} Stars
                            </>
                        )}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-2 bg-[#1c1c1e] text-sm text-gray-500">или через TON</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-center w-full">
                            <TonConnectButton />
                        </div>

                        <button
                            onClick={handleTonPayment}
                            disabled={isLoading || !tonConnectUI.connected}
                            className={`
                                w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors
                                ${!tonConnectUI.connected
                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : 'bg-[#0098EA] hover:bg-[#0088D0] text-white'}
                            `}
                        >
                            <Zap size={20} />
                            Оплатить {selectedPlan.priceTon} TON
                        </button>
                    </div>

                </div>

                <p className="text-center text-xs text-gray-500">
                    Нажимая кнопку оплаты, вы соглашаетесь с условиями использования.
                </p>
            </div>
        </div>
    );
};

export default PaymentView;
