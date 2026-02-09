import { pool } from '../../shared/database/connection';
import { KeyParams } from '../../shared/types';

export async function getKeyParams(userId: string): Promise<Omit<KeyParams, 'id' | 'user_id' | 'created_at'> | null> {
  const result = await pool.query(
    'SELECT salt, iterations, memory, encrypted_master_key, iv FROM key_params WHERE user_id = $1',
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

export async function getKeyParamsByEmail(email: string): Promise<{ salt: string; iterations: number; memory: number } | null> {
  const result = await pool.query(
    `SELECT kp.salt, kp.iterations, kp.memory
     FROM key_params kp
     JOIN users u ON u.id = kp.user_id
     WHERE u.email = $1`,
    [email],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}
