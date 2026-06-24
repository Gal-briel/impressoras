import type { ReactNode } from 'react';
import { QueryProvider } from './QueryProvider';
import { AuthBootstrap } from './AuthBootstrap';
import { ThemeProvider } from './ThemeProvider';
import { WebSocketProvider } from '../websocket/WebSocketProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthBootstrap>
          <WebSocketProvider>{children}</WebSocketProvider>
        </AuthBootstrap>
      </QueryProvider>
    </ThemeProvider>
  );
}
