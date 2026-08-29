import { t } from '../shared/i18n.mjs';
import {
  deriveTokenBotIdentity,
  maskPlatformId,
  TokenBotConfigStore,
} from '../shared/token-config-store.mjs';
import {
  normalizeDiscordGroupResponseMode,
} from './group-response-mode.mjs';
import {
  normalizeDiscordSessionPermission,
} from './session-permission.mjs';

const IDENTITY_OPTIONS = Object.freeze({
  botPrefix: 'discord',
  tokenRefPrefix: 'DSH_DISCORD_BOT_TOKEN',
});

function normalizeDiscordBotExtension(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const extension = {};
  if (Object.hasOwn(value, 'groupResponseMode')) {
    extension.groupResponseMode = normalizeDiscordGroupResponseMode(value.groupResponseMode);
  }
  if (Object.hasOwn(value, 'defaultSessionPermission')) {
    const permission = normalizeDiscordSessionPermission(value.defaultSessionPermission);
    if (permission) extension.defaultSessionPermission = permission;
  }
  return extension;
}

export function deriveDiscordBotIdentity(platformId) {
  return deriveTokenBotIdentity(platformId, IDENTITY_OPTIONS);
}

export function maskDiscordBotId(platformId) {
  return maskPlatformId(platformId, t('Discord机器人'));
}

export class DiscordConfigStore extends TokenBotConfigStore {
  constructor(path) {
    super(path, {
      channel: 'Discord',
      ...IDENTITY_OPTIONS,
      normalizeBotExtension: normalizeDiscordBotExtension,
    });
  }
}