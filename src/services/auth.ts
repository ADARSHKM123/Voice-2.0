import { apiRequest } from './api';

interface KeyParamsInput {
  salt: string;
  iterations: number;
  memory: number;
  encryptedMasterKey: string;
  iv: string;
}

interface AuthResponse {
  user: {id: string; email: string};
  tokens: {accessToken: string; refreshToken: string};
  keyParams?: {
    salt: string;
    iterations: number;
    memory: number;
    encrypted_master_key: string;
    iv: string;
  };
}

export async function registerUser(
  email: string,
  password: string,
  keyParams: KeyParamsInput,
) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({email, password, keyParams}),
  });
}

export async function loginUser(email: string, password: string) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({email, password}),
  });
}

export async function logoutUser(refreshToken: string) {
  return apiRequest('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({refreshToken}),
  });
}
