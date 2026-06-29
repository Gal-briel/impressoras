import { Outlet, useNavigate } from 'react-router-dom';

import { Header } from '../components/navigation/Header';
import { Sidebar } from '../components/navigation/Sidebar';

export function MainLayout() {
  const navigate = useNavigate();

  function logout() {
    localStorage.clear();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <Sidebar />

        <section className="min-h-screen flex-1">
          <Header onLogout={logout} />

          <main className="mx-auto w-full max-w-7xl px-6 py-8">
            <Outlet />
          </main>
        </section>
      </div>
    </div>
  );
}
