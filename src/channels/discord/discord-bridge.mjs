import { TextHarnessBridge, createTextBridgeStatus } from '../shared/text-harness-bridge.mjs';
import { discordSessionChannelLabel } from './session-title.mjs';

export const DISCORD_DESCRIPTOR = Object.freeze({
  key: 'discord',
  label: 'Discord',
  connectionLabel: ' Gateway 长连接',
  reactions: Object.freeze({ processing: '👀', success: '✅', error: '❌' }),
});

export class DiscordHarnessBridge extends TextHarnessBridge {
  constructor(options = {}) {
    const { channels, sessionCreateOptions, ...rest } = options;
    super({
      descriptor: DISCORD_DESCRIPTOR,
      ...rest,
      sessionCreateOptions: sessionCreateOptions ?? ((message) => ({
        sessionChannelLabel: message.sessionChannelLabel
          ?? discordSessionChannelLabel({
            kind: message.kind,
            conversationId: message.conversationId,
            conversationRoute: message.conversationRoute,
            channels,
          }),
      })),
    });
  }
}

export { createTextBridgeStatus as createDiscordBridgeStatus };
