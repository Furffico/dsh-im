import {
  TOKEN_BOT_ENDPOINTS,
  createTokenBotRpcHandler,
} from '../shared/rpc.mjs';
import { resolveRpcAuthority } from '../../rpc-authority.mjs';
import {
  isDiscordGroupResponseMode,
  normalizeDiscordGroupResponseMode,
} from '../../../../src/channels/discord/group-response-mode.mjs';
import {
  isDiscordSessionPermission,
  normalizeDiscordSessionPermission,
} from '../../../../src/channels/discord/session-permission.mjs';

export const DISCORD_RPC_CHANNEL = '/discord';
export const DISCORD_ENDPOINTS = Object.freeze({
  ...TOKEN_BOT_ENDPOINTS,
  setAccountSettings: 'bot.account-settings.set',
  setGroupResponseMode: 'bot.group-response-mode.set',
});
export const DISCORD_RPC_ENDPOINTS = Object.freeze(Object.values(DISCORD_ENDPOINTS));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function text(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function validPermission(value) {
  return value == null || isDiscordSessionPermission(value);
}

// DSH client-connection validates RpcResult.error with a discriminated union
// on `code`. Only a closed set of codes is legal; `bad-request` further
// requires `details: { issues: [] }`. Plugin-local codes such as
// `discord-operation-failed` or a bare `details: {}` on bad-request are
// rejected by Zod before the UI can read the message.
function badRequest(message) {
  return {
    ok: false,
    error: { code: 'bad-request', message, details: { issues: [] } },
  };
}

function cancelled() {
  return {
    ok: false,
    error: { code: 'cancelled', message: 'The request was cancelled.', details: {} },
  };
}

function internalFailure(message = 'Discord 操作失败，请稍后重试。') {
  return {
    ok: false,
    error: { code: 'internal', message, details: {} },
  };
}

function toPublicRpcResult(result) {
  if (result?.ok === true) return result;
  const error = result?.error;
  if (!isRecord(error)) return internalFailure();
  if (error.code === 'bad-request') {
    return badRequest(text(error.message, 'Invalid Discord request.'));
  }
  if (error.code === 'cancelled') return cancelled();
  if (error.code === 'workspace-bot-not-found'
    || error.code === 'workspace-not-absolute'
    || error.code === 'workspace-not-found'
    || error.code === 'workspace-not-directory'
    || error.code === 'agent-preset-invalid'
    || error.code === 'agent-preset-unavailable'
    || error.code === 'context-enhancement-invalid'
    || error.code === 'invalid-token'
    || error.code === 'discord-intents') {
    return {
      ok: false,
      error: {
        code: error.code,
        message: text(error.message, 'Discord 操作失败，请稍后重试。'),
        details: isRecord(error.details) ? error.details : {},
      },
    };
  }
  return internalFailure(text(error.message, 'Discord 操作失败，请稍后重试。'));
}

function accountSettingsPayload(payload) {
  if (!exactKeys(payload, ['botId', 'groupResponseMode', 'defaultSessionPermission'])
    || !validId(payload.botId)
    || !isDiscordGroupResponseMode(payload.groupResponseMode)
    || !validPermission(payload.defaultSessionPermission)) {
    return null;
  }
  return {
    botId: payload.botId,
    groupResponseMode: normalizeDiscordGroupResponseMode(payload.groupResponseMode),
    defaultSessionPermission: normalizeDiscordSessionPermission(payload.defaultSessionPermission),
  };
}

export function createDiscordRpcHandler(controller) {
  const sharedHandler = createTokenBotRpcHandler(controller, { channel: 'Discord' });
  return async (endpoint, payload, signal) => {
    const isLegacyMode = endpoint === DISCORD_ENDPOINTS.setGroupResponseMode;
    if (endpoint !== DISCORD_ENDPOINTS.setAccountSettings && !isLegacyMode) {
      return toPublicRpcResult(await sharedHandler(endpoint, payload, signal));
    }
    if (signal?.aborted) return cancelled();
    const settings = isLegacyMode
      ? (
        exactKeys(payload, ['botId', 'groupResponseMode'])
          && validId(payload.botId)
          && isDiscordGroupResponseMode(payload.groupResponseMode)
          ? {
            botId: payload.botId,
            groupResponseMode: normalizeDiscordGroupResponseMode(payload.groupResponseMode),
            defaultSessionPermission: undefined,
          }
          : null
      )
      : accountSettingsPayload(payload);
    if (!settings) {
      return badRequest(isLegacyMode
        ? '请选择「线程模式」或「频道直接回复」。'
        : '请选择群响应模式，以及「跟随 Host 默认」、「Workspace Write」或「Full access」。');
    }
    try {
      let value;
      if (isLegacyMode && typeof controller.setGroupResponseMode === 'function') {
        value = await controller.setGroupResponseMode(settings.botId, settings.groupResponseMode);
      } else if (typeof controller.setAccountSettings === 'function') {
        value = await controller.setAccountSettings(settings.botId, {
          groupResponseMode: settings.groupResponseMode,
          defaultSessionPermission: settings.defaultSessionPermission,
        });
      } else {
        return badRequest('请选择「线程模式」或「频道直接回复」。');
      }
      return signal?.aborted ? cancelled() : { ok: true, value };
    } catch {
      return signal?.aborted ? cancelled() : internalFailure();
    }
  };
}

export function installDiscordRpc(ctx, controller, authority) {
  if (!ctx?.connection?.rpc || typeof ctx.connection.rpc.handle !== 'function') {
    throw new TypeError('DSH Host Connection RPC is required');
  }
  return ctx.connection.rpc.handle(
    DISCORD_RPC_CHANNEL,
    createDiscordRpcHandler(controller),
    { authority: resolveRpcAuthority(authority) },
  );
}
