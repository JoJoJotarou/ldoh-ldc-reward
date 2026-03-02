/**
 * 日志系统
 */
const _print = (level, msg, color, bg, ...args) =>
  console.log(
    `%c LDOH %c ${level.toUpperCase()} %c ${msg}`,
    "background: #6366f1; color: white; border-radius: 3px 0 0 3px; font-weight: bold; padding: 1px 4px",
    `background: ${bg}; color: ${color}; border-radius: 0 3px 3px 0; font-weight: bold; padding: 1px 4px`,
    "color: inherit; font-weight: normal",
    ...args,
  );

const _printDebug = (level, msg, color, bg, ...args) =>
  console.debug(
    `%c LDOH %c ${level.toUpperCase()} %c ${msg}`,
    "background: #6366f1; color: white; border-radius: 3px 0 0 3px; font-weight: bold; padding: 1px 4px",
    `background: ${bg}; color: ${color}; border-radius: 0 3px 3px 0; font-weight: bold; padding: 1px 4px`,
    "color: inherit; font-weight: normal",
    ...args,
  );

export const Log = {
  info: (msg, ...args) => _print("info", msg, "#fff", "#3b82f6", ...args),
  success: (msg, ...args) => _print("ok", msg, "#fff", "#10b981", ...args),
  warn: (msg, ...args) => _print("warn", msg, "#000", "#f59e0b", ...args),
  error: (msg, ...args) => _print("err", msg, "#fff", "#ef4444", ...args),
  debug: (msg, ...args) => _printDebug("debug", msg, "#fff", "#8b5cf6", ...args),
};
