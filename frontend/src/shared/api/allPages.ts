/** Fetch every page before exposing a catalog used for local filtering. */
export async function allPages<T extends {items: unknown[]; pages: number}>(
  fetchPage: (page: number) => Promise<T>,
): Promise<T> {
  const first = await fetchPage(1);
  const items = [...first.items];
  for (let page = 2; page <= first.pages; page += 1) {
    const next = await fetchPage(page);
    items.push(...next.items);
  }
  return {...first, items};
}
