import { TokenBotController } from '../shared/token-bot-controller.mjs';
import { deriveDiscordBotIdentity, maskDiscordBotId } from './config-store.mjs';
import { inspectDiscordToken } from './discord-api.mjs';
import { DISCORD_DESCRIPTOR } from './discord-bridge.mjs';
import {
  isDiscordGroupResponseMode,
  normalizeDiscordGroupResponseMode,
} from './group-response-mode.mjs';
import {
  isDiscordSessionPermission,
  normalizeDiscordSessionPermission,
} from './session-permission.mjs';

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
          defaultSessionPermission: normalizeDiscordSessionPermission(
            config?.defaultSessionPermission,
          ),
        };
      }),
    };
  }

  async setAccountSettings(botId, {
    groupResponseMode,
    defaultSessionPermission,
  } = {}) {
    if (!isDiscordGroupResponseMode(groupResponseMode)) {
      throw new TypeError('Discord groupResponseMode must be "thread" or "channel"');
    }
    const permission = normalizeDiscordSessionPermission(defaultSessionPermission);
    if (defaultSessionPermission != null && !isDiscordSessionPermission(permission)) {
      throw new TypeError('Discord defaultSessionPermission must be "workspace-write" or "danger-full-access"');
    }
    return this.mutateBotConfig(botId, (config) => {
      const next = {
        ...config,
        groupResponseMode: normalizeDiscordGroupResponseMode(groupResponseMode),
      };
      if (permission) next.defaultSessionPermission = permission;
      else delete next.defaultSessionPermission;
      return next;
    });
  }

  async setGroupResponseMode(botId, groupResponseMode) {
    const current = this.#configStore.get(botId);
    return this.setAccountSettings(botId, {
      groupResponseMode,
      defaultSessionPermission: current?.defaultSessionPermission ?? null,
    });
  }
}