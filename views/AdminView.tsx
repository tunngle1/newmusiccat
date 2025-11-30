import React, { useState, useEffect } from 'react';
import { Shield, Users, Star, Activity, Check, AlertCircle, ArrowLeft, Database, RefreshCw, Trash2, Crown, UserX, Ban, CheckCircle, Zap, Plus, Loader } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { API_BASE_URL } from '../constants';

const SUPER_ADMIN_ID = 414153884;

interface UserStats {
    total_users: number;
    premium_users: number;
    admin_users: number;
    new_users_today: number;
    total_revenue_ton: number;
    total_revenue_stars: number;
    total_revenue_rub: number;
}

interface Transaction {
    id: number;
    user_id: number;
    amount: string;
    currency: string;
    plan: string;
    status: string;
    created_at: string;
}

interface PromoCode {
    id: number;
    code: string;
    discount_type: string;
    value: number;
    used_count: number;
    max_uses: number;
    expires_at: string | null;
    tribute_link_month: string | null;
    tribute_link_year: string | null;
}

interface TopUser {
    id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    download_count: number;
    is_premium: boolean;
}

interface ActivityStat {
    date: string;
    count: number;
}

interface CacheStats {
    total_entries: number;
    cache_hits: number;
    cache_misses: number;
    hit_ratio: number;
    ttl_seconds: number;
    sample_keys: string[];
}

interface UserListItem {
    id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    is_admin: boolean;
    is_premium: boolean;
    is_blocked: boolean;
}

interface AdminViewProps {
    onBack: () => void;
}

type TabType = 'overview' | 'all' | 'premium' | 'admins' | 'transactions' | 'promocodes' | 'broadcast' | 'top_users';

const AdminView: React.FC<AdminViewProps> = ({ onBack }) => {
    const { user } = usePlayer();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [stats, setStats] = useState<UserStats | null>(null);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
    const [premiumUsers, setPremiumUsers] = useState<UserListItem[]>([]);
    const [adminUsers, setAdminUsers] = useState<UserListItem[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [topUsers, setTopUsers] = useState<TopUser[]>([]);
    const [activityStats, setActivityStats] = useState<ActivityStat[]>([]);
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [newPromo, setNewPromo] = useState({
        code: '',
        discount_type: 'percent',
        value: 0,
        max_uses: 0,
        tribute_link_month: '',
        tribute_link_year: ''
    });
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        if (activeTab === 'all' && allUsers.length === 0) {
            loadAllUsers();
        } else if (activeTab === 'premium' && premiumUsers.length === 0) {
            loadPremiumUsers();
        } else if (activeTab === 'admins' && adminUsers.length === 0) {
        } else if (activeTab === 'admins' && adminUsers.length === 0) {
            loadAdminUsers();
        } else if (activeTab === 'transactions' && transactions.length === 0) {
            loadTransactions();
        } else if (activeTab === 'promocodes' && promoCodes.length === 0) {
            loadPromoCodes();
        } else if (activeTab === 'top_users' && topUsers.length === 0) {
            loadTopUsers();
        } else if (activeTab === 'overview') {
            loadActivityStats();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

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

    const loadAllUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users?user_id=${user?.id}&filter_type=all`);
            if (response.ok) {
                const data = await response.json();
                setAllUsers(data.users);
            }
        } catch (error) {
            console.error('Failed to load all users:', error);
        }
    };

    const loadPremiumUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users?user_id=${user?.id}&filter_type=premium`);
            if (response.ok) {
                const data = await response.json();
                setPremiumUsers(data.users);
            }
        } catch (error) {
            console.error('Failed to load premium users:', error);
        }
    };

    const loadAdminUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/users?user_id=${user?.id}&filter_type=admin`);
            if (response.ok) {
                const data = await response.json();
                setAdminUsers(data.users);
            }
        } catch (error) {
            console.error('Failed to load admin users:', error);
        }
    };

    const loadTransactions = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/transactions?user_id=${user?.id}`);
            if (response.ok) {
                const data = await response.json();
                setTransactions(data.transactions);
            }
        } catch (error) {
            console.error('Failed to load transactions:', error);
        }
    };

    const loadPromoCodes = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/promocodes?user_id=${user?.id}`);
            if (response.ok) {
                const data = await response.json();
                setPromoCodes(data);
            }
        } catch (error) {
            console.error('Failed to load promo codes:', error);
        }
    };

    const loadTopUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/top-users?user_id=${user?.id}`);
            if (response.ok) {
                const data = await response.json();
                setTopUsers(data);
            }
        } catch (error) {
            console.error('Failed to load top users:', error);
        }
    };

    const loadActivityStats = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/activity-stats?user_id=${user?.id}`);
            if (response.ok) {
                const data = await response.json();
                setActivityStats(data);
            }
        } catch (error) {
            console.error('Failed to load activity stats:', error);
        }
    };

    const handleBroadcast = async () => {
        if (!broadcastMessage.trim() || !confirm('Отправить сообщение всем пользователям?')) return;
        setIsBroadcasting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/broadcast?user_id=${user?.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: broadcastMessage })
            });
            if (response.ok) {
                const data = await response.json();
                setMessage({ type: 'success', text: data.message });
                setBroadcastMessage('');
            } else {
                setMessage({ type: 'error', text: 'Ошибка рассылки' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }
        setIsBroadcasting(false);
        setTimeout(() => setMessage(null), 3000);
    };

    const generatePromoCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'PROMO-';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setNewPromo({ ...newPromo, code: result });
    };

    const handleCreatePromo = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/promocodes?user_id=${user?.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPromo)
            });
            if (response.ok) {
                setMessage({ type: 'success', text: 'Промокод создан' });
                setNewPromo({
                    code: '',
                    discount_type: 'percent',
                    value: 0,
                    max_uses: 0,
                    tribute_link_month: '',
                    tribute_link_year: ''
                });
                loadPromoCodes();
            } else {
                const error = await response.json();
                setMessage({ type: 'error', text: error.detail || 'Ошибка создания' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }
        setTimeout(() => setMessage(null), 3000);
    };

    const handleDeletePromo = async (id: number) => {
        if (!confirm('Удалить промокод?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/promocodes/${id}?user_id=${user?.id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setMessage({ type: 'success', text: 'Промокод удален' });
                loadPromoCodes();
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка удаления' });
        }
        setTimeout(() => setMessage(null), 3000);
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
                loadStats();
            } else {
                const errorData = await response.json();
                setMessage({ type: 'error', text: errorData.detail || 'Ошибка при обновлении прав' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }

        setTimeout(() => setMessage(null), 3000);
    };

    const handleRemoveRight = async (userId: number, rightType: 'admin' | 'premium') => {
        if (!user) return;

        try {
            const body: any = { user_id: userId };
            if (rightType === 'admin') body.is_admin = false;
            if (rightType === 'premium') body.is_premium = false;

            const response = await fetch(`${API_BASE_URL}/api/admin/grant?admin_id=${user.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                setMessage({ type: 'success', text: `Права успешно отозваны` });
                // Refresh lists
                if (rightType === 'premium') {
                    loadPremiumUsers();
                } else {
                    loadAdminUsers();
                }
                loadStats();
            } else {
                const errorData = await response.json();
                setMessage({ type: 'error', text: errorData.detail || 'Ошибка при удалении прав' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }

        setTimeout(() => setMessage(null), 3000);
    };

    const handleBlockUser = async (userId: number, isBlocked: boolean) => {
        if (!user) return;

        try {
            const body = { user_id: userId, is_blocked: isBlocked };

            const response = await fetch(`${API_BASE_URL}/api/admin/grant?admin_id=${user.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                setMessage({ type: 'success', text: `Пользователь ${isBlocked ? 'заблокирован' : 'разблокирован'}` });
                loadAllUsers();
                loadStats();
            } else {
                const errorData = await response.json();
                setMessage({ type: 'error', text: errorData.detail || 'Ошибка при изменении статуса' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Ошибка сети' });
        }

        setTimeout(() => setMessage(null), 3000);
    };

    const getUserDisplayName = (user: UserListItem) => {
        if (user.first_name || user.last_name) {
            return `${user.first_name || ''} ${user.last_name || ''}`.trim();
        }
        return user.username || `User ${user.id}`;
    };

    if (!user?.is_admin) return null;

    return (
        <div className="px-4 py-8 space-y-8 animate-fade-in pb-24">
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
                        <Shield className="text-blue-500 drop-shadow-md" />
                        Админ-панель
                    </h1>
                </div>
                <button
                    onClick={loadData}
                    className="p-3 rounded-full glass-button text-white/80 hover:text-white transition-colors"
                >
                    <RefreshCw size={20} className={`${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tabs - Responsive Scroll */}
            <div className="flex overflow-x-auto pb-2 gap-2 mb-6 scrollbar-hide">
                <button onClick={() => setActiveTab('overview')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'overview' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Обзор</button>
                <button onClick={() => setActiveTab('all')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'all' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Все юзеры</button>
                <button onClick={() => setActiveTab('premium')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'premium' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg shadow-orange-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Premium</button>
                <button onClick={() => setActiveTab('admins')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'admins' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Админы</button>
                <button onClick={() => setActiveTab('transactions')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'transactions' ? 'bg-green-600 text-white shadow-lg shadow-green-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Транзакции</button>
                <button onClick={() => setActiveTab('promocodes')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'promocodes' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Промокоды</button>
                <button onClick={() => setActiveTab('top_users')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'top_users' ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Топ</button>
                <button onClick={() => setActiveTab('broadcast')} className={`whitespace-nowrap py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'broadcast' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>Рассылка</button>
            </div>

            {/* Overview Tab */}
            {
                activeTab === 'overview' && (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                            <div className="glass-panel p-5 rounded-2xl">
                                <div className="flex items-center gap-2 text-white/60 mb-2">
                                    <Users size={16} />
                                    <span className="text-xs font-bold uppercase tracking-wider">Всего</span>
                                </div>
                                <div className="text-3xl font-bold text-white text-glow">
                                    {isLoading ? '...' : stats?.total_users}
                                </div>
                            </div>
                            <div className="glass-panel p-5 rounded-2xl">
                                <div className="flex items-center gap-2 text-yellow-400 mb-2">
                                    <Star size={16} />
                                    <span className="text-xs font-bold uppercase tracking-wider">Premium</span>
                                </div>
                                <div className="text-3xl font-bold text-white text-glow">
                                    {isLoading ? '...' : stats?.premium_users}
                                </div>
                            </div>
                            <div className="glass-panel p-5 rounded-2xl">
                                <div className="flex items-center gap-2 text-blue-400 mb-2">
                                    <Shield size={16} />
                                    <span className="text-xs font-bold uppercase tracking-wider">Админы</span>
                                </div>
                                <div className="text-3xl font-bold text-white text-glow">
                                    {isLoading ? '...' : stats?.admin_users}
                                </div>
                            </div>
                            <div className="glass-panel p-5 rounded-2xl">
                                <div className="flex items-center gap-2 text-green-400 mb-2">
                                    <Activity size={16} />
                                    <span className="text-xs font-bold uppercase tracking-wider">Новые</span>
                                </div>
                                <div className="text-3xl font-bold text-white text-glow">
                                    {isLoading ? '...' : stats?.new_users_today}
                                </div>
                            </div>
                            <div className="glass-panel p-5 rounded-2xl">
                                <div className="flex items-center gap-2 text-blue-400 mb-2">
                                    <Zap size={16} />
                                    <span className="text-xs font-bold uppercase tracking-wider">TON Revenue</span>
                                </div>
                                <div className="text-3xl font-bold text-white text-glow">
                                    {isLoading ? '...' : stats?.total_revenue_ton.toFixed(2)}
                                </div>
                            </div>
                            <div className="glass-panel p-5 rounded-2xl">
                                <div className="flex items-center gap-2 text-green-400 mb-2">
                                    <Zap size={16} />
                                    <span className="text-xs font-bold uppercase tracking-wider">RUB Revenue</span>
                                </div>
                                <div className="text-3xl font-bold text-white text-glow">
                                    {isLoading ? '...' : stats?.total_revenue_rub.toFixed(0)} ₽
                                </div>
                            </div>
                        </div>

                        {/* Activity Graph */}
                        <div className="glass-panel p-6 rounded-2xl mb-8">
                            <h3 className="text-lg font-bold text-white mb-4">Активность (новые пользователи)</h3>
                            <div className="h-40 flex items-end gap-2">
                                {activityStats.map((stat, idx) => {
                                    const max = Math.max(...activityStats.map(s => s.count));
                                    const height = max > 0 ? (stat.count / max) * 100 : 0;
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                                            <div
                                                className="w-full bg-blue-500/50 rounded-t-lg transition-all group-hover:bg-blue-400"
                                                style={{ height: `${height}%`, minHeight: '4px' }}
                                            />
                                            <span className="text-[10px] text-white/40 rotate-45 origin-left mt-2 whitespace-nowrap">
                                                {new Date(stat.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Cache Stats */}
                        <div className="glass-panel p-6 rounded-3xl mb-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Database size={20} className="text-purple-400" />
                                    Кэширование
                                </h3>
                                <button
                                    onClick={handleResetCache}
                                    className="px-4 py-2 bg-red-500/10 text-red-400 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-2 border border-red-500/20"
                                >
                                    <Trash2 size={14} />
                                    СБРОСИТЬ
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="bg-black/30 p-4 rounded-2xl">
                                    <div className="text-xs text-white/50 mb-1 font-medium">Записей</div>
                                    <div className="text-xl font-bold text-white">{cacheStats?.total_entries || 0}</div>
                                </div>
                                <div className="bg-black/30 p-4 rounded-2xl">
                                    <div className="text-xs text-white/50 mb-1 font-medium">Hit Ratio</div>
                                    <div className="text-xl font-bold text-green-400">
                                        {((cacheStats?.hit_ratio || 0) * 100).toFixed(1)}%
                                    </div>
                                </div>
                                <div className="bg-black/30 p-4 rounded-2xl">
                                    <div className="text-xs text-white/50 mb-1 font-medium">Hits</div>
                                    <div className="text-xl font-bold text-blue-400">{cacheStats?.cache_hits || 0}</div>
                                </div>
                                <div className="bg-black/30 p-4 rounded-2xl">
                                    <div className="text-xs text-white/50 mb-1 font-medium">Misses</div>
                                    <div className="text-xl font-bold text-orange-400">{cacheStats?.cache_misses || 0}</div>
                                </div>
                            </div>

                            <div className="text-xs text-white/40 font-mono text-center">
                                TTL: {cacheStats?.ttl_seconds}s
                            </div>
                        </div>

                        {/* Management Form */}
                        <div className="glass-panel p-6 rounded-3xl">
                            <h3 className="text-lg font-bold text-white mb-6">Управление правами</h3>

                            <form onSubmit={handleGrant} className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">Telegram ID</label>
                                    <input
                                        type="text"
                                        value={targetId}
                                        onChange={(e) => setTargetId(e.target.value.replace(/\D/g, ''))}
                                        placeholder="123456789"
                                        className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-white/20"
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setGrantType('premium')}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${grantType === 'premium'
                                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        Premium
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setGrantType('admin')}
                                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${grantType === 'admin'
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        Admin
                                    </button>
                                </div>

                                {/* Premium Pro Toggle */}
                                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                                                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                                                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                                                <path d="M4 22h16"></path>
                                                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                                                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                                                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                                            </svg>
                                            <span className="text-sm font-bold text-purple-300">Premium Pro</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (targetId) {
                                                    const body = { user_id: parseInt(targetId), is_premium_pro: !user?.is_premium_pro };
                                                    fetch(`${API_BASE_URL}/api/admin/grant?admin_id=${user?.id}`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(body)
                                                    }).then(res => {
                                                        if (res.ok) {
                                                            setMessage({ type: 'success', text: 'Premium Pro обновлен' });
                                                            setTimeout(() => setMessage(null), 3000);
                                                        }
                                                    });
                                                }
                                            }}
                                            disabled={!targetId}
                                            className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-purple-300 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Переключить
                                        </button>
                                    </div>
                                    <p className="text-xs text-purple-400/60 mt-2">
                                        Эксклюзивный уровень - треки можно пересылать
                                    </p>
                                </div>

                                <div className="flex items-center justify-between bg-black/30 p-4 rounded-xl border border-white/5">
                                    <span className="text-sm font-medium text-white/80">Статус</span>
                                    <button
                                        type="button"
                                        onClick={() => setGrantValue(!grantValue)}
                                        className={`relative w-14 h-8 rounded-full transition-all duration-300 ${grantValue ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-gray-700'
                                            }`}
                                    >
                                        <div
                                            className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-300 shadow-sm ${grantValue ? 'translate-x-6' : 'translate-x-0'
                                                }`}
                                        />
                                    </button>
                                </div>

                                {/* Trial Period Controls */}
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <polyline points="12 6 12 12 16 14"></polyline>
                                        </svg>
                                        Пробный период
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (targetId) {
                                                    const body = { user_id: parseInt(targetId), trial_days: 3 };
                                                    fetch(`${API_BASE_URL}/api/admin/grant?admin_id=${user?.id}`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(body)
                                                    }).then(res => {
                                                        if (res.ok) {
                                                            setMessage({ type: 'success', text: 'Триал на 3 дня выдан' });
                                                            setTimeout(() => setMessage(null), 3000);
                                                        }
                                                    });
                                                }
                                            }}
                                            disabled={!targetId}
                                            className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-blue-400 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            +3 дня
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (targetId) {
                                                    const body = { user_id: parseInt(targetId), trial_days: 7 };
                                                    fetch(`${API_BASE_URL}/api/admin/grant?admin_id=${user?.id}`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(body)
                                                    }).then(res => {
                                                        if (res.ok) {
                                                            setMessage({ type: 'success', text: 'Триал на 7 дней выдан' });
                                                            setTimeout(() => setMessage(null), 3000);
                                                        }
                                                    });
                                                }
                                            }}
                                            disabled={!targetId}
                                            className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-blue-400 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            +7 дней
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (targetId) {
                                                    const body = { user_id: parseInt(targetId), trial_days: 0 };
                                                    fetch(`${API_BASE_URL}/api/admin/grant?admin_id=${user?.id}`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(body)
                                                    }).then(res => {
                                                        if (res.ok) {
                                                            setMessage({ type: 'success', text: 'Триал отменен' });
                                                            setTimeout(() => setMessage(null), 3000);
                                                        }
                                                    });
                                                }
                                            }}
                                            disabled={!targetId}
                                            className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Отменить
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={!targetId}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                                >
                                    <Check size={20} />
                                    ПРИМЕНИТЬ
                                </button>
                            </form>

                            {message && (
                                <div
                                    className={`mt-6 p-4 rounded-xl flex items-center gap-3 text-sm font-medium animate-fade-in ${message.type === 'success'
                                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        }`}
                                >
                                    {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                                    {message.text}
                                </div>
                            )}
                        </div>
                    </>
                )
            }

            {/* All Users Tab */}
            {activeTab === 'all' && (
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Users className="text-blue-500" />
                        Все пользователи ({allUsers.length})
                    </h3>

                    {
                        allUsers.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                Нет пользователей
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {allUsers.map((u) => (
                                    <div
                                        key={u.id}
                                        className={`bg-black/20 p-4 rounded-xl flex items-center justify-between ${u.is_blocked ? 'border border-red-500/30' : ''}`}
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="text-white font-medium">{getUserDisplayName(u)}</div>
                                                {u.id === SUPER_ADMIN_ID && (
                                                    <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                                        <Crown size={12} />
                                                        SUPER ADMIN
                                                    </span>
                                                )}
                                                {u.is_admin && u.id !== SUPER_ADMIN_ID && (
                                                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-full flex items-center gap-1">
                                                        <Shield size={12} />
                                                        Admin
                                                    </span>
                                                )}
                                                {u.is_premium && (
                                                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded-full flex items-center gap-1">
                                                        <Star size={12} />
                                                        Premium
                                                    </span>
                                                )}
                                                {u.is_blocked && (
                                                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded-full flex items-center gap-1">
                                                        <Ban size={12} />
                                                        Заблокирован
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-400 mt-1">
                                                ID: {u.id}
                                                {u.username && ` • @${u.username}`}
                                            </div>
                                        </div>

                                        {u.id !== SUPER_ADMIN_ID && (
                                            <button
                                                onClick={() => handleBlockUser(u.id, !u.is_blocked)}
                                                className={`p-2 rounded-lg transition-colors ${u.is_blocked
                                                    ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                                                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                                    }`}
                                                title={u.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                                            >
                                                {u.is_blocked ? <CheckCircle size={18} /> : <Ban size={18} />}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    }

                    {
                        message && (
                            <div
                                className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm ${message.type === 'success'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                                    }`}
                            >
                                {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                                {message.text}
                            </div>
                        )
                    }
                </div >
            )}

            {/* Premium Users Tab */}
            {
                activeTab === 'premium' && (
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Star className="text-yellow-500" />
                            Premium пользователи ({premiumUsers.length})
                        </h3>

                        {premiumUsers.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                Нет пользователей с премиумом
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {premiumUsers.map((u) => (
                                    <div
                                        key={u.id}
                                        className="bg-black/20 p-4 rounded-xl flex items-center justify-between"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <div className="text-white font-medium">{getUserDisplayName(u)}</div>
                                                {u.id === SUPER_ADMIN_ID && (
                                                    <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                                        <Crown size={12} />
                                                        SUPER ADMIN
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-400">
                                                ID: {u.id}
                                                {u.username && ` • @${u.username}`}
                                            </div>
                                        </div>

                                        {u.id !== SUPER_ADMIN_ID && (
                                            <button
                                                onClick={() => handleRemoveRight(u.id, 'premium')}
                                                className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                                                title="Удалить премиум"
                                            >
                                                <UserX size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {message && (
                            <div
                                className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm ${message.type === 'success'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                                    }`}
                            >
                                {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                                {message.text}
                            </div>
                        )}
                    </div>
                )
            }

            {/* Admin Users Tab */}
            {
                activeTab === 'admins' && (
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Shield className="text-blue-500" />
                            Администраторы ({adminUsers.length})
                        </h3>

                        {adminUsers.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">Нет администраторов</div>
                        ) : (
                            <div className="space-y-3">
                                {adminUsers.map((u) => (
                                    <div
                                        key={u.id}
                                        className="bg-black/20 p-4 rounded-xl flex items-center justify-between"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <div className="text-white font-medium">{getUserDisplayName(u)}</div>
                                                {u.id === SUPER_ADMIN_ID && (
                                                    <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                                                        <Crown size={12} />
                                                        SUPER ADMIN
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-400">
                                                ID: {u.id}
                                                {u.username && ` • @${u.username}`}
                                            </div>
                                        </div>

                                        {u.id !== SUPER_ADMIN_ID && (
                                            <button
                                                onClick={() => handleRemoveRight(u.id, 'admin')}
                                                className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                                                title="Удалить права админа"
                                            >
                                                <UserX size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {message && (
                            <div
                                className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm ${message.type === 'success'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                                    }`}
                            >
                                {message.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                                {message.text}
                            </div>
                        )}
                    </div>
                )
            }

            {/* Transactions Tab */}
            {activeTab === 'transactions' && (
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Zap className="text-green-400" />
                        История транзакций
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-xs text-white/40 border-b border-white/10">
                                    <th className="p-3">ID</th>
                                    <th className="p-3">User</th>
                                    <th className="p-3">Plan</th>
                                    <th className="p-3">Amount</th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {transactions.map((tx) => (
                                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="p-3 text-white/60 font-mono text-xs">{tx.id.substring(0, 8)}...</td>
                                        <td className="p-3 text-white">{tx.user_id}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${tx.plan === 'year' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
                                                }`}>
                                                {tx.plan === 'year' ? 'YEAR' : 'MONTH'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-white font-bold">
                                            {tx.amount} {tx.currency}
                                        </td>
                                        <td className="p-3 text-white/60 text-xs">
                                            {new Date(tx.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${tx.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                                }`}>
                                                {tx.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {transactions.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-400">
                                            Нет транзакций
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Promo Codes Tab */}
            {activeTab === 'promocodes' && (
                <div className="space-y-6">
                    {/* Create Form */}
                    <div className="glass-panel p-6 rounded-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-white">Создать промокод</h3>
                            <button
                                onClick={generatePromoCode}
                                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white transition-colors"
                            >
                                🎲 Сгенерировать
                            </button>
                        </div>
                        <form onSubmit={handleCreatePromo} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-white/60 mb-2">Код</label>
                                <input
                                    type="text"
                                    value={newPromo.code}
                                    onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                                    placeholder="SUMMER2025"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-white/60 mb-2">Тип скидки</label>
                                    <select
                                        value={newPromo.discount_type}
                                        onChange={(e) => setNewPromo({ ...newPromo, discount_type: e.target.value })}
                                        className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                                    >
                                        <option value="percent">Процент (%)</option>
                                        <option value="fixed">Фиксированная (RUB)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-white/60 mb-2">Значение</label>
                                    <input
                                        type="number"
                                        value={newPromo.value}
                                        onChange={(e) => setNewPromo({ ...newPromo, value: parseInt(e.target.value) })}
                                        className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-white/60 mb-2">Лимит использований (0 = безлимит)</label>
                                <input
                                    type="number"
                                    value={newPromo.max_uses}
                                    onChange={(e) => setNewPromo({ ...newPromo, max_uses: parseInt(e.target.value) })}
                                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-white/60 mb-2">Ссылка (Месяц)</label>
                                    <input
                                        type="text"
                                        value={newPromo.tribute_link_month}
                                        onChange={(e) => setNewPromo({ ...newPromo, tribute_link_month: e.target.value })}
                                        className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        placeholder="https://tribute.tg/..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-white/60 mb-2">Ссылка (Год)</label>
                                    <input
                                        type="text"
                                        value={newPromo.tribute_link_year}
                                        onChange={(e) => setNewPromo({ ...newPromo, tribute_link_year: e.target.value })}
                                        className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500 transition-colors"
                                        placeholder="https://tribute.tg/..."
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
                            >
                                <Plus size={20} />
                                Создать промокод
                            </button>
                        </form>
                    </div>

                    {/* Promo Codes List */}
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-4">Активные промокоды</h3>
                        <div className="space-y-3">
                            {promoCodes.map((promo) => (
                                <div key={promo.id} className="bg-black/20 p-4 rounded-xl flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-bold text-lg tracking-wider">{promo.code}</span>
                                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs font-bold rounded">
                                                -{promo.value}{promo.discount_type === 'percent' ? '%' : '₽'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-white/40 mt-1">
                                            Использовано: {promo.used_count} / {promo.max_uses > 0 ? promo.max_uses : '∞'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeletePromo(promo.id)}
                                        className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                            {promoCodes.length === 0 && (
                                <div className="text-center py-8 text-gray-400">Нет активных промокодов</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Top Users Tab */}
            {activeTab === 'top_users' && (
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Crown className="text-yellow-400" />
                        Топ скачиваний
                    </h3>
                    <div className="space-y-3">
                        {topUsers.map((u, idx) => (
                            <div key={u.id} className="bg-black/20 p-4 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${idx === 0 ? 'bg-yellow-500 text-black' :
                                        idx === 1 ? 'bg-gray-400 text-black' :
                                            idx === 2 ? 'bg-orange-700 text-white' : 'bg-white/10 text-white'
                                        }`}>
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <div className="text-white font-bold flex items-center gap-2">
                                            {u.first_name} {u.last_name}
                                            {u.is_premium && <Star size={12} className="text-yellow-400 fill-yellow-400" />}
                                        </div>
                                        <div className="text-xs text-white/40">
                                            @{u.username || 'no_username'} • ID: {u.id}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-blue-400 font-bold">
                                    {u.download_count} 📥
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Broadcast Tab */}
            {activeTab === 'broadcast' && (
                <div className="glass-panel p-6 rounded-2xl">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Zap className="text-indigo-400" />
                        Рассылка сообщений
                    </h3>
                    <div className="space-y-4">
                        <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl text-yellow-200 text-sm">
                            ⚠️ Сообщение будет отправлено всем пользователям бота. Это может занять время.
                            Поддерживается HTML разметка.
                        </div>
                        <textarea
                            value={broadcastMessage}
                            onChange={(e) => setBroadcastMessage(e.target.value)}
                            placeholder="Введите текст сообщения..."
                            className="w-full h-40 bg-black/30 border border-white/10 rounded-xl p-4 text-white placeholder-white/30 resize-none focus:outline-none focus:border-indigo-500"
                        />
                        <button
                            onClick={handleBroadcast}
                            disabled={isBroadcasting || !broadcastMessage.trim()}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isBroadcasting ? <Loader className="animate-spin" /> : 'Отправить всем'}
                        </button>
                    </div>
                </div>
            )}
        </div >
    );
};

export default AdminView;
