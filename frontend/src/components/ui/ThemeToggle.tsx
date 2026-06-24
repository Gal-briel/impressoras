import { useThemeStore } from '../../stores/themeStore';
import { Button } from './Button';

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  return <Button variant="secondary" onClick={toggleTheme}>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</Button>;
}
