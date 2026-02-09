import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../../shared/database/connection';
import { config } from '../../config';
import { User, KeyParams, TokenPair, JwtPayload } from '../../shared/types';

const BCRYPT_ROUNDS = 12;

interface RegisterInput {
  email: string;
  password: string;
  keyParams: {
    salt: string;
    iterations: number;
    memory: number;
    encryptedMasterKey: string;
    iv: string;
  };
}

export async function register(input: RegisterInput): Promise<{ user: Pick<User, 'id' | 'email'>; tokens: TokenPair }> {
  const { email, password, keyParams } = input;

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    const err = new Error('Email already registered');
    (err as any).statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash],
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO key_params (user_id, salt, iterations, memory, encrypted_master_key, iv)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, keyParams.salt, keyParams.iterations, keyParams.memory, keyParams.encryptedMasterKey, keyParams.iv],
    );

    const tokens = await generateTokenPair(client, user.id, user.email);

    await client.query('COMMIT');
    return { user: { id: user.id, email: user.email }, tokens };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function login(email: string, password: string): Promise<{ user: Pick<User, 'id' | 'email'>; tokens: TokenPair; keyParams: Omit<KeyParams, 'id' | 'user_id' | 'created_at'> }> {
  const userResult = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
  if (userResult.rows.length === 0) {
    const err = new Error('Invalid email or password');
    (err as any).statusCode = 401;
    throw err;
  }

  const user = userResult.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    (err as any).statusCode = 401;
    throw err;
  }

  const keyResult = await pool.query(
    'SELECT salt, iterations, memory, encrypted_master_key, iv FROM key_params WHERE user_id = $1',
    [user.id],
  );

  const keyParams = keyResult.rows[0];

  const client = await pool.connect();
  try {
    const tokens = await generateTokenPair(client, user.id, user.email);
    return {
      user: { id: user.id, email: user.email },
      tokens,
      keyParams: {
        salt: keyParams.salt,
        iterations: keyParams.iterations,
        memory: keyParams.memory,
        encrypted_master_key: keyParams.encrypted_master_key,
        iv: keyParams.iv,
      },
    };
  } finally {
    client.release();
  }
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const tokenHash = hashToken(refreshToken);

  const result = await pool.query(
    'SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid refresh token');
    (err as any).statusCode = 401;
    throw err;
  }

  const storedToken = result.rows[0];

  if (new Date(storedToken.expires_at) < new Date()) {
    await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [storedToken.id]);
    const err = new Error('Refresh token expired');
    (err as any).statusCode = 401;
    throw err;
  }

  // Revoke old token
  await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [storedToken.id]);

  const userResult = await pool.query('SELECT id, email FROM users WHERE id = $1', [storedToken.user_id]);
  const user = userResult.rows[0];

  const client = await pool.connect();
  try {
    return await generateTokenPair(client, user.id, user.email);
  } finally {
    client.release();
  }
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

async function generateTokenPair(client: any, userId: string, email: string): Promise<TokenPair> {
  const accessToken = jwt.sign(
    { userId, email } as JwtPayload,
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiry as unknown as jwt.SignOptions['expiresIn'] },
  );

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(refreshToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await client.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );

  return { accessToken, refreshToken };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
