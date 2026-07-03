const DEFAULT_API_BASE = "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function getJson<TResponse>(path: string): Promise<TResponse> {
  return requestJson<TResponse>(path, { method: "GET" });
}

export async function postJson<TRequest extends object, TResponse>(
  path: string,
  body: TRequest
): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function requestJson<TResponse>(
  path: string,
  init: RequestInit
): Promise<TResponse> {
  const response = await fetch(`${getApiBase()}${path}`, init);

  if (!response.ok) {
    throw new ApiError(`请求失败：${response.status}`, response.status);
  }

  return response.json() as Promise<TResponse>;
}

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE ?? DEFAULT_API_BASE;
}
