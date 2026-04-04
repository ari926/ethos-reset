import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const OURA_API_BASE = 'https://api.ouraring.com';

// ─── Types matching Oura API v2 response shapes ───

export interface OuraDailySleep {
  id: string;
  day: string;
  score: number | null;
  contributors: Record<string, number | null>;
  timestamp: string;
}

export interface OuraSleepPeriod {
  id: string;
  day: string;
  average_heart_rate: number | null;
  average_hrv: number | null;
  average_breath: number | null;
  efficiency: number | null;
  total_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_time: number | null;
  bedtime_start: string;
  bedtime_end: string;
  type: string;
}

export interface OuraDailyReadiness {
  id: string;
  day: string;
  score: number | null;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
  contributors: Record<string, number | null>;
  timestamp: string;
}

export interface OuraDailyActivity {
  id: string;
  day: string;
  score: number | null;
  active_calories: number | null;
  steps: number | null;
  total_calories: number | null;
  equivalent_walking_distance: number | null;
  high_activity_time: number | null;
  medium_activity_time: number | null;
  low_activity_time: number | null;
  timestamp: string;
}

export interface OuraDailyStress {
  id: string;
  day: string;
  stress_high: number | null;
  recovery_high: number | null;
  day_summary: string | null;
}

export interface OuraHeartRate {
  bpm: number;
  source: string;
  timestamp: string;
}

export interface OuraSnapshot {
  sleepScore: number | null;
  readinessScore: number | null;
  activityScore: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  steps: number | null;
  totalSleepHours: number | null;
  stressSummary: string | null;
  tempDeviation: number | null;
  day: string;
}

interface OuraState {
  // Token management (PAT for now, OAuth later)
  token: string | null;
  connected: boolean;
  loading: boolean;
  syncing: boolean;
  lastSyncAt: string | null;

  // Latest snapshot
  snapshot: OuraSnapshot | null;

  // 7-day history
  sleepHistory: OuraDailySleep[];
  readinessHistory: OuraDailyReadiness[];
  activityHistory: OuraDailyActivity[];
  sleepPeriods: OuraSleepPeriod[];

  // Actions
  setToken: (token: string) => void;
  clearToken: () => void;
  loadTokenFromDb: (memberId: string) => Promise<void>;
  fetchOuraData: (memberId: string) => Promise<void>;
  syncToVitals: (memberId: string) => Promise<void>;
}

// ─── API helpers ───

async function ouraGet<T>(path: string, token: string, params?: Record<string, string>): Promise<T | null> {
  const url = new URL(`${OURA_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('unauthorized');
    if (res.status === 403) throw new Error('forbidden');
    throw new Error(`Oura API error: ${res.status}`);
  }
  return res.json();
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useOuraStore = create<OuraState>((set, get) => ({
  token: null,
  connected: false,
  loading: false,
  syncing: false,
  lastSyncAt: null,

  snapshot: null,
  sleepHistory: [],
  readinessHistory: [],
  activityHistory: [],
  sleepPeriods: [],

  setToken: (token: string) => {
    set({ token, connected: true });
  },

  clearToken: () => {
    set({
      token: null,
      connected: false,
      snapshot: null,
      sleepHistory: [],
      readinessHistory: [],
      activityHistory: [],
      sleepPeriods: [],
      lastSyncAt: null,
    });
  },

  loadTokenFromDb: async (memberId: string) => {
    const { data } = await supabase
      .from('wearable_connections')
      .select('*')
      .eq('provider', 'oura')
      .eq('member_id', memberId)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();

    if (data?.metadata && typeof data.metadata === 'object' && 'access_token' in data.metadata) {
      set({
        token: (data.metadata as Record<string, string>).access_token,
        connected: true,
        lastSyncAt: data.last_sync_at,
      });
    } else {
      set({ token: null, connected: false });
    }
  },

  fetchOuraData: async (_memberId: string) => {
    const token = get().token;
    if (!token) {
      toast.error('No Oura token — enter your Personal Access Token or connect via OAuth');
      return;
    }

    set({ loading: true });

    try {
      const startDate = dateNDaysAgo(7);
      const endDate = todayStr();
      const params = { start_date: startDate, end_date: endDate };

      const [dailySleepRes, sleepRes, readinessRes, activityRes, stressRes] = await Promise.all([
        ouraGet<{ data: OuraDailySleep[] }>('/v2/usercollection/daily_sleep', token, params),
        ouraGet<{ data: OuraSleepPeriod[] }>('/v2/usercollection/sleep', token, params),
        ouraGet<{ data: OuraDailyReadiness[] }>('/v2/usercollection/daily_readiness', token, params),
        ouraGet<{ data: OuraDailyActivity[] }>('/v2/usercollection/daily_activity', token, params),
        ouraGet<{ data: OuraDailyStress[] }>('/v2/usercollection/daily_stress', token, params),
      ]);

      const sleepHistory = dailySleepRes?.data ?? [];
      const sleepPeriods = sleepRes?.data ?? [];
      const readinessHistory = readinessRes?.data ?? [];
      const activityHistory = activityRes?.data ?? [];
      const stressData = stressRes?.data ?? [];

      // Build latest snapshot from most recent day
      const latestSleep = sleepHistory.length > 0 ? sleepHistory[sleepHistory.length - 1] : null;
      const latestReadiness = readinessHistory.length > 0 ? readinessHistory[readinessHistory.length - 1] : null;
      const latestActivity = activityHistory.length > 0 ? activityHistory[activityHistory.length - 1] : null;
      const latestStress = stressData.length > 0 ? stressData[stressData.length - 1] : null;

      // Get HRV and resting HR from sleep period data (most recent long_sleep)
      const longSleeps = sleepPeriods.filter(s => s.type === 'long_sleep');
      const latestLongSleep = longSleeps.length > 0 ? longSleeps[longSleeps.length - 1] : null;

      const snapshot: OuraSnapshot = {
        sleepScore: latestSleep?.score ?? null,
        readinessScore: latestReadiness?.score ?? null,
        activityScore: latestActivity?.score ?? null,
        hrv: latestLongSleep?.average_hrv ?? null,
        restingHeartRate: latestLongSleep?.average_heart_rate ?? null,
        steps: latestActivity?.steps ?? null,
        totalSleepHours: latestLongSleep?.total_sleep_duration
          ? Math.round((latestLongSleep.total_sleep_duration / 3600) * 10) / 10
          : null,
        stressSummary: latestStress?.day_summary ?? null,
        tempDeviation: latestReadiness?.temperature_deviation ?? null,
        day: latestSleep?.day ?? latestReadiness?.day ?? todayStr(),
      };

      set({
        snapshot,
        sleepHistory,
        readinessHistory,
        activityHistory,
        sleepPeriods,
        loading: false,
        lastSyncAt: new Date().toISOString(),
      });
    } catch (err) {
      set({ loading: false });
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg === 'unauthorized') {
        toast.error('Oura token expired or invalid — please re-enter your token');
        set({ connected: false, token: null });
      } else if (msg === 'forbidden') {
        toast.error('Oura subscription expired or insufficient permissions');
      } else {
        toast.error(`Failed to fetch Oura data: ${msg}`);
      }
    }
  },

  syncToVitals: async (memberId: string) => {
    const { snapshot, sleepHistory, readinessHistory, activityHistory, sleepPeriods } = get();
    if (!snapshot) {
      toast.error('No Oura data to sync — fetch data first');
      return;
    }

    set({ syncing: true });

    try {
      const vitalsToInsert: Array<{
        member_id: string;
        vital_type: string;
        value_primary: number;
        value_secondary: number | null;
        unit: string;
        recorded_at: string;
        source: string;
        notes: string | null;
      }> = [];

      // Insert vitals for each day in the 7-day history
      for (const sleep of sleepHistory) {
        if (sleep.score != null) {
          vitalsToInsert.push({
            member_id: memberId,
            vital_type: 'sleep_score',
            value_primary: sleep.score,
            value_secondary: null,
            unit: '/100',
            recorded_at: `${sleep.day}T08:00:00Z`,
            source: 'oura',
            notes: null,
          });
        }
      }

      for (const readiness of readinessHistory) {
        if (readiness.score != null) {
          vitalsToInsert.push({
            member_id: memberId,
            vital_type: 'readiness_score',
            value_primary: readiness.score,
            value_secondary: null,
            unit: '/100',
            recorded_at: `${readiness.day}T08:00:00Z`,
            source: 'oura',
            notes: readiness.temperature_deviation != null
              ? `Temp dev: ${readiness.temperature_deviation.toFixed(2)}C`
              : null,
          });
        }
      }

      for (const activity of activityHistory) {
        if (activity.score != null) {
          vitalsToInsert.push({
            member_id: memberId,
            vital_type: 'activity_score',
            value_primary: activity.score,
            value_secondary: null,
            unit: '/100',
            recorded_at: `${activity.day}T20:00:00Z`,
            source: 'oura',
            notes: null,
          });
        }
        if (activity.steps != null) {
          vitalsToInsert.push({
            member_id: memberId,
            vital_type: 'steps',
            value_primary: activity.steps,
            value_secondary: null,
            unit: 'steps',
            recorded_at: `${activity.day}T20:00:00Z`,
            source: 'oura',
            notes: null,
          });
        }
      }

      // HRV and heart rate from sleep periods
      const longSleeps = sleepPeriods.filter(s => s.type === 'long_sleep');
      for (const sp of longSleeps) {
        if (sp.average_hrv != null) {
          vitalsToInsert.push({
            member_id: memberId,
            vital_type: 'hrv',
            value_primary: sp.average_hrv,
            value_secondary: null,
            unit: 'ms',
            recorded_at: sp.bedtime_end || `${sp.day}T08:00:00Z`,
            source: 'oura',
            notes: null,
          });
        }
        if (sp.average_heart_rate != null) {
          vitalsToInsert.push({
            member_id: memberId,
            vital_type: 'heart_rate',
            value_primary: Math.round(sp.average_heart_rate),
            value_secondary: null,
            unit: 'bpm',
            recorded_at: sp.bedtime_end || `${sp.day}T08:00:00Z`,
            source: 'oura',
            notes: 'Resting (sleep avg)',
          });
        }
      }

      if (vitalsToInsert.length === 0) {
        toast('No new data points to sync');
        set({ syncing: false });
        return;
      }

      // Delete existing oura vitals for this date range to avoid duplicates
      const startDate = dateNDaysAgo(7);
      const { error: deleteError } = await supabase
        .from('vitals')
        .delete()
        .eq('member_id', memberId)
        .eq('source', 'oura')
        .gte('recorded_at', `${startDate}T00:00:00Z`);

      if (deleteError) {
        console.warn('Failed to clear old Oura vitals:', deleteError);
      }

      const { error } = await supabase.from('vitals').insert(vitalsToInsert);

      if (error) {
        toast.error('Failed to save vitals to database');
        console.error('Vitals insert error:', error);
      } else {
        toast.success(`Synced ${vitalsToInsert.length} data points from Oura`);
      }
    } catch (err) {
      toast.error('Sync failed');
      console.error('Sync error:', err);
    }

    set({ syncing: false });
  },
}));
