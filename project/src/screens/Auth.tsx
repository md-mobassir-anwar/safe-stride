import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, IdCard, ArrowLeft, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Logo } from '@/components/ui';

export function AuthScreen() {
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [scholarId, setScholarId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'signup') {
      const { error: err } = await signUp(email, password, scholarId);
      if (err) {
        setError(err);
        setLoading(false);
      } else {
        navigate('/verification');
      }
    } else {
      const { error: err } = await signIn(email, password);
      if (err) {
        setError(err);
        setLoading(false);
      } else {
        navigate('/app/home');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col">
      <div className="max-w-md mx-auto w-full px-6 py-8 flex-1 flex flex-col">
        <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-brand-600 mb-6">
          <ArrowLeft size={20} /> <span className="text-sm">Back</span>
        </Link>

        <div className="mb-8">
          <Logo size="lg" />
          <h1 className="text-2xl font-bold mt-6 text-gray-900 dark:text-white">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {mode === 'login' ? 'Sign in to SafeStride' : 'Verified female students and staff only'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scholar ID</label>
              <div className="relative">
                <IdCard size={18} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type="text"
                  value={scholarId}
                  onChange={(e) => setScholarId(e.target.value)}
                  className="input pl-10"
                  placeholder="e.g. DEMO0001"
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Must match your ERP roster entry</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">College Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input pl-10"
                placeholder="you@manit.ac.in"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pl-10"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-error-50 text-error-700 rounded-lg p-3 text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
            className="text-sm text-brand-600 dark:text-brand-400 font-medium"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>

        <div className="mt-auto pt-6">
          <Link to="/demo" className="block text-center text-sm text-gray-500 hover:text-brand-600">
            Try the demo instead
          </Link>
        </div>
      </div>
    </div>
  );
}
