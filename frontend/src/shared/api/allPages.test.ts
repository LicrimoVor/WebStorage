import {describe, expect, it, vi} from 'vitest';
import {allPages} from './allPages';

describe('allPages', () => {
  it('includes catalog entries beyond the first hundred and stops at the last page', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: page === 1 ? Array.from({length: 100}, (_, i) => i) : [100, 101],
      pages: 2, total: 102,
    }));
    const result = await allPages(fetchPage);
    expect(result.items).toHaveLength(102);
    expect(result.items.at(-1)).toBe(101);
    expect(fetchPage.mock.calls).toEqual([[1], [2]]);
  });
  it('fails the catalog as a whole if a later page fails', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({items: ['first'], pages: 2})
      .mockRejectedValueOnce(new Error('second page failed'));
    await expect(allPages(fetchPage)).rejects.toThrow('second page failed');
  });

  it('loads at most four pages at a time and preserves page order', async () => {
    const complete = new Map<number, () => void>();
    const fetchPage = vi.fn((page: number) => page === 1
      ? Promise.resolve({items: [1], pages: 7, total: 7})
      : new Promise<{items: number[]; pages: number; total: number}>((resolve) => {
        complete.set(page, () => resolve({items: [page], pages: 7, total: 7}));
      }));
    const pending = allPages(fetchPage);
    await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(5));
    for (const page of [5, 4, 3]) complete.get(page)!();
    await Promise.resolve();
    expect(fetchPage).toHaveBeenCalledTimes(5);
    complete.get(2)!();
    await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(7));
    complete.get(7)!();
    complete.get(6)!();
    await expect(pending).resolves.toEqual({items: [1, 2, 3, 4, 5, 6, 7], pages: 7, total: 7});
  });

  it('does not start more batches after a page fails', async () => {
    const fetchPage = vi.fn(async (page: number) => {
      if (page === 3) throw new Error('page failed');
      return {items: [page], pages: 10};
    });
    await expect(allPages(fetchPage)).rejects.toThrow('page failed');
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3, 4, 5]);
  });
});
