import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Crown } from 'lucide-react';
import { API_BASE_URL, TRIBUTE_LINK_MONTH, TRIBUTE_LINK_YEAR } from '../constants';

interface SubscriptionViewProps {
    onBack: () => void;
    userId?: number;
}

interface SubscriptionStatus {
    has_access: boolean;
    reason: string;
    premium_expires_at?: string;
    is_premium: boolean;
}

interface SubscriptionPlan {
    id: 'month' | 'year';
    name: string;
    duration: string;
    price: number;
    originalPrice?: number;
    discount?: string;
    features: string[];
    popular?: boolean;
}

const PLANS: SubscriptionPlan[] = [
    {
        id: 'month',
        name: 'Месяц',
        duration: '30 дней',
        price: 139,
        features: [
            'Безлимитные скачивания',
            'Без рекламы',
            'Высокое качество аудио',
            'Скачивание в Telegram',
            'Приоритетная поддержка'
        ]
    },
    {
        id: 'year',
        name: 'Год',
        duration: '365 дней',
        price: 1390,
        originalPrice: 1668,
        discount: '-17%',
        popular: true,
        features: [
            'Все преимущества месячной подписки',
            'Экономия 278 ₽',
            'Приоритетный доступ к новым функциям',
            'Эксклюзивные плейлисты',
            'VIP поддержка'
        ]
    }
];

const SubscriptionView: React.FC<SubscriptionViewProps> = ({ onBack, userId }) => {
    const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<'month' | 'year'>('year');
    const [promoCode, setPromoCode] = useState('');
    const [promoData, setPromoData] = useState<any>(null);
    const [promoError, setPromoError] = useState('');
    const [checkingPromo, setCheckingPromo] = useState(false);

    useEffect(() => {
        if (userId) {
            loadSubscriptionStatus();
        }
    }, [userId]);

    const loadSubscriptionStatus = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/user/subscription-status?user_id=${userId}`);
            const data = await response.json();
            setSubscriptionStatus(data.subscription_status);
        } catch (error) {
            console.error('Failed to load subscription status:', error);
        } finally {
            setLoading(false);
        }
    };

    const checkPromoCode = async () => {
        if (!promoCode.trim()) {
            setPromoError('Введите промокод');
            return;
        }

        setCheckingPromo(true);
        setPromoError('');
        setPromoData(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/promo/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: promoCode.trim() })
            });

            const data = await response.json();

            if (data.valid) {
                setPromoData(data);
                setPromoError('');
            } else {
                setPromoError(data.message || 'Промокод недействителен');
                setPromoData(null);
            }
        } catch (error) {
            setPromoError('Ошибка проверки промокода');
        } finally {
            setCheckingPromo(false);
        }
    };

    const handleSubscribe = () => {
        if (!userId) return;

        // Если есть промокод с Tribute ссылкой, используем её
        if (promoData && promoData.valid) {
            const tributeLink = selectedPlan === 'month'
                ? promoData.tribute_link_month
                : promoData.tribute_link_year;

            if (tributeLink) {
                window.open(tributeLink, '_blank');
                return;
            }
        }

        // Используем стандартные ссылки из .env
        const tributeLink = selectedPlan === 'month'
            ? 'https://t.me/tribute/app?startapp=pnxU'
            : 'https://t.me/tribute/app?startapp=pnxW';

        window.open(tributeLink, '_blank');
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const daysUntilExpiry = () => {
        if (!subscriptionStatus?.premium_expires_at) return 0;
        const expiry = new Date(subscriptionStatus.premium_expires_at);
        const now = new Date();
        const diff = expiry.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    return (
        <div className="fixed inset-0 bg-black text-white flex flex-col max-w-[480px] mx-auto">
            {/* Header */}
            <div className="p-4 border-b-2 border-white flex items-center gap-4 bg-black z-10">
                <button onClick={onBack} className="flex items-center gap-2 hover:text-red-500 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex-1 text-center text-xl font-black uppercase">ПОДПИСКА</div>
                <div className="w-6 h-6"></div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-hidden space-y-6">
                {/* Current Status */}
                {subscriptionStatus && (
                    <div className={`border-2 p-4 ${subscriptionStatus.has_access ? 'border-green-500 bg-green-500/10' : 'border-white/20 bg-white/5'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-bold uppercase text-gray-400">Текущий статус</div>
                            {subscriptionStatus.has_access && <Check className="w-5 h-5 text-green-500" />}
                        </div>
                        <div className="text-2xl font-black uppercase mb-1">
                            {subscriptionStatus.has_access ? 'PREMIUM АКТИВЕН' : 'НЕТ ПОДПИСКИ'}
                        </div>
                        {subscriptionStatus.premium_expires_at && (
                            <div className="text-sm text-gray-400">
                                {subscriptionStatus.has_access
                                    ? `Действует до ${formatDate(subscriptionStatus.premium_expires_at)} (${daysUntilExpiry()} дней)`
                                    : `Истёк ${formatDate(subscriptionStatus.premium_expires_at)}`
                                }
                            </div>
                        )}
                    </div>
                )}

                {/* Plans */}
                <div className="space-y-4">
                    <div className="text-lg font-black uppercase border-b border-white/20 pb-2">Выберите план</div>

                    {PLANS.map(plan => (
                        <div
                            key={plan.id}
                            onClick={() => setSelectedPlan(plan.id)}
                            className={`border-2 p-4 cursor-pointer transition-all relative ${selectedPlan === plan.id
                                ? 'border-red-500 bg-red-500/10'
                                : 'border-white/20 hover:border-white/40'
                                }`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-3 left-4 bg-red-500 text-white px-3 py-1 text-xs font-black uppercase">
                                    ПОПУЛЯРНЫЙ
                                </div>
                            )}

                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="text-xl font-black uppercase">{plan.name}</div>
                                    <div className="text-xs text-gray-400 uppercase">{plan.duration}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-2xl font-black">{plan.price} ₽</div>
                                    {plan.originalPrice && (
                                        <div className="text-sm text-gray-400 line-through">{plan.originalPrice} ₽</div>
                                    )}
                                    {plan.discount && (
                                        <div className="text-xs font-bold text-green-500">{plan.discount}</div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {plan.features.map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm">
                                        <Check className="w-4 h-4 text-red-500 shrink-0" />
                                        <span className="text-gray-300">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Promo Code */}
                <div className="border-2 border-white/20 p-4 space-y-3">
                    <div className="text-sm font-bold uppercase text-gray-400">Есть промокод?</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                            placeholder="ВВЕДИТЕ КОД"
                            className="flex-1 bg-black border-2 border-white/20 p-3 text-sm uppercase placeholder-gray-600 focus:border-red-500 outline-none font-bold"
                        />
                        <button
                            onClick={checkPromoCode}
                            disabled={checkingPromo}
                            className="px-4 bg-white text-black font-black uppercase hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
                        >
                            {checkingPromo ? '...' : 'OK'}
                        </button>
                    </div>
                    {promoError && (
                        <div className="text-xs text-red-500 font-bold uppercase">{promoError}</div>
                    )}
                    {promoData && promoData.valid && (
                        <div className="bg-green-500/10 border border-green-500 p-3">
                            <div className="text-sm font-bold text-green-500 uppercase flex items-center gap-2">
                                <Check className="w-4 h-4" />
                                Промокод применён
                            </div>
                            {promoData.discount_type === 'percent' && (
                                <div className="text-xs text-gray-300 mt-1">
                                    Скидка {promoData.value}%
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Subscribe Button */}
                <button
                    onClick={handleSubscribe}
                    className="w-full bg-white text-black p-5 font-black text-lg uppercase hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center gap-3"
                >
                    <Crown className="w-6 h-6" />
                    {subscriptionStatus?.has_access ? 'ПРОДЛИТЬ ПОДПИСКУ' : 'ОФОРМИТЬ ПОДПИСКУ'}
                </button>
            </div>
        </div>
    );
};

export default SubscriptionView;
