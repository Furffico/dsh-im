export const DISCORD_GROUP_RESPONSE_MODES = Object.freeze({
  THREAD: 'thread',
  CHANNEL: 'channel',
});

export const DEFAULT_DISCORD_GROUP_RESPONSE_MODE = DISCORD_GROUP_RESPONSE_MODES.THREAD;

export function isDiscordGroupResponseMode(value) {
  return value === DISCORD_GROUP_RESPONSE_MODES.THREAD
    || value === DISCORD_GROUP_RESPONSE_MODES.CHANNEL;
}

export function normalizeDiscordGroupResponseMode(value) {
  return value === DISCORD_GROUP_RESPONSE_MODES.CHANNEL
    ? DISCORD_GROUP_RESPONSE_MODES.CHANNEL
    : DEFAULT_DISCORD_GROUP_RESPONSE_MODE;
}