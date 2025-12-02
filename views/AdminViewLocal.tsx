import React, { useState, useEffect } from 'react';
import { Shield, Users, Star, Activity, ArrowLeft, Database, RefreshCw, Trash2, Crown, UserX, Ban, CheckCircle, Zap, Plus } from 'lucide-react';

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

interface AdminViewLocalProps {
    onBack: () => void;
    currentUserId?: number;
}

type TabType = 'overview' | 'all' | 'premium' | 'admins' | 'transactions' | 'promocodes' | 'broadcast' | 'top_users';

// MOCK DATA
const MOCK_STATS: UserStats = {
    total_users: 15420,
    premium_users: 1847,
    admin_users: 3,
    new_users_today: 156,
    total_revenue_ton: 523.7,
    total_revenue_stars: 28500,
    total_revenue_rub: 185000
};

const MOCK_ACTIVITY: ActivityStat[] = [
    { date: '2025-11-26', count: 145 },
    { date: '2025-11-27', count: 167 },
    { date: '2025-11-28', count: 134 },
    { date: '2025-11-29', count: 189 },
    { date: '2025-11-30', count: 156 },
    { date: '2025-12-01', count: 178 },
    { date: '2025-12-02', count: 156 }
];

const MOCK_USERS: UserListItem[] = [
    { id: SUPER_ADMIN_ID, username: 'superadmin', first_name: 'Super', last_name: 'Admin', is_admin: true, is_premium: true, is_blocked: false },
    { id: 123456, username: 'user1', first_name: 'Иван', last_name: 'Иванов', is_admin: false, is_premium: true, is_blocked: false },
    { id: 234567, username: 'user2', first_name: 'Петр', last_name: 'Петров', is_admin: false, is_premium: true, is_blocked: false },
    { id: 345678, username: 'user3', first_name: 'Сергей', last_name: 'Сергеев', is_admin: true, is_premium: true, is_blocked: false },
    { id: 456789, username: 'user4', first_name: 'Алексей', last_name: 'Алексеев', is_admin: false, is_premium: false, is_blocked: false },
    { id: 567890, username: 'user5', first_name: 'Дмитрий', last_name: 'Дмитриев', is_admin: false, is_premium: false, is_blocked: true },
];

const MOCK_TRANSACTIONS: Transaction[] = [
    { id: 1, user_id: 123456, amount: '5.0', currency: 'TON', plan: 'month', status: 'completed', created_at: '2025-12-01T10:30:00' },
    { id: 2, user_id: 234567, amount: '50.0', currency: 'TON', plan: 'year', status: 'completed', created_at: '2025-12-01T11:15:00' },
    { id: 3, user_id: 345678, amount: '1000', currency: 'STARS', plan: 'month', status: 'pending', created_at: '2025-12-02T09:00:00' },
];

const MOCK_PROMO_CODES: PromoCode[] = [
    { id: 1, code: 'WELCOME2025', discount_type: 'percent', value: 20, used_count: 45, max_uses: 100, expires_at: '2025-12-31' },
    { id: 2, code: 'PREMIUM50', discount_type: 'percent', value: 50, used_count: 12, max_uses: 50, expires_at: null },
];

const MOCK_TOP_USERS: TopUser[] = [
    { id: 123456, username: 'user1', first_name: 'Иван', last_name: 'Иванов', download_count: 1250, is_premium: true },
    { id: 234567, username: 'user2', first_name: 'Петр', last_name: 'Петров', download_count: 980, is_premium: true },
    { id: 456789, username: 'user4', first_name: 'Алексей', last_name: 'Алексеев', download_count: 756, is_premium: false },
];

const MOCK_CACHE_STATS: CacheStats = {
    total_entries: 1547,
    cache_hits: 8934,
    cache_misses: 1203,
    hit_ratio: 88.1,
    ttl_seconds: 3600
};

const AdminViewLocal: React.FC<AdminViewLocalProps> = ({ onBack, currentUserId = SUPER_ADMIN_ID }) => {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [stats, setStats] = useState<UserStats>(MOCK_STATS);
    const [cacheStats, setCacheStats] = useState<CacheStats>(MOCK_CACHE_STATS);
    const [allUsers, setAllUsers] = useState<UserListItem[]>(MOCK_USERS);
    const [premiumUsers, setPremiumUsers] = useState<UserListItem[]>(MOCK_USERS.filter(u => u.is_premium));
    const [adminUsers, setAdminUsers] = useState<UserListItem[]>(MOCK_USERS.filter(u => u.is_admin));
    const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>(MOCK_PROMO_CODES);
    const [topUsers, setTopUsers] = useState<TopUser[]>(MOCK_TOP_USERS);
    const [activityStats, setActivityStats] = useState<ActivityStat[]>(MOCK_ACTIVITY);
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [targetId, setTargetId] = useState('');
    const [grantType, setGrantType] = useState<'admin' | 'premium'>('premium');
    const [grantValue, setGrantValue] = useState(true);

    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleGrant = () => {
        const userId = parseInt(targetId);
        if (!userId) {
            showMessage('error', 'Введите корректный ID пользователя');
            return;
        }

        if (userId === SUPER_ADMIN_ID) {
            showMessage('error', 'Нельзя изменить права супер-админа');
            return;
        }

        setAllUsers(prev => prev.map(u => {
            if (u.id === userId) {
                return { ...u, [grantType === 'admin' ? 'is_admin' : 'is_premium']: grantValue };
            }
            return u;
        }));

        setPremiumUsers(allUsers.filter(u => u.is_premium));
        setAdminUsers(allUsers.filter(u => u.is_admin));

        showMessage('success', `Права ${grantType === 'admin' ? 'администратора' : 'премиум'} ${grantValue ? 'выданы' : 'отозваны'}`);
        setTargetId('');
    };

    const handleBroadcast = () => {
        if (!broadcastMessage.trim()) {
            showMessage('error', 'Введите текст сообщения');
            return;
        }
        showMessage('success', `Сообщение отправлено ${stats.total_users} пользователям`);
        setBroadcastMessage('');
    };

    const handleResetCache = () => {
        setCacheStats({ ...cacheStats, cache_hits: 0, cache_misses: 0, hit_ratio: 0 });
        showMessage('success', 'Кэш очищен');
    };

    const handleDeletePromo = (id: number) => {
        setPromoCodes(prev => prev.filter(p => p.id !== id));
        showMessage('success', 'Промокод удален');
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
                            <button className="px-3 py-1 border border-white text-[10px] font-bold hover:bg-white hover:text-black uppercase transition-colors">
                                {u.is_premium ? 'UNSUB' : 'SUB'}
                            </button>
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
                className="w-full bg-white text-black p-4 font-black uppercase hover:bg-red-500 hover:text-white transition-colors"
            >
                ОТПРАВИТЬ ВСЕМ
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
                    </div>
                )}
                {activeTab === 'promocodes' && (
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
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminViewLocal;
