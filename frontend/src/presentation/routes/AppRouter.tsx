// frontend/src/presentation/routes/AppRouter.tsx
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { RequireAuth } from '../components/Guard/RequireAuth';
import { AgentsPage } from '../pages/Agents/AgentsPage';

// Componentes Mock para rotas não implementadas no snippet
const Login = () => <div>Login Page</div>;
const Dashboard = () => <div>Dashboard Page</div>;
const Layout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-screen w-screen overflow-hidden">
    <aside className="w-64 bg-slate-900 text-white p-4">Sidebar</aside>
    <main className="flex-1 overflow-hidden">{children}</main>
  </div>
);

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: '/dashboard',
        element: <Layout><Dashboard /></Layout>,
      },
      {
        path: '/agents',
        element: <RequireAuth requiredPermission="agents:read" />,
        children: [
          {
            path: '',
            element: <Layout><AgentsPage /></Layout>,
          }
        ]
      }
    ],
  },
]);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};