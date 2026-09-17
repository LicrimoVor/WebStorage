import { Moon, Sun } from '@gravity-ui/icons';
import { Button, Icon } from '@gravity-ui/uikit';
import { useContext } from 'react';

import { ThemeContext } from './themeContext';
export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  const label = theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему';
  return (
    <Button view="flat" onClick={toggle} aria-label={label} title={label}>
      <Icon data={theme === 'light' ? Moon : Sun} size={18} />
    </Button>
  );
}
