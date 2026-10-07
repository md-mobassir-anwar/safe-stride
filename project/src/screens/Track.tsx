import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertOctagon, Clock, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { SosEvent } from '@/lib/types';
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

export function TrackPage() {
  const { token } = useParams();
  const [event, setEvent] = useState<SosEvent | null>(null);
  const [locHistory, setLocHistory] = useState<Array<{ lat: number; lng: number; created_at: string }>>([]);
  const [latest, setLatest] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      // Use anon key (no auth needed for tracking)
      const { data } = await supabase
        .from('sos_events')
        .select('*')
        .eq('tracking_token', token)
        .maybeSingle();

      if (!data) { setLoading(false); return; }
      setEvent(data as SosEvent);

      // Check expiry
      if (data.status === 'resolved' && data.resolved_at) {
        const expiry = new Date(new Date(data.resolved_at).getTime() + 2 * 60 * 60 * 1000);
        if (new Date() > expiry) { setExpired(true); }
      }

      const { data: locs } = await supabase
        .from('sos_locations')
        .select('lat, lng, created_at')
        .eq('sos_event_id', data.id)
        .order('created_at', { ascending: true });
      setLocHistory((locs || []) as any[]);
      if (locs && locs.length > 0) {
        const last = locs[locs.length - 1] as any;
        setLatest({ lat: last.lat, lng: last.lng });
      } else {
        setLatest({ lat: data.lat, lng: data.lng });
      }
      setLoading(false);
    })();
  }, [token]);

  // Realtime for live updates
  useEffect(() => {
    if (!event) return;
    const channel = supabase
      .channel(`track-${event.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sos_locations',
        filter: `sos_event_id=eq.${event.id}`,
      }, (payload) => {
        const loc = payload.new as { lat: number; lng: number; created_at: string };
        setLatest({ lat: loc.lat, lng: loc.lng });
        setLocHistory(prev => [...prev, loc].slice(-100));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sos_events',
        filter: `id=eq.${event.id}`,
      }, (payload) => {
        setEvent(payload.new as SosEvent);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [event]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <AlertOctagon size={48} className="text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tracking link not found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">This tracking link is invalid or has expired.</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <Clock size={48} className="text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tracking link expired</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">This tracking link expired 2 hours after the SOS was resolved.</p>
      </div>
    );
  }

  const isActive = event.status === 'active' || event.status === 'acknowledged' || event.status === 'dispatched';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={24} className={isActive ? 'text-error-500' : 'text-success-500'} />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">SafeStride Live Tracking</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{isActive ? 'Active SOS — live location streaming' : `Resolved ${timeAgo(new Date(event.resolved_at || event.created_at))}`}</p>
          </div>
        </div>

        {/* Status banner */}
        <div className={`rounded-xl p-4 text-center font-semibold text-sm ${
          isActive ? 'bg-error-50 text-error-700 dark:bg-error-700/20 dark:text-error-400' :
          'bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-400'
        }`}>
          {isActive ? (
            <span className="flex items-center justify-center gap-2"><AlertOctagon size={18} className="animate-pulse" /> SOS Active — {event.status}</span>
          ) : (
            <span>Resolved — User confirmed safe</span>
          )}
        </div>

        {/* Map */}
        <div className="rounded-2xl overflow-hidden h-80 border border-gray-200 dark:border-gray-700">
          <MapContainer
            center={[latest?.lat || event.lat, latest?.lng || event.lng]}
            zoom={16}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            {latest && <FlyTo lat={latest.lat} lng={latest.lng} />}
            {locHistory.length > 1 && (
              <Polyline positions={locHistory.map(l => [l.lat, l.lng])} pathOptions={{ color: '#ef4444', weight: 3, dashArray: '5,10' }} />
            )}
            {locHistory.map((l, i) => (
              <CircleMarker
                key={i}
                center={[l.lat, l.lng]}
                pathOptions={{
                  color: i === locHistory.length - 1 ? '#ef4444' : '#c4b5fd',
                  fillColor: i === locHistory.length - 1 ? '#ef4444' : '#c4b5fd',
                  fillOpacity: 0.6,
                }}
                radius={i === locHistory.length - 1 ? 10 : 4}
              />
            ))}
          </MapContainer>
        </div>

        {/* Location history */}
        <div className="card">
          <h2 className="font-semibold text-sm text-gray-900 dark:text-white mb-2">Location History</h2>
          <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-hide">
            {locHistory.length === 0 ? (
              <p className="text-xs text-gray-400">No location updates yet</p>
            ) : (
              [...locHistory].reverse().slice(0, 20).map((l, i) => (
                <div key={i} className="text-xs text-gray-600 dark:text-gray-400 flex justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <span>{l.lat.toFixed(5)}, {l.lng.toFixed(5)}</span>
                  <span className="text-gray-400">{formatKolkataClock(new Date(l.created_at))}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="text-xs text-gray-400 text-center">
          <Shield size={12} className="inline mr-1" />
          SafeStride supports, and does not replace, 112 and campus security.
        </div>
      </div>
    </div>
  );
}
