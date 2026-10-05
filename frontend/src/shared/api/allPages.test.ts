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
});
