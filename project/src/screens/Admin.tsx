import { useState, useEffect, useCallback } from 'react';
import {
  Users, Flag, Settings, Map, Plug, BarChart3, Upload, Check, X,
  Clock, Shield, Download, Play, Calendar
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { benchmarkMatch } from '@/lib/matching';
import { shouldCancelOutsideMatched } from '@/lib/policy';
import type { Profile, AppConfig } from '@/lib/types';
import { DEFAULT_CONFIG } from '@/lib/types';
import { formatKolkataTime } from '@/lib/time';

type Tab = 'verification' | 'reports' | 'config' | 'campus' | 'integrations' | 'analytics' | 'demo';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('verification');
  const { profile, config, demoTime, setDemoTime } = useAuth();
  const [benchResult, setBenchResult] = useState<{ durationMs: number; resultCount: number } | null>(null);

  const tabs: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: 'verification', label: 'Verification', icon: Users },
    { key: 'reports', label: 'Reports', icon: Flag },
    { key: 'config', label: 'Config', icon: Settings },
    { key: 'campus', label: 'Campus', icon: Map },
    { key: 'integrations', label: 'Integrations', icon: Plug },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    { key: 'demo', label: 'Demo Tools', icon: Play },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={24} className="text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-4 bg-white dark:bg-gray-800 rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key ? 'bg-brand-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'verification' && <VerificationTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'config' && <ConfigTab />}
        {tab === 'campus' && <CampusTab />}
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'demo' && <DemoTab benchResult={benchResult} setBenchResult={setBenchResult} demoTime={demoTime} setDemoTime={setDemoTime} />}
      </div>
    </div>
  );
}

function VerificationTab() {
  const [pending, setPending] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('account_state', 'pending').order('created_at', { ascending: false });
    setPending((data || []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (p: Profile) => {
    await supabase.from('profiles').update({ account_state: 'active' }).eq('id', p.id);
    await supabase.from('notifications').insert({
      user_id: p.id, type: 'verification', title: 'Verification approved', body: 'Your SafeStride account is now active!',
    });
    load();
  };

  const reject = async (p: Profile, reason: string) => {
    await supabase.from('profiles').update({ account_state: 'rejected', rejection_reason: reason }).eq('id', p.id);
    await supabase.from('notifications').insert({
      user_id: p.id, type: 'verification', title: 'Verification rejected', body: reason,
    });
    load();
  };

  const suspend = async (p: Profile) => {
    await supabase.from('profiles').update({ account_state: 'suspended' }).eq('id', p.id);
    load();
  };

  const reinstate = async (p: Profile) => {
    await supabase.from('profiles').update({ account_state: 'active', suspended_until: null }).eq('id', p.id);
    load();
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-white">Verification Queue</h2>
      {pending.length === 0 ? (
        <div className="card text-center py-8">
          <Check size={28} className="text-success-500 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No pending verifications</p>
        </div>
      ) : (
        pending.map(p => (
          <div key={p.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{p.full_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{p.scholar_id} · {p.department} {p.year}</p>
                <p className="text-xs text-gray-400 mt-1">{formatKolkataTime(new Date(p.created_at))}</p>
              </div>
              <span className="badge bg-warning-100 text-warning-700 dark:bg-warning-700/30 dark:text-warning-400">Pending</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => approve(p)} className="btn-primary text-sm py-2 px-3 flex-1"><Check size={16} /> Approve</button>
              <button onClick={() => reject(p, 'ID verification failed')} className="btn-danger text-sm py-2 px-3 flex-1"><X size={16} /> Reject</button>
            </div>
          </div>
        ))
      )}

      {/* Suspend/Reinstate section */}
      <SuspendReinstateSection />
    </div>
  );
}

function SuspendReinstateSection() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [showSuspended, setShowSuspended] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles')
        .select('*')
        .eq('role', 'student_staff')
        .order('created_at', { ascending: false })
        .limit(50);
      setUsers((data || []) as Profile[]);
    })();
  }, []);

  const suspend = async (p: Profile) => {
    await supabase.from('profiles').update({ account_state: 'suspended' }).eq('id', p.id);
    setUsers(prev => prev.map(u => u.id === p.id ? { ...u, account_state: 'suspended' } : u));
  };

  const reinstate = async (p: Profile) => {
    await supabase.from('profiles').update({ account_state: 'active', suspended_until: null }).eq('id', p.id);
    setUsers(prev => prev.map(u => u.id === p.id ? { ...u, account_state: 'active', suspended_until: undefined } : u));
  };

  const filtered = showSuspended ? users.filter(u => u.account_state === 'suspended') : users.filter(u => u.account_state === 'active');

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">User Management</h3>
        <button onClick={() => setShowSuspended(!showSuspended)} className="btn-ghost text-sm">
          {showSuspended ? 'Show Active' : 'Show Suspended'}
        </button>
      </div>
      {filtered.slice(0, 20).map(u => (
        <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{u.full_name}</p>
            <p className="text-xs text-gray-400">{u.scholar_id} · {u.account_state}</p>
          </div>
          {u.account_state === 'active' ? (
            <button onClick={() => suspend(u)} className="btn-ghost text-xs text-error-600">Suspend</button>
          ) : (
            <button onClick={() => reinstate(u)} className="btn-ghost text-xs text-success-600">Reinstate</button>
          )}
        </div>
      ))}
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('reports')
        .select('*, reporter:profiles!reporter_id(full_name), reported:profiles!reported_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);
      setReports(data || []);
    })();
  }, []);

  const resolveReport = async (id: string, notes: string) => {
    await supabase.from('reports').update({ status: 'resolved', admin_notes: notes, resolved_at: new Date().toISOString() }).eq('id', id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' } : r));
  };

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-white">Reports Queue</h2>
      {reports.length === 0 ? (
        <div className="card text-center py-8">
          <Flag size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No reports filed</p>
        </div>
      ) : (
        reports.map(r => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">{r.category}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Reported: {r.reported?.full_name || 'Unknown'}</p>
                <p className="text-xs text-gray-400 mt-1">{formatKolkataTime(new Date(r.created_at))}</p>
              </div>
              <span className={`badge ${r.status === 'open' ? 'bg-warning-100 text-warning-700 dark:bg-warning-700/30 dark:text-warning-400' : 'bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-400'}`}>{r.status}</span>
            </div>
            {r.details && <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{r.details}</p>}
            {r.status === 'open' && (
              <button onClick={() => resolveReport(r.id, 'Reviewed and addressed')} className="btn-primary text-sm py-2 px-4">
                Mark Resolved
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function ConfigTab() {
  const { config } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const configKeys = [
    'timing_tolerance_minutes', 'timing_full_score_minutes', 'corridor_buffer_meters',
    'corridor_min_overlap_pct', 'score_weight_timing', 'score_weight_overlap', 'score_weight_trust',
    'max_results', 'trust_initial', 'trust_completed', 'trust_noshow',
    'noshow_grace_minutes', 'noshow_suspend_hours', 'index_penalty_per_noshow',
    'badge_silver_index', 'badge_silver_walks', 'badge_gold_index', 'badge_gold_walks',
    'outside_open_hour', 'outside_close_hour', 'webhook_url', 'webhook_secret',
    'group_walk_max', 'group_walk_min',
  ];

  useEffect(() => {
    const vals: Record<string, string> = {};
    configKeys.forEach(k => { vals[k] = String((config as unknown as Record<string, unknown>)[k] ?? ''); });
    setValues(vals);
  }, [config]);

  const save = async () => {
    const instId = '11111111-1111-1111-1111-111111111111';
    for (const [key, val] of Object.entries(values)) {
      const num = parseFloat(val);
      const jsonVal = !isNaN(num) && !['webhook_url', 'webhook_secret'].includes(key) ? num : val;
      await supabase.from('app_config')
        .upsert({ institution_id: instId, key, value: jsonVal }, { onConflict: 'institution_id,key' });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-white">Configuration Editor</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">All tunable parameters. Changes take effect immediately.</p>
      <div className="card space-y-3">
        {configKeys.map(key => (
          <div key={key}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">{key}</label>
            <input
              type="text"
              value={values[key] || ''}
              onChange={(e) => setValues(prev => ({ ...prev, [key]: e.target.value }))}
              className="input text-sm py-2"
            />
          </div>
        ))}
      </div>
      <button onClick={save} className="btn-primary w-full">
        {saved ? <><Check size={20} /> Saved!</> : 'Save Configuration'}
      </button>
    </div>
  );
}

function CampusTab() {
  const [places, setPlaces] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: ps } = await supabase.from('places').select('*').order('sort_order');
      setPlaces(ps || []);
      const { data: es } = await supabase.from('campus_edges').select('*, from_place:places!from_place_id(name), to_place:places!to_place_id(name)');
      setEdges(es || []);
    })();
  }, []);

  const updatePlace = async (id: string, lat: number, lng: number) => {
    await supabase.from('places').update({ lat, lng }).eq('id', id);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-900 dark:text-white">Campus Editor</h2>

      <div className="card">
        <h3 className="font-medium text-sm text-gray-900 dark:text-white mb-3">Places ({places.length})</h3>
        <div className="space-y-2">
          {places.map(p => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <Map size={14} className="text-gray-400 flex-shrink-0" />
              <span className="font-medium text-gray-900 dark:text-white flex-shrink-0 w-32 truncate">{p.name}</span>
              <input type="number" step="0.0001" defaultValue={p.lat} onChange={(e) => updatePlace(p.id, parseFloat(e.target.value), p.lng)} className="input text-xs py-1 flex-1" placeholder="lat" />
              <input type="number" step="0.0001" defaultValue={p.lng} onChange={(e) => updatePlace(p.id, p.lat, parseFloat(e.target.value))} className="input text-xs py-1 flex-1" placeholder="lng" />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-medium text-sm text-gray-900 dark:text-white mb-3">Path Edges ({edges.length})</h3>
        <div className="space-y-1">
          {edges.map(e => (
            <div key={e.id} className="text-xs text-gray-600 dark:text-gray-400">
              {e.from_place?.name} ↔ {e.to_place?.name} · {e.distance_m}m
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">Note: Full drag-and-drop map editor available in the campus editor. Use lat/lng fields above to adjust pin positions.</p>
    </div>
  );
}

function IntegrationsTab() {
  const { config } = useAuth();

  const adapters = [
    {
      name: 'ERP',
      mode: config.erp_mode,
      status: 'roster mode (built-in)',
      description: 'Student verification via ERP roster table. Upload CSV in Demo Login or here.',
      icon: Users,
      color: 'brand',
    },
    {
      name: 'SMS',
      mode: config.sms_mode,
      status: 'fallback mode (in-app + SMS link)',
      description: 'Emergency contact SMS via Twilio when TWILIO credentials are set. Otherwise in-app notice with prefilled sms: link.',
      icon: Shield,
      color: 'teal',
    },
    {
      name: 'Webhook',
      mode: 'active',
      status: 'HMAC-SHA256 signed delivery',
      description: `URL: ${config.webhook_url}. Signed with HMAC-SHA256, retry with exponential backoff.`,
      icon: Plug,
      color: 'warning',
    },
    {
      name: 'Push',
      mode: config.push_mode,
      status: 'fallback mode (in-app notifications)',
      description: 'Web Push when VAPID keys are configured. Otherwise in-app notifications via Realtime.',
      icon: BarChart3,
      color: 'success',
    },
  ];

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-white">Integrations</h2>
      {adapters.map(a => (
        <div key={a.name} className="card">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <a.icon size={20} className={`text-${a.color}-600`} />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{a.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{a.status}</p>
              </div>
            </div>
            <span className={`badge bg-${a.color}-100 text-${a.color}-700 dark:bg-${a.color}-900/30 dark:text-${a.color}-400`}>
              {a.mode}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{a.description}</p>
        </div>
      ))}

      {/* Roster CSV upload */}
      <RosterUpload />
    </div>
  );
}

function RosterUpload() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim());
        if (parts.length >= 7) {
          rows.push({
            institution_id: '11111111-1111-1111-1111-111111111111',
            scholar_id: parts[0], name: parts[1], gender: parts[2], email: parts[3],
            department: parts[4], year: parts[5], role: parts[6],
          });
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from('erp_roster').upsert(rows, { onConflict: 'institution_id,scholar_id' });
        if (error) throw error;
        setCount(rows.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="card">
      <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-2">Upload ERP Roster (CSV)</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Format: scholar_id, name, gender, email, department, year, role</p>
      <input type="file" accept=".csv" onChange={handleUpload} className="text-sm" />
      {count !== null && <p className="text-xs text-success-600 mt-2">{count} entries imported</p>}
      {error && <p className="text-xs text-error-600 mt-2">{error}</p>}
    </div>
  );
}

function AnalyticsTab() {
  const [stats, setStats] = useState({
    verifiedUsers: 0, totalUsers: 0, journeysToday: 0, completed: 0, noShows: 0, sosCount: 0, avgResponse: 0,
  });
  const [recentJourneys, setRecentJourneys] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { count: verified } = await supabase.from('profiles').select('id', { count: 'exact' }).eq('account_state', 'active').eq('role', 'student_staff');
      const { count: total } = await supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'student_staff');

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { data: journeys } = await supabase.from('journeys').select('*').gte('created_at', todayStart.toISOString());
      const js = journeys || [];
      const completed = js.filter(j => j.state === 'completed').length;
      const noShows = js.filter(j => j.state === 'no_show').length;

      const { count: sos } = await supabase.from('sos_events').select('id', { count: 'exact' });

      const { data: ackEvents } = await supabase.from('sos_events').select('created_at, acknowledged_at').not('acknowledged_at', 'is', null);
      let avgResp = 0;
      if (ackEvents && ackEvents.length > 0) {
        const times = ackEvents.map((e: any) => (new Date(e.acknowledged_at).getTime() - new Date(e.created_at).getTime()) / 1000);
        avgResp = times.reduce((s: number, t: number) => s + t, 0) / times.length;
      }

      setStats({
        verifiedUsers: verified || 0, totalUsers: total || 0,
        journeysToday: js.length, completed, noShows,
        sosCount: sos || 0, avgResponse: avgResp,
      });

      const { data: recent } = await supabase.from('journeys').select('*, journey_requests!inner(origin_label, dest_label)').order('created_at', { ascending: false }).limit(20);
      setRecentJourneys(recent || []);
    })();
  }, []);

  const exportCSV = () => {
    const rows = [['ID', 'State', 'Departure', 'Origin', 'Destination']];
    recentJourneys.forEach(j => {
      rows.push([j.id, j.state, new Date(j.departure_time).toISOString(), j.journey_requests?.origin_label || '', j.journey_requests?.dest_label || '']);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'journeys.csv'; a.click();
  };

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-900 dark:text-white">Analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card text-center"><p className="text-2xl font-bold text-brand-600">{stats.verifiedUsers}</p><p className="text-xs text-gray-400">Verified Users</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalUsers}</p><p className="text-xs text-gray-400">Total Users</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-teal-accent-600">{stats.journeysToday}</p><p className="text-xs text-gray-400">Journeys Today</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-success-500">{stats.completed}</p><p className="text-xs text-gray-400">Completed</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-error-500">{stats.noShows}</p><p className="text-xs text-gray-400">No-Shows</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-warning-500">{stats.sosCount}</p><p className="text-xs text-gray-400">SOS Events</p></div>
      </div>

      {stats.avgResponse > 0 && (
        <div className="card text-center">
          <Clock size={20} className="text-brand-600 mx-auto mb-1" />
          <p className="text-2xl font-bold text-brand-700 dark:text-brand-300">{stats.avgResponse.toFixed(1)}s</p>
          <p className="text-xs text-gray-400">Average SOS Response Time</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-gray-900 dark:text-white">Recent Journeys</h3>
        <button onClick={exportCSV} className="btn-ghost text-sm"><Download size={16} /> Export CSV</button>
      </div>
      <div className="card space-y-2">
        {recentJourneys.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No journeys yet</p>
        ) : recentJourneys.map(j => (
          <div key={j.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <span className="text-gray-600 dark:text-gray-300">{j.journey_requests?.origin_label} → {j.journey_requests?.dest_label}</span>
            <span className={`badge ${j.state === 'completed' ? 'bg-success-100 text-success-700 dark:bg-success-700/30 dark:text-success-400' : j.state === 'no_show' ? 'bg-error-100 text-error-700 dark:bg-error-700/30 dark:text-error-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{j.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoTab({ benchResult, setBenchResult, demoTime, setDemoTime }: {
  benchResult: { durationMs: number; resultCount: number } | null;
  setBenchResult: (r: { durationMs: number; resultCount: number }) => void;
  demoTime: Date | null;
  setDemoTime: (d: Date | null) => void;
}) {
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);

  const runBenchmark = () => {
    const result = benchmarkMatch(60, 50);
    setBenchResult(result);
  };

  const simulateRequests = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const instId = '11111111-1111-1111-1111-111111111111';
      const { data: users } = await supabase.from('profiles').select('id').eq('role', 'student_staff').eq('is_demo', true).limit(50);
      if (!users || users.length === 0) { setSimResult('No demo users found'); return; }

      const now = Date.now();
      const inserts = [];
      for (let i = 0; i < 50; i++) {
        const user = users[i % users.length];
        const offset = (i % 20) - 10;
        inserts.push({
          institution_id: instId,
          user_id: user.id,
          mode: 'inside_campus' as const,
          origin_label: 'Hostel',
          origin_lat: 23.215 + (Math.random() - 0.5) * 0.002,
          origin_lng: 77.403 + (Math.random() - 0.5) * 0.002,
          dest_label: 'Library',
          dest_lat: 23.217 + (Math.random() - 0.5) * 0.002,
          dest_lng: 77.409 + (Math.random() - 0.5) * 0.002,
          departure_time: new Date(now + offset * 60000).toISOString(),
          route_geo: [
            { lat: 23.215, lng: 77.403 },
            { lat: 23.216, lng: 77.407 },
            { lat: 23.217, lng: 77.409 },
          ],
          is_group: false,
          group_max: 5,
          status: 'open',
        });
      }
      const { error } = await supabase.from('journey_requests').insert(inserts);
      if (error) throw error;
      setSimResult(`Created 50 concurrent requests`);
    } catch (err) {
      setSimResult(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  };

  const setTimeTravel = (hour: number) => {
    const d = new Date();
    d.setHours(hour, 1, 0, 0);
    setDemoTime(d);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-900 dark:text-white">Demo Tools</h2>

      {/* Benchmark */}
      <div className="card">
        <h3 className="font-medium text-sm text-gray-900 dark:text-white mb-2">Match Engine Benchmark</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Tests 60 users with 50 concurrent open requests. Target: under 500ms.</p>
        <button onClick={runBenchmark} className="btn-primary text-sm">Run Benchmark</button>
        {benchResult && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-sm">Duration: <span className={`font-bold ${benchResult.durationMs < 500 ? 'text-success-600' : 'text-error-600'}`}>{benchResult.durationMs.toFixed(2)}ms</span></p>
            <p className="text-sm">Results: {benchResult.resultCount} matches found</p>
            <p className={`text-xs mt-1 ${benchResult.durationMs < 500 ? 'text-success-600' : 'text-error-600'}`}>
              {benchResult.durationMs < 500 ? 'PASS — Under 500ms target' : 'FAIL — Exceeds 500ms target'}
            </p>
          </div>
        )}
      </div>

      {/* Simulate concurrent requests */}
      <div className="card">
        <h3 className="font-medium text-sm text-gray-900 dark:text-white mb-2">Simulate 50 Concurrent Requests</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Creates 50 demo journey requests to test matching at scale.</p>
        <button onClick={simulateRequests} disabled={simulating} className="btn-secondary text-sm">
          {simulating ? 'Creating...' : 'Simulate'}
        </button>
        {simResult && <p className="text-xs text-success-600 mt-2">{simResult}</p>}
      </div>

      {/* Time travel */}
      <div className="card">
        <h3 className="font-medium text-sm text-gray-900 dark:text-white mb-2">Time Travel (Demo Only)</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Simulate different times to test the outside-campus lock.</p>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setDemoTime(null)} className={`btn-ghost text-sm ${!demoTime ? 'bg-brand-100 dark:bg-brand-900' : ''}`}>Now</button>
          <button onClick={() => setTimeTravel(12)} className={`btn-ghost text-sm ${demoTime?.getHours() === 12 ? 'bg-brand-100 dark:bg-brand-900' : ''}`}>Noon</button>
          <button onClick={() => setTimeTravel(20)} className={`btn-ghost text-sm ${demoTime?.getHours() === 20 ? 'bg-brand-100 dark:bg-brand-900' : ''}`}>8 PM (Locked)</button>
        </div>
        {demoTime && <p className="text-xs text-gray-400 mt-2">Simulated time: {formatKolkataTime(demoTime)}</p>}
      </div>
    </div>
  );
}
