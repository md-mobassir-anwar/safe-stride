import { useState, useEffect } from 'react';
import { Phone, Plus, Trash2, Vibrate, Mic, Hand, Keyboard, QrCode, Shield, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import type { EmergencyContact } from '@/lib/types';

export function SettingsScreen() {
  const { profile, refreshProfile } = useAuth();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [triggerUrl, setTriggerUrl] = useState('');
  const [idCardUploaded, setIdCardUploaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('emergency_contacts').select('*').eq('profile_id', profile.id)
      .then(({ data }) => setContacts(data || []));

    if (profile.trigger_token) {
      setTriggerUrl(`${window.location.origin}/api/sos/trigger?token=${profile.trigger_token}`);
    }
  }, [profile]);

  if (!profile) return null;

  const addContact = async () => {
    if (!profile || !newName || !newPhone) return;
    const { data } = await supabase.from('emergency_contacts').insert({
      profile_id: profile.id,
      name: newName,
      phone: newPhone,
      relationship: newRelation || undefined,
    }).select().single();
    if (data) {
      setContacts(prev => [...prev, data as EmergencyContact]);
      setShowAdd(false);
      setNewName('');
      setNewPhone('');
      setNewRelation('');
      // Update profile completeness
      await updateCompleteness();
    }
  };

  const deleteContact = async (id: string) => {
    await supabase.from('emergency_contacts').delete().eq('id', id);
    setContacts(prev => prev.filter(c => c.id !== id));
    await updateCompleteness();
  };

  const updateCompleteness = async () => {
    if (!profile) return;
    let pct = 0;
    if (profile.photo_url) pct += 20;
    if (profile.department) pct += 15;
    if (profile.year) pct += 10;
    if (profile.hostel) pct += 15;
    if (profile.phone) pct += 10;
    if (contacts.length > 0 || (await supabase.from('emergency_contacts').select('id').eq('profile_id', profile.id)).data?.length) {
      pct += 30;
    }
    pct = Math.min(100, pct);
    await supabase.from('profiles').update({ profile_completeness: pct }).eq('id', profile.id);
    refreshProfile();
  };

  const toggleTrigger = async (key: 'silent_shake' | 'silent_voice' | 'silent_taps' | 'silent_keyboard' | 'silent_trigger_url') => {
    if (!profile) return;
    const newValue = !profile[key];
    await supabase.from('profiles').update({ [key]: newValue }).eq('id', profile.id);
    refreshProfile();
  };

  const generateTriggerToken = async () => {
    if (!profile) return;
    const token = uuidv4();
    await supabase.from('profiles').update({ trigger_token: token }).eq('id', profile.id);
    setTriggerUrl(`${window.location.origin}/api/sos/trigger?token=${token}`);
    refreshProfile();
  };

  const handleIdCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    // For demo, just mark as uploaded (would use Supabase Storage in production)
    const { error } = await supabase.from('profiles')
      .update({ id_card_url: `id-card-${profile.id}.jpg` })
      .eq('id', profile.id);
    if (!error) {
      setIdCardUploaded(true);
      updateCompleteness();
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Profile completion */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Profile Completeness</h2>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
          <div className="bg-brand-600 h-3 rounded-full transition-all" style={{ width: `${profile.profile_completeness}%` }} />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{profile.profile_completeness}% complete</p>

        {/* ID card upload */}
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">ID Card Photo</label>
          <input type="file" accept="image/*" onChange={handleIdCardUpload} className="hidden" id="idcard-input" />
          <button
            onClick={() => document.getElementById('idcard-input')?.click()}
            className={`btn-secondary w-full mt-1 text-sm ${profile.id_card_url || idCardUploaded ? 'opacity-50' : ''}`}
          >
            <Upload size={16} /> {profile.id_card_url || idCardUploaded ? 'ID card uploaded' : 'Upload ID card'}
          </button>
        </div>
      </div>

      {/* Emergency contacts */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Emergency Contacts</h2>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-ghost text-sm">
            <Plus size={16} /> Add
          </button>
        </div>

        {showAdd && (
          <div className="space-y-2 mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl animate-slide-up">
            <input type="text" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="input text-sm" />
            <input type="tel" placeholder="Phone number" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="input text-sm" />
            <input type="text" placeholder="Relationship (optional)" value={newRelation} onChange={(e) => setNewRelation(e.target.value)} className="input text-sm" />
            <button onClick={addContact} className="btn-primary w-full text-sm" disabled={!newName || !newPhone}>Save Contact</button>
          </div>
        )}

        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No emergency contacts yet. Add at least one to unlock matching.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <Phone size={18} className="text-brand-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.phone}{c.relationship ? ` · ${c.relationship}` : ''}</p>
                </div>
                <button onClick={() => deleteContact(c.id)} className="text-error-500 p-1">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Silent triggers */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={18} className="text-brand-600" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Silent SOS Triggers</h2>
        </div>

        <div className="space-y-2">
          {[
            { key: 'silent_shake' as const, icon: Vibrate, label: 'Shake phone 3 times', desc: 'Detects 3 sharp shakes via motion sensors' },
            { key: 'silent_taps' as const, icon: Hand, label: '5 rapid taps on logo', desc: 'Tap the SafeStride logo 5 times quickly' },
            { key: 'silent_keyboard' as const, icon: Keyboard, label: 'Keyboard shortcut', desc: 'Ctrl+Shift+S on desktop' },
            { key: 'silent_voice' as const, icon: Mic, label: 'Voice phrase', desc: 'Say your trigger word (Web Speech API)' },
          ].map(t => (
            <div key={t.key} className="flex items-center gap-3 p-2 rounded-lg">
              <t.icon size={18} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t.desc}</p>
              </div>
              <button
                onClick={() => toggleTrigger(t.key)}
                className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${profile[t.key] ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mt-0.5 ${profile[t.key] ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}

          {/* Trigger URL with QR */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
            <div className="flex items-center gap-3 p-2 rounded-lg">
              <QrCode size={18} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Personal trigger URL</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">POST to trigger SOS silently (for smartwatch)</p>
              </div>
              <button
                onClick={() => toggleTrigger('silent_trigger_url')}
                className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${profile.silent_trigger_url ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mt-0.5 ${profile.silent_trigger_url ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {profile.silent_trigger_url && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg animate-slide-up">
                {triggerUrl ? (
                  <>
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all mb-2">{triggerUrl}</p>
                    <div className="bg-white p-3 rounded-lg flex justify-center mb-2">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(triggerUrl)}`} alt="QR code" className="w-32 h-32" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Scan with Apple Watch or Wear OS, then create a Shortcut that POSTs to this URL.
                    </p>
                  </>
                ) : (
                  <button onClick={generateTriggerToken} className="btn-secondary w-full text-sm">Generate trigger URL</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hostel field for completeness */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Additional Info</h2>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hostel</label>
        <input
          type="text"
          defaultValue={profile.hostel || ''}
          placeholder="e.g. Kalpana Chawla Hostel"
          className="input"
          onBlur={async (e) => {
            if (e.target.value !== profile.hostel) {
              await supabase.from('profiles').update({ hostel: e.target.value }).eq('id', profile.id);
              updateCompleteness();
            }
          }}
        />
      </div>
    </div>
  );
}
