/** 管理 API 的错误类型；Mock API（/v1）使用 OpenAI 风格错误体，见 lib/openai-error.ts。 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, 'bad_request', details);
}

export function notFound(what: string): HttpError {
  return new HttpError(404, `${what}不存在`, 'not_found');
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message, 'conflict');
}

export function badGateway(message: string, details?: unknown): HttpError {
  return new HttpError(502, message, 'upstream_error', details);
}
