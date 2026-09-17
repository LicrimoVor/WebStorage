import {API_URL} from '@/shared/config';

import type {components} from './generated/schema';

type ProblemDetail = components['schemas']['ProblemDetail'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: ProblemDetail['fields'];

  constructor(problem: ProblemDetail) {
    super(problem.detail);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.fields = problem.fields;
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/session') {
      window.dispatchEvent(new Event('webstorage:unauthorized'));
    }
    let problem: ProblemDetail = {
      status: response.status,
      code: 'transport_error',
      detail: 'Сервер вернул некорректный ответ',
    };
    try {
      const body: unknown = await response.json();
      if (
        typeof body === 'object' && body !== null &&
        'code' in body && typeof body.code === 'string' &&
        'detail' in body && typeof body.detail === 'string'
      ) {
        problem = {
          status: response.status,
          code: body.code,
          detail: body.detail,
          fields: 'fields' in body && Array.isArray(body.fields)
            ? body.fields.filter((field): field is Record<string, unknown> =>
                typeof field === 'object' && field !== null && !Array.isArray(field))
            : null,
        };
      }
    } catch {
      // Keep the HTTP status even when a proxy returns HTML or an empty body.
    }
    throw new ApiError(problem);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'conflict') {
      return error.message;
    }
    if (error.code === 'validation_error' || error.code === 'domain_validation_error') {
      return error.message;
    }
  }
  return 'Не удалось выполнить запрос. Проверьте соединение и повторите попытку.';
}
