import { Routes, Route } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/pages/Dashboard';
import Tracking from '@/pages/Tracking';
import Employees from '@/pages/Employees';
import Customers from '@/pages/Customers';
import Activities from '@/pages/Activities';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/NotFound';

export default function AppLayout() {
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';

  return (
    <div className="flex min-h-screen bg-[#f6f7f8]">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tracking" element={<Tracking />} />
          {isAdmin && <Route path="/employees" element={<Employees />} />}
          {isAdmin && <Route path="/customers" element={<Customers />} />}
          {isAdmin && <Route path="/activities" element={<Activities />} />}
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
