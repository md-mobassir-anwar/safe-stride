import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, AppConfig } from './types';
import { DEFAULT_CONFIG } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  config: AppConfig;
  loading: boolean;
  signUp: (email: string, password: string, scholarId: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setDemoTime: (date: Date | null) => void;
  demoTime: Date | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [demoTime, setDemoTime] = useState<Date | null>(null);

  async function loadProfile(uid: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error('Profile load error:', error);
      return;
    }
    setProfile(data as Profile | null);
  }

  async function loadConfig() {
    const instId = '11111111-1111-1111-1111-111111111111';
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .eq('institution_id', instId);

    if (error || !data) {
      return;
    }

    const cfg = { ...DEFAULT_CONFIG };
    for (const row of data) {
      const val = row.value;
      if (typeof val === 'number') {
        (cfg as Record<string, unknown>)[row.key] = val;
      } else if (typeof val === 'string') {
        const num = parseFloat(val);
        if (!isNaN(num) && row.key !== 'webhook_url' && row.key !== 'webhook_secret' && row.key !== 'erp_mode' && row.key !== 'sms_mode' && row.key !== 'push_mode') {
          (cfg as Record<string, unknown>)[row.key] = num;
        } else {
          (cfg as Record<string, unknown>)[row.key] = val;
        }
      }
    }
    setConfig(cfg);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s) {
        Promise.all([loadProfile(s.user.id), loadConfig()]).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, s) => {
      (async () => {
        setSession(s);
        if (s) {
          await Promise.all([loadProfile(s.user.id), loadConfig()]);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, scholarId: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { scholar_id: scholarId } },
    });
    if (error) return { error: error.message };

    if (data.user) {
      // Check ERP roster
      const { data: roster } = await supabase
        .from('erp_roster')
        .select('*')
        .eq('scholar_id', scholarId)
        .maybeSingle();

      if (!roster) {
        return { error: 'Scholar ID not found in ERP roster. Contact your administrator.' };
      }

      if (roster.gender !== 'female') {
        return { error: 'SafeStride is a female-only safety companion. You are not eligible to activate.' };
      }

      // Create profile
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        institution_id: '11111111-1111-1111-1111-111111111111',
        scholar_id: scholarId,
        full_name: roster.name,
        email,
        role: roster.role === 'admin' ? 'admin' : roster.role === 'security' ? 'security' : 'student_staff',
        account_state: 'pending',
        department: roster.department,
        year: roster.year,
      });

      if (profileError) {
        return { error: profileError.message };
      }

      await loadProfile(data.user.id);
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    const currentSession = session ?? (await supabase.auth.getSession()).data.session;
    if (currentSession) await loadProfile(currentSession.user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, config, loading, signUp, signIn, signOut, refreshProfile, setDemoTime, demoTime }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
