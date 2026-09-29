import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import { Settings as SettingsIcon, User, Mail, Shield } from 'lucide-react';

export default function Settings() {
  const { user, role } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setName(data.display_name);
      }
    })();
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await supabase.from('profiles').update({ display_name: name, updated_at: new Date().toISOString() }).eq('id', user?.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-7 w-7 text-[#7598AF]" />
        <h1 className="text-2xl font-bold text-[#486679]">Einstellungen</h1>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-[#486679] mb-4 flex items-center gap-2"><User className="h-5 w-5 text-[#7598AF]" /> Profil</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#486679] mb-1.5">Name</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#486679] mb-1.5">E-Mail</label>
            <input className="field bg-[#f9fafb]" value={user?.email ?? ''} disabled />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="primary-button">Speichern</button>
            {saved && <span className="text-sm text-green-700">Gespeichert.</span>}
          </div>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-[#486679] mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-[#7598AF]" /> Rolle & Berechtigung</h2>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full bg-[#eef2f4] text-[#486679]">
            <Mail className="h-4 w-4" /> {role === 'ADMIN' ? 'Administrator' : 'Mitarbeiter'}
          </span>
          <span className="text-sm text-[#7598AF]">
            {role === 'ADMIN' ? 'Voller Zugriff auf alle Bereiche.' : 'Zugriff auf eigene Zeiterfassung und Auswertungen.'}
          </span>
        </div>
      </div>
    </div>
  );
}
