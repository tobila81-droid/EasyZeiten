import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types';
import { UserCog, Shield, CheckCircle2, XCircle } from 'lucide-react';

export default function Employees() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const { data: p } = await supabase.from('profiles').select('*').order('created_at');
    const { data: r } = await supabase.from('user_roles').select('user_id, role');
    const roleMap: Record<string, Role> = {};
    (r ?? []).forEach((row: { user_id: string; role: Role }) => { roleMap[row.user_id] = row.role; });
    setProfiles((p as Profile[]) ?? []);
    setRoles(roleMap);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (id: string, active: boolean) => {
    setBusy(id);
    const { error } = await supabase.rpc('admin_set_user_status', { p_user_id: id, p_active: !active });
    setBusy(null);
    if (error) { setError('Status konnte nicht geändert werden.'); return; }
    load();
  };

  const changeRole = async (id: string, role: Role) => {
    setBusy(id);
    const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: id, p_role: role });
    setBusy(null);
    if (error) { setError('Rolle konnte nicht geändert werden.'); return; }
    load();
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <UserCog className="h-7 w-7 text-[#7598AF]" />
        <h1 className="text-2xl font-bold text-[#486679]">Mitarbeiter</h1>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e4e8eb] text-left text-[#7598AF] bg-[#f9fafb]">
              <th className="py-3 px-4 font-medium">Name</th>
              <th className="py-3 px-4 font-medium">E-Mail</th>
              <th className="py-3 px-4 font-medium">Rolle</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b border-[#f0f3f5]">
                <td className="py-3 px-4 font-medium text-[#486679]">{p.display_name || '—'}</td>
                <td className="py-3 px-4 text-[#486679]">{p.email}</td>
                <td className="py-3 px-4">
                  <select
                    value={roles[p.id] ?? 'EMPLOYEE'}
                    onChange={(e) => changeRole(p.id, e.target.value as Role)}
                    disabled={busy === p.id}
                    className="rounded-lg border border-[#d8e0e5] px-3 py-1.5 text-sm text-[#486679] outline-none focus:border-[#7598AF]"
                  >
                    <option value="EMPLOYEE">Bediener</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </td>
                <td className="py-3 px-4">
                  {p.active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aktiv
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                      <XCircle className="h-3.5 w-3.5" /> Inaktiv
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => toggleActive(p.id, p.active)}
                    disabled={busy === p.id}
                    className={`text-sm font-medium px-3 py-1.5 rounded-lg transition ${
                      p.active ? 'text-red-600 hover:bg-red-50' : 'text-green-700 hover:bg-green-50'
                    }`}
                  >
                    {p.active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {profiles.length === 0 && <p className="p-6 text-sm text-[#7598AF]">Noch keine Mitarbeiter registriert.</p>}
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs text-[#9baab3]">
        <Shield className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Rollen und Status werden serverseitig über Supabase RLS geprüft. Der erste registrierte Benutzer wird automatisch zum Administrator.</p>
      </div>
    </div>
  );
}
