import { Outlet } from 'react-router-dom';
import { Header } from '../components/navigation/Header';
import { Sidebar } from '../components/navigation/Sidebar';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Header />
          <main className="p-4 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
