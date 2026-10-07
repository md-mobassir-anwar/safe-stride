import { useNavigate, Link } from 'react-router-dom';
import { Clock, MapPin, Lock, Unlock, Users, Zap, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Disclaimer, BadgeIcon } from '@/components/ui';
import { NearbyPresence } from '@/components/NearbyPresence';
import { checkPolicy, getCountdown } from '@/lib/policy';
import { isMatchingLocked } from '@/lib/trust';
import { useState, useEffect } from 'react';
import { formatKolkataClock } from '@/lib/time';

export function Home() {
  const { profile, config, demoTime } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(demoTime ?? new Date()), 1000);
    return () => clearInterval(interval);
  }, [demoTime]);

  if (!profile) return null;

  const lockStatus = isMatchingLocked(profile);
  const currentTime = demoTime ?? now;
  const insidePolicy = checkPolicy('inside_campus', currentTime, config, currentTime);
  const outsidePolicy = checkPolicy('outside_campus', currentTime, config, currentTime);

  // Show next change countdown
  const nextChange = outsidePolicy.isLocked ? outsidePolicy.nextChange : outsidePolicy.nextChange;
  const cd = getCountdown(nextChange, currentTime);

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatKolkataClock(currentTime)} IST</p>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Hi, {profile.full_name.split(' ')[0]}
          </h1>
        </div>
        <BadgeIcon badge={profile.badge} />
      </div>

      {/* Profile completeness / matching locked warning */}
      {lockStatus.locked && (
        <div className="flex items-start gap-3 bg-warning-50 dark:bg-warning-700/20 text-warning-700 dark:text-warning-400 rounded-xl p-4 border border-warning-100 dark:border-warning-700/30">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">Matching is locked</p>
            <p className="text-xs mt-1">{lockStatus.reason}</p>
            <Link to="/app/settings" className="text-xs font-medium underline mt-1 inline-block">Complete profile</Link>
          </div>
        </div>
      )}

      {/* Transit timeline */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-brand-600 dark:text-brand-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white">MANIT Transit Timeline</h2>
        </div>

        <div className="space-y-3">
          {/* Inside campus */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success-100 dark:bg-success-700/30 rounded-full flex items-center justify-center">
              <Unlock size={18} className="text-success-600 dark:text-success-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm text-gray-900 dark:text-white">Inside Campus</p>
              <p className="text-xs text-success-600 dark:text-success-400">Available 24/7</p>
            </div>
            <span className="badge bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-400">Open</span>
          </div>

          {/* Outside campus */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${outsidePolicy.isLocked ? 'bg-error-100 dark:bg-error-700/30' : 'bg-success-100 dark:bg-success-700/30'}`}>
              {outsidePolicy.isLocked ? <Lock size={18} className="text-error-600 dark:text-error-400" /> : <Unlock size={18} className="text-success-600 dark:text-success-400" />}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm text-gray-900 dark:text-white">Outside Campus</p>
              <p className={`text-xs ${outsidePolicy.isLocked ? 'text-error-600 dark:text-error-400' : 'text-success-600 dark:text-success-400'}`}>
                {outsidePolicy.isLocked ? 'Locked (19:00–06:00)' : 'Open (06:00–19:00)'}
              </p>
            </div>
            <span className={`badge ${outsidePolicy.isLocked ? 'bg-error-100 text-error-700 dark:bg-error-700/30 dark:text-error-400' : 'bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-400'}`}>
              {outsidePolicy.isLocked ? 'Locked' : 'Open'}
            </span>
          </div>

          {/* Countdown */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              {outsidePolicy.isLocked ? 'Outside campus unlocks in' : 'Outside campus locks in'}
            </p>
            <p className="text-2xl font-mono font-bold text-brand-700 dark:text-brand-300 tabular-nums">{cd.label}</p>
          </div>
        </div>
      </div>

      {/* Find companion */}
      <button
        onClick={() => navigate('/app/request')}
        disabled={lockStatus.locked}
        className={`w-full rounded-2xl p-6 text-left transition-all ${lockStatus.locked ? 'bg-gray-100 dark:bg-gray-800 opacity-60 cursor-not-allowed' : 'bg-gradient-to-br from-brand-600 to-brand-800 text-white hover:from-brand-700 hover:to-brand-900 active:scale-95 shadow-lg'}`}
      >
        <div className="flex items-center gap-3 mb-2">
          <Users size={24} />
          <span className="text-lg font-bold">Find a Companion</span>
        </div>
        <p className="text-sm opacity-90">
          {lockStatus.locked ? 'Complete your profile to start matching' : 'Match with students walking the same route at the same time'}
        </p>
      </button>

      <NearbyPresence />

      {/* Trust summary */}
      <Link to="/app/profile" className="card flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Safety Index</p>
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300">{profile.safety_index.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-right">Trust Points</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white text-right">{profile.trust_points}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-right">Completed</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white text-right">{profile.completed_walks}</p>
        </div>
      </Link>

      <Disclaimer />
    </div>
  );
}
