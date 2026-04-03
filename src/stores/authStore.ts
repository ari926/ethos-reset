import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  isDoctor: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,
  isDoctor: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const isDoctor = await checkDoctorStatus(session.user.id);
        set({ session, user: session.user, loading: false, initialized: true, isDoctor });
      } else {
        set({ session: null, user: null, loading: false, initialized: true });
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          const isDoctor = await checkDoctorStatus(session.user.id);
          set({ session, user: session.user, isDoctor });
        } else {
          set({ session: null, user: null, isDoctor: false });
        }
      });
    } catch (err) {
      console.error('[authStore] init error:', err);
      set({ loading: false, initialized: true });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false });
      return { error: error.message };
    }
    if (data.session) {
      const isDoctor = await checkDoctorStatus(data.session.user.id);
      set({ session: data.session, user: data.session.user, loading: false, isDoctor });
    }
    return { error: null };
  },

  signUp: async (email: string, password: string, _fullName: string) => {
    set({ loading: true });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ loading: false });
      return { error: error.message };
    }
    if (data.session) {
      set({ session: data.session, user: data.session.user, loading: false });
    } else {
      set({ loading: false });
    }
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, isDoctor: false });
  },
}));

async function checkDoctorStatus(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('doctors')
      .select('id')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
