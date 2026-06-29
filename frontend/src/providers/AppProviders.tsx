import { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { NotificationsContainer } from '../features/notifications/NotificationsContainer';
import { NotificationsProvider } from '../features/notifications/NotificationsProvider';
import { RealtimeProvider } from '../features/realtime/RealtimeProvider';
import { QueryProvider } from './QueryProvider';

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <BrowserRouter>
      <QueryProvider>
        <NotificationsProvider>
          <RealtimeProvider>
            {children}
            <NotificationsContainer />
          </RealtimeProvider>
        </NotificationsProvider>
      </QueryProvider>
    </BrowserRouter>
  );
}
