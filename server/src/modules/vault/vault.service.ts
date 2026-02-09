import { pool } from '../../shared/database/connection';
import { VaultEntry } from '../../shared/types';

interface CreateEntryInput {
  userId: string;
  encryptedData: string;
  iv: string;
  tag: string;
  category: string;
}

interface UpdateEntryInput {
  encryptedData: string;
  iv: string;
  tag: string;
  category?: string;
}

export async function getEntries(userId: string): Promise<VaultEntry[]> {
  const result = await pool.query(
    'SELECT id, encrypted_data, iv, tag, category, created_at, updated_at FROM vault_entries WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows;
}

export async function createEntry(input: CreateEntryInput): Promise<VaultEntry> {
  const { userId, encryptedData, iv, tag, category } = input;
  const result = await pool.query(
    `INSERT INTO vault_entries (user_id, encrypted_data, iv, tag, category)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, encrypted_data, iv, tag, category, created_at, updated_at`,
    [userId, encryptedData, iv, tag, category],
  );
  return result.rows[0];
}

export async function updateEntry(entryId: string, userId: string, input: UpdateEntryInput): Promise<VaultEntry | null> {
  const { encryptedData, iv, tag, category } = input;

  const setClauses = [
    'encrypted_data = $3',
    'iv = $4',
    'tag = $5',
    'updated_at = NOW()',
  ];
  const params: any[] = [entryId, userId, encryptedData, iv, tag];

  if (category) {
    setClauses.push(`category = $${params.length + 1}`);
    params.push(category);
  }

  const result = await pool.query(
    `UPDATE vault_entries SET ${setClauses.join(', ')}
     WHERE id = $1 AND user_id = $2
     RETURNING id, encrypted_data, iv, tag, category, created_at, updated_at`,
    params,
  );

  return result.rows[0] || null;
}

export async function deleteEntry(entryId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM vault_entries WHERE id = $1 AND user_id = $2',
    [entryId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}
