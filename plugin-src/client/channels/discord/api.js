import {
  TOKEN_BOT_ENDPOINTS,
  createTokenChannelApi,
} from '../shared/token-api.js';
import {
  DISCORD_GROUP_RESPONSE_MODES,
} from '../../../../src/channels/discord/group-response-mode.mjs';

export const DISCORD_RPC_CHANNEL = '/discord';
export const DISCORD_ENDPOINTS = Object.freeze({
  ...TOKEN_BOT_ENDPOINTS,
  setGroupResponseMode: 'bot.group-response-mode.set',
});

const api = createTokenChannelApi('Discord', ' Gateway 长连接', {
  normalizeBotExtension: (value) => {
    const source = value?.groupResponseMode;
    const groupResponseMode = source === DISCORD_GROUP_RESPONSE_MODES.CHANNEL
      ? DISCORD_GROUP_RESPONSE_MODES.CHANNEL
      : DISCORD_GROUP_RESPONSE_MODES.THREAD;
    return { groupResponseMode };
  },
});

export const unwrapRpcResult = api.unwrapRpcResult;
export const normalizeSnapshot = api.normalizeSnapshot;
export const presentError = api.presentError;
export { api as discordClientApi };