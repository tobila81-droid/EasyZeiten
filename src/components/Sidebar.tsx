import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Clock, Users, Building2, ListChecks, BarChart3, Settings, LogOut } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/tracking', label: 'Zeiterfassung', icon: Clock, adminOnly: false },
  { to: '/employees', label: 'Mitarbeiter', icon: Users, adminOnly: true },
  { to: '/customers', label: 'Kunden', icon: Building2, adminOnly: true },
  { to: '/activities', label: 'Tätigkeiten', icon: ListChecks, adminOnly: true },
  { to: '/reports', label: 'Auswertungen', icon: BarChart3, adminOnly: false },
  { to: '/settings', label: 'Einstellungen', icon: Settings, adminOnly: false },
];

export default function Sidebar() {
  const { role, signOut } = useAuth();
  const location = useLocation();
  const isAdmin = role === 'ADMIN';

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-[#e4e8eb] flex flex-col h-screen sticky top-0">
      <div className="px-6 py-5 border-b border-[#e4e8eb]">
        <img src="/assets/images/easypayroll_4c.png" alt="Easy Payroll" className="h-10 w-auto" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  active ? 'bg-[#7598AF] text-white shadow-sm' : 'text-[#486679] hover:bg-[#f2f6f8]'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
      </nav>

      <div className="px-3 py-4 border-t border-[#e4e8eb]">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#486679] hover:bg-[#f2f6f8] w-full transition"
        >
          <LogOut className="h-5 w-5" />
          Abmelden
        </button>
      </div>
    </aside>
  );
}
