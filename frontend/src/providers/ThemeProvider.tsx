import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useThemeStore } from '../stores/themeStore';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}
