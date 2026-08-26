import {
  TOKEN_BOT_ENDPOINTS,
  createTokenBotRpcHandler,
} from '../shared/rpc.mjs';
import { resolveRpcAuthority } from '../../rpc-authority.mjs';
import {
  isDiscordGroupResponseMode,
  normalizeDiscordGroupResponseMode,
} from '../../../../src/channels/discord/group-response-mode.mjs';

export const DISCORD_RPC_CHANNEL = '/discord';
export const DISCORD_ENDPOINTS = Object.freeze({
  ...TOKEN_BOT_ENDPOINTS,
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
  return internalFailure(text(error.message, 'Discord 操作失败，请稍后重试。'));
}

export function createDiscordRpcHandler(controller) {
  if (typeof controller?.setGroupResponseMode !== 'function') {
    throw new TypeError('A complete Discord controller is required (setGroupResponseMode)');
  }
  const sharedHandler = createTokenBotRpcHandler(controller, { channel: 'Discord' });
  return async (endpoint, payload, signal) => {
    if (endpoint !== DISCORD_ENDPOINTS.setGroupResponseMode) {
      return toPublicRpcResult(await sharedHandler(endpoint, payload, signal));
    }
    if (signal?.aborted) return cancelled();
    if (!exactKeys(payload, ['botId', 'groupResponseMode']) || !validId(payload.botId)
      || !isDiscordGroupResponseMode(payload.groupResponseMode)) {
      return badRequest('请选择「线程模式」或「频道直接回复」。');
    }
    const normalized = normalizeDiscordGroupResponseMode(payload.groupResponseMode);
    try {
      const value = await controller.setGroupResponseMode(payload.botId, normalized);
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