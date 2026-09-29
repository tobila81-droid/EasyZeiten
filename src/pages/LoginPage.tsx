import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split('@')[0] } },
        });
        if (error) throw error;
        setInfo('Konto erstellt. Sie können sich jetzt anmelden.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      if (msg.toLowerCase().includes('invalid login')) setError('E-Mail oder Passwort ist falsch.');
      else if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered'))
        setError('Diese E-Mail-Adresse ist bereits registriert.');
      else setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email) { setError('Bitte erst E-Mail-Adresse eingeben.'); return; }
    setError('');
    setInfo('');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setError('Reset konnte nicht gesendet werden.');
    else setInfo('Wenn die Adresse registriert ist, wurde eine Reset-E-Mail versendet.');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#f6f7f8] px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/assets/images/easypayroll_4c.png" alt="Easy Payroll" className="h-16 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#486679]">Zeiterfassung</h1>
        </div>

        <div className="card p-8">
          <div className="flex gap-1 p-1 bg-[#eef2f4] rounded-xl mb-6">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'signin' ? 'bg-white text-[#486679] shadow-sm' : 'text-[#7598AF]'}`}
            >Anmelden</button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'signup' ? 'bg-white text-[#486679] shadow-sm' : 'text-[#7598AF]'}`}
            >Registrieren</button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-[#486679] mb-1.5">Name</label>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ihr Name" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-[#486679] mb-1.5">E-Mail</label>
              <input type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#486679] mb-1.5">Passwort</label>
              <input type="password" required minLength={6} className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {info && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{info}</p>}

            <button type="submit" disabled={busy} className="primary-button w-full">
              {busy ? 'Bitte warten …' : mode === 'signin' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>

          {mode === 'signin' && (
            <button onClick={resetPassword} className="w-full text-center text-sm text-[#7598AF] hover:text-[#486679] mt-4 transition">
              Passwort vergessen?
            </button>
          )}
        </div>

        <p className="text-center text-xs text-[#9baab3] mt-6">
          Der erste registrierte Benutzer wird automatisch als Administrator eingerichtet.
        </p>
      </div>
    </div>
  );
}
