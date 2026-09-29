/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect, it, vi} from 'vitest';

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = {match: vi.fn(), put: vi.fn(), keys: vi.fn().mockResolvedValue([])};
  const caches = {open: vi.fn().mockResolvedValue(cache), match: vi.fn().mockResolvedValue('offline')};
  const fetch = vi.fn();
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {location: {origin: 'https://storage.test'}, addEventListener: (name: string, fn: typeof handlers[string]) => {handlers[name] = fn;}},
    caches, fetch, URL,
  });
  const request = (path: string, mode = 'cors', destination = '', method = 'GET') => {
    const respondWith = vi.fn();
    handlers.fetch({request: {url: `https://storage.test${path}`, mode, destination, method}, respondWith});
    return respondWith;
  };
  return {cache, caches, fetch, request};
}

it('does not intercept API, media, health or write requests', () => {
  const {request, fetch, caches} = worker();
  for (const path of ['/api/v1/auth/session', '/media/photo.jpg', '/health/live']) {
    expect(request(path, 'navigate')).not.toHaveBeenCalled();
  }
  expect(request('/assets/app.js', 'cors', 'script', 'POST')).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(caches.open).not.toHaveBeenCalled();
});

it('shows offline fallback only when navigation cannot reach the network', async () => {
  const {request, fetch, cache} = worker();
  fetch.mockRejectedValueOnce(new Error('offline'));
  await expect(request('/warehouse', 'navigate').mock.calls[0][0]).resolves.toBe('offline');
  fetch.mockResolvedValueOnce('server response');
  await expect(request('/warehouse', 'navigate').mock.calls[0][0]).resolves.toBe('server response');
  expect(cache.put).not.toHaveBeenCalled();
});

it('serves cached static assets without a network request', async () => {
  const {request, cache, fetch} = worker();
  cache.match.mockResolvedValueOnce('cached script');
  await expect(request('/assets/app-123.js', 'cors', 'script').mock.calls[0][0]).resolves.toBe('cached script');
  expect(fetch).not.toHaveBeenCalled();
});

it('still serves assets if the cache is full', async () => {
  const {request, cache, fetch} = worker();
  const response = {ok: true, headers: new Headers({'content-type': 'text/javascript'}), clone: () => 'copy'};
  fetch.mockResolvedValueOnce(response);
  cache.put.mockRejectedValueOnce(new Error('quota'));
  await expect(request('/assets/app-123.js', 'cors', 'script').mock.calls[0][0]).resolves.toBe(response);
});
