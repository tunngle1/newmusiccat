export interface Track {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  audioUrl: string;
  duration: number; // in seconds
  isLocal?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  coverUrl: string;
  trackIds: string[];
}

export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  url: string;
  image: string;
}

export interface SubscriptionPlan {
  id: 'month' | 'year';
  name: string;
  priceStars: number;
  priceTon: number;
  duration: string;
  features: string[];
}

export interface SubscriptionStatus {
  has_access: boolean;
  reason: 'admin' | 'premium' | 'premium_pro' | 'trial' | 'expired' | 'blocked';
  trial_expires_at?: string;
  premium_expires_at?: string;
  days_left?: number;
}

export interface User {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_admin: boolean;
  is_premium: boolean;
  is_premium_pro: boolean;
  is_blocked: boolean;
  subscription_status?: SubscriptionStatus;
}

export interface Lyrics {
  track_id: string;
  title: string;
  artist: string;
  lyrics_text: string;
  source: string;
}

export enum ViewState {
  HOME = 'home',
  PLAYLISTS = 'playlists',
  FAVORITES = 'favorites',
  RADIO = 'radio',
  LIBRARY = 'library',
  PLAYLIST_DETAILS = 'PLAYLIST_DETAILS',
  ADMIN = 'admin',
  REFERRAL = 'referral',
  SUBSCRIPTION = 'subscription'
}

export type RepeatMode = 'none' | 'all' | 'one';
export type SearchMode = 'all' | 'artist' | 'track';

// --- Admin Interfaces ---

export interface UserStats {
  total_users: number;
  premium_users: number;
  admin_users: number;
  new_users_today: number;
  total_revenue_ton: number;
  total_revenue_stars: number;
  total_revenue_rub: number;
}

export interface ActivityStat {
  date: string;
  count: number;
}

export interface UserListItem {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_admin: boolean;
  is_premium: boolean;
  is_blocked: boolean;
}

export interface UserListResponse {
  users: UserListItem[];
}

export interface BroadcastRequest {
  message: string;
}

export interface GrantRequest {
  user_id: number;
  is_admin?: boolean;
  is_premium?: boolean;
  is_blocked?: boolean;
  trial_days?: number;
  premium_days?: number;
}
