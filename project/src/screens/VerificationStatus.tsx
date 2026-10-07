import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { Logo } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

export function VerificationStatus() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const state = profile?.account_state || 'pending';

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <Logo size="lg" />

        <div className="card">
          {state === 'pending' && (
            <>
              <div className="w-16 h-16 bg-warning-100 dark:bg-warning-700/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={28} className="text-warning-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Verification Pending</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your account is under review by the MANIT administration. You'll be notified once your verification is complete.
              </p>
              <p className="text-xs text-gray-400 mt-4">
                Make sure you've uploaded your ID card photo and added at least one emergency contact in Settings.
              </p>
            </>
          )}

          {state === 'active' && (
            <>
              <div className="w-16 h-16 bg-success-100 dark:bg-success-700/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={28} className="text-success-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Verified!</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Your account is active. You can now use SafeStride.</p>
              <button onClick={() => navigate('/app/home')} className="btn-primary mt-4">Go to Home</button>
            </>
          )}

          {state === 'rejected' && (
            <>
              <div className="w-16 h-16 bg-error-100 dark:bg-error-700/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={28} className="text-error-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Verification Rejected</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {profile?.rejection_reason || 'Your verification was not approved. Please contact the administration.'}
              </p>
            </>
          )}

          {state === 'suspended' && (
            <>
              <div className="w-16 h-16 bg-error-100 dark:bg-error-700/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={28} className="text-error-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Account Suspended</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your account is temporarily suspended due to a no-show. Suspension will be lifted after 24 hours.
              </p>
            </>
          )}
        </div>

        <button onClick={() => navigate('/app/home')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-600 mx-auto">
          <ArrowLeft size={16} /> Back to app
        </button>
      </div>
    </div>
  );
}
