import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setServerOffset } from '@/lib/time';
import type { Role } from '@/types';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ session: null, user: null, role: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setRole(null);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    (async () => {
      const [roleRes, timeRes] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle(),
        supabase.rpc('get_server_time'),
      ]);
      if (!cancelled) {
        if (timeRes.data) {
          const offset = new Date(timeRes.data as string).getTime() - Date.now();
          setServerOffset(offset);
        }
        setRole((roleRes.data?.role as Role) ?? 'EMPLOYEE');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
