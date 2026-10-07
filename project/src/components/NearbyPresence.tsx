import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, CircleMarker, Popup, TileLayer } from 'react-leaflet';
import { MapPin, Radio, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { BadgeLevel, LatLng } from '@/lib/types';

interface PresencePoint extends LatLng {
  user_id: string;
  display_name: string;
  badge: BadgeLevel;
  accuracy_m: number | null;
  last_seen_at: string;
}

const MANIT_CENTER: LatLng = { lat: 23.2138, lng: 77.4125 };

function badgeColor(badge: BadgeLevel): string {
  if (badge === 'gold') return '#d97706';
  if (badge === 'silver') return '#64748b';
  return '#6d28d9';
}

export function NearbyPresence() {
  const { profile } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [people, setPeople] = useState<PresencePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_nearby_presence');
    if (error) {
      setMessage('Nearby presence is temporarily unavailable.');
      return;
    }
    setPeople((data || []) as PresencePoint[]);
  }, []);

  const publishLocation = useCallback(async (position: GeolocationPosition) => {
    if (!profile) return;
    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
    setLocation(point);
    const { error } = await supabase.from('nearby_presence').upsert({
      user_id: profile.id,
      institution_id: profile.institution_id,
      lat: point.lat,
      lng: point.lng,
      accuracy_m: position.coords.accuracy,
      sharing_enabled: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) setMessage('Your location could not be shared.');
  }, [profile]);

  useEffect(() => {
    if (!sharing || !profile) return;
    let cancelled = false;
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      position => { if (!cancelled) void publishLocation(position); },
      () => { if (!cancelled) { setSharing(false); setMessage('Location permission is needed to appear nearby.'); } },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
    const watchId = navigator.geolocation.watchPosition(
      position => { if (!cancelled) void publishLocation(position); },
      () => { if (!cancelled) setMessage('Location updates paused. Check your device permission.'); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [sharing, profile, publishLocation]);

  useEffect(() => {
    void loadPeople();
    const channel = supabase
      .channel('nearby-presence-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nearby_presence' }, () => void loadPeople())
      .subscribe();
    const refresh = window.setInterval(() => void loadPeople(), 30000);
    return () => {
      window.clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [loadPeople]);

  const toggleSharing = async () => {
    if (!profile) return;
    setLoading(true);
    setMessage(null);
    if (sharing) {
      const { error } = await supabase.from('nearby_presence').delete().eq('user_id', profile.id);
      if (error) setMessage('Could not stop sharing your location.');
      else { setSharing(false); setLocation(null); }
    } else {
      setSharing(true);
    }
    setLoading(false);
  };

  const mapCenter = useMemo(() => location || people[0] || MANIT_CENTER, [location, people]);

  return (
    <section className="card overflow-hidden p-0">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Radio size={18} className={sharing ? 'text-success-600' : 'text-gray-400'} />
              <h2 className="font-semibold text-gray-900 dark:text-white">Nearby SafeStride users</h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Only people who choose to share their live location appear here.</p>
          </div>
          <button onClick={toggleSharing} disabled={loading} className={sharing ? 'btn-danger text-xs' : 'btn-primary text-xs'}>
            {sharing ? 'Stop sharing' : 'Share my location'}
          </button>
        </div>
        {message && <p className="text-xs text-error-600 dark:text-error-400 mt-3">{message}</p>}
      </div>

      <div className="h-64 relative">
        <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={16} className="h-full w-full" scrollWheelZoom={false}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {location && <CircleMarker center={[location.lat, location.lng]} radius={9} pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.85 }}><Popup>You</Popup></CircleMarker>}
          {people.filter(person => person.user_id !== profile?.id).map(person => (
            <CircleMarker key={person.user_id} center={[person.lat, person.lng]} radius={8} pathOptions={{ color: badgeColor(person.badge), fillColor: badgeColor(person.badge), fillOpacity: 0.8 }}>
              <Popup><strong>{person.display_name}</strong><br />{person.badge} badge</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
        <div className="absolute bottom-3 left-3 bg-white/95 dark:bg-gray-800/95 rounded-lg px-3 py-2 text-xs shadow-md flex items-center gap-2 z-[400]">
          <MapPin size={14} className="text-brand-600" />
          <span>{people.filter(person => person.user_id !== profile?.id).length} nearby sharing now</span>
        </div>
      </div>
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/70 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <ShieldCheck size={14} className="text-success-600" />
        Locations are visible only to active SafeStride users at MANIT and expire after 10 minutes.
      </div>
    </section>
  );
}
