import axios, { AxiosError } from 'axios';
import { t } from '../i18n';

export const http = axios.create({
  baseURL: '/api',
  timeout: 300_000,
});

interface ApiErrorBody {
  error?: { message?: string; code?: string; details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status ?? 0;
    const body = error.response?.data;
    const message =
      body?.error?.message ??
      (status === 0 ? t('api.unreachable') : error.message);
    return Promise.reject(new ApiError(message, status, body?.error?.code ?? 'network_error', body?.error?.details));
  },
);

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await http.get<T>(url, { params });
  return response.data;
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await http.post<T>(url, body ?? {});
  return response.data;
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const response = await http.put<T>(url, body ?? {});
  return response.data;
}

export async function del(url: string): Promise<void> {
  await http.delete(url);
}
