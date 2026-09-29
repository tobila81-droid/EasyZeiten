import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Customer } from '@/types';
import { Building2, Plus, Pencil, Check, X } from 'lucide-react';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('customers').select('*').order('name');
    setCustomers((data as Customer[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setName('');
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    if (editing) {
      const { error } = await supabase.from('customers').update({ name, updated_at: new Date().toISOString() }).eq('id', editing.id);
      if (error) setError('Speichern fehlgeschlagen.');
    } else {
      const { error } = await supabase.from('customers').insert({ name });
      if (error) setError('Anlegen fehlgeschlagen.');
    }
    setBusy(false);
    if (!error) {
      setShowForm(false);
      load();
    }
  };

  const toggleActive = async (c: Customer) => {
    await supabase.from('customers').update({ active: !c.active, updated_at: new Date().toISOString() }).eq('id', c.id);
    load();
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-[#7598AF]" />
          <h1 className="text-2xl font-bold text-[#486679]">Kunden</h1>
        </div>
        <button onClick={openNew} className="primary-button"><Plus className="h-5 w-5" /> Neuer Kunde</button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-bold text-[#486679] mb-4">{editing ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h2>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#486679] mb-1.5">Kundenname</label>
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex gap-2">
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
              <th className="py-3 px-4 font-medium">Kundenname</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-[#f0f3f5]">
                <td className="py-3 px-4 font-medium text-[#486679]">{c.name}</td>
                <td className="py-3 px-4">
                  <button onClick={() => toggleActive(c)} className={`text-xs font-medium px-2 py-1 rounded-full transition ${c.active ? 'text-green-700 bg-green-50' : 'text-gray-600 bg-gray-100'}`}>
                    {c.active ? 'Aktiv' : 'Inaktiv'}
                  </button>
                </td>
                <td className="py-3 px-4 text-right">
                  <button onClick={() => openEdit(c)} className="text-[#7598AF] hover:text-[#486679] p-1.5 rounded-lg hover:bg-[#f2f6f8]">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <p className="p-6 text-sm text-[#7598AF]">Noch keine Kunden angelegt.</p>}
      </div>
    </div>
  );
}
