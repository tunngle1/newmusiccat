import React, { useState, useEffect } from 'react';
import { Copy, Share2, Users, CheckCircle, Clock, Gift, ArrowLeft } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { API_BASE_URL } from '../constants';

interface ReferralStats {
    total_referrals: number;
    completed_referrals: number;
    pending_referrals: number;
    referrals: Array<{
        id: number;
        user_id: number;
        username: string | null;
        first_name: string | null;
        status: string;
        reward_given: boolean;
        created_at: string | null;
        completed_at: string | null;
    }>;
}

interface ReferralViewProps {
    onBack: () => void;
}

const ReferralView: React.FC<ReferralViewProps> = ({ onBack }) => {
    const { user } = usePlayer();
    const [referralCode, setReferralCode] = useState<string>('');
    const [referralLink, setReferralLink] = useState<string>('');
    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadReferralData();
        }
    }, [user]);

    const loadReferralData = async () => {
        if (!user) return;

        try {
            // Get referral code and link
            const codeResponse = await fetch(`${API_BASE_URL}/api/referral/code?user_id=${user.id}`);
            if (codeResponse.ok) {
                const codeData = await codeResponse.json();
                setReferralCode(codeData.code);
                setReferralLink(codeData.link);
            }

            // Get referral stats
            const statsResponse = await fetch(`${API_BASE_URL}/api/referral/stats?user_id=${user.id}`);
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                setStats(statsData);
            }
        } catch (error) {
            console.error('Failed to load referral data:', error);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(referralLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    const shareReferral = () => {
        const text = `🎵 Присоединяйся к лучшему музыкальному боту! Используй мою реферальную ссылку и получи бонусы:\n${referralLink}`;

        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-white">Загрузка...</div>
            </div>
        );
    }

    return (
        <div className="px-4 py-8 space-y-6 animate-fade-in pb-24">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={onBack}
                        className="p-3 rounded-full glass-button text-white/80 hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3 text-glow">
                        <Gift className="text-purple-500 drop-shadow-md" />
                        Реферальная программа
                    </h1>
                </div>
            </div>

            {/* Info Banner */}
            <div className="glass-panel p-6 rounded-2xl border border-purple-500/20">
                <h2 className="text-lg font-bold text-white mb-2">🎁 Приглашай друзей — получай премиум!</h2>
                <p className="text-white/70 text-sm">
                    За каждого друга, который оформит подписку по вашей ссылке, вы получите <span className="text-purple-400 font-bold">+30 дней Premium</span> бесплатно!
                </p>
            </div>

            {/* Referral Link Card */}
            <div className="glass-panel p-6 rounded-2xl">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Share2 size={18} className="text-purple-400" />
                    Ваша реферальная ссылка
                </h3>

                <div className="bg-black/30 p-4 rounded-xl mb-4">
                    <div className="text-xs text-white/40 mb-2">Код</div>
                    <div className="text-white font-mono text-lg">{referralCode}</div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={copyToClipboard}
                        className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2"
                    >
                        {copied ? (
                            <>
                                <CheckCircle size={18} />
                                Скопировано!
                            </>
                        ) : (
                            <>
                                <Copy size={18} />
                                Копировать ссылку
                            </>
                        )}
                    </button>
                    <button
                        onClick={shareReferral}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2"
                    >
                        <Share2 size={18} />
                        Поделиться
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4">
                <div className="glass-panel p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-white mb-1">{stats?.total_referrals || 0}</div>
                    <div className="text-xs text-white/60">Всего</div>
                </div>
                <div className="glass-panel p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-green-400 mb-1">{stats?.completed_referrals || 0}</div>
                    <div className="text-xs text-white/60">Активных</div>
                </div>
                <div className="glass-panel p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-yellow-400 mb-1">{stats?.pending_referrals || 0}</div>
                    <div className="text-xs text-white/60">Ожидают</div>
                </div>
            </div>

            {/* Referrals List */}
            {stats && stats.referrals.length > 0 && (
                <div className="glass-panel p-6 rounded-2xl">
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                        <Users size={18} className="text-purple-400" />
                        Ваши рефералы ({stats.referrals.length})
                    </h3>
                    <div className="space-y-3">
                        {stats.referrals.map((ref) => (
                            <div
                                key={ref.id}
                                className="bg-black/20 p-4 rounded-xl flex items-center justify-between"
                            >
                                <div className="flex-1">
                                    <div className="text-white font-medium">
                                        {ref.first_name || ref.username || `User ${ref.user_id}`}
                                    </div>
                                    <div className="text-xs text-white/40 mt-1">
                                        {ref.username && `@${ref.username}`}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {ref.status === 'completed' ? (
                                        <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full flex items-center gap-1">
                                            <CheckCircle size={12} />
                                            Активен
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full flex items-center gap-1">
                                            <Clock size={12} />
                                            Ожидает
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {stats && stats.referrals.length === 0 && (
                <div className="glass-panel p-8 rounded-2xl text-center">
                    <Users size={48} className="text-white/20 mx-auto mb-4" />
                    <h3 className="text-white font-bold mb-2">Пока нет рефералов</h3>
                    <p className="text-white/60 text-sm">
                        Поделитесь своей ссылкой с друзьями, чтобы получить бонусы!
                    </p>
                </div>
            )}
        </div>
    );
};

export default ReferralView;
