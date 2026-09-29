import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import LoginPage from '@/pages/LoginPage';
import AppLayout from '@/components/AppLayout';

function Gate() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f8]">
        <div className="text-[#7598AF] text-sm">Laden …</div>
      </div>
    );
  }
  if (!session) return <LoginPage />;
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
