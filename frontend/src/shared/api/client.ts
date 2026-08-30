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
  const response = await fetch(`${API_URL}${path}`, {...init, headers});
  if (!response.ok) {
    let problem: ProblemDetail;
    try {
      problem = (await response.json()) as ProblemDetail;
    } catch {
      problem = {
        status: response.status,
        code: 'transport_error',
        detail: 'Сервер вернул некорректный ответ',
      };
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
