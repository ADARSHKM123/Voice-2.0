import { Response, NextFunction } from 'express';
import * as voiceService from './voice.service';
import { AuthenticatedRequest } from '../../shared/types';
import { success, error } from '../../shared/utils/response';
import { config } from '../../config';
import { logger } from '../../shared/utils/logger';

export async function processVoice(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { transcript } = req.body;
    console.log(transcript)
    const intent = await voiceService.processTranscript(transcript);
    success(res, { intent, transcript });
  } catch (err) {
    next(err);
  }
}

export async function getElevenLabsSession(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!config.elevenlabs.apiKey || !config.elevenlabs.agentId) {
      error(res, 'ElevenLabs is not configured', 503);
      return;
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${config.elevenlabs.agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': config.elevenlabs.apiKey,
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ElevenLabs token error ${response.status}: ${body}`);
    }

    const data: any = await response.json();
    logger.info('ElevenLabs token response', { data });

    // API returns either { signed_url } or { token } depending on version
    // Always include agent_id in the WSS URL so ElevenLabs knows which agent to use
    const signed_url = data.signed_url
      ?? (data.token
        ? `wss://api.elevenlabs.io/v1/convai/conversation?token=${data.token}&agent_id=${config.elevenlabs.agentId}`
        : null);

    if (!signed_url) {
      throw new Error(`ElevenLabs returned unexpected response: ${JSON.stringify(data)}`);
    }

    success(res, { signed_url });
  } catch (err) {
    next(err);
  }
}
