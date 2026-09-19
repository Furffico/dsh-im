const CHANNEL_CONTROL = /[\u0000-\u001f\u007f]+/g;

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function formatDiscordSessionTimestamp(date = new Date()) {
  const instant = date instanceof Date ? date : new Date(date);
  return [
    instant.getFullYear(),
    pad2(instant.getMonth() + 1),
    pad2(instant.getDate()),
    '-',
    pad2(instant.getHours()),
    pad2(instant.getMinutes()),
  ].join('');
}

export function sanitizeDiscordChannelLabel(value, fallbackId) {
  const cleaned = String(value ?? '')
    .replace(CHANNEL_CONTROL, '')
    .replace(/^#+/, '')
    .replace(/:/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
  if (cleaned) return cleaned;
  const fallback = String(fallbackId ?? '').replace(CHANNEL_CONTROL, '').trim();
  return fallback || 'unknown';
}

export function discordSessionTitle({ channelLabel, now = new Date() } = {}) {
  return `discord:${sanitizeDiscordChannelLabel(channelLabel, 'unknown')}:${formatDiscordSessionTimestamp(now)}`;
}

function lookupChannel(channels, channel, id) {
  if (!id) return null;
  const key = String(id);
  if (channel && String(channel.id) === key) return channel;
  return channels?.get?.(key) ?? null;
}

export function discordSessionChannelLabel({
  kind,
  conversationId,
  conversationRoute,
  channel,
  channels,
} = {}) {
  const currentId = conversationId ?? channel?.id;
  if (kind === 'direct') {
    const direct = lookupChannel(channels, channel, currentId);
    return sanitizeDiscordChannelLabel(direct?.name, currentId);
  }
  const parentId = conversationRoute?.peerId ?? currentId;
  const parent = lookupChannel(channels, channel, parentId);
  const current = lookupChannel(channels, channel, currentId);
  return sanitizeDiscordChannelLabel(parent?.name ?? current?.name, parentId ?? currentId);
}
