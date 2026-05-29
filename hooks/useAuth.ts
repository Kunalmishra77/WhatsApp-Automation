'use client';

import { useEffect } from 'react';
import { createClient } from '@/services/supabase/client';
import { useAuthStore } from '@/store/auth.store';

export function useAuth() {
  const store = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        store.setUser({
          id:         data.user.id,
          email:      data.user.email ?? '',
          full_name:  (data.user.user_metadata['full_name'] as string | undefined) ?? '',
          avatar_url: (data.user.user_metadata['avatar_url'] as string | undefined) ?? null,
        });
      }
      store.setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        store.setUser({
          id:         session.user.id,
          email:      session.user.email ?? '',
          full_name:  (session.user.user_metadata['full_name'] as string | undefined) ?? '',
          avatar_url: (session.user.user_metadata['avatar_url'] as string | undefined) ?? null,
        });
      } else {
        store.reset();
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    user:            store.user,
    isLoading:       store.isLoading,
    isAuthenticated: store.isAuthenticated,
    can:             store.can,
  };
}
