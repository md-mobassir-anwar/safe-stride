import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Upload, CheckCircle, Users, Shield, UserCog, Play } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Logo, LoadingSpinner } from '@/components/ui';

export function DemoLogin() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loginDemoUser = async (scholarId: string, email: string, role: 'student_staff' | 'security' | 'admin', fullName: string) => {
    setLoading(scholarId);
    setError(null);
    try {
      const demoPassword = 'SafeStrideDemo!2026';
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: demoPassword,
      });

      if (signInErr) {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email,
          password: demoPassword,
          options: { data: { scholar_id: scholarId } },
        });

        if (signUpErr) throw signUpErr;
        if (!signUpData.user) throw new Error('Demo account could not be created');

        const { error: profileError } = await supabase.from('profiles').insert({
          id: signUpData.user.id,
          institution_id: '11111111-1111-1111-1111-111111111111',
          scholar_id: `${scholarId}-${signUpData.user.id.slice(0, 8)}`,
          full_name: fullName,
          email,
          role,
          account_state: 'active',
          department: role === 'admin' ? 'Administration' : role === 'security' ? 'Security' : 'Student Affairs',
          year: role === 'student_staff' ? 'Demo' : 'Staff',
          is_demo: true,
          trust_points: role === 'admin' ? 100 : role === 'security' ? 80 : 70,
          profile_completeness: 100,
        });

        if (profileError) throw profileError;
      }

      await refreshProfile();
      navigate('/app/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(null);
    }
  };

  const handleRosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading('roster');
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const rows = [];
      for (let i = 1; i < lines.length; i++) { // skip header
        const parts = lines[i].split(',').map(s => s.trim());
        if (parts.length >= 7) {
          rows.push({
            institution_id: '11111111-1111-1111-1111-111111111111',
            scholar_id: parts[0],
            name: parts[1],
            gender: parts[2],
            email: parts[3],
            department: parts[4],
            year: parts[5],
            role: parts[6],
          });
        }
      }
      if (rows.length > 0) {
        await supabase.from('erp_roster').upsert(rows, { onConflict: 'institution_id,scholar_id' });
      }
      setError(`${rows.length} roster entries imported`);
    } catch {
      setError('CSV upload failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md mx-auto w-full px-6 py-8">
        <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-brand-600 mb-6">
          <ArrowLeft size={20} /> <span className="text-sm">Back</span>
        </Link>

        <div className="mb-8">
          <Logo size="lg" />
          <h1 className="text-2xl font-bold mt-4 text-gray-900 dark:text-white">Demo Login</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Try SafeStride with pre-seeded demo accounts</p>
        </div>

        {error && (
          <div className="bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded-lg p-3 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Admin */}
          <button
            onClick={() => loginDemoUser('ADMIN001', 'admin@manit.ac.in', 'admin', 'SafeStride Admin')}
            disabled={loading !== null}
            className="card flex items-center gap-3 w-full text-left hover:border-brand-300 transition-colors"
          >
            <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900 rounded-full flex items-center justify-center">
              <UserCog size={20} className="text-brand-700 dark:text-brand-300" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">Admin</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Full admin access, verification queue, config, analytics</p>
            </div>
            {loading === 'ADMIN001' && <LoadingSpinner />}
          </button>

          {/* Security */}
          <button
            onClick={() => loginDemoUser('SEC001', 'security@manit.ac.in', 'security', 'Security Control')}
            disabled={loading !== null}
            className="card flex items-center gap-3 w-full text-left hover:border-brand-300 transition-colors"
          >
            <div className="w-10 h-10 bg-error-100 dark:bg-error-700/30 rounded-full flex items-center justify-center">
              <Shield size={20} className="text-error-600 dark:text-error-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 dark:text-white">Security Control</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">SOS dashboard, acknowledge and dispatch</p>
            </div>
            {loading === 'SEC001' && <LoadingSpinner />}
          </button>

          {/* Featured demo users */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} className="text-brand-600" />
              <p className="font-semibold text-gray-900 dark:text-white">Demo Students</p>
            </div>
            <div className="space-y-2">
              {[
                { id: 'DEMO0001', email: 'demo1@manit.ac.in', name: 'Ananya S.', dept: 'CSE 3rd Yr', rating: '4.9' },
                { id: 'DEMO0002', email: 'demo2@manit.ac.in', name: 'Priya M.', dept: 'ECE 4th Yr', rating: '4.8' },
                { id: 'DEMO0003', email: 'demo3@manit.ac.in', name: 'Sneha R.', dept: 'ME 2nd Yr', rating: '4.5' },
                { id: 'DEMO0010', email: 'demo10@manit.ac.in', name: 'Aarti V.', dept: 'CSE 1st Yr', rating: '4.0' },
              ].map(u => (
                <button
                  key={u.id}
                  onClick={() => loginDemoUser(u.id, u.email, 'student_staff', u.name)}
                  disabled={loading !== null}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {u.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{u.dept} · ★ {u.rating}</p>
                  </div>
                  {loading === u.id ? <LoadingSpinner /> : <Play size={16} className="text-gray-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Roster CSV upload */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Upload size={18} className="text-brand-600" />
              <p className="font-semibold text-gray-900 dark:text-white">Upload ERP Roster (CSV)</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Format: scholar_id, name, gender, email, department, year, role
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleRosterUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading !== null}
              className="btn-secondary w-full text-sm"
            >
              {loading === 'roster' ? 'Uploading...' : 'Choose CSV file'}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400 justify-center pt-2">
            <CheckCircle size={14} className="text-success-500" />
            All demo passwords: SafeStrideDemo!2026
          </div>
        </div>
      </div>
    </div>
  );
}
