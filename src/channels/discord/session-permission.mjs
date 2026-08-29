export const DISCORD_SESSION_PERMISSIONS = Object.freeze({
  WORKSPACE_WRITE: 'workspace-write',
  DANGER_FULL_ACCESS: 'danger-full-access',
});

export const DISCORD_SESSION_PERMISSION_VALUES = Object.freeze(
  Object.values(DISCORD_SESSION_PERMISSIONS),
);

export function isDiscordSessionPermission(value) {
  return value === DISCORD_SESSION_PERMISSIONS.WORKSPACE_WRITE
    || value === DISCORD_SESSION_PERMISSIONS.DANGER_FULL_ACCESS;
}

export function normalizeDiscordSessionPermission(value) {
  return isDiscordSessionPermission(value) ? value : null;
}

export function discordPermissionCommand(permission) {
  const normalized = normalizeDiscordSessionPermission(permission);
  return normalized ? `/permission ${normalized}` : null;
}

export function wrapDiscordSessionPermission(harness, getDefaultPermission) {
  if (!harness || typeof harness !== 'object') {
    throw new TypeError('Harness is required');
  }
  if (typeof getDefaultPermission !== 'function') {
    throw new TypeError('getDefaultPermission must be a function');
  }
  if (typeof harness.createSession !== 'function') return harness;
  return new Proxy(harness, {
    get(target, property, receiver) {
      if (property !== 'createSession') {
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (options = {}) => {
        const sessionId = await target.createSession(options);
        const line = discordPermissionCommand(getDefaultPermission());
        if (!line) return sessionId;
        if (typeof target.executeCommand !== 'function') {
          const error = new Error('当前 Harness 暂不支持从机器人设置会话权限。');
          error.code = 'commands-unavailable';
          throw error;
        }
        const execution = await target.executeCommand(sessionId, line, options);
        if (execution === undefined) {
          const error = new Error('当前 Harness 未注册 /permission 命令。');
          error.code = 'commands-unavailable';
          throw error;
        }
        if (execution?.result?.kind === 'error') {
          const error = new Error(
            typeof execution.result.text === 'string' && execution.result.text.trim()
              ? execution.result.text.trim()
              : '会话权限设置失败。',
          );
          error.code = 'discord-permission-failed';
          throw error;
        }
        return sessionId;
      };
    },
  });
}
