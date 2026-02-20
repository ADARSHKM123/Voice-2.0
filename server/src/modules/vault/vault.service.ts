import { pool } from '../../shared/database/connection';
import { VaultEntry } from '../../shared/types';
import { logger } from '../../shared/utils/logger';

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
  logger.info('[VaultSvc] getEntries: querying DB', { userId });
  const result = await pool.query(
    'SELECT id, encrypted_data, iv, tag, category, created_at, updated_at FROM vault_entries WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  logger.info('[VaultSvc] getEntries: DB returned', { userId, rowCount: result.rows.length });
  return result.rows;
}

export async function createEntry(input: CreateEntryInput): Promise<VaultEntry> {
  const { userId, encryptedData, iv, tag, category } = input;
  logger.info('[VaultSvc] createEntry: inserting into DB', { userId, category });
  const result = await pool.query(
    `INSERT INTO vault_entries (user_id, encrypted_data, iv, tag, category)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, encrypted_data, iv, tag, category, created_at, updated_at`,
    [userId, encryptedData, iv, tag, category],
  );
  logger.info('[VaultSvc] createEntry: inserted', { userId, entryId: result.rows[0].id });
  return result.rows[0];
}

export async function updateEntry(entryId: string, userId: string, input: UpdateEntryInput): Promise<VaultEntry | null> {
  const { encryptedData, iv, tag, category } = input;
  logger.info('[VaultSvc] updateEntry: updating in DB', { entryId, userId, category });

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

  const updated = result.rows[0] || null;
  logger.info('[VaultSvc] updateEntry: result', { entryId, userId, found: !!updated });
  return updated;
}

export async function deleteEntry(entryId: string, userId: string): Promise<boolean> {
  logger.info('[VaultSvc] deleteEntry: deleting from DB', { entryId, userId });
  const result = await pool.query(
    'DELETE FROM vault_entries WHERE id = $1 AND user_id = $2',
    [entryId, userId],
  );
  const deleted = (result.rowCount ?? 0) > 0;
  logger.info('[VaultSvc] deleteEntry: result', { entryId, userId, deleted, rowCount: result.rowCount });
  return deleted;
}
