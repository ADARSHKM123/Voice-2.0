import { Platform } from 'react-native';

const ANDROID_EMULATOR_HOST = '10.0.2.2';
const IOS_SIMULATOR_HOST = 'localhost';

const BASE_HOST = Platform.OS === 'android' ? ANDROID_EMULATOR_HOST : IOS_SIMULATOR_HOST;
const BASE_URL = `http://${BASE_HOST}:3000/api`;

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

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<{success: boolean; data?: T; error?: string}> {
  const url = `${BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    let res = await fetch(url, {...options, headers});

    // If 401, try refreshing token once
    if (res.status === 401 && refreshToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${accessToken}`;
        res = await fetch(url, {...options, headers});
      } else {
        onTokenRefreshFailed?.();
        return {success: false, error: 'Session expired. Please log in again.'};
      }
    }

    const json = await res.json();
    return json;
  } catch (err: any) {
    return {success: false, error: err.message || 'Network error'};
  }
}
