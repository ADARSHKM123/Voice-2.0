import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';
import { VoiceIntent } from '../../shared/types';
import { VOICE_INTENT_SYSTEM_PROMPT } from './voice.prompts';
import { logger } from '../../shared/utils/logger';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

export async function processTranscript(transcript: string): Promise<VoiceIntent> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 256,
    system: VOICE_INTENT_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: transcript },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  try {
    const intent = JSON.parse(responseText) as VoiceIntent;

    const validActions = ['save', 'retrieve', 'delete', 'list', 'update', 'unknown'];
    if (!validActions.includes(intent.action)) {
      intent.action = 'unknown';
    }

    return intent;
  } catch (err) {
    logger.error('Failed to parse Claude response as JSON', { responseText, err });
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
