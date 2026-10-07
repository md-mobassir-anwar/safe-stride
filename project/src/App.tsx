import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Landing } from '@/screens/Landing';
import { AuthScreen } from '@/screens/Auth';
import { DemoLogin } from '@/screens/DemoLogin';
import { AppLayout } from '@/components/AppLayout';
import { Home } from '@/screens/Home';
import { RequestScreen } from '@/screens/Request';
import { Results } from '@/screens/Results';
import { JourneyScreen } from '@/screens/Journey';
import { RatingScreen } from '@/screens/Rating';
import { ProfileScreen } from '@/screens/Profile';
import { SettingsScreen } from '@/screens/Settings';
import { SecurityDashboard } from '@/screens/SecurityDashboard';
import { AdminPage } from '@/screens/Admin';
import { TrackPage } from '@/screens/Track';
import { VerificationStatus } from '@/screens/VerificationStatus';
import { SilentTriggers } from '@/lib/silent-triggers';
import { useEffect } from 'react';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>;
  if (!session) return <Navigate to="/" replace />;
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to="/app/home" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { session, profile, loading } = useAuth();

  // Initialize silent triggers for authenticated users
  useEffect(() => {
    if (!session || !profile) return;
    const triggers = new SilentTriggers();
    triggers.init(profile);
    return () => triggers.destroy();
  }, [session, profile]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><div className="w-8 h-8 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>;
  }

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to={profile?.account_state === 'pending' ? '/verification' : '/app/home'} replace /> : <Landing />} />
      <Route path="/auth" element={session ? <Navigate to={profile?.account_state === 'pending' ? '/verification' : '/app/home'} replace /> : <AuthScreen />} />
      <Route path="/demo" element={<DemoLogin />} />
      <Route path="/verification" element={session ? <VerificationStatus /> : <Navigate to="/" replace />} />
      <Route path="/track/:token" element={<TrackPage />} />
      <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="home" element={<Home />} />
        <Route path="request" element={<RequestScreen />} />
        <Route path="results" element={<Results />} />
        <Route path="journey/:id" element={<JourneyScreen />} />
        <Route path="rating/:id" element={<RatingScreen />} />
        <Route path="profile" element={<ProfileScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>
      <Route path="/security" element={<ProtectedRoute roles={['security', 'admin']}><SecurityDashboard /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
