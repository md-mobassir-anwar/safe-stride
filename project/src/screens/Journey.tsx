import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Check, X, Flag, Ban, AlertCircle, Navigation, Clock, Vibrate,
  UserCheck, MapPin, Shield
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { isOffRoute } from '@/lib/campus-graph';
import { formatKolkataClock } from '@/lib/time';
import type { Journey, JourneyParticipant, Profile, LatLng } from '@/lib/types';

// Fix default icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function FitBounds({ positions }: { positions: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [positions, map]);
  return null;
}

export function JourneyScreen() {
  const { id: journeyId } = useParams();
  const navigate = useNavigate();
  const { profile, config } = useAuth();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [participants, setParticipants] = useState<JourneyParticipant[]>([]);
  const [companion, setCompanion] = useState<Profile | null>(null);
  const [myPing, setMyPing] = useState<LatLng | null>(null);
  const [companionPing, setCompanionPing] = useState<LatLng | null>(null);
  const [syncCountdown, setSyncCountdown] = useState<number | null>(null);
  const [departureCountdown, setDepartureCountdown] = useState('');
  const [showDeviation, setShowDeviation] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const deviationTimer = useRef<number | null>(null);
  const locationInterval = useRef<number | null>(null);

  const loadJourney = useCallback(async () => {
    if (!journeyId || !profile) return;
    const { data: j } = await supabase.from('journeys').select('*').eq('id', journeyId).maybeSingle();
    if (j) setJourney(j as Journey);

    const { data: parts } = await supabase
      .from('journey_participants')
      .select('*')
      .eq('journey_id', journeyId);
    setParticipants((parts || []) as JourneyParticipant[]);

    // Find companion
    const companionPart = (parts || []).find((p: any) => p.user_id !== profile.id);
    if (companionPart) {
      const { data: cp } = await supabase.from('profiles').select('*').eq('id', companionPart.user_id).maybeSingle();
      setCompanion(cp as Profile | null);
    }
  }, [journeyId, profile]);

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  // Realtime subscription for journey state changes
  useEffect(() => {
    if (!journeyId) return;
    const channel = supabase
      .channel(`journey-${journeyId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'journeys', filter: `id=eq.${journeyId}` }, (payload) => {
        setJourney(payload.new as Journey);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'journey_participants', filter: `journey_id=eq.${journeyId}` }, (payload) => {
        setParticipants(prev => prev.map(p => p.id === (payload.new as JourneyParticipant).id ? payload.new as JourneyParticipant : p));
        // Check if both ready → start sync countdown
        checkBothReady();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_pings', filter: `journey_id=eq.${journeyId}` }, (payload) => {
        const ping = payload.new as { user_id: string; lat: number; lng: number };
        if (profile && ping.user_id === profile.id) {
          setMyPing({ lat: ping.lat, lng: ping.lng });
        } else {
          setCompanionPing({ lat: ping.lat, lng: ping.lng });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [journeyId, profile]);

  const checkBothReady = useCallback(async () => {
    if (!journeyId) return;
    const { data: parts } = await supabase
      .from('journey_participants')
      .select('*')
      .eq('journey_id', journeyId);
    const allReady = (parts || []).every((p: any) => p.is_ready);
    if (allReady && (parts || []).length >= 2) {
      // Start sync countdown
      const { data: j } = await supabase.from('journeys')
        .update({ state: 'ready', sync_countdown_started_at: new Date().toISOString() })
        .eq('id', journeyId)
        .select()
        .single();
      setJourney(j as Journey);

      // Countdown
      const syncSeconds = config.sync_countdown_seconds;
      let remaining = syncSeconds;
      setSyncCountdown(remaining);
      const interval = setInterval(() => {
        remaining--;
        setSyncCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          // Vibrate and set in_progress
          if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 500]);
          supabase.from('journeys')
            .update({ state: 'in_progress', in_progress_at: new Date().toISOString() })
            .eq('id', journeyId!);
          setSyncCountdown(null);
        }
      }, 1000);
    }
  }, [journeyId, config]);

  // Live location sharing during in_progress
  useEffect(() => {
    if (!journey || !profile) return;
    if (journey.state !== 'in_progress') return;
    if (locationInterval.current) return;

    const startSharing = async () => {
      // Watch position
      locationInterval.current = window.setInterval(async () => {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
          });
          const ping = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMyPing(ping);

          await supabase.from('location_pings').insert({
            journey_id: journeyId,
            user_id: profile.id,
            lat: ping.lat,
            lng: ping.lng,
            accuracy: pos.coords.accuracy,
            source: 'journey',
          });

          // Check deviation
          if (journey.route_geo && journey.route_geo.length > 0) {
            const off = isOffRoute(ping, journey.route_geo, config.deviation_threshold_meters);
            if (off && !showDeviation) {
              setShowDeviation(true);
              // Start 30s countdown → silent SOS
              deviationTimer.current = window.setTimeout(() => {
                // Trigger silent SOS
                window.dispatchEvent(new CustomEvent('safestride-sos-trigger', { detail: { test: false } }));
                setShowDeviation(false);
              }, config.deviation_response_seconds * 1000);
            }
          }
        } catch {
          // Location might fail
        }
      }, config.journey_ping_interval_seconds * 1000);
    };

    startSharing();

    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
      if (deviationTimer.current) clearTimeout(deviationTimer.current);
    };
  }, [journey, profile, journeyId, config, showDeviation]);

  // Departure countdown
  useEffect(() => {
    if (!journey) return;
    const interval = setInterval(() => {
      const dep = new Date(journey.departure_time);
      const diff = dep.getTime() - Date.now();
      if (diff <= 0) {
        setDepartureCountdown('Departed');
        clearInterval(interval);
      } else {
        const m = Math.floor(diff / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setDepartureCountdown(`${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [journey]);

  const handleReady = async () => {
    if (!profile || !journeyId) return;
    await supabase
      .from('journey_participants')
      .update({ is_ready: true, ready_at: new Date().toISOString() })
      .eq('journey_id', journeyId)
      .eq('user_id', profile.id);
    // The realtime subscription will trigger checkBothReady
    loadJourney();
  };

  const handleArrived = async () => {
    if (!profile || !journeyId) return;
    await supabase
      .from('journey_participants')
      .update({ arrived: true, arrived_at: new Date().toISOString() })
      .eq('journey_id', journeyId)
      .eq('user_id', profile.id);

    // Check if both arrived → complete
    const { data: parts } = await supabase
      .from('journey_participants')
      .select('*')
      .eq('journey_id', journeyId);
    const allArrived = (parts || []).every((p: any) => p.arrived);
    if (allArrived) {
      // Complete journey
      await supabase.from('journeys')
        .update({ state: 'completed', completed_at: new Date().toISOString() })
        .eq('id', journeyId);

      // Award trust points to all participants
      for (const p of (parts || [])) {
        const { data: prof } = await supabase.from('profiles')
          .select('trust_points, completed_walks')
          .eq('id', p.user_id)
          .maybeSingle();
        if (prof) {
          await supabase.from('profiles')
            .update({
              trust_points: prof.trust_points + config.trust_completed,
              completed_walks: prof.completed_walks + 1,
            })
            .eq('id', p.user_id);

          await supabase.from('journey_participants')
            .update({ trust_delta: config.trust_completed })
            .eq('journey_id', journeyId)
            .eq('user_id', p.user_id);
        }
      }

      // Notify participants
      for (const p of (parts || [])) {
        await supabase.from('notifications').insert({
          user_id: p.user_id,
          type: 'journey_completed',
          title: 'Journey completed',
          body: 'Please rate your companion',
          data: { journeyId },
        });
      }

      navigate(`/app/rating/${journeyId}`);
    }
  };

  const handleCancel = async () => {
    if (!profile || !journeyId) return;
    await supabase.from('journeys')
      .update({ state: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: profile.id, cancel_reason: 'user_cancelled' })
      .eq('id', journeyId);
    navigate('/app/home');
  };

  const handleBlock = async () => {
    if (!profile || !companion) return;
    await supabase.from('user_blocks').insert({
      blocker_id: profile.id,
      blocked_id: companion.id,
    });
    setShowBlockConfirm(false);
    navigate('/app/home');
  };

  const handleReport = async () => {
    if (!profile || !companion || !journeyId) return;
    await supabase.from('reports').insert({
      reporter_id: profile.id,
      reported_id: companion.id,
      journey_id: journeyId,
      category: reportCategory || 'other',
      details: reportDetails,
    });
    setShowReport(false);
    setReportCategory('');
    setReportDetails('');
  };

  if (!journey) return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin" /></div>;

  const myPart = participants.find(p => p.user_id === profile?.id);
  const companionPart = participants.find(p => p.user_id !== profile?.id);
  const routePositions = (journey.route_geo || []) as LatLng[];
  const allPositions = [...routePositions];
  if (myPing) allPositions.push(myPing);
  if (companionPing) allPositions.push(companionPing);

  return (
    <div className="space-y-4">
      {/* Sync countdown overlay */}
      {syncCountdown !== null && (
        <div className="fixed inset-0 z-50 bg-brand-700 text-white flex flex-col items-center justify-center animate-scale-in">
          <p className="text-lg mb-4">Step out together!</p>
          <p className="text-7xl font-bold tabular-nums animate-pulse">{syncCountdown}</p>
          <Vibrate size={32} className="mt-4 animate-pulse" />
        </div>
      )}

      {/* Deviation prompt */}
      {showDeviation && (
        <div className="fixed inset-0 z-50 bg-error-600/95 text-white flex flex-col items-center justify-center p-6 animate-scale-in">
          <AlertCircle size={48} className="animate-pulse mb-4" />
          <p className="text-2xl font-bold mb-2">Are you okay?</p>
          <p className="text-sm opacity-90 mb-6 text-center">You appear to be off the planned route. Tap to confirm you're safe.</p>
          <button
            onClick={() => { setShowDeviation(false); if (deviationTimer.current) clearTimeout(deviationTimer.current); }}
            className="bg-white text-error-600 font-bold px-8 py-4 rounded-2xl active:scale-95 transition-transform"
          >
            I'm Safe
          </button>
          <p className="text-xs mt-4 opacity-70">Auto SOS in {config.deviation_response_seconds}s if no response</p>
        </div>
      )}

      {/* State banner */}
      <div className={`rounded-xl p-3 text-center font-semibold text-sm ${
        journey.state === 'in_progress' ? 'bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-400' :
        journey.state === 'completed' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300' :
        journey.state === 'cancelled' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' :
        'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
      }`}>
        {journey.state === 'matched' && 'Matched — waiting for both to be ready'}
        {journey.state === 'ready' && 'Get ready to step out!'}
        {journey.state === 'in_progress' && 'Journey in progress'}
        {journey.state === 'completed' && 'Journey completed'}
        {journey.state === 'cancelled' && 'Journey cancelled'}
      </div>

      {/* Departure countdown */}
      {journey.state === 'matched' && (
        <div className="card text-center">
          <Clock size={20} className="text-brand-600 mx-auto mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Departs in</p>
          <p className="text-3xl font-bold text-brand-700 dark:text-brand-300 tabular-nums">{departureCountdown}</p>
        </div>
      )}

      {/* Map */}
      <div className="rounded-2xl overflow-hidden h-64 border border-gray-200 dark:border-gray-700">
        <MapContainer center={[23.216, 77.407]} zoom={16} style={{ height: '100%', width: '100%' }} className="z-0">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {routePositions.length > 0 && (
            <Polyline positions={routePositions.map(p => [p.lat, p.lng])} pathOptions={{ color: '#6D28D9', weight: 4, dashArray: '5,10' }} />
          )}
          {myPing && <CircleMarker center={[myPing.lat, myPing.lng]} pathOptions={{ color: '#14b8a6', fillColor: '#14b8a6', fillOpacity: 1 }} radius={8} />}
          {companionPing && <CircleMarker center={[companionPing.lat, companionPing.lng]} pathOptions={{ color: '#6D28D9', fillColor: '#6D28D9', fillOpacity: 1 }} radius={8} />}
          {allPositions.length > 0 && <FitBounds positions={allPositions} />}
        </MapContainer>
      </div>

      {/* Companion info */}
      {companion && (
        <div className="card flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white font-bold">
            {companion.full_name[0]}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 dark:text-white">{companion.full_name.split(' ')[0]}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{companion.department} {companion.year}</p>
          </div>
          {companionPart?.is_ready && <UserCheck size={20} className="text-success-500" />}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        {journey.state === 'matched' && (
          <button
            onClick={handleReady}
            disabled={myPart?.is_ready}
            className={myPart?.is_ready ? 'btn-secondary w-full' : 'btn-primary w-full'}
          >
            {myPart?.is_ready ? (
              <><Check size={20} /> Ready — waiting for companion</>
            ) : (
              <><Check size={20} /> I'm Ready</>
            )}
          </button>
        )}

        {journey.state === 'in_progress' && (
          <button onClick={handleArrived} className="btn-primary w-full" disabled={myPart?.arrived}>
            {myPart?.arrived ? <><Check size={20} /> Arrived — waiting for companion</> : <><MapPin size={20} /> I've Arrived</>}
          </button>
        )}

        {/* Always visible: Cancel, Block, Report */}
        {journey.state !== 'completed' && journey.state !== 'cancelled' && (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleCancel} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <X size={18} /> Cancel
            </button>
            <button onClick={() => setShowBlockConfirm(true)} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-error-50 dark:bg-error-700/20 text-error-600 dark:text-error-400 text-xs font-medium hover:bg-error-100 dark:hover:bg-error-700/30 transition-colors">
              <Ban size={18} /> Block
            </button>
            <button onClick={() => setShowReport(true)} className="flex flex-col items-center gap-1 py-3 rounded-xl bg-warning-50 dark:bg-warning-700/20 text-warning-600 dark:text-warning-400 text-xs font-medium hover:bg-warning-100 dark:hover:bg-warning-700/30 transition-colors">
              <Flag size={18} /> Report
            </button>
          </div>
        )}
      </div>

      {/* Report modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white">Report User</h3>
              <button onClick={() => setShowReport(false)}><X size={20} className="text-gray-500" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Confidential — the reported user will not know who reported them.</p>
            <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value)} className="input mb-3">
              <option value="">Select category</option>
              <option value="harassment">Harassment</option>
              <option value="safety">Safety concern</option>
              <option value="behavior">Inappropriate behavior</option>
              <option value="no_show">No-show</option>
              <option value="other">Other</option>
            </select>
            <textarea value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} className="input mb-3" rows={3} placeholder="Details (optional)" />
            <button onClick={handleReport} className="btn-danger w-full" disabled={!reportCategory}>Submit Report</button>
          </div>
        </div>
      )}

      {/* Block confirm */}
      {showBlockConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white">Block User?</h3>
              <button onClick={() => setShowBlockConfirm(false)}><X size={20} className="text-gray-500" /></button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This will remove {companion?.full_name.split(' ')[0]} from all your future matches in both directions. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowBlockConfirm(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleBlock} className="btn-danger flex-1">Block</button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
        <Shield size={12} /> Live location shared only with your companion
      </div>
    </div>
  );
}
