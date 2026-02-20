import AudioRecord from 'react-native-audio-record';
import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';
import { apiRequest } from './api';
import { getEntries, createEntry, updateEntry, deleteEntry } from './vault';
import { toBase64, fromBase64 } from './api';

Sound.setCategory('Playback');

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConversationState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'agent_speaking'
  | 'disconnected';

export type ElevenLabsHandlers = {
  onStateChange: (state: ConversationState) => void;
  onUserTranscript: (text: string) => void;
  onAgentTranscript: (text: string) => void;
  onError: (message: string) => void;
  onVaultChanged?: () => void;
};

// ─── Module state ─────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let isConnecting = false;
let handlers: ElevenLabsHandlers | null = null;
let audioChunks: Uint8Array[] = [];
let currentSound: Sound | null = null;
// Format announced by the agent in conversation_initiation_metadata (e.g. "pcm_16000", "mp3_44100_128")
let agentOutputFormat = 'pcm_16000';

// ─── Public API ───────────────────────────────────────────────────────────────

export function setHandlers(h: ElevenLabsHandlers) {
  handlers = h;
}

export async function startConversation(): Promise<void> {
  if (isConnecting || ws) {
    return; // already connecting or connected — ignore duplicate taps
  }

  isConnecting = true;
  handlers?.onStateChange('connecting');

  const result = await apiRequest<{ signed_url: string }>('/voice/elevenlabs-session');
  if (!result.success || !result.data?.signed_url) {
    isConnecting = false;
    handlers?.onError(result.error || 'Failed to get ElevenLabs session');
    handlers?.onStateChange('disconnected');
    return;
  }

  console.log('[ElevenLabs] Connecting WebSocket...');
  ws = new WebSocket(result.data.signed_url);

  ws.onopen = () => {
    console.log('[ElevenLabs] WebSocket opened');
    isConnecting = false;
    try {
      startMicStream();
      console.log('[ElevenLabs] Mic stream started');
    } catch (e: any) {
      console.error('[ElevenLabs] AudioRecord error:', e?.message);
      handlers?.onError(`Microphone error: ${e?.message ?? 'AudioRecord failed — rebuild the app with: npx react-native run-android'}`);
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      console.log('[ElevenLabs] MSG type:', msg.type);
      handleMessage(msg);
    } catch (e) {
      console.error('[ElevenLabs] message parse error', e);
    }
  };

  ws.onerror = (e) => {
    console.error('[ElevenLabs] WS error:', e);
    isConnecting = false;
    handlers?.onError('Connection error. Please try again.');
    handlers?.onStateChange('disconnected');
  };

  ws.onclose = (e) => {
    console.log('[ElevenLabs] WS closed, code:', e.code, 'reason:', e.reason);
    isConnecting = false;
    stopMicStream();
    handlers?.onStateChange('disconnected');
    ws = null;
  };
}

export function stopConversation() {
  isConnecting = false;
  agentOutputFormat = 'pcm_16000';
  stopMicStream();
  currentSound?.stop();
  currentSound?.release();
  currentSound = null;
  audioChunks = [];
  ws?.close();
  ws = null;
}

export function isActive(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

// ─── WebSocket message handler ────────────────────────────────────────────────

async function handleMessage(msg: any) {
  switch (msg.type) {
    case 'conversation_initiation_metadata': {
      const fmt = msg.conversation_initiation_metadata_event?.agent_output_audio_format;
      if (fmt) { agentOutputFormat = fmt; }
      console.log('[ElevenLabs] Agent output format:', agentOutputFormat);
      handlers?.onStateChange('listening');
      break;
    }

    case 'user_transcript':
      handlers?.onUserTranscript(msg.user_transcription_event.user_transcript);
      handlers?.onStateChange('user_speaking');
      break;

    case 'audio': {
      const b64 = msg.audio_event?.audio_base_64;
      if (b64) {
        audioChunks.push(decodeBase64(b64));
      }
      handlers?.onStateChange('agent_speaking');
      break;
    }

    case 'agent_response':
      handlers?.onAgentTranscript(msg.agent_response_event.agent_response);
      await playCollectedAudio();
      break;

    case 'client_tool_call': {
      const { tool_name, parameters, tool_call_id } = msg.client_tool_call;
      const result = await executeVaultTool(tool_name, parameters);
      ws?.send(JSON.stringify({
        type: 'client_tool_result',
        tool_call_id,
        result,
        is_error: false,
      }));
      break;
    }

    case 'interruption':
      audioChunks = [];
      currentSound?.stop();
      handlers?.onStateChange('listening');
      break;

    case 'ping':
      ws?.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event.event_id }));
      break;
  }
}

// ─── Microphone streaming ─────────────────────────────────────────────────────

function startMicStream() {
  AudioRecord.init({
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // MIC
    wavFile: '',
  });

  AudioRecord.on('data', (data: string) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ user_audio_chunk: data }));
    }
  });

  AudioRecord.start();
}

function stopMicStream() {
  try {
    AudioRecord.stop();
  } catch (_e) {
    // already stopped
  }
}

// ─── Audio playback ───────────────────────────────────────────────────────────

async function playCollectedAudio() {
  if (audioChunks.length === 0) {
    handlers?.onStateChange('listening');
    return;
  }

  try {
    // Concatenate all decoded byte chunks into a single Uint8Array
    const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of audioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    audioChunks = [];

    // Use the format the agent declared at conversation start — far more reliable
    // than magic-byte sniffing.  agentOutputFormat is e.g. "pcm_16000" or "mp3_44100_128".
    const isPCM = agentOutputFormat.startsWith('pcm');
    const sampleRate = isPCM
      ? (parseInt(agentOutputFormat.split('_')[1] ?? '16000', 10) || 16000)
      : 44100;
    const ext = isPCM ? 'wav' : 'mp3';
    const fileData = isPCM ? buildWavBuffer(combined, sampleRate) : combined;
    console.log(`[ElevenLabs] Audio: ${combined.length} bytes, agentFormat=${agentOutputFormat} → writing .${ext}`);

    const path = `${RNFS.TemporaryDirectoryPath}/el_agent_${Date.now()}.${ext}`;
    await RNFS.writeFile(path, encodeBase64(fileData), 'base64');

    // Play and clean up
    currentSound?.stop();
    currentSound?.release();

    await new Promise<void>((resolve) => {
      const sound = new Sound(path, '', (err) => {
        if (err) {
          console.error('[ElevenLabs] Sound load error', err);
          RNFS.unlink(path).catch(() => {});
          resolve();
          return;
        }
        currentSound = sound;
        sound.play(() => {
          sound.release();
          currentSound = null;
          RNFS.unlink(path).catch(() => {});
          handlers?.onStateChange('listening');
          resolve();
        });
      });
    });
  } catch (e) {
    console.error('[ElevenLabs] playback error', e);
    handlers?.onStateChange('listening');
  }
}

// ─── Vault tool execution (called by ElevenLabs agent) ───────────────────────

/** Match helper — true if either string contains the other (case-insensitive, trimmed). */
function serviceMatches(stored: string | undefined | null, search: string): boolean {
  if (!stored) { return false; }
  const a = stored.toLowerCase().trim();
  const b = search.toLowerCase().trim();
  return a.includes(b) || b.includes(a);
}

async function executeVaultTool(toolName: string, params: any): Promise<string> {
  console.log(`[VaultTool] ${toolName} called, params:`, JSON.stringify(params));
  try {
    switch (toolName) {
      case 'save_password': {
        if (!params.service || !params.password) {
          return 'Missing service or password parameter';
        }
        const payload = JSON.stringify({
          service: params.service,
          username: params.username ?? null,
          password: params.password,
        });
        await createEntry({
          encryptedData: toBase64(payload),
          iv: toBase64('placeholder-iv'),
          tag: toBase64('placeholder-tag'),
          category: 'password',
        });
        handlers?.onVaultChanged?.();
        return `Saved. Service: ${params.service}, password: ${params.password}${params.username ? `, username: ${params.username}` : ''}.`;
      }

      case 'get_password': {
        if (!params.service) { return 'Missing service parameter'; }
        const result = await getEntries();
        if (!result.success || !result.data) { return 'Failed to fetch vault entries'; }
        console.log(`[VaultTool] get_password: searching for "${params.service}", total entries: ${result.data.length}`);
        for (const entry of result.data) {
          try {
            const decoded = JSON.parse(fromBase64(entry.encrypted_data));
            console.log(`[VaultTool]   entry service: "${decoded.service}"`);
            if (serviceMatches(decoded.service, params.service)) {
              const pw = decoded.password ?? null;
              const un = decoded.username ?? null;
              if (!pw) {
                return `Found ${decoded.service} but no password is stored for it.`;
              }
              return `The password for ${decoded.service} is ${pw}${un ? `. The username is ${un}` : ''}.`;
            }
          } catch (e) {
            console.log(`[VaultTool]   could not decode entry ${entry.id}:`, e);
          }
        }
        return `No saved password found for ${params.service}.`;
      }

      case 'update_password': {
        if (!params.service || !params.password) {
          return 'Missing service or password parameter';
        }
        const result = await getEntries();
        if (!result.success || !result.data) { return 'Failed to fetch vault entries'; }
        for (const entry of result.data) {
          try {
            const decoded = JSON.parse(fromBase64(entry.encrypted_data));
            if (serviceMatches(decoded.service, params.service)) {
              const newPayload = JSON.stringify({
                service: decoded.service,
                username: decoded.username,
                password: params.password,
              });
              await updateEntry(entry.id, {
                encryptedData: toBase64(newPayload),
                iv: toBase64('placeholder-iv'),
                tag: toBase64('placeholder-tag'),
                category: entry.category,
              });
              handlers?.onVaultChanged?.();
              return `Updated. The new password for ${decoded.service} is ${params.password}.`;
            }
          } catch (e) {
            console.log(`[VaultTool]   could not decode entry ${entry.id}:`, e);
          }
        }
        return `No saved entry found for ${params.service}.`;
      }

      case 'delete_password': {
        if (!params.service) { return 'Missing service parameter'; }
        const result = await getEntries();
        if (!result.success || !result.data) { return 'Failed to fetch vault entries'; }
        for (const entry of result.data) {
          try {
            const decoded = JSON.parse(fromBase64(entry.encrypted_data));
            if (serviceMatches(decoded.service, params.service)) {
              await deleteEntry(entry.id);
              handlers?.onVaultChanged?.();
              return `Deleted the password for ${decoded.service}.`;
            }
          } catch (e) {
            console.log(`[VaultTool]   could not decode entry ${entry.id}:`, e);
          }
        }
        return `No saved entry found for ${params.service}.`;
      }

      case 'list_passwords': {
        const result = await getEntries();
        if (!result.success || !result.data || result.data.length === 0) {
          return 'No passwords saved yet.';
        }
        const services: string[] = [];
        for (const entry of result.data) {
          try {
            const decoded = JSON.parse(fromBase64(entry.encrypted_data));
            if (decoded.service) { services.push(decoded.service); }
          } catch (e) {
            console.log(`[VaultTool]   could not decode entry ${entry.id}:`, e);
          }
        }
        return services.length > 0
          ? `You have passwords saved for: ${services.join(', ')}.`
          : 'No readable entries found.';
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (e: any) {
    console.error('[VaultTool] Unexpected error:', e);
    return `Error: ${e.message}`;
  }
}

// ─── WAV builder (wraps raw PCM from ElevenLabs in a RIFF/WAV header) ────────

function buildWavBuffer(pcm: Uint8Array, sampleRate = 16000): Uint8Array {
  const channels = 1, bits = 16;
  const hdr = new ArrayBuffer(44);
  const v = new DataView(hdr);
  const s = (off: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true);
  s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true);   // subchunk1 size
  v.setUint16(20, 1, true);    // PCM format
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * bits / 8, true); // byte rate
  v.setUint16(32, channels * bits / 8, true);              // block align
  v.setUint16(34, bits, true);
  s(36, 'data'); v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(hdr));
  out.set(pcm, 44);
  return out;
}

// ─── Base64 helpers (Hermes-safe) ─────────────────────────────────────────────

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  // Chunk size MUST be divisible by 3 — otherwise btoa adds '=' padding mid-stream
  // and concatenating padded base64 chunks produces invalid base64.
  const CHUNK = 0x7FFE; // 32766 = 3 × 10922
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += btoa(String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK))));
  }
  return result;
}
