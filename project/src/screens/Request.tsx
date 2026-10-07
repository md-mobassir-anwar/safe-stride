import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, Building2, Navigation, Lock, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { checkPolicy } from '@/lib/policy';
import { buildGraph, dijkstra, osrmFootRoute, straightLineRoute } from '@/lib/campus-graph';
import type { Place, SavedDestination, TravelMode, LatLng } from '@/lib/types';
import { formatKolkataTime, minutesFromNow } from '@/lib/time';

export function RequestScreen() {
  const { profile, config, demoTime } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<TravelMode>('inside_campus');
  const [places, setPlaces] = useState<Place[]>([]);
  const [destinations, setDestinations] = useState<SavedDestination[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [customDest, setCustomDest] = useState<LatLng | null>(null);
  const [departureTime, setDepartureTime] = useState(minutesFromNow(15).toISOString().slice(0, 16));
  const [isGroup, setIsGroup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase.from('places').select('*').eq('institution_id', profile.institution_id).order('sort_order')
      .then(({ data }) => setPlaces(data || []));
    supabase.from('saved_destinations').select('*').eq('institution_id', profile.institution_id)
      .then(({ data }) => setDestinations(data || []));
    supabase.from('campus_edges').select('*').eq('institution_id', profile.institution_id)
      .then(({ data }) => setEdges(data || []));
  }, [profile]);

  if (!profile) return null;

  const depDate = new Date(departureTime);
  const policy = checkPolicy(mode, depDate, config, demoTime ?? new Date());

  const canCreateGroup = profile.badge === 'gold';

  const handleSubmit = async () => {
    setError(null);
    if (!originId) { setError('Select an origin'); return; }
    if (mode === 'inside_campus' && !destId) { setError('Select a destination'); return; }
    if (mode === 'outside_campus' && !destId && !customDest) { setError('Select a destination'); return; }
    if (!policy.allowed) { setError(policy.reason); return; }

    setLoading(true);
    try {
      const origin = places.find(p => p.id === originId);
      if (!origin) { setError('Invalid origin'); setLoading(false); return; }

      let destLabel = '';
      let destLat = 0, destLng = 0;
      let route: LatLng[] = [];

      if (mode === 'inside_campus') {
        const dest = places.find(p => p.id === destId);
        if (!dest) { setError('Invalid destination'); setLoading(false); return; }
        destLabel = dest.name;
        destLat = dest.lat;
        destLng = dest.lng;

        // Dijkstra route
        const graph = buildGraph(places, edges);
        const result = dijkstra(graph, originId, destId);
        if (result) {
          route = result.polyline;
        } else {
          route = straightLineRoute({ lat: origin.lat, lng: origin.lng }, { lat: dest.lat, lng: dest.lng });
        }
      } else {
        if (destId) {
          const dest = destinations.find(d => d.id === destId);
          if (!dest) { setError('Invalid destination'); setLoading(false); return; }
          destLabel = dest.name;
          destLat = dest.lat;
          destLng = dest.lng;
        } else if (customDest) {
          destLabel = 'Custom location';
          destLat = customDest.lat;
          destLng = customDest.lng;
        }

        // OSRM foot route
        route = await osrmFootRoute({ lat: origin.lat, lng: origin.lng }, { lat: destLat, lng: destLng });
      }

      const { data, error: insertErr } = await supabase
        .from('journey_requests')
        .insert({
          institution_id: profile.institution_id,
          user_id: profile.id,
          mode,
          origin_label: origin.name,
          origin_lat: origin.lat,
          origin_lng: origin.lng,
          dest_label: destLabel,
          dest_lat: destLat,
          dest_lng: destLng,
          departure_time: depDate.toISOString(),
          route_geo: route,
          is_group: isGroup,
          group_max: config.group_walk_max,
          status: 'open',
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      navigate('/app/results', { state: { requestId: data.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Request a Companion</h1>

      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
        <button
          onClick={() => setMode('inside_campus')}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${mode === 'inside_campus' ? 'bg-white dark:bg-gray-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-gray-500'}`}
        >
          <Building2 size={16} className="inline mr-1" /> Inside Campus
        </button>
        <button
          onClick={() => setMode('outside_campus')}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${mode === 'outside_campus' ? 'bg-white dark:bg-gray-700 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-gray-500'}`}
        >
          <Navigation size={16} className="inline mr-1" /> Outside Campus
        </button>
      </div>

      {/* Policy lock indicator */}
      {mode === 'outside_campus' && (
        <div className={`rounded-xl p-4 border ${policy.isLocked ? 'bg-error-50 dark:bg-error-700/20 border-error-100 dark:border-error-700/30' : 'bg-success-50 dark:bg-success-700/20 border-success-100 dark:border-success-700/30'}`}>
          <div className="flex items-center gap-2">
            {policy.isLocked ? <Lock size={18} className="text-error-600 dark:text-error-400" /> : <Clock size={18} className="text-success-600 dark:text-success-400" />}
            <p className={`text-sm font-medium ${policy.isLocked ? 'text-error-700 dark:text-error-400' : 'text-success-700 dark:text-success-400'}`}>
              {policy.reason}
            </p>
          </div>
        </div>
      )}

      {/* Origin */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">From</label>
        <div className="relative">
          <MapPin size={18} className="absolute left-3 top-3.5 text-gray-400" />
          <select value={originId} onChange={(e) => setOriginId(e.target.value)} className="input pl-10">
            <option value="">Select starting point</option>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Destination */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">To</label>
        {mode === 'inside_campus' ? (
          <div className="relative">
            <MapPin size={18} className="absolute left-3 top-3.5 text-gray-400" />
            <select value={destId} onChange={(e) => setDestId(e.target.value)} className="input pl-10">
              <option value="">Select destination</option>
              {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <MapPin size={18} className="absolute left-3 top-3.5 text-gray-400" />
              <select value={destId} onChange={(e) => { setDestId(e.target.value); setCustomDest(null); }} className="input pl-10">
                <option value="">Select destination</option>
                {destinations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400 text-center">or</p>
            <div className="relative">
              <MapPin size={18} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Drop a pin (lat, lng)"
                className="input pl-10"
                onChange={(e) => {
                  const parts = e.target.value.split(',').map(s => parseFloat(s.trim()));
                  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    setCustomDest({ lat: parts[0], lng: parts[1] });
                    setDestId('');
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Departure time */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Departure Time</label>
        <div className="relative">
          <Clock size={18} className="absolute left-3 top-3.5 text-gray-400" />
          <input
            type="datetime-local"
            value={departureTime}
            min={new Date().toISOString().slice(0, 16)}
            max={minutesFromNow(120).toISOString().slice(0, 16)}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="input pl-10"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">Up to 2 hours from now</p>
      </div>

      {/* Group walk toggle */}
      {canCreateGroup ? (
        <button
          onClick={() => setIsGroup(!isGroup)}
          className={`card flex items-center gap-3 w-full text-left ${isGroup ? 'border-brand-300 bg-brand-50 dark:bg-brand-900/20' : ''}`}
        >
          <Users size={20} className={isGroup ? 'text-brand-600' : 'text-gray-400'} />
          <div className="flex-1">
            <p className="font-medium text-sm text-gray-900 dark:text-white">Group Walk</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Up to {config.group_walk_max} people (Gold badge required to create)</p>
          </div>
          <div className={`w-12 h-6 rounded-full transition-colors ${isGroup ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <div className={`w-5 h-5 bg-white rounded-full transition-transform mt-0.5 ${isGroup ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </div>
        </button>
      ) : (
        <div className="card flex items-center gap-3 opacity-60">
          <Users size={20} className="text-gray-400" />
          <div>
            <p className="font-medium text-sm text-gray-500">Group Walk</p>
            <p className="text-xs text-gray-400">Gold badge required to create group walks</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-error-50 dark:bg-error-700/20 text-error-700 dark:text-error-400 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || (mode === 'outside_campus' && policy.isLocked)}
        className="btn-primary w-full"
      >
        {loading ? 'Finding route...' : policy.isLocked && mode === 'outside_campus' ? 'Locked' : 'Find Companions'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Departure: {formatKolkataTime(depDate)} IST
      </p>
    </div>
  );
}
