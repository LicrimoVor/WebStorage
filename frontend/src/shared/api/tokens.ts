import {API_URL} from '@/shared/config';

const storageKey = 'webstorage.refreshToken';
let accessToken: string | null = null;
let revision = 0;
let refreshing: Promise<void> | undefined;

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export function getRefreshToken() {
  return localStorage.getItem(storageKey);
}

export function saveTokens(pair: TokenPair) {
  localStorage.setItem(storageKey, pair.refresh_token);
  accessToken = pair.access_token;
  revision += 1;
}

export function clearTokens() {
  accessToken = null;
  revision += 1;
  localStorage.removeItem(storageKey);
}

window.addEventListener('storage', (event) => {
  if (event.key === storageKey || event.key === null) {
    accessToken = null;
    revision += 1;
    window.dispatchEvent(new Event('webstorage:unauthorized'));
  }
});

async function refreshTokens() {
  if (refreshing) return refreshing;
  const token = getRefreshToken();
  if (!token) return;
  const started = revision;
  refreshing = (async () => {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST', credentials: 'omit',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refresh_token: token}),
    });
    if (revision !== started) return;
    if (response.status === 401) {
      clearTokens();
      return;
    }
    if (!response.ok) throw new Error('Не удалось обновить сессию. Повторите попытку.');
    const pair = await response.json() as TokenPair;
    if (revision === started && getRefreshToken() === token) saveTokens(pair);
  })().finally(() => {refreshing = undefined;});
  return refreshing;
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const publicRequest = ['/auth/login', '/auth/refresh', '/auth/logout'].includes(path);
  if (!publicRequest && !accessToken && getRefreshToken()) await refreshTokens();
  let requestRevision = revision;
  const request = () => {
    requestRevision = revision;
    const headers = new Headers(init.headers);
    if (accessToken && !publicRequest) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`${API_URL}${path}`, {...init, credentials: 'omit', headers});
  };
  const usedToken = accessToken;
  let response = await request();
  if (response.status === 401 && !publicRequest && getRefreshToken()) {
    // Parallel failed requests share one refresh; late responses use the new token.
    if (usedToken === accessToken) await refreshTokens();
    response = await request();
  }
  if (response.status === 401 && !publicRequest && requestRevision === revision) {
    // Another tab can refresh the same session while this request is in flight.
    // Only rejection by /auth/refresh proves the saved session has expired.
    if (getRefreshToken()) {
      accessToken = null;
      revision += 1;
      throw new Error('Сессия обновилась в другой вкладке. Повторите запрос.');
    }
    clearTokens();
    if (path !== '/auth/session') window.dispatchEvent(new Event('webstorage:unauthorized'));
  }
  return response;
}
