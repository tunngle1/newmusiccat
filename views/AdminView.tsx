import React, { useState, useEffect } from 'react';
import { Shield, Users, Star, Activity, ArrowLeft, Database, RefreshCw, Trash2, Crown, Ban, Zap, Plus, Loader, CheckCircle } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { API_BASE_URL } from '../constants';
import { UserStats, UserListItem, Transaction, PromoCode, TopUser, ActivityStat, CacheStats } from '../types';

interface AdminViewProps {
    onBack: () => void;
}

type TabType = 'overview' | 'all' | 'premium' | 'admins' | 'transactions' | 'promocodes' | 'broadcast' | 'top_users';

const SUPER_ADMIN_ID = 414153884;

const AdminView: React.FC<AdminViewProps> = ({ onBack }) => {
    const { user } = usePlayer();
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    // Data state
    const [stats, setStats] = useState<UserStats>({
        total_users: 0,
        premium_users: 0,
        admin_users: 0,
        new_users_today: 0,
        total_revenue_ton: 0,
        total_revenue_stars: 0,
        total_revenue_rub: 0
    });
    const [cacheStats, setCacheStats] = useState<CacheStats>({
        total_entries: 0,
        cache_hits: 0,
        cache_misses: 0,
        hit_ratio: 0,
        ttl_seconds: 0,
        sample_keys: []
    });
    const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
    const [premiumUsers, setPremiumUsers] = useState<UserListItem[]>([]);
    const [adminUsers, setAdminUsers] = useState<UserListItem[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [topUsers, setTopUsers] = useState<TopUser[]>([]);
    const [activityStats, setActivityStats] = useState<ActivityStat[]>([]);

    // UI state
    const [isLoading, setIsLoading] = useState(true);
    const [targetId, setTargetId] = useState('');
    const [grantType, setGrantType] = useState<'admin' | 'premium'>('premium');
    const [grantValue, setGrantValue] = useState(true);
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [newPromo, setNewPromo] = useState({
        code: '',
        discount_type: 'percent',
        value: 0,
        max_uses: 0,
        tribute_link_month: '',
        tribute_link_year: ''
    });

    useEffect(() => {
        if (!user?.is_admin) {
            onBack();
            return;
        }
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        if (activeTab === 'all' && allUsers.length === 0) loadAllUsers();
        else if (activeTab === 'premium' && premiumUsers.length === 0) loadPremiumUsers();
        else if (activeTab === 'admins' && adminUsers.length === 0) loadAdminUsers();
        else if (activeTab === 'transactions' && transactions.length === 0) loadTransactions();
        else if (activeTab === 'promocodes' && promoCodes.length === 0) loadPromoCodes();
        else if (activeTab === 'top_users' && topUsers.length === 0) loadTopUsers();
        else if (activeTab === 'overview') loadActivityStats();
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
            if (response.ok) setStats(await response.json());
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    };

    const loadCacheStats = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/cache/stats?user_id=${user?.id}`);
            if (response.ok) setCacheStats(await response.json());
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
            if (response.ok) setPromoCodes(await response.json());
        } catch (error) {
            console.error('Failed to load promo codes:', error);
        }
    };

    const loadTopUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/top-users?user_id=${user?.id}`);
            if (response.ok) setTopUsers(await response.json());
        } catch (error) {
            console.error('Failed to load top users:', error);
        }
    };

    const loadActivityStats = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/activity-stats?user_id=${user?.id}`);
            if (response.ok) setActivityStats(await response.json());
        } catch (error) {
            console.error('Failed to load activity stats:', error);
        }
    };

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
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
                showMessage('success', data.message);
                setBroadcastMessage('');
            } else {
                showMessage('error', 'Ошибка рассылки');
            }
        } catch (error) {
            showMessage('error', 'Ошибка сети');
        }
        setIsBroadcasting(false);
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
                showMessage('success', 'Промокод создан');
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
                showMessage('error', error.detail || 'Ошибка создания');
            }
        } catch (error) {
            showMessage('error', 'Ошибка сети');
        }
    };

    const handleDeletePromo = async (id: number) => {
        if (!confirm('Удалить промокод?')) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/promocodes/${id}?user_id=${user?.id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showMessage('success', 'Промокод удален');
                loadPromoCodes();
            }
        } catch (error) {
            showMessage('error', 'Ошибка удаления');
        }
    };

    const handleResetCache = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/cache/reset?admin_id=${user?.id}`, {
                method: 'POST'
            });
            if (response.ok) {
                showMessage('success', 'Кэш успешно очищен');
                loadCacheStats();
            } else {
                showMessage('error', 'Ошибка при очистке кэша');
            }
        } catch (error) {
            showMessage('error', 'Ошибка сети');
        }
    };

    const handleGrant = async () => {
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
                showMessage('success', `Права успешно обновлены для ID ${targetId}`);
                setTargetId('');
                loadStats();
                // Reload relevant lists
                if (activeTab === 'all') loadAllUsers();
                if (activeTab === 'premium') loadPremiumUsers();
                if (activeTab === 'admins') loadAdminUsers();
            } else {
                const errorData = await response.json();
                showMessage('error', errorData.detail || 'Ошибка при обновлении прав');
            }
        } catch (error) {
            showMessage('error', 'Ошибка сети');
        }
    };

    const handleRemoveRight = async (userId: number, rightType: 'admin' | 'premium') => {
        if (!user) return;
        if (!confirm('Вы уверены?')) return;

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
                showMessage('success', `Права успешно отозваны`);
                if (rightType === 'premium') loadPremiumUsers();
                else loadAdminUsers();
                loadStats();
            } else {
                const errorData = await response.json();
                showMessage('error', errorData.detail || 'Ошибка при удалении прав');
            }
        } catch (error) {
            showMessage('error', 'Ошибка сети');
        }
    };

    const renderOverview = () => (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-black border-2 border-white p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-5 h-5 text-red-500" />
                        <div className="text-xs text-gray-400 uppercase">Всего пользователей</div>
                    </div>
                    <div className="text-3xl font-black">{stats.total_users.toLocaleString()}</div>
                </div>

                <div className="bg-black border-2 border-white p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Star className="w-5 h-5 text-red-500" />
                        <div className="text-xs text-gray-400 uppercase">Premium</div>
                    </div>
                    <div className="text-3xl font-black text-red-500">{stats.premium_users.toLocaleString()}</div>
                </div>

                <div className="bg-black border-2 border-white p-4 col-span-2">
                    <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-5 h-5 text-red-500" />
                        <div className="text-xs text-gray-400 uppercase">Выручка</div>
                    </div>
                    <div className="flex justify-between items-end">
                        <div className="text-xl font-black">
                            {stats.total_revenue_ton.toFixed(1)} TON / {stats.total_revenue_stars.toLocaleString()} ★
                        </div>
                        <div className="text-xs text-green-500 font-bold">{stats.total_revenue_rub.toLocaleString()} ₽</div>
                    </div>
                </div>
            </div>

            {/* Activity Chart */}
            <div className="bg-black border-2 border-white p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-red-500" />
                    <div className="text-sm font-bold uppercase">Активность за 7 дней</div>
                </div>
                <div className="flex items-end justify-between gap-1 h-32">
                    {activityStats.map((stat, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                                className="w-full bg-red-500 transition-all hover:bg-red-400"
                                style={{ height: `${(stat.count / 200) * 100}%` }}
                                title={`${stat.date}: ${stat.count}`}
                            />
                            <div className="text-[8px] text-gray-500">{stat.date.slice(5)}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Cache Stats */}
            <div className="bg-black border-2 border-white p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-red-500" />
                        <div className="text-sm font-bold uppercase">Кэш</div>
                    </div>
                    <button
                        onClick={handleResetCache}
                        className="px-3 py-1 bg-red-500 text-white text-xs font-bold uppercase hover:bg-red-600 transition-colors flex items-center gap-1"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Сбросить
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                        <div className="text-gray-400">Записей</div>
                        <div className="font-bold">{cacheStats.total_entries}</div>
                    </div>
                    <div>
                        <div className="text-gray-400">Попадания</div>
                        <div className="font-bold text-green-500">{cacheStats.cache_hits}</div>
                    </div>
                    <div>
                        <div className="text-gray-400">Промахи</div>
                        <div className="font-bold text-red-500">{cacheStats.cache_misses}</div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderUserList = (users: UserListItem[], title: string) => (
        <div className="space-y-2">
            <div className="text-sm font-bold uppercase text-gray-400 mb-4">{title} ({users.length})</div>
            {users.map(u => (
                <div key={u.id} className={`bg-black border ${u.is_blocked ? 'border-red-900 opacity-50' : 'border-white/20'} p-4 flex justify-between items-center hover:border-white transition-colors`}>
                    <div>
                        <div className="font-bold text-sm flex items-center gap-2">
                            @{u.username || u.id}
                            {u.id === SUPER_ADMIN_ID && <Crown className="w-4 h-4 text-yellow-500" />}
                            {u.is_admin && u.id !== SUPER_ADMIN_ID && <Shield className="w-4 h-4 text-red-500" />}
                        </div>
                        <div className="text-[10px] text-gray-400 uppercase font-mono">
                            {u.is_premium ? 'PREMIUM' : 'FREE'} • ID: {u.id}
                        </div>
                    </div>
                    {u.id !== SUPER_ADMIN_ID && (
                        <div className="flex gap-2">
                            {u.is_premium && (
                                <button
                                    onClick={() => handleRemoveRight(u.id, 'premium')}
                                    className="px-3 py-1 border border-white text-[10px] font-bold hover:bg-white hover:text-black uppercase transition-colors"
                                >
                                    UNSUB
                                </button>
                            )}
                            <button className="px-3 py-1 border border-gray-600 text-gray-400 text-[10px] font-bold hover:bg-red-500 hover:text-white uppercase transition-colors">
                                {u.is_blocked ? 'UNBAN' : 'BAN'}
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderBroadcast = () => (
        <div className="space-y-4">
            <div className="bg-red-500/10 border-l-4 border-red-500 p-4 text-xs text-gray-300 font-mono">
                ВАШЕ СООБЩЕНИЕ БУДЕТ ОТПРАВЛЕНО ВСЕМ ПОЛЬЗОВАТЕЛЯМ БОТА ({stats.total_users})
            </div>
            <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="w-full h-40 bg-black border-2 border-white p-4 text-sm font-bold uppercase focus:border-red-500 outline-none resize-none placeholder-gray-600"
                placeholder="ВВЕДИТЕ ТЕКСТ РАССЫЛКИ..."
            />
            <button
                onClick={handleBroadcast}
                disabled={isBroadcasting}
                className="w-full bg-white text-black p-4 font-black uppercase hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
            >
                {isBroadcasting ? <Loader className="animate-spin mx-auto" /> : 'ОТПРАВИТЬ ВСЕМ'}
            </button>
        </div>
    );

    const renderGrantRights = () => (
        <div className="space-y-4 bg-black border-2 border-white p-6">
            <div className="text-lg font-black uppercase">Управление правами</div>
            <input
                type="number"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="ID пользователя"
                className="w-full bg-black border-2 border-white p-3 text-sm uppercase placeholder-gray-600 focus:border-red-500 outline-none font-bold"
            />
            <div className="flex gap-4">
                <select
                    value={grantType}
                    onChange={(e) => setGrantType(e.target.value as 'admin' | 'premium')}
                    className="flex-1 bg-black border-2 border-white p-3 text-sm uppercase focus:border-red-500 outline-none font-bold"
                >
                    <option value="premium">PREMIUM</option>
                    <option value="admin">ADMIN</option>
                </select>
                <select
                    value={grantValue ? 'true' : 'false'}
                    onChange={(e) => setGrantValue(e.target.value === 'true')}
                    className="flex-1 bg-black border-2 border-white p-3 text-sm uppercase focus:border-red-500 outline-none font-bold"
                >
                    <option value="true">ВЫДАТЬ</option>
                    <option value="false">ОТОЗВАТЬ</option>
                </select>
            </div>
            <button
                onClick={handleGrant}
                className="w-full bg-white text-black p-4 font-black uppercase hover:bg-red-500 hover:text-white transition-colors"
            >
                ПРИМЕНИТЬ
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black text-white flex flex-col max-w-[480px] mx-auto">
            {/* Header */}
            <div className="p-4 border-b-2 border-white flex items-center gap-4 bg-black z-10">
                <button onClick={onBack} className="flex items-center gap-2 hover:text-red-500 transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex-1 text-center text-xl font-black uppercase">АДМИН-ПАНЕЛЬ</div>
                <div className="w-6 h-6"></div>
            </div>

            {/* Message */}
            {message && (
                <div className={`p-4 text-center font-bold uppercase text-sm ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {message.text}
                </div>
            )}

            {/* Tabs */}
            <div className="flex overflow-x-auto overflow-y-hidden border-b-2 border-white bg-black scrollbar-hidden">
                {[
                    { id: 'overview', label: 'Обзор', icon: Activity },
                    { id: 'all', label: 'Все', icon: Users },
                    { id: 'premium', label: 'Premium', icon: Star },
                    { id: 'admins', label: 'Админы', icon: Shield },
                    { id: 'transactions', label: 'Платежи', icon: Zap },
                    { id: 'promocodes', label: 'Промо', icon: Plus },
                    { id: 'broadcast', label: 'Рассылка', icon: CheckCircle },
                    { id: 'top_users', label: 'Топ', icon: Crown }
                ].map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabType)}
                            className={`flex-shrink-0 py-3 px-3 text-[10px] font-bold uppercase border-b-2 transition-colors flex items-center justify-center gap-1 ${activeTab === tab.id ? 'text-white border-red-500 bg-red-500/10' : 'text-gray-400 border-transparent hover:text-white hover:border-white/30'
                                }`}
                        >
                            <Icon className="w-3 h-3" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-hidden">
                {isLoading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader className="w-8 h-8 animate-spin text-red-500" />
                    </div>
                ) : (
                    <>
                        {activeTab === 'overview' && renderOverview()}
                        {activeTab === 'all' && (
                            <>
                                {renderGrantRights()}
                                <div className="mt-6">{renderUserList(allUsers, 'Все пользователи')}</div>
                            </>
                        )}
                        {activeTab === 'premium' && renderUserList(premiumUsers, 'Premium пользователи')}
                        {activeTab === 'admins' && renderUserList(adminUsers, 'Администраторы')}
                        {activeTab === 'broadcast' && renderBroadcast()}
                        {activeTab === 'transactions' && (
                            <div className="space-y-2">
                                {transactions.map(t => (
                                    <div key={t.id} className="bg-black border border-white/20 p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold">#{t.id} • User {t.user_id}</div>
                                            <div className={`text-xs font-bold uppercase ${t.status === 'completed' ? 'text-green-500' : 'text-yellow-500'}`}>
                                                {t.status}
                                            </div>
                                        </div>
                                        <div className="text-sm text-gray-400">
                                            {t.amount} {t.currency} • {t.plan}
                                        </div>
                                        <div className="text-xs text-gray-600 mt-1">{new Date(t.created_at).toLocaleString('ru')}</div>
                                    </div>
                                ))}
                                {transactions.length === 0 && <div className="text-center text-gray-500 py-8">Нет транзакций</div>}
                            </div>
                        )}
                        {activeTab === 'promocodes' && (
                            <div className="space-y-6">
                                <div className="bg-black border-2 border-white p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold uppercase">Создать промокод</h3>
                                        <button
                                            onClick={generatePromoCode}
                                            className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white transition-colors uppercase font-bold"
                                        >
                                            🎲 Сгенерировать
                                        </button>
                                    </div>
                                    <form onSubmit={handleCreatePromo} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Код</label>
                                            <input
                                                type="text"
                                                value={newPromo.code}
                                                onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                                                className="w-full bg-black border-2 border-white p-3 text-sm uppercase placeholder-gray-600 focus:border-red-500 outline-none font-bold"
                                                placeholder="SUMMER2025"
                                                required
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Тип скидки</label>
                                                <select
                                                    value={newPromo.discount_type}
                                                    onChange={(e) => setNewPromo({ ...newPromo, discount_type: e.target.value })}
                                                    className="w-full bg-black border-2 border-white p-3 text-sm uppercase focus:border-red-500 outline-none font-bold"
                                                >
                                                    <option value="percent">Процент (%)</option>
                                                    <option value="fixed">Фиксированная (RUB)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">Значение</label>
                                                <input
                                                    type="number"
                                                    value={newPromo.value}
                                                    onChange={(e) => setNewPromo({ ...newPromo, value: parseInt(e.target.value) })}
                                                    className="w-full bg-black border-2 border-white p-3 text-sm uppercase placeholder-gray-600 focus:border-red-500 outline-none font-bold"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            className="w-full bg-white text-black p-4 font-black uppercase hover:bg-red-500 hover:text-white transition-colors"
                                        >
                                            Создать промокод
                                        </button>
                                    </form>
                                </div>

                                <div className="space-y-2">
                                    {promoCodes.map(p => (
                                        <div key={p.id} className="bg-black border border-white/20 p-4 flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-lg">{p.code}</div>
                                                <div className="text-xs text-gray-400">
                                                    {p.value}% скидка • {p.used_count}/{p.max_uses} использований
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeletePromo(p.id)}
                                                className="p-2 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))}
                                    {promoCodes.length === 0 && <div className="text-center text-gray-500 py-8">Нет активных промокодов</div>}
                                </div>
                            </div>
                        )}
                        {activeTab === 'top_users' && (
                            <div className="space-y-2">
                                {topUsers.map((u, i) => (
                                    <div key={u.id} className="bg-black border border-white/20 p-4 flex items-center gap-4">
                                        <div className="text-3xl font-black text-gray-600">#{i + 1}</div>
                                        <div className="flex-1">
                                            <div className="font-bold flex items-center gap-2">
                                                @{u.username || u.id}
                                                {u.is_premium && <Star className="w-4 h-4 text-red-500" />}
                                            </div>
                                            <div className="text-xs text-gray-400">{u.download_count} скачиваний</div>
                                        </div>
                                    </div>
                                ))}
                                {topUsers.length === 0 && <div className="text-center text-gray-500 py-8">Нет данных</div>}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminView;
