import {useEffect} from 'react';
import {paletteCss, useAppearance} from '@/entities/Auth/appearance';

export function PersonalAppearance({username}: {username: string}) {
  const query = useAppearance(username);
  useEffect(() => {
    if (!query.data) return;
    const style = document.createElement('style');
    style.textContent = paletteCss(query.data);
    document.head.append(style);
    return () => style.remove();
  }, [query.data]);
  return null;
}
