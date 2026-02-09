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
  return apiRequest<VaultEntry[]>('/vault/entries');
}

export async function createEntry(data: {
  encryptedData: string;
  iv: string;
  tag: string;
  category?: string;
}) {
  return apiRequest<VaultEntry>('/vault/entries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEntry(
  id: string,
  data: {encryptedData: string; iv: string; tag: string; category?: string},
) {
  return apiRequest<VaultEntry>(`/vault/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEntry(id: string) {
  return apiRequest(`/vault/entries/${id}`, {method: 'DELETE'});
}
