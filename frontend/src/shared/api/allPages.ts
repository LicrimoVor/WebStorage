const PAGE_CONCURRENCY = 4;

/** Fetch every page before exposing a catalog used for local filtering. */
export async function allPages<T extends {items: unknown[]; pages: number}>(
  fetchPage: (page: number) => Promise<T>,
): Promise<T> {
  const first = await fetchPage(1);
  const items = [...first.items];
  for (let page = 2; page <= first.pages; page += PAGE_CONCURRENCY) {
    // Bound API load and retain server ordering even if responses arrive out of order.
    const count = Math.min(PAGE_CONCURRENCY, first.pages - page + 1);
    const batch = await Promise.all(
      Array.from({length: count}, (_, index) => fetchPage(page + index)),
    );
    for (const next of batch) items.push(...next.items);
  }
  return {...first, items};
}
