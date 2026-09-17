import {afterEach, describe, expect, it, vi} from 'vitest';

import {apiRequest} from './client';

afterEach(() => vi.unstubAllGlobals());

describe('API error handling', () => {
  it.each([null, [], {detail: []}, 'upstream unavailable'])('handles malformed JSON: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {status: 502})));
    await expect(apiRequest('/materials')).rejects.toMatchObject({
      name: 'ApiError', status: 502, code: 'transport_error',
    });
  });

  it('preserves the HTTP status instead of trusting the error payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 200, code: 'conflict', detail: 'Запись изменена', fields: [null, {name: 'revision'}],
    }), {status: 409})));
    await expect(apiRequest('/materials')).rejects.toMatchObject({
      status: 409, code: 'conflict', message: 'Запись изменена', fields: [{name: 'revision'}],
    });
  });

  it('handles an HTML response from a proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', {status: 502})));
    await expect(apiRequest('/materials')).rejects.toMatchObject({status: 502, code: 'transport_error'});
  });

  it('only notifies session expiration for business requests', async () => {
    const listener = vi.fn();
    window.addEventListener('webstorage:unauthorized', listener);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(null, {status: 401}))));
    try {
      await expect(apiRequest('/auth/login')).rejects.toMatchObject({status: 401});
      await expect(apiRequest('/auth/session')).rejects.toMatchObject({status: 401});
      expect(listener).not.toHaveBeenCalled();
      await expect(apiRequest('/materials')).rejects.toMatchObject({status: 401});
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('webstorage:unauthorized', listener);
    }
  });
});
