import { apiRequest } from './api';

interface VaultEntry {
  id: string;
  encrypted_data: string;
  iv: string;
  tag: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export async function getEntries() {
  console.log('[Vault] getEntries → GET /vault/entries');
  const result = await apiRequest<VaultEntry[]>('/vault/entries');
  console.log(`[Vault] getEntries ← success=${result.success}, count=${result.data?.length ?? 0}${result.error ? ', error=' + result.error : ''}`);
  return result;
}

export async function createEntry(data: {
  encryptedData: string;
  iv: string;
  tag: string;
  category?: string;
}) {
  console.log(`[Vault] createEntry → POST /vault/entries, category=${data.category}`);
  const result = await apiRequest<VaultEntry>('/vault/entries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  console.log(`[Vault] createEntry ← success=${result.success}, id=${result.data?.id ?? 'none'}${result.error ? ', error=' + result.error : ''}`);
  return result;
}

export async function updateEntry(
  id: string,
  data: {encryptedData: string; iv: string; tag: string; category?: string},
) {
  console.log(`[Vault] updateEntry → PUT /vault/entries/${id}, category=${data.category}`);
  const result = await apiRequest<VaultEntry>(`/vault/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  console.log(`[Vault] updateEntry ← success=${result.success}${result.error ? ', error=' + result.error : ''}`);
  return result;
}

export async function deleteEntry(id: string) {
  console.log(`[Vault] deleteEntry → DELETE /vault/entries/${id}`);
  const result = await apiRequest(`/vault/entries/${id}`, {method: 'DELETE'});
  console.log(`[Vault] deleteEntry ← success=${result.success}${result.error ? ', error=' + result.error : ''}`);
  return result;
}
