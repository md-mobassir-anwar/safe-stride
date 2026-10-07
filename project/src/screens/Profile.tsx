import { useState, useEffect } from 'react';
import { Award, TrendingUp, Star, History, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { BadgeIcon, StarRating, EmptyState } from '@/components/ui';
import { computeSafetyIndex, computeBadge, formatSafetyIndexBreakdown } from '@/lib/trust';
import type { Journey, Rating } from '@/lib/types';

export function ProfileScreen() {
  const { profile, config } = useAuth();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [noShows90d, setNoShows90d] = useState(0);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      // Load completed journeys
      const { data: parts } = await supabase
        .from('journey_participants')
        .select('journey_id, journeys!inner(*)')
        .eq('user_id', profile.id)
        .in('journeys.state', ['completed', 'cancelled', 'no_show'])
        .order('journeys.created_at', { ascending: false })
        .limit(20);

      const js = (parts || []).map((p: any) => p.journeys as Journey);
      setJourneys(js);

      // Load ratings received
      const { data: rs } = await supabase
        .from('ratings')
        .select('*')
        .eq('ratee_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setRatings((rs || []) as Rating[]);

      // Count no-shows in last 90 days
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('journey_participants')
        .select('id', { count: 'exact' })
        .eq('user_id', profile.id)
        .eq('no_show', true)
        .gte('created_at', ninetyDaysAgo);
      setNoShows90d(count || 0);
    })();
  }, [profile]);

  if (!profile) return null;

  const computedIndex = computeSafetyIndex(
    profile.completed_walks,
    profile.total_requests,
    profile.avg_rating,
    noShows90d,
    config
  );
  const computedBadge = computeBadge(computedIndex, profile.completed_walks, config);
  const breakdown = formatSafetyIndexBreakdown(
    profile.completed_walks,
    profile.total_requests,
    profile.avg_rating,
    noShows90d,
    config
  );

  return (
    <div className="space-y-5">
      {/* Profile header */}
      <div className="card text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
          {profile.full_name[0]}
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{profile.full_name}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{profile.department} {profile.year}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <BadgeIcon badge={profile.badge} />
          <StarRating rating={profile.avg_rating} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <TrendingUp size={20} className="text-brand-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text white">{profile.trust_points}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Trust</p>
        </div>
        <div className="card text-center">
          <Shield size={20} className="text-teal-accent-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-teal-accent-600 dark:text-teal-accent-400">{computedIndex.toFixed(0)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Safety Index</p>
        </div>
        <div className="card text-center">
          <Award size={20} className="text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{profile.completed_walks}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Walks</p>
        </div>
      </div>

      {/* Safety Index breakdown */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={18} className="text-teal-accent-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Female Safety Index</h2>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3">
          <code className="text-xs text-gray-600 dark:text-gray-300">{breakdown.formula}</code>
        </div>
        <div className="space-y-1.5">
          {breakdown.components.map(c => (
            <div key={c.label} className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">{c.label}</span>
              <span className="font-medium text-gray-900 dark:text-white">{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Badge info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Award size={18} className="text-amber-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Badge Progress</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Current badge</span>
            <BadgeIcon badge={computedBadge} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Next: Silver</span>
            <span className="text-gray-600 dark:text-gray-300">
              Index ≥ {config.badge_silver_index}, ≥ {config.badge_silver_walks} walks
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-gray-400">Next: Gold</span>
            <span className="text-gray-600 dark:text-gray-300">
              Index ≥ {config.badge_gold_index}, ≥ {config.badge_gold_walks} walks
            </span>
          </div>
        </div>
      </div>

      {/* Journey history */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <History size={18} className="text-brand-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Recent Journeys</h2>
        </div>
        {journeys.length === 0 ? (
          <EmptyState icon={History} title="No journeys yet" subtitle="Your walk history will appear here" />
        ) : (
          <div className="space-y-2">
            {journeys.map(j => (
              <div key={j.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {new Date(j.departure_time).toLocaleDateString('en-IN')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{j.state}</p>
                </div>
                <span className={`badge ${
                  j.state === 'completed' ? 'bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-400' :
                  j.state === 'cancelled' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' :
                  'bg-error-100 text-error-700 dark:bg-error-700/30 dark:text-error-400'
                }`}>
                  {j.state}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent ratings */}
      {ratings.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Star size={18} className="text-amber-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Recent Ratings</h2>
          </div>
          <div className="space-y-2">
            {ratings.map(r => (
              <div key={r.id} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={12} className={i < r.stars ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'} fill={i < r.stars ? 'currentColor' : 'none'} />
                  ))}
                </div>
                <div className="flex-1">
                  {r.tags && r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.tags.map(t => <span key={t} className="text-xs bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full">{t}</span>)}
                    </div>
                  )}
                  {r.comment && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{r.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
