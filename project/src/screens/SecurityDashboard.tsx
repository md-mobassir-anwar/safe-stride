import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertOctagon, Check, Send, FileText, Clock, Volume2, VolumeX, Activity } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { SosEvent, Profile, EmergencyContact } from '@/lib/types';
import { timeAgo, formatKolkataClock } from '@/lib/time';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], 16, { duration: 1 }); }, [lat, lng, map]);
  return null;
}

export function SecurityDashboard() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [selected, setSelected] = useState<SosEvent | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [userContacts, setUserContacts] = useState<EmergencyContact[]>([]);
  const [latestLoc, setLatestLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locHistory, setLocHistory] = useState<Array<{ lat: number; lng: number; created_at: string }>>([]);
  const [audible, setAudible] = useState(true);
  const [resolveNotes, setResolveNotes] = useState('');
  const [stats, setStats] = useState({ total: 0, medianAckSec: 0, active: 0 });
  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState<Array<any>>([]);

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from('sos_events')
      .select('*')
      .in('status', ['active', 'acknowledged', 'dispatched'])
      .order('created_at', { ascending: false });
    setEvents((data || []) as SosEvent[]);

    // Stats
    const { data: allEvents } = await supabase
      .from('sos_events')
      .select('created_at, acknowledged_at, status')
      .order('created_at', { ascending: false })
      .limit(100);

    if (allEvents) {
      const ackTimes = allEvents
        .filter((e: any) => e.acknowledged_at)
        .map((e: any) => (new Date(e.acknowledged_at).getTime() - new Date(e.created_at).getTime()) / 1000)
        .filter((s: number) => s >= 0);
      const median = ackTimes.length > 0
        ? ackTimes.sort((a: number, b: number) => a - b)[Math.floor(ackTimes.length / 2)]
        : 0;
      setStats({
        total: allEvents.length,
        medianAckSec: median,
        active: allEvents.filter((e: any) => e.status === 'active' || e.status === 'acknowledged' || e.status === 'dispatched').length,
      });
    }
  }, []);

  useEffect(() => {
    loadEvents();
    const interval = setInterval(loadEvents, 3000);

    // Realtime subscription
    const channel = supabase
      .channel('security-sos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_events' }, (payload) => {
        const newEvent = payload.new as SosEvent;
        setEvents(prev => [newEvent, ...prev]);
        if (audible) playAlert();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sos_events' }, (payload) => {
        setEvents(prev => prev.map(e => e.id === (payload.new as SosEvent).id ? payload.new as SosEvent : e));
        loadEvents();
      })
      .subscribe();

    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [loadEvents, audible]);

  // Load selected event details
  useEffect(() => {
    if (!selected) return;
    (async () => {
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', selected.user_id).maybeSingle();
      setUserProfile(prof as Profile | null);

      const { data: contacts } = await supabase.from('emergency_contacts').select('*').eq('profile_id', selected.user_id);
      setUserContacts((contacts || []) as EmergencyContact[]);

      const { data: locs } = await supabase
        .from('sos_locations')
        .select('lat, lng, created_at')
        .eq('sos_event_id', selected.id)
        .order('created_at', { ascending: true })
        .limit(100);
      setLocHistory((locs || []) as any[]);
      if (locs && locs.length > 0) {
        const latest = locs[locs.length - 1] as any;
        setLatestLoc({ lat: latest.lat, lng: latest.lng });
      } else {
        setLatestLoc({ lat: selected.lat, lng: selected.lng });
      }

      // Load audit log
      const { data: logs } = await supabase
        .from('audit_log')
        .select('*')
        .eq('entity_type', 'sos_event')
        .eq('entity_id', selected.id)
        .order('created_at', { ascending: false });
      setAuditLog(logs || []);
    })();
  }, [selected]);

  // Realtime location updates for selected event
  useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`sos-loc-${selected.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sos_locations',
        filter: `sos_event_id=eq.${selected.id}`,
      }, (payload) => {
        const loc = payload.new as { lat: number; lng: number; created_at: string };
        setLatestLoc({ lat: loc.lat, lng: loc.lng });
        setLocHistory(prev => [...prev, loc].slice(-100));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selected]);

  const playAlert = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* no audio */ }
  };

  const acknowledge = async (event: SosEvent) => {
    if (!profile) return;
    await supabase.from('sos_events')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: profile.id })
      .eq('id', event.id);
    await supabase.from('audit_log').insert({
      institution_id: profile.institution_id,
      actor_id: profile.id,
      action: 'sos_acknowledged',
      entity_type: 'sos_event',
      entity_id: event.id,
    });
    loadEvents();
  };

  const dispatchGuard = async (event: SosEvent) => {
    if (!profile) return;
    await supabase.from('sos_events')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
      .eq('id', event.id);
    await supabase.from('audit_log').insert({
      institution_id: profile.institution_id,
      actor_id: profile.id,
      action: 'sos_dispatched',
      entity_type: 'sos_event',
      entity_id: event.id,
    });
    loadEvents();
  };

  const resolve = async (event: SosEvent) => {
    if (!profile) return;
    await supabase.from('sos_events')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolve_notes: resolveNotes })
      .eq('id', event.id);
    await supabase.from('audit_log').insert({
      institution_id: profile.institution_id,
      actor_id: profile.id,
      action: 'sos_resolved',
      entity_type: 'sos_event',
      entity_id: event.id,
      details: { notes: resolveNotes },
    });
    setResolveNotes('');
    setSelected(null);
    loadEvents();
  };

  const targetAckSec = 120;
  const ackStatus = stats.medianAckSec > 0 && stats.medianAckSec <= targetAckSec ? 'success' : stats.medianAckSec > targetAckSec ? 'error' : 'neutral';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertOctagon size={24} className="text-error-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Security Control Dashboard</h1>
          </div>
          <button
            onClick={() => setAudible(!audible)}
            className={`p-2 rounded-lg ${audible ? 'bg-error-50 dark:bg-error-700/20 text-error-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}
          >
            {audible ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card text-center">
            <p className="text-2xl font-bold text-error-500">{stats.active}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Active SOS</p>
          </div>
          <div className="card text-center">
            <p className={`text-2xl font-bold ${ackStatus === 'success' ? 'text-success-500' : ackStatus === 'error' ? 'text-error-500' : 'text-gray-400'}`}>
              {stats.medianAckSec > 0 ? `${(stats.medianAckSec).toFixed(0)}s` : '—'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Median Response (target &lt; 2m)</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Events</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Event list */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Active Events</h2>
            {events.length === 0 ? (
              <div className="card text-center py-8">
                <Check size={32} className="text-success-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No active SOS events</p>
              </div>
            ) : (
              events.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className={`card w-full text-left transition-all ${selected?.id === e.id ? 'border-error-300 ring-2 ring-error-200' : 'hover:border-gray-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${
                          e.status === 'active' ? 'bg-error-100 text-error-700 dark:bg-error-700/30 dark:text-error-400' :
                          e.status === 'acknowledged' ? 'bg-warning-100 text-warning-700 dark:bg-warning-700/30 dark:text-warning-400' :
                          'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300'
                        }`}>{e.status}</span>
                        {e.is_test && <span className="badge bg-gray-100 text-gray-500">TEST</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{timeAgo(new Date(e.created_at))}</p>
                    </div>
                    {e.status === 'active' && (
                      <button
                        onClick={(ev) => { ev.stopPropagation(); acknowledge(e); }}
                        className="btn-primary text-sm py-2 px-4"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Detail panel */}
          <div>
            {selected ? (
              <div className="space-y-3">
                {/* Map */}
                <div className="rounded-2xl overflow-hidden h-64 border border-gray-200 dark:border-gray-700">
                  <MapContainer
                    center={[latestLoc?.lat || selected.lat, latestLoc?.lng || selected.lng]}
                    zoom={16}
                    style={{ height: '100%', width: '100%' }}
                    className="z-0"
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                    {latestLoc && <FlyTo lat={latestLoc.lat} lng={latestLoc.lng} />}
                    {locHistory.map((l, i) => (
                      <CircleMarker
                        key={i}
                        center={[l.lat, l.lng]}
                        pathOptions={{ color: i === locHistory.length - 1 ? '#ef4444' : '#c4b5fd', fillColor: i === locHistory.length - 1 ? '#ef4444' : '#c4b5fd', fillOpacity: 0.6 }}
                        radius={i === locHistory.length - 1 ? 10 : 4}
                      />
                    ))}
                  </MapContainer>
                </div>

                {/* User details */}
                {userProfile && (
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">User Details</h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Name</span><span className="font-medium text-gray-900 dark:text-white">{userProfile.full_name}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Scholar ID</span><span className="font-medium text-gray-900 dark:text-white">{userProfile.scholar_id}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Department</span><span className="font-medium text-gray-900 dark:text-white">{userProfile.department} {userProfile.year}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Phone</span><span className="font-medium text-gray-900 dark:text-white">{userProfile.phone || '—'}</span></div>
                    </div>
                  </div>
                )}

                {/* Emergency contacts */}
                {userContacts.length > 0 && (
                  <div className="card">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Emergency Contacts</h3>
                    <div className="space-y-2">
                      {userContacts.map(c => (
                        <div key={c.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-900 dark:text-white">{c.name}</span>
                          <a href={`tel:${c.phone}`} className="text-brand-600 dark:text-brand-400 font-medium">{c.phone}</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tracking link */}
                <div className="card">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Public tracking link</p>
                  <a href={`/track/${selected.tracking_token}`} target="_blank" rel="noopener" className="text-sm text-brand-600 dark:text-brand-400 break-all">
                    /track/{selected.tracking_token.slice(0, 8)}...
                  </a>
                </div>

                {/* Time to acknowledge */}
                {selected.acknowledged_at && (
                  <div className="card text-center">
                    <Clock size={18} className="text-brand-600 mx-auto mb-1" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">Time to acknowledge</p>
                    <p className="text-lg font-bold text-success-600">
                      {((new Date(selected.acknowledged_at).getTime() - new Date(selected.created_at).getTime()) / 1000).toFixed(1)}s
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2">
                  {selected.status === 'active' && (
                    <button onClick={() => acknowledge(selected)} className="btn-primary w-full">
                      <Check size={20} /> Acknowledge
                    </button>
                  )}
                  {(selected.status === 'acknowledged' || selected.status === 'active') && (
                    <button onClick={() => dispatchGuard(selected)} className="btn-secondary w-full">
                      <Send size={20} /> Dispatch Guard
                    </button>
                  )}
                  {selected.status !== 'resolved' && (
                    <>
                      <input
                        type="text"
                        value={resolveNotes}
                        onChange={(e) => setResolveNotes(e.target.value)}
                        className="input"
                        placeholder="Resolution notes..."
                      />
                      <button onClick={() => resolve(selected)} className="btn-danger w-full">
                        <Check size={20} /> Resolve
                      </button>
                    </>
                  )}
                  <button onClick={() => setShowAudit(!showAudit)} className="btn-ghost w-full text-sm">
                    <FileText size={16} /> {showAudit ? 'Hide' : 'Show'} Audit Log
                  </button>
                  {showAudit && (
                    <div className="card space-y-2">
                      {auditLog.length === 0 ? (
                        <p className="text-xs text-gray-400">No audit entries yet</p>
                      ) : auditLog.map((log, i) => (
                        <div key={i} className="text-xs border-l-2 border-brand-300 pl-2">
                          <p className="font-medium text-gray-700 dark:text-gray-300">{log.action}</p>
                          <p className="text-gray-400">{formatKolkataClock(new Date(log.created_at))}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card text-center py-12">
                <Activity size={32} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Select an event to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
