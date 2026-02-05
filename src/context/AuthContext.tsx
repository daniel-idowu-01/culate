import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../api/supabaseClient';
import type { Profile, UserRole } from '../types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<{ error?: Error }>;
  signUp: (email: string, password: string) => Promise<{ error?: Error }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        const profile = await fetchProfile(session.user.id);
        setState({
          session,
          profile,
          role: profile?.role ?? null,
          loading: false,
        });
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState({
          session: null,
          profile: null,
          role: null,
          loading: false,
        });
        return;
      }

      fetchProfile(session.user.id).then((profile) => {
        setState({
          session,
          profile,
          role: profile?.role ?? null,
          loading: false,
        });
      });
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('Error fetching profile', error.message);
      return null;
    }

    return data as Profile;
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { error: new Error(error.message) };
    }

    if (data.session) {
      const profile = await fetchProfile(data.session.user.id);
      setState({
        session: data.session,
        profile,
        role: profile?.role ?? null,
        loading: false,
      });
    }

    return {};
  };

  const signUp: AuthContextValue['signUp'] = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      return { error: new Error(error.message) };
    }

    if (data.session) {
      const profile = await fetchProfile(data.session.user.id);
      setState({
        session: data.session,
        profile,
        role: profile?.role ?? null,
        loading: false,
      });
    }

    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({
      session: null,
      profile: null,
      role: null,
      loading: false,
    });
  };

  const refreshProfile = async () => {
    const userId = state.session?.user.id;
    if (!userId) return;
    const profile = await fetchProfile(userId);
    setState((prev) => ({
      ...prev,
      profile,
      role: profile?.role ?? prev.role,
    }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

