const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001/api";

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  token?: string | null;
  body?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, body, headers, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    const message =
      typeof payload === "object" &&
      payload &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Falha na requisicao ${response.status}`;
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await safeJson(response)) as T;
}

async function safeJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
