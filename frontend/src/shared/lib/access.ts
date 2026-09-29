import type {AuthSession} from '@/entities/Auth';

export const sections = [
  {id: 'planning', title: 'Планирование', path: '/production-plans'},
  {id: 'processes', title: 'Техпроцессы', path: '/processes'},
  {id: 'warehouse', title: 'Склад', path: '/warehouse'},
  {id: 'operations', title: 'Операции', path: '/operations'},
  {id: 'personnel', title: 'Персонал', path: '/personnel'},
  {id: 'repairs', title: 'Ремонт', path: '/repairs'},
  {id: 'sales', title: 'Продажа продукции', path: '/sales'},
  {id: 'finance', title: 'Финансы', path: '/finance'},
] as const;
export type Section = typeof sections[number]['id'];
export type Access = Pick<AuthSession, 'roles' | 'permissions'>;
export const isAdmin = (access: Access) => access.roles.includes('admin');
export function canAccess(access: Access, section: Section) {
  if (isAdmin(access)) return true;
  if (access.permissions) return access.permissions.includes(section);
  const legacy: Record<string, readonly Section[]> = {
    production: ['planning', 'processes', 'operations', 'repairs'],
    warehouse: ['warehouse', 'repairs'], finance: ['finance', 'sales', 'personnel'],
    manager: sections.map((item) => item.id),
  };
  return access.roles.some((role) => legacy[role]?.includes(section));
}
export function canOpenPath(access: Access, pathname: string) {
  if (pathname.startsWith('/settings/audit') || pathname.startsWith('/settings/users')) return isAdmin(access);
  if (pathname === '/settings') return isAdmin(access) || canAccess(access, 'finance');
  if (pathname === '/analytics') return canAccess(access, 'finance');
  if (pathname === '/production') return canAccess(access, 'planning');
  if (pathname === '/procurement') return canAccess(access, 'warehouse');
  if (pathname === '/audit') return isAdmin(access);
  const section = sections.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  return !section || canAccess(access, section.id);
}
export const firstAvailablePath = (access: Access) => sections.find((item) => canAccess(access, item.id))?.path ?? '/help';
