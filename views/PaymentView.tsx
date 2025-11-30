import React, { useState } from 'react';
import { User, SubscriptionPlan } from '../types';
import { Loader, Check, Star, Zap, CreditCard } from 'lucide-react';
import { API_BASE_URL } from '../constants';

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

    const handleTributePayment = async () => {
        setIsLoading(true);
        try {
            // Получаем конфигурацию платежей с бэкенда
            const configResponse = await fetch(`${API_BASE_URL}/api/payment/config`);
            if (!configResponse.ok) {
                throw new Error('Failed to fetch payment config');
            }
            const config = await configResponse.json();

            // Выбираем ссылку в зависимости от плана
            const link = selectedPlan.id === 'month' ? config.tribute_link_month : config.tribute_link_year;

            if (link) {
                // Открываем Tribute Mini App
                (window.Telegram.WebApp as any).openTelegramLink(link);
                onClose(); // Закрываем окно оплаты, так как пользователь перейдет в Tribute
            } else {
                window.Telegram.WebApp.showAlert('Ссылка на оплату не настроена. Пожалуйста, свяжитесь с поддержкой.');
            }

        } catch (error) {
            console.error('Tribute Payment error:', error);
            window.Telegram.WebApp.showAlert('Ошибка при получении ссылки на оплату.');
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
                        onClick={handleTributePayment}
                        disabled={isLoading}
                        className="w-full py-4 bg-[#0098EA] hover:bg-[#0088D0] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        <CreditCard size={20} />
                        Оплатить {selectedPlan.priceTon * 100}₽ (Карта / СБП)
                    </button>

                    <p className="text-center text-xs text-gray-500 mt-2">
                        Оплата происходит через сервис Tribute.tg
                    </p>
                </div>

                <p className="text-center text-xs text-gray-500">
                    Нажимая кнопку оплаты, вы соглашаетесь с условиями использования.
                </p>
            </div>
        </div>
    );
};

export default PaymentView;
