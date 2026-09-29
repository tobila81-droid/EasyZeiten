import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { TimeEntry, Activity, Customer, Pause } from '@/types';
import { formatDuration, formatTime, calcNetMs, isToday } from '@/lib/time';
import { Play, Pause as PauseIcon, RotateCcw, Square, Clock, X } from 'lucide-react';

type EntryStatus = 'idle' | 'running' | 'paused';

export default function Dashboard() {
  const { user } = useAuth();
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [activityMode, setActivityMode] = useState<'select' | 'freetext'>('select');
  const [freeActivityName, setFreeActivityName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<EntryStatus>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // TN modal state (shown when stopping a Stundenerfassung entry)
  const [tnModalOpen, setTnModalOpen] = useState(false);
  const [tnCount, setTnCount] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const activeIsStundenerfassung =
    activeEntry != null &&
    (activeEntry.activities?.name ?? activeEntry.activity_name ?? '').toLowerCase() === 'stundenerfassung';

  const isStundenerfassung =
    activityMode === 'freetext'
      ? freeActivityName.trim().toLowerCase() === 'stundenerfassung'
      : activities.find((a) => a.id === selectedActivityId)?.name?.toLowerCase() === 'stundenerfassung';

  const loadActiveEntry = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('time_entries')
      .select('*, activities(id, name, customer_id, customers(id, name)), customers(id, name), time_entry_pauses(*)')
      .eq('user_id', user.id)
      .is('stopped_at', null)
      .maybeSingle();
    if (data) {
      setActiveEntry(data as TimeEntry);
      setPauses((data as TimeEntry).time_entry_pauses ?? []);
      setStatus((data as TimeEntry).time_entry_pauses?.some((p) => !p.ended_at) ? 'paused' : 'running');
    } else {
      setActiveEntry(null);
      setPauses([]);
      setStatus('idle');
    }
  }, [user]);

  const loadTodayEntries = useCallback(async () => {
    if (!user) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('time_entries')
      .select('*, activities(id, name, customers(id, name)), customers(id, name), time_entry_pauses(*)')
      .eq('user_id', user.id)
      .gte('started_at', startOfDay.toISOString())
      .order('started_at');
    setTodayEntries((data as TimeEntry[]) ?? []);
  }, [user]);

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase.from('customers').select('*').eq('active', true).order('name');
    setCustomers((data as Customer[]) ?? []);
  }, []);

  const loadActivities = useCallback(async () => {
    const { data } = await supabase.from('activities').select('*').eq('active', true).order('name');
    setActivities((data as Activity[]) ?? []);
  }, []);

  useEffect(() => {
    loadActiveEntry();
    loadTodayEntries();
    loadCustomers();
    loadActivities();
  }, [loadActiveEntry, loadTodayEntries, loadCustomers, loadActivities]);

  const filteredActivities = activities.filter((a) => a.customer_id === selectedCustomerId);

  const handleStart = async () => {
    setError('');
    if (activityMode === 'select' && !selectedActivityId) { setError('Bitte eine Tätigkeit auswählen oder auf Freitext umschalten.'); return; }
    if (activityMode === 'freetext' && !freeActivityName.trim()) { setError('Bitte einen Tätigkeitsnamen eingeben.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('start_time_entry', {
      p_activity_id: activityMode === 'select' ? selectedActivityId : null,
      p_description: description,
      p_activity_name: activityMode === 'freetext' ? freeActivityName.trim() : '',
      p_customer_id: activityMode === 'freetext' ? (selectedCustomerId || null) : null,
      p_participant_count: null,
    });
    setBusy(false);
    if (error) { setError('Zeiterfassung konnte nicht gestartet werden.'); return; }
    setActiveEntry(data as TimeEntry);
    setStatus('running');
    setPauses([]);
    setDescription('');
    setFreeActivityName('');
    loadTodayEntries();
  };

  const handlePause = async () => {
    if (!activeEntry) return;
    setBusy(true);
    const { error } = await supabase.rpc('pause_time_entry', { p_entry_id: activeEntry.id });
    setBusy(false);
    if (error) { setError('Pause konnte nicht gestartet werden.'); return; }
    loadActiveEntry();
  };

  const handleResume = async () => {
    if (!activeEntry) return;
    setBusy(true);
    const { error } = await supabase.rpc('resume_time_entry', { p_entry_id: activeEntry.id });
    setBusy(false);
    if (error) { setError('Weiter konnte nicht ausgeführt werden.'); return; }
    loadActiveEntry();
  };

  const handleStopClick = () => {
    if (!activeEntry) return;
    if (activeIsStundenerfassung) {
      setTnCount('');
      setTnModalOpen(true);
    } else {
      doStop(null);
    }
  };

  const doStop = async (pCount: number | null) => {
    if (!activeEntry) return;
    setBusy(true);
    const { error } = await supabase.rpc('stop_time_entry', {
      p_entry_id: activeEntry.id,
      p_participant_count: pCount,
    });
    setBusy(false);
    if (error) { setError('Zeiterfassung konnte nicht gestoppt werden.'); return; }
    setActiveEntry(null);
    setPauses([]);
    setStatus('idle');
    setTnModalOpen(false);
    loadTodayEntries();
  };

  const handleTnConfirm = () => {
    const n = parseInt(tnCount);
    if (!tnCount || isNaN(n) || n < 1) {
      setError('Bitte eine gültige TN-Anzahl eingeben.');
      return;
    }
    setError('');
    doStop(n);
  };

  const liveMs = activeEntry
    ? calcNetMs({ started_at: activeEntry.started_at, stopped_at: activeEntry.stopped_at, time_entry_pauses: pauses })
    : 0;

  const todayTotalMs = todayEntries.reduce((sum, e) => sum + calcNetMs(e), 0) + (activeEntry && isToday(activeEntry.started_at) ? liveMs : 0);

  const statusLabel = status === 'running' ? 'Zeiterfassung läuft' : status === 'paused' ? 'Pause' : 'Keine aktive Zeiterfassung';
  const statusColor = status === 'running' ? 'bg-green-500' : status === 'paused' ? 'bg-amber-500' : 'bg-gray-300';

  const entryActivityName = (e: TimeEntry) => e.activities?.name ?? e.activity_name ?? '—';
  const entryCustomerName = (e: TimeEntry) => e.activities?.customers?.name ?? e.customers?.name ?? '—';

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#486679]">Dashboard</h1>
        <p className="text-sm text-[#7598AF] mt-1">{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Active timer card */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor} ${status === 'running' ? 'animate-pulse' : ''}`} />
          <span className="eyebrow">{statusLabel}</span>
        </div>

        {activeEntry ? (
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-[#7598AF] mb-1">Kunde</div>
              <div className="text-lg font-semibold text-[#486679] mb-3">{entryCustomerName(activeEntry)}</div>
              <div className="text-sm text-[#7598AF] mb-1">Tätigkeit</div>
              <div className="text-lg font-semibold text-[#486679] mb-3">{entryActivityName(activeEntry)}</div>
              <div className="text-sm text-[#7598AF] mb-1">Beschreibung</div>
              <div className="text-base text-[#486679]">{activeEntry.description || '—'}</div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="text-5xl font-bold text-[#486679] tabular-nums tracking-tight">{formatDuration(liveMs)}</div>
              <div className="text-sm text-[#7598AF] mt-2 flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Start: {formatTime(activeEntry.started_at)}
              </div>
              <div className="flex gap-2 mt-6">
                {status === 'running' && (
                  <button onClick={handlePause} disabled={busy} className="secondary-button"><PauseIcon className="h-5 w-5" /> Pause</button>
                )}
                {status === 'paused' && (
                  <button onClick={handleResume} disabled={busy} className="primary-button"><RotateCcw className="h-5 w-5" /> Weiter</button>
                )}
                <button onClick={handleStopClick} disabled={busy} className="secondary-button border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"><Square className="h-5 w-5" /> Stop</button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-[#486679] mb-1.5">Kunde</label>
                <select className="field" value={selectedCustomerId} onChange={(e) => { setSelectedCustomerId(e.target.value); setSelectedActivityId(''); }}>
                  <option value="">— wählen —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-[#486679]">Tätigkeit</label>
                  <button type="button" onClick={() => setActivityMode(activityMode === 'select' ? 'freetext' : 'select')} className="text-xs font-medium text-[#7598AF] hover:text-[#486679] transition">
                    {activityMode === 'select' ? 'Als Freitext eingeben' : 'Aus Liste wählen'}
                  </button>
                </div>
                {activityMode === 'select' ? (
                  <select className="field" value={selectedActivityId} onChange={(e) => setSelectedActivityId(e.target.value)} disabled={!selectedCustomerId}>
                    <option value="">— wählen —</option>
                    {filteredActivities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <input className="field" value={freeActivityName} onChange={(e) => setFreeActivityName(e.target.value)} placeholder="Tätigkeit eingeben" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[#486679] mb-1.5">Beschreibung</label>
                <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={handleStart} disabled={busy || (activityMode === 'select' ? !selectedActivityId : !freeActivityName.trim())} className="primary-button">
                <Play className="h-5 w-5" /> Start
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Today's bookings */}
      <div className="card p-6">
        <h2 className="text-lg font-bold text-[#486679] mb-4">Heutige Buchungen</h2>
        {todayEntries.length === 0 ? (
          <p className="text-sm text-[#7598AF]">Noch keine Buchungen heute.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e4e8eb] text-left text-[#7598AF]">
                  <th className="py-2 pr-4 font-medium">Beginn</th>
                  <th className="py-2 pr-4 font-medium">Ende</th>
                  <th className="py-2 pr-4 font-medium">Kunde</th>
                  <th className="py-2 pr-4 font-medium">Tätigkeit</th>
                  <th className="py-2 pr-4 font-medium text-center">TN</th>
                  <th className="py-2 pr-4 font-medium">Beschreibung</th>
                  <th className="py-2 pr-4 font-medium text-right">Nettozeit</th>
                  <th className="py-2 pl-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {todayEntries.map((e) => (
                  <tr key={e.id} className="border-b border-[#f0f3f5]">
                    <td className="py-3 pr-4 text-[#486679]">{formatTime(e.started_at)}</td>
                    <td className="py-3 pr-4 text-[#486679]">{e.stopped_at ? formatTime(e.stopped_at) : '—'}</td>
                    <td className="py-3 pr-4 text-[#486679]">{entryCustomerName(e)}</td>
                    <td className="py-3 pr-4 text-[#486679]">{entryActivityName(e)}</td>
                    <td className="py-3 pr-4 text-center text-[#486679]">{e.participant_count != null ? e.participant_count : '—'}</td>
                    <td className="py-3 pr-4 text-[#486679]">{e.description || '—'}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-[#486679] tabular-nums">{formatDuration(calcNetMs(e))}</td>
                    <td className="py-3 pl-4">
                      {e.stopped_at ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">Beendet</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Läuft</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-[#e4e8eb] flex items-center justify-between">
          <span className="text-sm font-medium text-[#7598AF]">Heute gesamt</span>
          <span className="text-xl font-bold text-[#486679] tabular-nums">{formatDuration(todayTotalMs)}</span>
        </div>
      </div>

      {/* TN modal — shown when stopping a Stundenerfassung entry */}
      {tnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#486679]">Stundenerfassung beenden</h2>
              <button onClick={() => setTnModalOpen(false)} className="text-[#7598AF] hover:text-[#486679] p-1 rounded-lg hover:bg-[#f2f6f8]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-[#7598AF] mb-4">Bitte geben Sie die Anzahl der Teilnehmer (TN) für diese Buchung ein.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#486679] mb-1.5">Anzahl TN</label>
              <input
                type="number"
                min={1}
                step={1}
                className="field"
                value={tnCount}
                onChange={(e) => setTnCount(e.target.value)}
                placeholder="z. B. 12"
                autoFocus
              />
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={handleTnConfirm} disabled={busy} className="primary-button">
                <Square className="h-5 w-5" /> Stop & speichern
              </button>
              <button onClick={() => setTnModalOpen(false)} className="secondary-button">Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
