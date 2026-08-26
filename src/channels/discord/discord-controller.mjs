import { TokenBotController } from '../shared/token-bot-controller.mjs';
import { deriveDiscordBotIdentity, maskDiscordBotId } from './config-store.mjs';
import { inspectDiscordToken } from './discord-api.mjs';
import { DISCORD_DESCRIPTOR } from './discord-bridge.mjs';
import {
  isDiscordGroupResponseMode,
  normalizeDiscordGroupResponseMode,
} from './group-response-mode.mjs';

export class DiscordController extends TokenBotController {
  #configStore;

  constructor(options) {
    super({
      ...options,
      descriptor: DISCORD_DESCRIPTOR,
      inspectToken: options.inspectToken ?? inspectDiscordToken,
      deriveIdentity: deriveDiscordBotIdentity,
      maskPlatformId: maskDiscordBotId,
    });
    this.#configStore = options.configStore;
  }

  status() {
    const snapshot = super.status();
    return {
      ...snapshot,
      bots: snapshot.bots.map((bot) => {
        const config = this.#configStore.get(bot.botId);
        return {
          ...bot,
          groupResponseMode: normalizeDiscordGroupResponseMode(config?.groupResponseMode),
        };
      }),
    };
  }

  async setGroupResponseMode(botId, groupResponseMode) {
    if (!isDiscordGroupResponseMode(groupResponseMode)) {
      throw new TypeError('Discord groupResponseMode must be "thread" or "channel"');
    }
    return this.mutateBotConfig(botId, (config) => ({
      ...config,
      groupResponseMode: normalizeDiscordGroupResponseMode(groupResponseMode),
    }));
  }
}