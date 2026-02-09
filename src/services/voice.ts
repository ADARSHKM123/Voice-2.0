import { apiRequest } from './api';

interface VoiceIntent {
  action: 'save' | 'retrieve' | 'delete' | 'list' | 'update' | 'unknown';
  service?: string;
  username?: string;
  password?: string;
  notes?: string;
  category?: string;
}

interface VoiceResponse {
  intent: VoiceIntent;
  transcript: string;
}

export async function processTranscript(transcript: string) {
  return apiRequest<VoiceResponse>('/voice/process', {
    method: 'POST',
    body: JSON.stringify({transcript}),
  });
}
