import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Activity, Customer } from '@/types';
import { ListChecks, Plus, Pencil, Check, X } from 'lucide-react';

export default function Activities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: a } = await supabase.from('activities').select('*, customers(id, name)').order('name');
    const { data: c } = await supabase.from('customers').select('*').order('name');
    setActivities((a as Activity[]) ?? []);
    setCustomers((c as Customer[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setName(''); setDescription(''); setCustomerId('');
    setShowForm(true);
  };

  const openEdit = (a: Activity) => {
    setEditing(a);
    setName(a.name); setDescription(a.description); setCustomerId(a.customer_id);
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    if (editing) {
      const { error } = await supabase.from('activities').update({ name, description, customer_id: customerId, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) setError('Speichern fehlgeschlagen.');
    } else {
      const { error } = await supabase.from('activities').insert({ name, description, customer_id: customerId });
      if (error) setError('Anlegen fehlgeschlagen.');
    }
    setBusy(false);
    if (!error) { setShowForm(false); load(); }
  };

  const toggleActive = async (a: Activity) => {
    await supabase.from('activities').update({ active: !a.active, updated_at: new Date().toISOString() }).eq('id', a.id);
    load();
  };

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ListChecks className="h-7 w-7 text-[#7598AF]" />
          <h1 className="text-2xl font-bold text-[#486679]">Tätigkeiten</h1>
        </div>
        <button onClick={openNew} className="primary-button"><Plus className="h-5 w-5" /> Neue Tätigkeit</button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-bold text-[#486679] mb-4">{editing ? 'Tätigkeit bearbeiten' : 'Neue Tätigkeit'}</h2>
          <form onSubmit={save} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#486679] mb-1.5">Kunde</label>
              <select className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                <option value="">— wählen —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#486679] mb-1.5">Tätigkeitsname</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[#486679] mb-1.5">Beschreibung</label>
              <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={busy} className="primary-button"><Check className="h-5 w-5" /> Speichern</button>
              <button type="button" onClick={() => setShowForm(false)} className="secondary-button"><X className="h-5 w-5" /> Abbrechen</button>
              {error && <p className="text-sm text-red-600 self-center">{error}</p>}
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e4e8eb] text-left text-[#7598AF] bg-[#f9fafb]">
              <th className="py-3 px-4 font-medium">Tätigkeit</th>
              <th className="py-3 px-4 font-medium">Kunde</th>
              <th className="py-3 px-4 font-medium">Beschreibung</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} className="border-b border-[#f0f3f5]">
                <td className="py-3 px-4 font-medium text-[#486679]">{a.name}</td>
                <td className="py-3 px-4 text-[#486679]">{a.customers?.name ?? customerName(a.customer_id)}</td>
                <td className="py-3 px-4 text-[#486679]">{a.description || '—'}</td>
                <td className="py-3 px-4">
                  <button onClick={() => toggleActive(a)} className={`text-xs font-medium px-2 py-1 rounded-full transition ${a.active ? 'text-green-700 bg-green-50' : 'text-gray-600 bg-gray-100'}`}>
                    {a.active ? 'Aktiv' : 'Inaktiv'}
                  </button>
                </td>
                <td className="py-3 px-4 text-right">
                  <button onClick={() => openEdit(a)} className="text-[#7598AF] hover:text-[#486679] p-1.5 rounded-lg hover:bg-[#f2f6f8]">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {activities.length === 0 && <p className="p-6 text-sm text-[#7598AF]">Noch keine Tätigkeiten angelegt.</p>}
      </div>
    </div>
  );
}
