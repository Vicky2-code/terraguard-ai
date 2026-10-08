/**
 * TerraGuard AI — API client.
 * Base URL comes from VITE_API_BASE_URL (falls back to same-origin).
 * Every call returns typed JSON or throws ApiError with a human-readable message.
 */

const rawBase = import.meta.env.VITE_API_BASE_URL;
export const API_BASE: string =
  typeof rawBase === "string" && rawBase.trim() !== "" ? rawBase.trim().replace(/\/+$/, "") : "";

const TOKEN_KEY = "tg_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, headers = {} } = opts;
  const h: Record<string, string> = { Accept: "application/json", ...headers };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Cannot reach the API server (network error or CORS blocked)", 0);
  }

  if (!res.ok) {
    let detail = `Request failed with HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (j && typeof j.detail === "string" && j.detail.trim() !== "") detail = j.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (text.trim() === "") return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("API returned a malformed JSON response", res.status);
  }
}

export const getJSON = <T>(path: string, signal?: AbortSignal): Promise<T> =>
  request<T>(path, { signal });

export const postJSON = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: "POST", body });

export const putJSON = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: "PUT", body });

export const patchJSON = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: "PATCH", body });

/** Download a file from the API (CSV export etc.) via a temporary anchor. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError("Download failed: cannot reach the API server", 0);
  }
  if (!res.ok) throw new ApiError(`Download failed (HTTP ${res.status})`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
