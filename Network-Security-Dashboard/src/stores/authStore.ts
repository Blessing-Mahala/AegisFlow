import { create } from 'zustand';
import { supabase } from '../lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Tables } from '../lib/database.types';

type Profile = Tables<'profiles'>;

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  createTeam: (name: string) => Promise<{ teamId?: string; error?: string }>;
  joinTeam: (teamId: string) => Promise<{ error?: string }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      let profile: Profile | null = null;

      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        profile = data;
      }

      set({ user, profile, loading: false, initialized: true });

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (_event, session) => {
        const currentUser = session?.user ?? null;
        let currentProfile: Profile | null = null;

        if (currentUser) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
          currentProfile = data;
        }

        set({ user: currentUser, profile: currentProfile });
      });
    } catch {
      set({ loading: false, initialized: true });
    }
  },

  signIn: async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  },

  signUp: async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}` },
    });
    if (error) return { error: error.message };
    return {};
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) set({ profile: data });
  },

  createTeam: async (name: string) => {
    const { user } = get();
    if (!user) return { error: 'Not authenticated' };

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({ name })
      .select('*')
      .single();

    if (teamError) return { error: teamError.message };
    if (!team) return { error: 'Failed to create team' };

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ team_id: team.id, role: 'admin' })
      .eq('id', user.id);

    if (profileError) return { error: profileError.message };

    await get().refreshProfile();
    return { teamId: team.id };
  },

  joinTeam: async (teamId: string) => {
    const { user } = get();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('profiles')
      .update({ team_id: teamId, role: 'member' })
      .eq('id', user.id);

    if (error) return { error: error.message };
    await get().refreshProfile();
    return {};
  },
}));
