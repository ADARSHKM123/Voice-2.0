import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';
import { VoiceIntent } from '../../shared/types';
import { VOICE_INTENT_SYSTEM_PROMPT } from './voice.prompts';
import { logger } from '../../shared/utils/logger';

// --- Provider: Anthropic (Claude) ---

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return anthropicClient;
}

async function processWithAnthropic(transcript: string): Promise<string> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 256,
    system: VOICE_INTENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: transcript }],
  });
  return message.content[0].type === 'text' ? message.content[0].text : '';
}

// --- Provider: Groq ---

async function processWithGroq(transcript: string): Promise<string> {
  if (!config.groq.apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groq.apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: VOICE_INTENT_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      max_tokens: 256,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Groq API error ${res.status}: ${errBody}`);
  }

  const data: any = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// --- Main entry point ---

export async function processTranscript(transcript: string): Promise<VoiceIntent> {
  const provider = config.aiProvider;
  logger.info(`Processing transcript with provider: ${provider}`);

  let responseText: string;

  if (provider === 'anthropic') {
    responseText = await processWithAnthropic(transcript);
  } else {
    responseText = await processWithGroq(transcript);
  }

  try {
    // Strip markdown code fences if the model wraps the JSON
    const cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const intent = JSON.parse(cleaned) as VoiceIntent;

    const validActions = ['save', 'retrieve', 'delete', 'list', 'update', 'unknown'];
    if (!validActions.includes(intent.action)) {
      intent.action = 'unknown';
    }

    return intent;
  } catch (err) {
    logger.error('Failed to parse AI response as JSON', { responseText, err });
    return {
      action: 'unknown',
      service: undefined,
      username: undefined,
      password: undefined,
      notes: undefined,
      category: undefined,
    };
  }
}
