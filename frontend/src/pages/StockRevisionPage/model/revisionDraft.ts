export interface RevisionDraft {
  values: Record<string, string>;
  comment: string;
  updatedAt: string;
}

const DATABASE_NAME = 'webstorage-stock-revision';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'active';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const database = await openDatabase();
  if (!database) return undefined;
  return new Promise<T>((resolve, reject) => {
    const request = action(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function loadRevisionDraft() {
  return (await transaction('readonly', (store) => store.get(DRAFT_KEY))) as
    | RevisionDraft
    | undefined;
}

export async function saveRevisionDraft(values: Record<string, string>, comment: string) {
  await transaction('readwrite', (store) =>
    store.put(
      {values, comment, updatedAt: new Date().toISOString()} satisfies RevisionDraft,
      DRAFT_KEY,
    ),
  );
}

export async function deleteRevisionDraft() {
  await transaction('readwrite', (store) => store.delete(DRAFT_KEY));
}
