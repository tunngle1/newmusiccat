import React, { useState, useEffect } from 'react';
import { Shield, Users, Star, Activity, Check, AlertCircle, ArrowLeft, Database, RefreshCw, Trash2, Crown, UserX, Ban, CheckCircle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { API_BASE_URL } from '../constants';

const SUPER_ADMIN_ID = 414153884;

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

type TabType = 'overview' | 'all' | 'premium' | 'admins';

const AdminView: React.FC<AdminViewProps> = ({ onBack }) => {
    const { user } = usePlayer();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [stats, setStats] = useState<UserStats | null>(null);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
    const [premiumUsers, setPremiumUsers] = useState<UserListItem[]>([]);
    const [adminUsers, setAdminUsers] = useState<UserListItem[]>([]);
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
            loadAdminUsers();
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

            {/* Tabs */}
            <div className="flex gap-2 glass p-1.5 rounded-2xl mb-8">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'overview'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                >
                    Обзор
                </button>
                <button
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'all'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                >
                    Все
                </button>
                <button
                    onClick={() => setActiveTab('premium')}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'premium'
                        ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                >
                    Premium
                </button>
                <button
                    onClick={() => setActiveTab('admins')}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'admins'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                >
                    Админы
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
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
            )}

            {/* All Users Tab */}
            {activeTab === 'all' && (
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Users className="text-blue-500" />
                        Все пользователи ({allUsers.length})
                    </h3>

                    {allUsers.length === 0 ? (
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
            )}

            {/* Premium Users Tab */}
            {activeTab === 'premium' && (
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
            )}

            {/* Admin Users Tab */}
            {activeTab === 'admins' && (
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
            )}
        </div>
    );
};

export default AdminView;
