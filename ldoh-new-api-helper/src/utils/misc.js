/**
 * 杂项工具函数
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";
import { STYLES } from "../styles.js";
import { normalizeHost } from "./format.js";
import { getAndSyncUserId } from "./storage.js";

/**
 * 注入样式表（防止重复注入）
 */
export function injectStyles() {
  const styleId = CONFIG.DOM.STYLE_ID;
  if (!document.getElementById(styleId)) {
    Log.debug("注入样式表");
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = STYLES;
    document.head.appendChild(s);
  }
}

/**
 * 复制文本到剪贴板
 */
export function copy(text) {
  try {
    GM_setClipboard(text);
    Log.debug(`已复制到剪贴板: ${text.substring(0, 20)}...`);
  } catch (e) {
    Log.error("复制到剪贴板失败", e);
  }
}

/**
 * 创建防抖函数
 */
export function debounce(func, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * 检测是否为 New API 站点（需同时满足：在白名单中 + 符合 New API 特征）
 */
export async function isNewApiSite(retryCount = 5) {
  try {
    const host = window.location.hostname;
    const normalizedHost = normalizeHost(host);

    const whitelist = GM_getValue(CONFIG.WHITELIST_KEY, []);
    const inWhitelist = whitelist.includes(normalizedHost);

    if (!inWhitelist) {
      Log.debug(`[站点识别] ${host} - 不在 LDOH 站点白名单中，跳过`);
      return false;
    }

    if (retryCount > 0) {
      Log.debug(`[站点识别] ${host} - 在 LDOH 白名单中，继续检测 New API 特征`);
    }

    let hasUserData = !!localStorage.getItem("user");

    if (!hasUserData && retryCount > 0) {
      Log.debug(`[站点识别] ${host} - 暂无用户数据，${retryCount === 1 ? "结束" : "等待"}重试...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return isNewApiSite(retryCount - 1);
    }

    if (hasUserData) {
      Log.debug(`[站点识别] ${host} - 检测到用户数据，判定为 New API 站点`);
      return true;
    }

    Log.debug(`[站点识别] ${host} - 未识别为 New API 站点`);
    return false;
  } catch (e) {
    Log.error("[站点识别] 检测失败", e);
    return false;
  }
}

/**
 * 等待用户登录（轮询检测）
 * @returns {Promise<string|null>} 用户 ID 或 null
 */
export async function waitForLogin() {
  Log.debug("[登录检测] 开始等待用户登录...");

  const host = window.location.hostname;
  for (let i = 0; i < CONFIG.LOGIN_CHECK_MAX_ATTEMPTS; i++) {
    const userId = getAndSyncUserId(host);
    if (userId) {
      Log.success(`[登录检测] 检测到登录，用户 ID: ${userId}`);
      return userId;
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIG.LOGIN_CHECK_INTERVAL));
  }

  Log.debug("[登录检测] 超时，未检测到登录");
  return null;
}

/**
 * 监听 localStorage 变化（用于检测登录）
 */
export function watchLoginStatus(callback) {
  const host = window.location.hostname;
  window.addEventListener("storage", (e) => {
    if (e.key === "user" && e.newValue) {
      Log.debug("[登录监听] 检测到 user 数据变化");
      const userId = getAndSyncUserId(host);
      if (userId) callback(userId);
    }
  });

  let lastUserId = getAndSyncUserId(host);
  setInterval(() => {
    const currentUserId = getAndSyncUserId(host);
    if (currentUserId && currentUserId !== lastUserId) {
      Log.debug("[登录监听] 轮询检测到登录");
      lastUserId = currentUserId;
      callback(currentUserId);
    }
  }, CONFIG.LOGIN_CHECK_INTERVAL);
}
