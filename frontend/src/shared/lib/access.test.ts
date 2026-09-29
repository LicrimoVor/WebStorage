import {expect, it} from 'vitest';
import {canOpenPath, firstAvailablePath} from './access';

it('limits direct routes as well as navigation and picks an allowed landing page', () => {
  const user = {roles: ['user'] as const, permissions: ['warehouse'] as const};
  const access = {roles: [...user.roles], permissions: [...user.permissions]};
  expect(canOpenPath(access, '/warehouse/receipt')).toBe(true);
  for (const path of ['/finance', '/settings/users', '/settings/audit', '/processes/123', '/production']) expect(canOpenPath(access, path)).toBe(false);
  expect(firstAvailablePath(access)).toBe('/warehouse');
  expect(firstAvailablePath({roles: ['user'], permissions: []})).toBe('/help');
  expect(canOpenPath({roles: ['admin'], permissions: []}, '/settings/users')).toBe(true);
});
