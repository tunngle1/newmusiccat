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
        priceRub: 139,
        duration: '30 дней',
        features: ['Безлимитное скачивание', 'Доступ к эксклюзивам', 'Поддержка авторов']
    },
    {
        id: 'year',
        name: '1 Год',
        priceStars: 1000,
        priceTon: 10.0,
        priceRub: 1390,
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
    const [promoCode, setPromoCode] = useState('');
    const [appliedPromo, setAppliedPromo] = useState<{
        code: string;
        discount_type: string;
        value: number;
    } | null>(null);
    const [promoMessage, setPromoMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleApplyPromo = async () => {
        if (!promoCode.trim()) return;
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/payment/check-promo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: promoCode })
            });
            const data = await response.json();

            if (data.valid) {
                setAppliedPromo({
                    code: promoCode,
                    discount_type: data.discount_type,
                    value: data.value
                });
                setPromoMessage({ type: 'success', text: data.message });
            } else {
                setAppliedPromo(null);
                setPromoMessage({ type: 'error', text: data.message });
            }
        } catch (error) {
            setPromoMessage({ type: 'error', text: 'Ошибка проверки промокода' });
        }
        setIsLoading(false);
    };

    const getDiscountedPrice = (originalPrice: number) => {
        if (!appliedPromo) return originalPrice;
        if (appliedPromo.discount_type === 'percent') {
            return Math.round(originalPrice * (1 - appliedPromo.value / 100));
        } else if (appliedPromo.discount_type === 'fixed') {
            return Math.max(0, Math.round(originalPrice - appliedPromo.value));
        }
        return originalPrice;
    };


    const handleYooMoneyPayment = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            // Создаем ссылку на оплату
            const response = await fetch(`${API_BASE_URL}/api/payment/create-yoomoney-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: user.id,
                    plan_id: selectedPlan.id,
                    promo_code: appliedPromo?.code || null,
                    amount: 0 // Цена определяется на сервере
                })
            });

            if (!response.ok) throw new Error('Failed to create payment link');

            const { payment_link } = await response.json();

            // Открываем ссылку
            if ((window.Telegram?.WebApp as any)?.openLink) {
                (window.Telegram.WebApp as any).openLink(payment_link);
            } else {
                window.open(payment_link, '_blank');
            }

            // Показываем инструкцию
            window.Telegram?.WebApp?.showPopup({
                title: 'Оплата через ЮMoney',
                message: 'После успешной оплаты вернитесь в бота. Премиум активируется автоматически в течение минуты.',
                buttons: [{ type: 'ok' }]
            });

        } catch (error) {
            console.error('YooMoney Payment error:', error);
            window.Telegram?.WebApp?.showAlert('Ошибка при создании ссылки на оплату.');
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

                {/* Промокод */}
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Есть промокод?"
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <button
                            onClick={handleApplyPromo}
                            disabled={!promoCode || isLoading}
                            className="px-4 py-2 bg-blue-500/20 text-blue-400 font-bold rounded-xl hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? <Loader size={18} className="animate-spin" /> : 'OK'}
                        </button>
                    </div>
                    {promoMessage && (
                        <div className={`text-xs font-medium ${promoMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                            {promoMessage.text}
                        </div>
                    )}
                </div>

                {/* Кнопки оплаты */}
                <div className="space-y-3 pt-2">
                    <button
                        onClick={handleYooMoneyPayment}
                        disabled={isLoading}
                        className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? (
                            <Loader size={20} className="animate-spin" />
                        ) : (
                            <>
                                <CreditCard size={20} />
                                Оплатить {getDiscountedPrice(selectedPlan.priceRub)} ₽
                                {appliedPromo && (
                                    <span className="ml-2 text-sm line-through opacity-70">
                                        {selectedPlan.priceRub}₽
                                    </span>
                                )}
                            </>
                        )}
                    </button>

                    <p className="text-center text-xs text-gray-500 mt-2">
                        Безопасная оплата картой РФ или кошельком ЮMoney
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
