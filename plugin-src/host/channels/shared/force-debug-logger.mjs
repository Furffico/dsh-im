// Debug helper: wrap a cordis LoggerService logger so debug-level calls always
// reach stderr, regardless of the host's configured level. Other levels still
// go through the original logger so the host can keep filtering them.
//
// This is a temporary patch to surface dsh-im debug output while
// `dsh web` does not expose a CLI flag for log level.
//
// Set DSH_IM_DEBUG=0 (or any falsy value) to disable the force-debug fallback
// and behave like the original logger.
function isDebugEnabled() {
  const raw = process.env.DSH_IM_DEBUG;
  if (raw === undefined) return true;
  return !/^(0|false|off|no)$/i.test(raw);
}

function formatDebug(prefix, args) {
  const parts = args.map((arg) => {
    if (arg instanceof Error) return arg.stack || arg.message || String(arg);
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  });
  return `[${prefix}] [debug] ${parts.join(' ')}`;
}

export function wrapForDebug(logger, prefix) {
  if (!logger) return logger;
  if (!isDebugEnabled()) return logger;
  // If the host already exposes a working debug() we don't need to force.
  // But cordis drops debug calls based on its exporter levels, so we always
  // emit an extra stderr line just to be safe.
  return {
    error: (...args) => logger.error?.(...args),
    warn: (...args) => logger.warn?.(...args),
    info: (...args) => logger.info?.(...args),
    debug: (...args) => {
      // Forward to the original logger in case an exporter is configured.
      logger.debug?.(...args);
      // Always also write to stderr so debug is visible regardless of host
      // log level.
      try {
        process.stderr.write(`${formatDebug(prefix, args)}\n`);
      } catch {
        // ignore: stderr write failure must not break the plugin
      }
    },
  };
}
