import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Star, Clock, MapPin, Send, UserPlus, ArrowLeft, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { findMatches } from '@/lib/matching';
import { BadgeIcon, StarRating, EmptyState, LoadingSpinner } from '@/components/ui';
import type { JourneyRequest, Profile, MatchCandidate } from '@/lib/types';

export function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, config } = useAuth();
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRequest, setMyRequest] = useState<JourneyRequest | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const loadMatches = useCallback(async () => {
    if (!profile) return;
    const requestId = (location.state as { requestId?: string })?.requestId;
    if (!requestId) { navigate('/app/request'); return; }

    // Load my request
    const { data: myReq } = await supabase
      .from('journey_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (!myReq) { navigate('/app/request'); return; }
    setMyRequest(myReq as JourneyRequest);

    // Load other open requests at same institution, same mode
    const { data: otherReqs } = await supabase
      .from('journey_requests')
      .select('*, profiles!journey_requests_user_id_fkey(*)')
      .eq('institution_id', profile.institution_id)
      .eq('mode', myReq.mode)
      .eq('status', 'open')
      .neq('user_id', profile.id);

    // Load blocked users (both directions)
    const { data: blocked } = await supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', profile.id);
    const { data: blockedBy } = await supabase
      .from('user_blocks')
      .select('blocker_id')
      .eq('blocked_id', profile.id);

    const blockedIds = new Set<string>();
    (blocked || []).forEach(b => blockedIds.add(b.blocked_id));
    (blockedBy || []).forEach(b => blockedIds.add(b.blocker_id));

    // Load users in active journeys
    const { data: activeJ } = await supabase
      .from('journey_participants')
      .select('user_id, journeys!inner(state)')
      .in('journeys.state', ['matched', 'ready', 'in_progress', 'invited']);

    const activeIds = new Set<string>();
    (activeJ || []).forEach(j => activeIds.add(j.user_id));

    const candidateData = (otherReqs || []).map((r: any) => ({
      request: r as JourneyRequest,
      profile: r.profiles as Profile,
    }));

    const results = findMatches({
      myRequest: myReq as JourneyRequest,
      myProfile: profile,
      candidates: candidateData,
      blockedUserIds: blockedIds,
      activeJourneyUserIds: activeIds,
      config,
    });

    setCandidates(results);
    setLoading(false);
  }, [profile, config, location.state, navigate]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // Realtime: subscribe to new requests
  useEffect(() => {
    if (!profile || !myRequest) return;

    const channel = supabase
      .channel(`results-${myRequest.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'journey_requests',
        filter: `institution_id=eq.${profile.institution_id}`,
      }, () => {
        loadMatches();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'journey_requests',
        filter: `institution_id=eq.${profile.institution_id}`,
      }, () => {
        loadMatches();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, myRequest, loadMatches]);

  const sendInvite = async (candidate: MatchCandidate) => {
    if (!profile || !myRequest) return;
    setInvitedIds(prev => new Set(prev).add(candidate.userId));

    await supabase.from('invitations').insert({
      journey_id: myRequest.id,
      from_user_id: profile.id,
      to_user_id: candidate.userId,
      status: 'pending',
    });

    // Notify the candidate
    await supabase.from('notifications').insert({
      user_id: candidate.userId,
      type: 'journey_invite',
      title: 'New companion invite',
      body: `${profile.full_name.split(' ')[0]} invited you to walk together`,
      data: { requestId: myRequest.id },
    });
  };

  if (loading) return <LoadingSpinner label="Finding companions..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/app/home')} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Top Companions</h1>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        {myRequest && `${myRequest.origin_label} → ${myRequest.dest_label}`}
      </p>

      {candidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No compatible companions right now"
          subtitle="New requests appear here in real time. Try adjusting your departure time."
        />
      ) : (
        <div className="space-y-3">
          {candidates.map((c, idx) => (
            <div key={c.userId} className="card animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white font-bold">
                    {c.firstName[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text white">{c.firstName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.department} {c.year}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StarRating rating={c.rating} />
                      <BadgeIcon badge={c.badge} />
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-brand-600 dark:text-brand-400">
                    <Zap size={14} />
                    <span className="font-bold text-sm">{Math.round(c.score * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2.5 py-1.5">
                  <MapPin size={12} className="text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-300">{c.overlapPct}% Route Overlap</span>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2.5 py-1.5">
                  <Clock size={12} className="text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-300">Departs in {c.departsInMin}m</span>
                </div>
              </div>

              <button
                onClick={() => sendInvite(c)}
                disabled={invitedIds.has(c.userId)}
                className={invitedIds.has(c.userId) ? 'btn-secondary w-full text-sm' : 'btn-primary w-full text-sm'}
              >
                {invitedIds.has(c.userId) ? (
                  <><Send size={16} /> Invite Sent</>
                ) : (
                  <><UserPlus size={16} /> Send Invite</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pt-2">
        Results update in real time as new requests come in
      </p>
    </div>
  );
}
