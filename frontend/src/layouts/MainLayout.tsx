import { Outlet } from 'react-router-dom';
import { Header } from '../components/navigation/Header';
import { Sidebar } from '../components/navigation/Sidebar';

export function MainLayout() {
  return (
    <div className="app-shell-bg min-h-screen">
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Header />
          <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
