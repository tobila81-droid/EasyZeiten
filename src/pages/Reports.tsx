import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { TimeEntry, Profile, Customer, Activity } from '@/types';
import { formatDuration, formatDateTime, calcNetMs, startOfWeek, startOfMonth, isToday } from '@/lib/time';
import { BarChart3, Calendar, Users, Building2, ListChecks, Download, Filter, GraduationCap } from 'lucide-react';

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function escapeCsvCell(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface StundenerfassungRow {
  customer: string;
  tn: number | null;
  time: number;
  operator?: string;
}

export default function Reports() {
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(toInputDate(startOfMonth()));
  const [toDate, setToDate] = useState(toInputDate(new Date()));
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('time_entries')
      .select('*, activities(id, name, customers(id, name)), customers(id, name), time_entry_pauses(*)');
    if (!isAdmin && user) query = query.eq('user_id', user.id);
    if (employeeFilter !== 'all') query = query.eq('user_id', employeeFilter);
    if (customerFilter !== 'all') query = query.eq('customer_id', customerFilter);
    if (activityFilter !== 'all') query = query.eq('activity_id', activityFilter);
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    query = query.gte('started_at', from.toISOString()).lte('started_at', to.toISOString());
    query = query.order('started_at', { ascending: false });
    const { data, error } = await query;
    if (error) {
      console.error('Reports query error:', error.message);
    }
    setEntries((data as TimeEntry[]) ?? []);
    setLoading(false);
  }, [isAdmin, user, employeeFilter, customerFilter, activityFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAdmin) {
      (async () => {
        const { data: p } = await supabase.from('profiles').select('*').order('display_name');
        setProfiles((p as Profile[]) ?? []);
      })();
    }
    (async () => {
      const { data: c } = await supabase.from('customers').select('*').order('name');
      setCustomers((c as Customer[]) ?? []);
      const { data: a } = await supabase.from('activities').select('*').order('name');
      setActivities((a as Activity[]) ?? []);
    })();
  }, [isAdmin]);

  const todayMs = entries.filter((e) => isToday(e.started_at)).reduce((s, e) => s + calcNetMs(e), 0);
  const weekStart = startOfWeek();
  const weekMs = entries.filter((e) => new Date(e.started_at) >= weekStart).reduce((s, e) => s + calcNetMs(e), 0);
  const monthStart = startOfMonth();
  const monthMs = entries.filter((e) => new Date(e.started_at) >= monthStart).reduce((s, e) => s + calcNetMs(e), 0);

  const entryCustomerName = (e: TimeEntry) => e.activities?.customers?.name ?? e.customers?.name ?? '—';
  const entryActivityName = (e: TimeEntry) => e.activities?.name ?? e.activity_name ?? '—';

  const byCustomer = new Map<string, number>();
  const byActivity = new Map<string, number>();
  const byEmployee = new Map<string, number>();
  const byCustomerEmployee = new Map<string, number>();
  const byActivityEmployee = new Map<string, number>();

  const stundenRows: StundenerfassungRow[] = [];

  entries.forEach((e) => {
    const net = calcNetMs(e);
    const cName = entryCustomerName(e);
    const aName = entryActivityName(e);
    byCustomer.set(cName, (byCustomer.get(cName) ?? 0) + net);
    byActivity.set(aName, (byActivity.get(aName) ?? 0) + net);
    byEmployee.set(e.user_id, (byEmployee.get(e.user_id) ?? 0) + net);

    if (isAdmin) {
      const ceKey = `${cName} · ${profileName(e.user_id)}`;
      byCustomerEmployee.set(ceKey, (byCustomerEmployee.get(ceKey) ?? 0) + net);
      const aeKey = `${aName} · ${profileName(e.user_id)}`;
      byActivityEmployee.set(aeKey, (byActivityEmployee.get(aeKey) ?? 0) + net);
    }

    if (aName.toLowerCase() === 'stundenerfassung') {
      const existing = stundenRows.find(
        (r) => r.customer === cName && r.tn === e.participant_count && (isAdmin ? r.operator === profileName(e.user_id) : true)
      );
      if (existing) {
        existing.time += net;
      } else {
        stundenRows.push({ customer: cName, tn: e.participant_count, time: net, operator: isAdmin ? profileName(e.user_id) : undefined });
      }
    }
  });

  function profileName(id: string): string {
    return profiles.find((p) => p.id === id)?.display_name ?? id.slice(0, 8);
  }

  const exportCsv = () => {
    const headers = isAdmin
      ? ['Datum', 'Beginn', 'Ende', 'Bediener', 'Kunde', 'Tätigkeit', 'TN', 'Beschreibung', 'Nettozeit']
      : ['Datum', 'Beginn', 'Ende', 'Kunde', 'Tätigkeit', 'TN', 'Beschreibung', 'Nettozeit'];
    const rows = entries.map((e) => {
      const base = [
        new Date(e.started_at).toLocaleDateString('de-DE'),
        formatDateTime(e.started_at),
        e.stopped_at ? formatDateTime(e.stopped_at) : '—',
      ];
      if (isAdmin) base.push(profileName(e.user_id));
      base.push(entryCustomerName(e), entryActivityName(e));
      base.push(e.participant_count != null ? String(e.participant_count) : '—');
      base.push(e.description || '—');
      base.push(formatDuration(calcNetMs(e)));
      return base;
    });
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(';'))
      .join('\r\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Auswertung_${fromDate}_bis_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { label: 'Heute', value: todayMs },
    { label: 'Diese Woche', value: weekMs },
    { label: 'Dieser Monat', value: monthMs },
  ];

  const renderList = (title: string, Icon: React.ElementType, map: Map<string, number>) => (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-[#7598AF]" />
        <h3 className="font-bold text-[#486679]">{title}</h3>
      </div>
      {map.size === 0 ? <p className="text-sm text-[#7598AF]">Keine Daten.</p> : (
        <div className="space-y-2">
          {Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([key, ms]) => (
            <div key={key} className="flex justify-between items-center py-2 border-b border-[#f0f3f5] last:border-0">
              <span className="text-sm text-[#486679]">{key}</span>
              <span className="text-sm font-semibold text-[#486679] tabular-nums">{formatDuration(ms)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-7 w-7 text-[#7598AF]" />
        <h1 className="text-2xl font-bold text-[#486679]">Auswertungen</h1>
      </div>

      {/* Filter bar */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-[#7598AF]" />
          <span className="text-sm font-semibold text-[#486679]">Filter</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#7598AF] mb-1.5">Von</label>
            <input type="date" className="field" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7598AF] mb-1.5">Bis</label>
            <input type="date" className="field" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7598AF] mb-1.5">Kunde</label>
            <select className="field" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
              <option value="all">Alle Kunden</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#7598AF] mb-1.5">Tätigkeit</label>
            <select className="field" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
              <option value="all">Alle Tätigkeiten</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-[#7598AF] mb-1.5">Bediener</label>
              <select className="field" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
                <option value="all">Alle Bediener</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name || p.email}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button onClick={exportCsv} disabled={entries.length === 0} className="secondary-button w-full">
              <Download className="h-5 w-5" /> Excel-Export (CSV)
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#7598AF]">Daten werden geladen …</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            {statCards.map((s) => (
              <div key={s.label} className="card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-[#7598AF]" />
                  <span className="text-sm text-[#7598AF]">{s.label}</span>
                </div>
                <div className="text-3xl font-bold text-[#486679] tabular-nums">{formatDuration(s.value)}</div>
              </div>
            ))}
          </div>

          {/* Summary lists */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {renderList('Zeit pro Kunde', Building2, byCustomer)}
            {renderList('Zeit pro Tätigkeit', ListChecks, byActivity)}
            {isAdmin && renderList('Zeit pro Bediener', Users, byEmployee)}
            {isAdmin && renderList('Zeit pro Kunde und Bediener', Building2, byCustomerEmployee)}
            {isAdmin && renderList('Zeit pro Tätigkeit und Bediener', ListChecks, byActivityEmployee)}
          </div>

          {/* Stundenerfassung statistics */}
          {stundenRows.length > 0 && (
            <div className="card p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="h-5 w-5 text-[#7598AF]" />
                <h3 className="font-bold text-[#486679]">Stundenerfassung – Statistik</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e4e8eb] text-left text-[#7598AF]">
                      <th className="py-2 pr-4 font-medium">Kunde</th>
                      <th className="py-2 pr-4 font-medium text-center">TN</th>
                      <th className="py-2 pr-4 font-medium text-right">Zeit</th>
                      {isAdmin && <th className="py-2 pl-4 font-medium">Bediener</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {stundenRows.map((r, i) => (
                      <tr key={i} className="border-b border-[#f0f3f5]">
                        <td className="py-3 pr-4 text-[#486679]">{r.customer}</td>
                        <td className="py-3 pr-4 text-center text-[#486679]">{r.tn ?? '—'}</td>
                        <td className="py-3 pr-4 text-right font-semibold text-[#486679] tabular-nums">{formatDuration(r.time)}</td>
                        {isAdmin && <td className="py-3 pl-4 text-[#486679]">{r.operator ?? '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detailed entries table */}
          <div className="card overflow-hidden">
            <h2 className="text-lg font-bold text-[#486679] px-6 pt-5 pb-3">Einzelbuchungen ({entries.length})</h2>
            {entries.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-[#7598AF]">Keine Buchungen im gewählten Zeitraum.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e4e8eb] text-left text-[#7598AF] bg-[#f9fafb]">
                      <th className="py-3 px-4 font-medium">Datum</th>
                      <th className="py-3 px-4 font-medium">Beginn</th>
                      <th className="py-3 px-4 font-medium">Ende</th>
                      {isAdmin && <th className="py-3 px-4 font-medium">Bediener</th>}
                      <th className="py-3 px-4 font-medium">Kunde</th>
                      <th className="py-3 px-4 font-medium">Tätigkeit</th>
                      <th className="py-3 px-4 font-medium text-center">TN</th>
                      <th className="py-3 px-4 font-medium">Beschreibung</th>
                      <th className="py-3 px-4 font-medium text-right">Nettozeit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b border-[#f0f3f5]">
                        <td className="py-3 px-4 text-[#486679]">{new Date(e.started_at).toLocaleDateString('de-DE')}</td>
                        <td className="py-3 px-4 text-[#486679]">{formatDateTime(e.started_at)}</td>
                        <td className="py-3 px-4 text-[#486679]">{e.stopped_at ? formatDateTime(e.stopped_at) : '—'}</td>
                        {isAdmin && <td className="py-3 px-4 text-[#486679]">{profileName(e.user_id)}</td>}
                        <td className="py-3 px-4 text-[#486679]">{entryCustomerName(e)}</td>
                        <td className="py-3 px-4 text-[#486679]">{entryActivityName(e)}</td>
                        <td className="py-3 px-4 text-center text-[#486679]">{e.participant_count != null ? e.participant_count : '—'}</td>
                        <td className="py-3 px-4 text-[#486679]">{e.description || '—'}</td>
                        <td className="py-3 px-4 text-right font-semibold text-[#486679] tabular-nums">{formatDuration(calcNetMs(e))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
