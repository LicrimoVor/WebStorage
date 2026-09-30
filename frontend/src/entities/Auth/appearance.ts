import {useQuery} from '@tanstack/react-query';
import {apiRequest} from '@/shared/api';

export interface Palette {accent: string; link: string; background: string; surface: string}
export interface Appearance {light: Palette | null; dark: Palette | null}
export const palettes: Record<'light' | 'dark', Palette> = {
  light: {accent: '#ffbe5c', link: '#916b32', background: '#fafafa', surface: '#ffffff'},
  dark: {accent: '#ffbe5c', link: '#ffce85', background: '#101217', surface: '#1b1e25'},
};
export const appearanceKey = (username: string) => ['appearance', username] as const;
export function useAppearance(username: string) {
  return useQuery({queryKey: appearanceKey(username), queryFn: () => apiRequest<Appearance>('/auth/appearance'), enabled: Boolean(username)});
}
function contrast(hex: string) {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722 > .179 ? '#17191c' : '#ffffff';
}
export function paletteCss(settings: Appearance) {
  return (['light', 'dark'] as const).map((theme) => {
    const p = settings[theme];
    if (!p || !Object.values(p).every((value) => /^#[\da-f]{6}$/i.test(value))) return '';
    const text = contrast(p.background);
    return `.g-root.g-root_theme_${theme} {
      --g-color-base-brand: ${p.accent}; --g-color-base-brand-hover: color-mix(in srgb, ${p.accent} 85%, ${text});
      --g-color-line-brand: ${p.accent}; --g-color-text-brand: ${p.accent};
      --g-color-text-brand-heavy: ${p.accent};
      --g-color-text-link: ${p.link}; --g-color-text-link-hover: ${p.link};
      --g-color-text-brand-contrast: ${contrast(p.accent)};
      --g-color-base-selection: color-mix(in srgb, ${p.accent} 20%, transparent);
      --g-color-base-selection-hover: color-mix(in srgb, ${p.accent} 30%, transparent);
      --g-color-base-background: ${p.background}; --g-color-base-float: ${p.surface};
      --g-color-base-modal: ${p.surface};
      --g-color-base-simple-hover: color-mix(in srgb, ${text} 8%, transparent);
      --g-color-base-generic: color-mix(in srgb, ${text} 6%, ${p.surface});
      --g-color-base-generic-hover: color-mix(in srgb, ${text} 12%, ${p.surface});
      --g-color-line-generic: color-mix(in srgb, ${text} 18%, transparent);
      --g-color-text-primary: ${text};
      --g-color-text-secondary: color-mix(in srgb, ${text} 70%, transparent);
      --g-color-text-hint: color-mix(in srgb, ${text} 55%, transparent);
    }
    .g-root.g-root_theme_${theme} :is(.g-modal__content, .g-popup, .g-card_view_outlined, [data-personal-panel]) {
      background-color: ${p.surface};
      --g-color-text-primary: ${contrast(p.surface)};
      --g-color-text-secondary: color-mix(in srgb, ${contrast(p.surface)} 70%, transparent);
      --g-color-text-hint: color-mix(in srgb, ${contrast(p.surface)} 55%, transparent);
      color: var(--g-color-text-primary);
    }`;
  }).join('\n');
}
