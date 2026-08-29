import {API_URL} from '@/shared/config';

import type {ExportDataset, ExportParams} from '../model/types';

const fallbackFilename = 'export.xlsx';

function buildQuery(params: ExportParams): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, String(item)));
    } else {
      query.set(key, String(value));
    }
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function responseFilename(response: Response): string {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) return decodeURIComponent(encoded);
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return plain ?? fallbackFilename;
}

export async function downloadExcel(
  dataset: ExportDataset,
  params: ExportParams = {},
): Promise<void> {
  const response = await fetch(
    `${API_URL}/exports/${dataset}.xlsx${buildQuery(params)}`,
  );
  if (!response.ok) {
    let message = 'Не удалось сформировать Excel-файл.';
    try {
      const problem = (await response.json()) as {detail?: string};
      message = problem.detail ?? message;
    } catch {
      // The fallback message is clearer than an invalid server response.
    }
    throw new Error(message);
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = responseFilename(response);
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
