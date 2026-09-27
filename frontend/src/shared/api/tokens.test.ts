import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {apiRequest} from './client';
import {clearTokens, getRefreshToken, saveTokens} from './tokens';

beforeEach(() => clearTokens());
afterEach(() => {clearTokens(); vi.unstubAllGlobals();});

const pair = {access_token: 'new-access', refresh_token: 'saved-refresh'};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});

describe('persistent token authorization', () => {
  it('restores access from localStorage and never persists access', async () => {
    localStorage.setItem('webstorage.refreshToken', pair.refresh_token);
    const fetchMock = vi.fn().mockResolvedValueOnce(json(pair)).mockResolvedValueOnce(json({username: 'user'}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/auth/session')).resolves.toEqual({username: 'user'});
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/refresh');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer new-access');
    expect(localStorage.getItem('webstorage.refreshToken')).toBe(pair.refresh_token);
    expect(Object.values(localStorage)).not.toContain(pair.access_token);
  });

  it('shares one refresh for parallel expired requests and retries both', async () => {
    saveTokens({access_token: 'old-access', refresh_token: pair.refresh_token});
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return json(pair);
      return new Headers(init.headers).get('Authorization') === 'Bearer old-access'
        ? json({}, 401) : json({ok: true});
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await Promise.all([apiRequest('/materials'), apiRequest('/operations')])).toEqual([{ok: true}, {ok: true}]);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('preserves refresh on network failure', async () => {
    localStorage.setItem('webstorage.refreshToken', pair.refresh_token);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiRequest('/auth/session')).rejects.toThrow('offline');
    expect(getRefreshToken()).toBe(pair.refresh_token);
  });

  it('keeps the saved session if another tab invalidates the renewed access', async () => {
    saveTokens({access_token: 'old-access', refresh_token: pair.refresh_token});
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('/auth/refresh') ? json(pair) : json({}, 401)));
    await expect(apiRequest('/materials')).rejects.toThrow('Сессия обновилась');
    expect(getRefreshToken()).toBe(pair.refresh_token);
  });

  it('clears a rejected refresh without looping', async () => {
    localStorage.setItem('webstorage.refreshToken', pair.refresh_token);
    const fetchMock = vi.fn().mockImplementation(async () => json({}, 401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/auth/session')).rejects.toMatchObject({status: 401});
    expect(getRefreshToken()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not restore tokens when logout occurs during refresh', async () => {
    localStorage.setItem('webstorage.refreshToken', pair.refresh_token);
    let resolveRefresh!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    })).mockResolvedValue(json({}, 401)));
    const request = apiRequest('/auth/session');
    clearTokens();
    resolveRefresh(json(pair));
    await expect(request).rejects.toMatchObject({status: 401});
    expect(getRefreshToken()).toBeNull();
  });
});
