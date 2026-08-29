import {
  TOKEN_BOT_ENDPOINTS,
  createTokenChannelApi,
} from '../shared/token-api.js';
import {
  DISCORD_GROUP_RESPONSE_MODES,
} from '../../../../src/channels/discord/group-response-mode.mjs';
import {
  normalizeDiscordSessionPermission,
} from '../../../../src/channels/discord/session-permission.mjs';

export const DISCORD_RPC_CHANNEL = '/discord';
export const DISCORD_ENDPOINTS = Object.freeze({
  ...TOKEN_BOT_ENDPOINTS,
  setAccountSettings: 'bot.account-settings.set',
  setGroupResponseMode: 'bot.group-response-mode.set',
});

const api = createTokenChannelApi('Discord', ' Gateway 长连接', {
  normalizeBotExtension: (value) => {
    const source = value?.groupResponseMode;
    const groupResponseMode = source === DISCORD_GROUP_RESPONSE_MODES.CHANNEL
      ? DISCORD_GROUP_RESPONSE_MODES.CHANNEL
      : DISCORD_GROUP_RESPONSE_MODES.THREAD;
    return {
      groupResponseMode,
      defaultSessionPermission: normalizeDiscordSessionPermission(value?.defaultSessionPermission),
    };
  },
});

export const unwrapRpcResult = api.unwrapRpcResult;
export const normalizeSnapshot = api.normalizeSnapshot;
export const presentError = api.presentError;
export { api as discordClientApi };
