import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, User, Settings, Bell, LogOut, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Logo } from '@/components/ui';
import { ThemeToggle as ThemeToggleCmp } from '@/components/ThemeToggle';
import { SosButton } from '@/components/SosButton';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Notification as Notif } from '@/lib/types';

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setNotifs(data || []));

    const channel = supabase
      .channel(`notifs-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        setNotifs(prev => [payload.new as Notif, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const markAllRead = async () => {
    if (!profile) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false);
    setNotifs([]);
    setShowNotifs(false);
  };

  if (!profile) return null;

  const isSecurity = profile.role === 'security';
  const isAdmin = profile.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-700">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <NavLink to="/app/home">
            <Logo size="sm" />
          </NavLink>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
                aria-label="Notifications"
              >
                <Bell size={20} className="text-gray-600 dark:text-gray-300" />
                {notifs.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-error-500 rounded-full" />
                )}
              </button>
              {showNotifs && (
                <div className="absolute right-0 top-12 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-3 z-50 animate-scale-in">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">Notifications</span>
                    {notifs.length > 0 && (
                      <button onClick={markAllRead} className="text-xs text-brand-600">Mark all read</button>
                    )}
                  </div>
                  {notifs.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">No new notifications</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
                      {notifs.map(n => (
                        <div key={n.id} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                          <p className="font-medium text-sm">{n.title}</p>
                          {n.body && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.body}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <ThemeToggleCmp />
            {isSecurity && (
              <NavLink to="/security" className={({ isActive }) => `p-2 rounded-lg transition-colors ${isActive ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                <Shield size={20} />
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => `p-2 rounded-lg transition-colors ${isActive ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                <Settings size={20} />
              </NavLink>
            )}
            <button onClick={handleSignOut} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-4 pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-t border-gray-100 dark:border-gray-700">
        <div className="max-w-md mx-auto flex items-center justify-around h-16">
          <NavLink to="/app/home" className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-1 transition-colors ${isActive ? 'text-brand-700 dark:text-brand-300' : 'text-gray-400'}`}>
            <Home size={22} />
            <span className="text-xs">Home</span>
          </NavLink>
          <NavLink to="/app/profile" className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-1 transition-colors ${isActive ? 'text-brand-700 dark:text-brand-300' : 'text-gray-400'}`}>
            <User size={22} />
            <span className="text-xs">Profile</span>
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => `flex flex-col items-center gap-1 px-4 py-1 transition-colors ${isActive ? 'text-brand-700 dark:text-brand-300' : 'text-gray-400'}`}>
            <Settings size={22} />
            <span className="text-xs">Settings</span>
          </NavLink>
        </div>
      </nav>

      {/* SOS button */}
      <SosButton />
    </div>
  );
}
