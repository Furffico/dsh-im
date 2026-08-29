import { extname } from 'node:path';

import sharp from 'sharp';

export const DISCORD_IMAGE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
export const DISCORD_IMAGE_RESIZE_TARGET_BYTES = 8 * 1024 * 1024;
export const DISCORD_WEBP_QUALITY = 90;

const IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_FILE_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function fileBytes(file) {
  if (Buffer.isBuffer(file?.bytes)) return file.bytes;
  if (file?.bytes instanceof Uint8Array) return Buffer.from(file.bytes);
  return null;
}

function fileSize(bytes) {
  return bytes?.byteLength ?? 0;
}

export function discordImageMediaType(file) {
  const mediaType = typeof file?.mediaType === 'string'
    ? file.mediaType.split(';', 1)[0].trim().toLowerCase()
    : '';
  if (IMAGE_MEDIA_TYPES.has(mediaType)) return mediaType;
  const filename = typeof file?.fileName === 'string' ? file.fileName.toLowerCase() : '';
  return IMAGE_FILE_TYPES.get(extname(filename)) ?? null;
}

function webpFileName(fileName) {
  const current = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'image';
  return current.replace(/\.[^.]+$/u, '') + '.webp';
}

function formatSizeValue(value) {
  return String(value).replace(/\.0+$/u, '').replace(/(\.\d*[1-9])0+$/u, '$1');
}

export function formatDiscordFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return '0 KB';
  if (size >= 1024 * 1024) {
    const mb = size / (1024 * 1024);
    return `${formatSizeValue(mb.toFixed(mb >= 10 ? 1 : 2))} MB`;
  }
  const kb = size === 0 ? 0 : Math.max(0.1, size / 1024);
  return `${formatSizeValue(kb.toFixed(1))} KB`;
}

export function formatDiscordPath(path) {
  return `\`${String(path)}\``;
}

export function discordImageCaption(file) {
  if (!discordImageMediaType(file)) return null;
  const path = typeof file?.sourcePath === 'string' && file.sourcePath.trim()
    ? file.sourcePath.trim()
    : (typeof file?.fileName === 'string' && file.fileName.trim() ? file.fileName.trim() : null);
  if (!path) return null;
  const original = Number.isInteger(file.originalSize) ? file.originalSize : fileSize(fileBytes(file));
  const current = fileBytes(file)?.byteLength ?? original;
  if (Number.isInteger(file.originalSize) && file.originalSize !== current) {
    return `${formatDiscordPath(path)} (${formatDiscordFileSize(file.originalSize)} -> ${formatDiscordFileSize(current)})`;
  }
  return `${formatDiscordPath(path)} (${formatDiscordFileSize(current)})`;
}

export function discordAttachmentCaptions(files) {
  return files
    .map((file) => discordImageCaption(file))
    .filter(Boolean)
    .join('\n') || undefined;
}

function withWebpBytes(file, bytes) {
  return {
    ...file,
    fileName: webpFileName(file.fileName),
    mediaType: 'image/webp',
    originalSize: Number.isInteger(file.originalSize) ? file.originalSize : fileSize(fileBytes(file)),
    size: bytes.byteLength,
    bytes,
  };
}

export function discordWebpEncodeOptions(mediaType) {
  if (mediaType === 'image/png') return { lossless: true };
  if (mediaType === 'image/jpeg') return { quality: DISCORD_WEBP_QUALITY };
  return { quality: DISCORD_WEBP_QUALITY };
}

async function encodeWebp(pipeline, mediaType) {
  return Buffer.from(await pipeline.webp(discordWebpEncodeOptions(mediaType)).toBuffer());
}

export function resizeForTargetBytes(width, height, currentBytes, targetBytes) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const ratio = Math.min(1, Math.sqrt(targetBytes / Math.max(1, currentBytes)));
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
}

/**
 * Discord Nitro-free accounts reject attachments over 10 MB. Compress a single
 * outbound image in place: PNG to lossless WebP, JPEG to WebP quality 90, then
 * a one-shot area-based resize aimed at about 8 MB if that is still too large.
 */
export async function compressDiscordImageIfNeeded(file, {
  encoder,
  inspect,
  limitBytes = DISCORD_IMAGE_SIZE_LIMIT_BYTES,
  targetBytes = DISCORD_IMAGE_RESIZE_TARGET_BYTES,
} = {}) {
  const bytes = fileBytes(file);
  const mediaType = discordImageMediaType(file);
  if (!bytes || !mediaType) return file;
  if (fileSize(bytes) <= limitBytes) return file;

  try {
    const encode = encoder ?? (async (input, { width, height } = {}) => {
      let pipeline = sharp(input, { animated: false, failOn: 'none' }).rotate();
      if (Number.isInteger(width) && Number.isInteger(height)) {
        pipeline = pipeline.resize({
          width,
          height,
          fit: 'fill',
          withoutEnlargement: true,
        });
      }
      return encodeWebp(pipeline, mediaType);
    });

    const webp = await encode(bytes);
    if (webp.byteLength <= limitBytes) {
      return withWebpBytes(file, webp);
    }

    const metadata = await (inspect ?? ((input) => (
      sharp(input, { animated: false, failOn: 'none' }).rotate().metadata()
    )))(bytes);
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
      return withWebpBytes(file, webp);
    }

    const { width: nextWidth, height: nextHeight } = resizeForTargetBytes(
      width,
      height,
      webp.byteLength,
      targetBytes,
    );
    const resized = await encode(bytes, { width: nextWidth, height: nextHeight });
    return withWebpBytes(file, resized.byteLength < webp.byteLength ? resized : webp);
  } catch {
    return file;
  }
}

export async function prepareDiscordAttachments(files, options) {
  const attachments = Array.isArray(files) ? files.filter(Boolean) : [];
  const prepared = [];
  for (const file of attachments) {
    prepared.push(await compressDiscordImageIfNeeded(file, options));
  }
  return prepared;
}
