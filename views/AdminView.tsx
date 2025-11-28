import React, { useState, useEffect } from 'react';
import { Shield, Users, Star, Activity, Check, AlertCircle, ArrowLeft, Database, RefreshCw, Trash2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { API_BASE_URL } from '../constants';

interface UserStats {
    total_users: number;
    premium_users: number;
    admin_users: number;
    new_users_today: number;
}

interface CacheStats {
    total_entries: number;
    cache_hits: number;
    cache_misses: number;
    hit_ratio: number;
    ttl_seconds: number;
    sample_keys: string[];
}

interface AdminViewProps {
    onBack: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({ onBack }) => {
    const { user } = usePlayer();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [targetId, setTargetId] = useState('');
    const [grantType, setGrantType] = useState<'admin' | 'premium'>('premium');
    const [grantValue, setGrantValue] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (!user?.is_admin) {
            onBack();
            return;
        }
        loadData();
    }, [user, onBack]);

    const loadData = async () => {
        setIsLoading(true);
        await Promise.all([loadStats(), loadCacheStats()]);
        setIsLoading(false);
    };

    const loadStats = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/stats?user_id=${user?.id}`);
            if (response.ok) {
                const data = await response.json();
                setStats(data);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    };

    const loadCacheStats = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/cache/stats?user_id=${user?.id}`);
            if (response.ok) {
                const data = await response.json();
                setCacheStats(data);
            }
        } catch (error) {
            console.error('Failed to load cache stats:', error);
        }
    };

    const handleResetCache = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/cache/reset?admin_id=${user?.id}`, {
                method: 'POST'
            });
            if (response.ok) {
                setMessage({ type: 'success', text: 'Кэш успешно очищен' });
                loadCacheStats();
            } else {
                setMessage({ type: 'error', text: 'Ошибка при очистке кэша' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }
        setTimeout(() => setMessage(null), 3000);
    };

    const handleGrant = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetId || !user) return;

        try {
            const body: any = { user_id: parseInt(targetId) };
            if (grantType === 'admin') body.is_admin = grantValue;
            if (grantType === 'premium') body.is_premium = grantValue;

            const response = await fetch(`${API_BASE_URL}/api/admin/grant?admin_id=${user.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                setMessage({ type: 'success', text: `Права успешно обновлены для ID ${targetId}` });
                setTargetId('');
                loadStats(); // Refresh stats
            } else {
                setMessage({ type: 'error', text: 'Ошибка при обновлении прав' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }

        setTimeout(() => setMessage(null), 3000);
    };

    if (!user?.is_admin) return null;

    return (
        <div className="px-4 py-8 space-y-8 animate-fade-in pb-24">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft size={20} className="text-gray-300" />
                    </button>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="text-blue-500" />
                        Админ-панель
                    </h1>
                </div>
                <button
                    onClick={loadData}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <RefreshCw size={20} className={`text-gray-300 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 text-gray-400 mb-2">
                        <Users size={16} />
                        <span className="text-xs font-medium">Всего пользователей</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {isLoading ? '...' : stats?.total_users}
                    </div>
                </div>

                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 text-yellow-500 mb-2">
                        <Star size={16} />
                        <span className="text-xs font-medium text-gray-400">Premium</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {isLoading ? '...' : stats?.premium_users}
                    </div>
                </div>

                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 text-blue-500 mb-2">
                        <Shield size={16} />
                        <span className="text-xs font-medium text-gray-400">Админы</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {isLoading ? '...' : stats?.admin_users}
                    </div>
                </div>

                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 text-green-500 mb-2">
                        <Activity size={16} />
                        <span className="text-xs font-medium text-gray-400">Новые сегодня</span>
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {isLoading ? '...' : stats?.new_users_today}
                    </div>
                </div>
            </div>

            {/* Cache Stats */}
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Database size={18} className="text-purple-400" />
                        Кэширование
                    </h3>
                    <button
                        onClick={handleResetCache}
                        className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors flex items-center gap-1"
                    >
                        <Trash2 size={14} />
                        Сбросить
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-black/20 p-3 rounded-xl">
                        <div className="text-xs text-gray-400 mb-1">Записей в кэше</div>
                        <div className="text-xl font-bold text-white">{cacheStats?.total_entries || 0}</div>
                    </div>
                    <div className="bg-black/20 p-3 rounded-xl">
                        <div className="text-xs text-gray-400 mb-1">Эффективность (Hit Ratio)</div>
                        <div className="text-xl font-bold text-green-400">
                            {((cacheStats?.hit_ratio || 0) * 100).toFixed(1)}%
                        </div>
                    </div>
                    <div className="bg-black/20 p-3 rounded-xl">
                        <div className="text-xs text-gray-400 mb-1">Попаданий (Hits)</div>
                        <div className="text-xl font-bold text-blue-400">{cacheStats?.cache_hits || 0}</div>
                    </div>
                    <div className="bg-black/20 p-3 rounded-xl">
                        <div className="text-xs text-gray-400 mb-1">Промахов (Misses)</div>
                        <div className="text-xl font-bold text-orange-400">{cacheStats?.cache_misses || 0}</div>
                    </div>
                </div>

                <div className="text-xs text-gray-500">
                    TTL: {cacheStats?.ttl_seconds} сек.
                </div>
            </div>

            {/* Management Form */}
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                <h3 className="text-lg font-semibold text-white mb-4">Управление правами</h3>

                <form onSubmit={handleGrant} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Telegram ID пользователя</label>
                        <input
                            type="text"
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value.replace(/\D/g, ''))}
                            placeholder="Например: 123456789"
                            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setGrantType('premium')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${grantType === 'premium' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50' : 'bg-white/5 text-gray-400'
                                }`}
                        >
                            Premium
                        </button>
                        <button
                            type="button"
                            onClick={() => setGrantType('admin')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${grantType === 'admin' ? 'bg-blue-500/20 text-blue-500 border border-blue-500/50' : 'bg-white/5 text-gray-400'
                                }`}
                        >
                            Admin
                        </button>
                    </div>

                    <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl">
                        <span className="text-sm text-gray-300">Статус</span>
                        <button
                            type="button"
                            onClick={() => setGrantValue(!grantValue)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${grantValue ? 'bg-green-500' : 'bg-gray-600'
                                }`}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${grantValue ? 'translate-x-6' : 'translate-x-0'
                                }`} />
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={!targetId}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        <Check size={18} />
                        Применить изменения
                    </button>
                </form>

                {message && (
                    <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                        {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                        {message.text}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminView;
