import { useState, useEffect, useCallback } from 'react';
import { AlertOctagon, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

interface SosButtonProps {
  className?: string;
}

export function SosButton({ className = '' }: SosButtonProps) {
  const { profile, config } = useAuth();
  const [active, setActive] = useState(false);
  const [showSosScreen, setShowSosScreen] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [sosEventId, setSosEventId] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);

  // Subscribe to SOS status changes
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`sos-status-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sos_events',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        if (payload.new.status === 'resolved') {
          setActive(false);
          setShowSosScreen(false);
          setSosEventId(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  const triggerSOS = useCallback(async (isTest = false) => {
    if (!profile) return;

    // Get current location
    let lat = 23.216;
    let lng = 77.407;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // Fallback to campus center
    }

    const token = uuidv4();

    // Check for active journey
    const { data: activeJourney } = await supabase
      .from('journeys')
      .select('id')
      .eq('institution_id', profile.institution_id)
      .in('state', ['matched', 'ready', 'in_progress'])
      .maybeSingle();

    const { data, error } = await supabase
      .from('sos_events')
      .insert({
        institution_id: profile.institution_id,
        user_id: profile.id,
        status: 'active',
        lat,
        lng,
        tracking_token: token,
        journey_id: activeJourney?.id || null,
        is_test: isTest,
        silent: false,
      })
      .select()
      .single();

    if (error) {
      console.error('SOS insert error:', error);
      return;
    }

    setSosEventId(data.id);
    setActive(true);
    setShowSosScreen(true);

    // Vibrate
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

    // Insert initial SOS location
    await supabase.from('sos_locations').insert({
      sos_event_id: data.id,
      lat,
      lng,
    });

    // Trigger webhook delivery via edge function (fire and forget)
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sos-webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ sosEventId: data.id }),
      });
    } catch {
      // Webhook delivery is async with retry
    }

    // Start location streaming
    const streamInterval = setInterval(async () => {
      if (!data.id) return;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
        });
        await supabase.from('sos_locations').insert({
          sos_event_id: data.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      } catch {
        // Keep streaming even if location fails momentarily
      }
    }, (config.sos_stream_interval_seconds || 4) * 1000);

    // Store interval for cleanup
    (window as unknown as Record<string, unknown>).__sosStreamInterval = streamInterval;
  }, [profile, config]);

  // Listen for silent triggers
  useEffect(() => {
    if (!profile) return;
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ test: boolean }>;
      triggerSOS(customEvent.detail?.test ?? false);
    };
    window.addEventListener('safestride-sos-trigger', handler);
    return () => window.removeEventListener('safestride-sos-trigger', handler);
  }, [triggerSOS, profile]);

  const cancelSOS = async () => {
    if (!sosEventId || !profile) return;
    // Verify PIN (simplified — in production this would hash and compare)
    setShowPinPrompt(true);
  };

  const verifyPinAndCancel = async () => {
    if (!sosEventId || !profile) return;
    // For demo: accept any 4-digit PIN
    if (pinInput.length !== 4) return;

    await supabase
      .from('sos_events')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolve_notes: 'User confirmed safe (PIN verified)' })
      .eq('id', sosEventId);

    // Stop streaming
    const interval = (window as unknown as Record<string, unknown>).__sosStreamInterval as number;
    if (interval) clearInterval(interval);

    // Audit log
    await supabase.from('audit_log').insert({
      institution_id: profile.institution_id,
      actor_id: profile.id,
      action: 'sos_cancelled',
      entity_type: 'sos_event',
      entity_id: sosEventId,
      details: { method: 'pin' },
    });

    setActive(false);
    setShowSosScreen(false);
    setShowPinPrompt(false);
    setPinInput('');
    setSosEventId(null);
  };

  if (showSosScreen) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-error-600 text-white flex flex-col items-center justify-between p-6 animate-fade-in">
          <div className="flex items-center gap-2 mt-4">
            <AlertOctagon size={32} className="animate-pulse" />
            <span className="text-2xl font-bold">SOS Active</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
            <p className="text-lg">Emergency services and campus security have been notified.</p>
            <p className="text-sm opacity-90">Your live location is being shared with security and your emergency contacts.</p>
            {testMode && <p className="bg-white/20 px-4 py-2 rounded-lg text-sm">TEST MODE — Security not alerted</p>}
            <a
              href="tel:112"
              className="bg-white text-error-600 font-bold text-xl px-8 py-4 rounded-2xl active:scale-95 transition-transform flex items-center gap-2"
            >
              Call 112
            </a>
            <button
              onClick={cancelSOS}
              className="text-sm bg-white/20 px-6 py-3 rounded-xl hover:bg-white/30 transition-colors"
            >
              I'm Safe — Cancel SOS (requires PIN)
            </button>
          </div>
          <div className="text-xs opacity-70 pb-4">Tracking link active for 2 hours after resolution</div>
        </div>
        {showPinPrompt && (
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white">Enter your PIN to cancel</h3>
                <button onClick={() => setShowPinPrompt(false)}><X size={20} className="text-gray-500" /></button>
              </div>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                className="input text-center text-2xl tracking-widest"
                placeholder="••••"
                autoFocus
              />
              <button onClick={verifyPinAndCancel} className="btn-primary w-full mt-4" disabled={pinInput.length !== 4}>
                Confirm Cancel
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      onClick={() => triggerSOS(false)}
      className={`fixed bottom-20 right-4 z-40 w-16 h-16 bg-error-500 text-white rounded-full shadow-lg flex items-center justify-center font-bold text-sm active:scale-90 transition-transform animate-sos-pulse ${className}`}
      aria-label="Trigger SOS"
    >
      SOS
    </button>
  );
}

