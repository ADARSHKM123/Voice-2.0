import { Request } from 'express';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  verification_token: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface KeyParams {
  id: string;
  user_id: string;
  salt: string;
  iterations: number;
  memory: number;
  encrypted_master_key: string;
  iv: string;
  created_at: Date;
}

export interface VaultEntry {
  id: string;
  user_id: string;
  encrypted_data: string;
  iv: string;
  tag: string;
  category: string;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export interface VoiceIntent {
  action: 'save' | 'retrieve' | 'delete' | 'list' | 'update' | 'unknown';
  service?: string;
  username?: string;
  password?: string;
  notes?: string;
  category?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
