/**
 * GM 存储与黑名单/签到跳过列表管理
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";
import { normalizeHost } from "./format.js";

// ── 内部辅助：托管列表（builtin ∪ added \ removed）──

/**
 * 判断规范化 host 是否在托管列表中
 */
function _isInManagedList(n, builtinList, addedKey, removedKey) {
  const added = GM_getValue(addedKey, []);
  const removed = GM_getValue(removedKey, []);
  const inBuiltin = Array.isArray(builtinList)
    ? builtinList.includes(n)
    : builtinList instanceof Map
      ? builtinList.has(n)
      : Object.prototype.hasOwnProperty.call(builtinList, n);
  return (inBuiltin && !removed.includes(n)) || added.includes(n);
}

/**
 * 切换规范化 host 在托管列表中的状态
 * @returns {boolean} true=已加入，false=已移出
 */
function _toggleManagedList(n, builtinList, addedKey, removedKey) {
  const inBuiltin = Array.isArray(builtinList)
    ? builtinList.includes(n)
    : builtinList instanceof Map
      ? builtinList.has(n)
      : Object.prototype.hasOwnProperty.call(builtinList, n);

  if (_isInManagedList(n, builtinList, addedKey, removedKey)) {
    if (inBuiltin) {
      const removed = GM_getValue(removedKey, []);
      if (!removed.includes(n)) {
        removed.push(n);
        GM_setValue(removedKey, removed);
      }
    } else {
      const added = GM_getValue(addedKey, []);
      const idx = added.indexOf(n);
      if (idx >= 0) {
        added.splice(idx, 1);
        GM_setValue(addedKey, added);
      }
    }
    return false;
  } else {
    const removed = GM_getValue(removedKey, []);
    const ridx = removed.indexOf(n);
    if (ridx >= 0) {
      removed.splice(ridx, 1);
      GM_setValue(removedKey, removed);
    } else {
      const added = GM_getValue(addedKey, []);
      if (!added.includes(n)) {
        added.push(n);
        GM_setValue(addedKey, added);
      }
    }
    return true;
  }
}

// ── 公开 API ──

/**
 * 保存站点数据到 GM 存储
 */
export function saveSiteData(host, data) {
  try {
    const all = GM_getValue(CONFIG.STORAGE_KEY, {});
    const key = normalizeHost(host);
    all[key] = { ...(all[key] || {}), ...data, ts: Date.now() };
    GM_setValue(CONFIG.STORAGE_KEY, all);
    Log.debug(`保存站点数据: ${key}`, data);
  } catch (e) {
    Log.error(`保存站点数据失败: ${host}`, e);
  }
}

/**
 * 从 GM 存储获取站点数据
 */
export function getSiteData(host) {
  try {
    const all = GM_getValue(CONFIG.STORAGE_KEY, {});
    const key = normalizeHost(host);
    return all[key] || {};
  } catch (e) {
    Log.error(`获取站点数据失败: ${host}`, e);
    return {};
  }
}

/**
 * 从 localStorage 获取用户 ID，并自动同步到当前站点的 GM 存储中
 */
export function getAndSyncUserId(host) {
  try {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      Log.debug("localStorage 中未找到 user 数据");
      return null;
    }
    const user = JSON.parse(userStr);
    if (!user || typeof user !== "object" || !user.id) {
      Log.warn("user 数据格式无效或缺失 ID");
      return null;
    }

    const userId = String(user.id);
    const normalizedHost = normalizeHost(host);
    const siteData = getSiteData(normalizedHost);

    // 如果 userId 还没存，或者变了，则执行保存
    if (siteData.userId !== userId) {
      Log.info(`[身份同步] 为 ${normalizedHost} 识别到新用户 ID: ${userId}`);
      saveSiteData(normalizedHost, { userId });
    }

    return userId;
  } catch (e) {
    Log.error("同步用户 ID 失败", e);
    return null;
  }
}

/**
 * 判断站点是否在黑名单中
 */
export function isBlacklisted(host) {
  return _isInManagedList(
    normalizeHost(host),
    CONFIG.BLACKLIST,
    CONFIG.BLACKLIST_KEY,
    CONFIG.BLACKLIST_REMOVED_KEY,
  );
}

/**
 * 切换站点在黑名单中的状态
 */
export function toggleBlacklist(host) {
  return _toggleManagedList(
    normalizeHost(host),
    CONFIG.BLACKLIST,
    CONFIG.BLACKLIST_KEY,
    CONFIG.BLACKLIST_REMOVED_KEY,
  );
}

/**
 * 获取站点在内置签到跳过列表中的原因
 */
export function getBuiltinCheckinSkipReason(host) {
  const n = normalizeHost(host);
  const list = CONFIG.DEFAULT_CHECKIN_SKIP;
  return list instanceof Map ? (list.get(n) ?? null) : (list[n] ?? null);
}

/**
 * 判断站点是否跳过自动签到
 */
export function isCheckinSkipped(host) {
  const n = normalizeHost(host);
  if (getSiteData(n).checkinSupported === false) return true;
  return _isInManagedList(
    n,
    CONFIG.DEFAULT_CHECKIN_SKIP,
    CONFIG.CHECKIN_SKIP_KEY,
    CONFIG.CHECKIN_SKIP_REMOVED_KEY,
  );
}

/**
 * 切换站点在签到跳过列表中的状态
 */
export function toggleCheckinSkip(host) {
  return _toggleManagedList(
    normalizeHost(host),
    CONFIG.DEFAULT_CHECKIN_SKIP,
    CONFIG.CHECKIN_SKIP_KEY,
    CONFIG.CHECKIN_SKIP_REMOVED_KEY,
  );
}
