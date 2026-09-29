import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#f6f7f8]">
      <h1 className="text-4xl font-bold text-[#486679] mb-2">404</h1>
      <p className="text-[#7598AF] mb-6">Seite nicht gefunden.</p>
      <Link to="/" className="primary-button">Zum Dashboard</Link>
    </div>
  );
}
