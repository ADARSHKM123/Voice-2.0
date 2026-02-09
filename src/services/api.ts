// Replace with your machine's local IP (run `ipconfig` on Windows, `ifconfig` on Mac/Linux).
// Use '10.0.2.2' only if running on Android emulator.
// Use 'localhost' only if running on iOS simulator.
const SERVER_HOST = '192.168.1.122';
const SERVER_PORT = 3000;
const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}/api`;

// Base64 encode — works on all RN engines including Hermes
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(input: string): string {
  let result = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
    const c = i + 2 < input.length ? input.charCodeAt(i + 2) : 0;
    result += BASE64_CHARS[a >> 2];
    result += BASE64_CHARS[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < input.length ? BASE64_CHARS[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < input.length ? BASE64_CHARS[c & 63] : '=';
  }
  return result;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onTokenRefreshFailed: (() => void) | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

export function getRefreshToken() {
  return refreshToken;
}

export function setOnTokenRefreshFailed(cb: () => void) {
  onTokenRefreshFailed = cb;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) {return false;}

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refreshToken}),
    });

    if (!res.ok) {return false;}

    const data = await res.json();
    if (data.success && data.data) {
      accessToken = data.data.accessToken;
      refreshToken = data.data.refreshToken;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeoutMs / 1000}s — is the server running at ${SERVER_HOST}:${SERVER_PORT}?`));
    }, timeoutMs);

    fetch(url, {...options, signal: controller.signal})
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<{success: boolean; data?: T; error?: string}> {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`[API] ${options.method || 'GET'} ${url}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    let res = await fetchWithTimeout(url, {...options, headers});
    console.log(`[API] Response: ${res.status}`);

    // If 401, try refreshing token once
    if (res.status === 401 && refreshToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${accessToken}`;
        res = await fetchWithTimeout(url, {...options, headers});
      } else {
        onTokenRefreshFailed?.();
        return {success: false, error: 'Session expired. Please log in again.'};
      }
    }

    const json = await res.json();
    console.log(`[API] Result:`, JSON.stringify(json).slice(0, 200));
    return json;
  } catch (err: any) {
    console.error(`[API] Error: ${err.message}`);
    return {success: false, error: err.message || 'Network error'};
  }
}
