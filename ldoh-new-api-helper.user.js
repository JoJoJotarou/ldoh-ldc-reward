// ==UserScript==
// @name         LDOH New API Helper
// @namespace    jojojotarou.ldoh.newapi.helper
// @version      1.0.8
// @description  LDOH New API 助手（余额查询、签到状态、密钥获取、模型列表）
// @author       @JoJoJotarou
// @match        https://ldoh.105117.xyz/*
// @include      *
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/**
 * 版本更新日志
 *
 * v1.0.8 (2026-02-25)
 * - feat：新增右下角悬浮面板，仅在 LDOH 主站显示，按余额排序展示所有站点（签到、余额、密钥、刷新、定位）
 * - feat：自动提取并缓存站点名称，悬浮面板优先显示友好名称
 *
 * v1.0.7 (2026-02-13)
 * - feat：新增黑名单机制，屏蔽已知非 New API 站点或者 CF 拦截站点
 *
 * v1.0.6 (2026-02-12)
 * - bug：修复签到状态接口返回余额不正确的问题（统一从/api/user/self接口获取余额）
 *
 * v1.0.5 (2026-02-12)
 * - bug：修复签到状态接口获取余额错误的问题
 * - 优化：增加并发数到 15 个，后台请求最多占用 10 个并发（之前是 5 个），提升性能和响应速度
 *
 * v1.0.4 (2026-02-12)
 * - 优化： new api id 获取逻辑，使用 user.id 更可靠
 *
 * v1.0.3 (2026-02-12)
 * - 新增：LDOH 站点白名单机制，只识别 LDOH 卡片中的站点（白名单仅在页面加载时更新一次，避免频繁更新和筛选影响）
 * - 优化：两步验证机制（白名单检查 + New API 特征检测）
 *
 * v1.0.2
 * - 新增：密钥管理功能（创建、删除）
 * - 优化：请求并发控制和优先级
 *
 * v1.0.1
 * - 初始版本：余额查询、签到状态、模型列表
 */

(function () {
  "use strict";

  // 只在顶级窗口运行，屏蔽 Iframe 里的"串味"日志和执行
  if (window.top !== window.self) return;
  if (window.__LDOH_HELPER_RUNNING__) return;
  window.__LDOH_HELPER_RUNNING__ = true;

  // ==================== 配置管理 ====================
  const CONFIG = {
    STORAGE_KEY: "ldoh_newapi_data",
    SETTINGS_KEY: "ldoh_newapi_settings",
    WHITELIST_KEY: "ldoh_site_whitelist", // LDOH 站点白名单
    BLACKLIST: [
      "elysiver.h-e.top", // CF 拦截
      "demo.voapi.top", // 非 New API 站点
      "windhub.cc", // 非 New API 站点
      "ai.qaq.al", // 非 New API 站点
      "anyrouter.top", // CF 拦截
      "agentrouter.org", // CF 拦截
    ],
    DEFAULT_INTERVAL: 60, // 默认 60 分钟
    QUOTA_CONVERSION_RATE: 500000, // New API 额度转美元固定汇率
    MAX_CONCURRENT_REQUESTS: 15, // 最大并发请求数
    REQUEST_TIMEOUT: 10000, // 请求超时时间（毫秒）
    DEBOUNCE_DELAY: 800, // 防抖延迟（毫秒）
    LOGIN_CHECK_INTERVAL: 500, // 登录检测间隔（毫秒）
    LOGIN_CHECK_MAX_ATTEMPTS: 10, // 登录检测最大尝试次数（5秒）
    DOM: {
      CARD_SELECTOR: ".rounded-xl.shadow.group.relative",
      HELPER_CONTAINER_CLASS: "ldoh-helper-container",
      STYLE_ID: "ldoh-helper-css",
    },
  };

  // ==================== 日志系统 ====================
  const Log = {
    _print: (level, msg, color, bg, ...args) =>
      console.log(
        `%c LDOH %c ${level.toUpperCase()} %c ${msg}`,
        "background: #6366f1; color: white; border-radius: 3px 0 0 3px; font-weight: bold; padding: 1px 4px",
        `background: ${bg}; color: ${color}; border-radius: 0 3px 3px 0; font-weight: bold; padding: 1px 4px`,
        "color: inherit; font-weight: normal",
        ...args,
      ),
    _printDebug: (level, msg, color, bg, ...args) =>
      console.debug(
        `%c LDOH %c ${level.toUpperCase()} %c ${msg}`,
        "background: #6366f1; color: white; border-radius: 3px 0 0 3px; font-weight: bold; padding: 1px 4px",
        `background: ${bg}; color: ${color}; border-radius: 0 3px 3px 0; font-weight: bold; padding: 1px 4px`,
        "color: inherit; font-weight: normal",
        ...args,
      ),
    info: (msg, ...args) => Log._print("info", msg, "#fff", "#3b82f6", ...args),
    success: (msg, ...args) =>
      Log._print("ok", msg, "#fff", "#10b981", ...args),
    warn: (msg, ...args) => Log._print("warn", msg, "#000", "#f59e0b", ...args),
    error: (msg, ...args) => Log._print("err", msg, "#fff", "#ef4444", ...args),
    debug: (msg, ...args) =>
      Log._printDebug("debug", msg, "#fff", "#8b5cf6", ...args),
  };

  // ==================== 样式定义 ====================
  const STYLES = `
    :root {
      --ldoh-primary: #6366f1;
      --ldoh-primary-hover: #4f46e5;
      --ldoh-success: #10b981;
      --ldoh-warning: #f59e0b;
      --ldoh-danger: #ef4444;
      --ldoh-text: #1e293b;
      --ldoh-text-light: #64748b;
      --ldoh-bg: #ffffff;
      --ldoh-card-bg: rgba(255, 255, 255, 0.85);
      --ldoh-border: #e2e8f0;
      --ldoh-radius: 12px;
      --ldoh-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
    }

    .ldoh-helper-container {
      display: flex; align-items: center; gap: 4px; z-index: 10;
      pointer-events: auto; animation: ldoh-fade-in 0.3s ease-out;
    }
    @keyframes ldoh-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

    .ldoh-info-bar {
      display: flex; align-items: center; gap: 4px;
      font-size: 10px; font-weight: 600; color: inherit;
      white-space: nowrap;
    }

    .status-ok { background: var(--ldoh-success); }
    .status-none { background: #9ca3af; }

    .ldoh-btn {
      width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
      background: transparent; border-radius: 4px; border: none;
      cursor: pointer; color: inherit; transition: all 0.2s; flex-shrink: 0;
    }
    .ldoh-btn:hover { background: rgba(99, 102, 241, 0.1); color: var(--ldoh-primary); opacity: 1; transform: scale(1.1); }
    .ldoh-btn:active { transform: scale(0.95); }

    .ldoh-refresh-btn.loading svg { animation: ldoh-spin 0.8s linear infinite; }
    @keyframes ldoh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    /* Dialog */
    .ldh-overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4);
      z-index: 900; display: flex; justify-content: center; align-items: center;
      backdrop-filter: blur(6px); animation: ldoh-fade-in-blur 0.3s ease-out;
    }
    @keyframes ldoh-fade-in-blur { from { opacity: 0; backdrop-filter: blur(0); } to { opacity: 1; backdrop-filter: blur(6px); } }

    .ldh-dialog {
      background: #fff; width: min(680px, 94vw); max-height: 85vh;
      border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      display: flex; flex-direction: column; overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.2);
      transform-origin: center; animation: ldoh-zoom-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes ldoh-zoom-in { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

    .ldh-header {
      padding: 18px 24px; border-bottom: 1px solid var(--ldoh-border);
      display: flex; justify-content: space-between; align-items: center;
      background: linear-gradient(to right, #f8fafc, #ffffff);
    }
    .ldh-title { font-size: 16px; font-weight: 700; color: var(--ldoh-text); }
    .ldh-close {
      width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
      border-radius: 50%; color: var(--ldoh-text-light); cursor: pointer; transition: all 0.2s;
    }
    .ldh-close:hover { background: #f1f5f9; color: var(--ldoh-danger); transform: rotate(90deg); }

    .ldh-content { padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 24px; scrollbar-width: thin; }
    .ldh-sec-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .ldh-sec-title { font-size: 14px; font-weight: 700; color: var(--ldoh-text); display: flex; align-items: center; gap: 6px; }
    .ldh-sec-badge { font-size: 11px; padding: 2px 8px; background: #f1f5f9; border-radius: 20px; color: var(--ldoh-text-light); }

    .ldh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .ldh-item {
      padding: 12px; border: 1px solid var(--ldoh-border); border-radius: var(--ldoh-radius);
      font-size: 12px; color: var(--ldoh-text); background: #fff; cursor: pointer;
      position: relative; transition: all 0.2s ease;
      display: flex; flex-direction: column; gap: 4px;
    }
    .ldh-item:hover { border-color: var(--ldoh-primary); background: #f5f3ff; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1); }
    .ldh-item:active { transform: translateY(0); }

    .ldh-item.active { border-color: var(--ldoh-primary); background: #f5f3ff; box-shadow: inset 0 0 0 1px var(--ldoh-primary); }

    .ldh-quota { color: var(--ldoh-warning); font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    /* Toast */
    .ldoh-toast-container { position: fixed; top: 24px; right: 24px; z-index: 950; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
    .ldoh-toast {
      min-width: 300px; max-width: 450px; padding: 14px 18px; background: #fff; border-radius: 14px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 600;
      pointer-events: auto; animation: ldoh-slide-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      border-left: 5px solid var(--ldoh-primary);
    }
    @keyframes ldoh-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

    .ldoh-toast.success { border-left-color: var(--ldoh-success); }
    .ldoh-toast.error { border-left-color: var(--ldoh-danger); }
    .ldoh-toast.warning { border-left-color: var(--ldoh-warning); }

    .ldoh-toast-icon { width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
    .ldoh-toast.success .ldoh-toast-icon { background: #ecfdf5; color: var(--ldoh-success); }
    .ldoh-toast.error .ldoh-toast-icon { background: #fef2f2; color: var(--ldoh-danger); }
    .ldoh-toast.warning .ldoh-toast-icon { background: #fffbeb; color: var(--ldoh-warning); }
    .ldoh-toast.info .ldoh-toast-icon { background: #f0f9ff; color: var(--ldoh-primary); }

    .ldoh-toast-message { flex: 1; color: var(--ldoh-text); line-height: 1.5; }
    .ldoh-toast-close { width: 24px; height: 24px; flex-shrink: 0; cursor: pointer; color: var(--ldoh-text-light); display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s; }
    .ldoh-toast-close:hover { background: #f1f5f9; color: var(--ldoh-text); }

    /* ---- 悬浮面板 FAB ---- */
    .ldoh-fab {
      position: fixed; right: 20px; bottom: 20px; width: 44px; height: 44px;
      border-radius: 50%; background: var(--ldoh-primary); color: white; border: none;
      cursor: pointer; z-index: 800; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.45);
      transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .ldoh-fab:hover { background: var(--ldoh-primary-hover); transform: scale(1.08); }
    .ldoh-fab-badge {
      position: absolute; top: -4px; right: -4px; background: var(--ldoh-danger); color: white;
      border-radius: 99px; font-size: 9px; font-weight: 700; min-width: 16px; height: 16px;
      display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 2px solid white;
    }
    .ldoh-floating-panel {
      position: fixed; right: 20px; bottom: 76px; width: 500px; max-height: 62vh;
      background: #fff; border-radius: 16px; z-index: 799; flex-direction: column; overflow: hidden;
      box-shadow: 0 20px 40px -8px rgba(0,0,0,0.18), 0 4px 12px -2px rgba(0,0,0,0.08);
      border: 1px solid var(--ldoh-border); transform-origin: bottom right;
    }
    @keyframes ldoh-panel-in {
      from { opacity: 0; transform: scale(0.85) translateY(16px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .ldoh-panel-in { animation: ldoh-panel-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
    .ldoh-panel-hd {
      padding: 10px 14px; border-bottom: 1px solid var(--ldoh-border);
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
      background: linear-gradient(to right, #f8fafc, #fff);
    }
    .ldoh-panel-hd-title {
      flex: 1; font-size: 13px; font-weight: 700; color: var(--ldoh-text);
      display: flex; align-items: center; gap: 6px;
    }
    .ldoh-panel-hd-total { font-size: 11px; color: var(--ldoh-text-light); }
    .ldoh-panel-search {
      padding: 7px 12px; border-bottom: 1px solid var(--ldoh-border); flex-shrink: 0; background: #fff;
    }
    .ldoh-panel-search-wrap { position: relative; }
    .ldoh-panel-search-icon {
      position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
      opacity: 0.35; pointer-events: none;
    }
    .ldoh-panel-search-input {
      width: 100%; box-sizing: border-box; padding: 5px 8px 5px 28px;
      border: 1px solid var(--ldoh-border); border-radius: 6px; font-size: 12px;
      outline: none; background: #f8fafc; transition: border-color 0.2s, background 0.2s;
    }
    .ldoh-panel-search-input:focus { border-color: var(--ldoh-primary); background: #fff; }
    .ldoh-panel-body { overflow-y: auto; flex: 1; scrollbar-width: thin; }
    .ldoh-panel-row {
      display: grid; grid-template-columns: 1fr 54px 64px 22px 22px 22px 22px;
      align-items: center; gap: 6px; padding: 7px 12px;
      border-bottom: 1px solid #f1f5f9; transition: background 0.15s; font-size: 12px;
    }
    .ldoh-panel-row:hover { background: #f8fafc; }
    .ldoh-panel-row:last-child { border-bottom: none; }
    .ldoh-panel-name {
      font-weight: 600; color: var(--ldoh-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ldoh-panel-checkin {
      font-size: 10px; padding: 2px 5px; border-radius: 8px; font-weight: 600; text-align: center;
    }
    .ldoh-panel-checkin.ok { background: #ecfdf5; color: #059669; }
    .ldoh-panel-checkin.no { background: #fffbeb; color: #d97706; }
    .ldoh-panel-checkin.na { background: #f1f5f9; color: var(--ldoh-text-light); }
    .ldoh-panel-balance {
      font-weight: 700; color: #d97706; font-family: ui-monospace, monospace;
      font-size: 12px; text-align: right; white-space: nowrap;
    }
    .ldoh-panel-empty { padding: 32px; text-align: center; color: var(--ldoh-text-light); font-size: 13px; }

    /* 删除确认气泡 */
    .ldoh-confirm-pop {
      position: fixed; z-index: 1000;
      background: #fff; border: 1px solid var(--ldoh-border); border-radius: 10px;
      box-shadow: 0 6px 20px -4px rgba(0,0,0,0.15);
      padding: 8px 10px; display: flex; align-items: center; gap: 8px;
      font-size: 12px; font-weight: 600; color: var(--ldoh-text); white-space: nowrap;
      animation: ldoh-fade-in 0.15s ease-out;
    }
    .ldoh-confirm-pop::after {
      content: ""; position: absolute; bottom: -5px; right: 10px;
      width: 8px; height: 8px; background: #fff;
      border-right: 1px solid var(--ldoh-border); border-bottom: 1px solid var(--ldoh-border);
      transform: rotate(45deg);
    }
    .ldoh-pop-btn {
      padding: 3px 10px; border-radius: 6px; border: none; font-size: 11px;
      font-weight: 600; cursor: pointer; transition: all 0.15s;
    }
    .ldoh-pop-cancel { background: #f1f5f9; color: var(--ldoh-text); }
    .ldoh-pop-cancel:hover { background: #e2e8f0; }
    .ldoh-pop-confirm { background: var(--ldoh-danger); color: #fff; }
    .ldoh-pop-confirm:hover { background: #dc2626; }
  `;

  // ==================== 工具函数 ====================
  const Utils = {
    /**
     * 注入样式表（防止重复注入）
     */
    injectStyles() {
      const styleId = CONFIG.DOM.STYLE_ID;
      if (!document.getElementById(styleId)) {
        Log.debug("注入样式表");
        const s = document.createElement("style");
        s.id = styleId;
        s.textContent = STYLES;
        document.head.appendChild(s);
      }
    },

    /**
     * 从 localStorage 获取用户 ID
     * @returns {string|null} 用户 ID 或 null
     */
    getUserIdFromStorage() {
      try {
        const userStr = localStorage.getItem("user");
        if (!userStr) {
          Log.debug("localStorage 中未找到 user 数据");
          return null;
        }

        const user = JSON.parse(userStr);
        if (!user || typeof user !== "object") {
          Log.warn("user 数据格式无效");
          return null;
        }

        if (user.id) {
          const userId = user.id;
          if (userId) {
            Log.debug(`从 localStorage 获取到用户 ID: ${userId}`);
            return userId;
          }
        }

        Log.warn("无法从 user 数据中提取用户 ID", user);
        return null;
      } catch (e) {
        Log.error("解析 localStorage user 数据失败", e);
        return null;
      }
    },

    /**
     * 转换额度为美元格式
     * @param {number} q - 额度值
     * @returns {string} 格式化的美元金额
     */
    formatQuota: (q) => {
      if (q === undefined || q === null || isNaN(q)) {
        return "0.00";
      }
      return (q / CONFIG.QUOTA_CONVERSION_RATE).toFixed(2);
    },

    /**
     * 标准化主机名（移除 www 前缀和端口）
     * @param {string} host - 主机名
     * @returns {string} 标准化后的主机名
     */
    normalizeHost: (host) => {
      if (!host || typeof host !== "string") {
        Log.warn("normalizeHost 收到无效的 host", host);
        return "";
      }
      return host
        .toLowerCase()
        .split(":")[0]
        .replace(/^www\./, "");
    },

    /**
     * 保存站点数据到存储
     * @param {string} host - 主机名
     * @param {object} data - 要保存的数据
     */
    saveSiteData(host, data) {
      try {
        const all = GM_getValue(CONFIG.STORAGE_KEY, {});
        const key = Utils.normalizeHost(host);
        all[key] = { ...(all[key] || {}), ...data, ts: Date.now() };
        GM_setValue(CONFIG.STORAGE_KEY, all);
        Log.debug(`保存站点数据: ${key}`, data);
      } catch (e) {
        Log.error(`保存站点数据失败: ${host}`, e);
      }
    },

    /**
     * 从存储获取站点数据
     * @param {string} host - 主机名
     * @returns {object} 站点数据
     */
    getSiteData: (host) => {
      try {
        const all = GM_getValue(CONFIG.STORAGE_KEY, {});
        const key = Utils.normalizeHost(host);
        return all[key] || {};
      } catch (e) {
        Log.error(`获取站点数据失败: ${host}`, e);
        return {};
      }
    },

    /**
     * 复制文本到剪贴板
     * @param {string} text - 要复制的文本
     */
    copy: (text) => {
      try {
        GM_setClipboard(text);
        Log.debug(`已复制到剪贴板: ${text.substring(0, 20)}...`);
      } catch (e) {
        Log.error("复制到剪贴板失败", e);
      }
    },

    /**
     * 转义 HTML 特殊字符防止 XSS
     * @param {string} str - 要转义的字符串
     * @returns {string} 转义后的字符串
     */
    escapeHtml: (str) => {
      if (!str || typeof str !== "string") return "";
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    },

    /**
     * 创建防抖函数
     * @param {Function} func - 要防抖的函数
     * @param {number} delay - 延迟时间（毫秒）
     * @returns {Function} 防抖后的函数
     */
    debounce(func, delay) {
      let timer = null;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
      };
    },

    /**
     * Toast 通知系统
     */
    toast: {
      container: null,
      init() {
        if (!this.container) {
          this.container = document.createElement("div");
          this.container.className = "ldoh-toast-container";
          document.body.appendChild(this.container);
        }
      },
      show(message, type = "info", duration = 3000) {
        this.init();
        const toast = document.createElement("div");
        toast.className = `ldoh-toast ${type}`;

        const icons = {
          success:
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
          error:
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
          warning:
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
          info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        };

        toast.innerHTML = `
          <div class="ldoh-toast-icon">${icons[type] || icons.info}</div>
          <div class="ldoh-toast-message">${Utils.escapeHtml(message)}</div>
          <div class="ldoh-toast-close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
        `;

        toast.querySelector(".ldoh-toast-close").onclick = () =>
          this.remove(toast);
        this.container.appendChild(toast);
        if (duration > 0) setTimeout(() => this.remove(toast), duration);
        return toast;
      },
      remove(toast) {
        if (!toast || !toast.parentNode) return;
        toast.style.animation = "ldoh-slide-in 0.3s ease-in reverse forwards";
        setTimeout(() => toast.remove(), 300);
      },
      // 快捷方法
      success: (msg, duration) => Utils.toast.show(msg, "success", duration),
      error: (msg, duration) => Utils.toast.show(msg, "error", duration),
      warning: (msg, duration) => Utils.toast.show(msg, "warning", duration),
      info: (msg, duration) => Utils.toast.show(msg, "info", duration),
    },

    /**
     * 检测是否为 New API 站点（需同时满足：在白名单中 + 符合 New API 特征）
     * @param {number} retryCount - 重试次数（用于 OAuth 场景）
     * @returns {Promise<boolean>} 是否为 New API 站点
     */
    async isNewApiSite(retryCount = 3) {
      try {
        const host = window.location.hostname;

        // LDOH 站点直接返回 true
        if (host === "ldoh.105117.xyz") {
          return true;
        }

        const normalizedHost = this.normalizeHost(host);

        // 第一步：检查是否在黑名单中（优先级最高）
        if (
          CONFIG.BLACKLIST.length > 0 &&
          CONFIG.BLACKLIST.includes(normalizedHost)
        ) {
          Log.debug(`[站点识别] ${host} - 在黑名单中，跳过`);
          return false;
        }

        // 第二步：检查是否在 LDOH 站点白名单中
        const whitelist = GM_getValue(CONFIG.WHITELIST_KEY, []);

        if (!whitelist.includes(normalizedHost)) {
          Log.debug(`[站点识别] ${host} - 不在 LDOH 站点白名单中，跳过`);
          return false;
        }

        Log.debug(
          `[站点识别] ${host} - 在 LDOH 白名单中，继续检测 New API 特征`,
        );

        // 第三步：检查是否符合 New API 站点特征
        // 检查 localStorage 中是否有 user 数据（已登录过）
        let hasUserData = !!localStorage.getItem("user");

        // OAuth 场景：如果没有 user 数据，等待一会再检查
        if (!hasUserData && retryCount > 0) {
          Log.debug(
            `[站点识别] ${host} - 暂无用户数据，等待 ${retryCount} 次重试...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
          return this.isNewApiSite(retryCount - 1);
        }

        if (hasUserData) {
          Log.debug(`[站点识别] ${host} - 检测到用户数据，判定为 New API 站点`);
          return true;
        }

        // 检查 API 端点是否可访问
        Log.debug(`[站点识别] ${host} - 检查 API 端点...`);
        try {
          const response = await fetch("/api/status", {
            method: "GET",
            timeout: 3000,
          });
          if (response.ok && response.data?.data?._qn === "new-api") {
            Log.debug(
              `[站点识别] ${host} - API 端点可访问（_qn=new-api），判定为 New API 站点`,
            );
            return true;
          }
        } catch (e) {
          Log.debug(`[站点识别] ${host} - API 端点不可访问`);
        }

        Log.debug(`[站点识别] ${host} - 未识别为 New API 站点`);
        return false;
      } catch (e) {
        Log.error("[站点识别] 检测失败", e);
        return false;
      }
    },

    /**
     * 更新 LDOH 站点白名单（从卡片中提取所有站点域名）
     */
    updateSiteWhitelist() {
      try {
        const cards = document.querySelectorAll(CONFIG.DOM.CARD_SELECTOR);
        const hosts = new Set();

        cards.forEach((card) => {
          const links = Array.from(card.querySelectorAll("a"));
          const siteLink =
            links.find(
              (a) => a.href.startsWith("http") && !a.href.includes("linux.do"),
            ) || links[0];

          if (siteLink) {
            try {
              const host = new URL(siteLink.href).hostname;
              const normalizedHost = this.normalizeHost(host);
              // 过滤掉黑名单中的站点
              if (
                normalizedHost &&
                !CONFIG.BLACKLIST.includes(normalizedHost)
              ) {
                hosts.add(normalizedHost);
              }
            } catch (e) {
              // 忽略无效 URL
            }
          }
        });

        const whitelist = Array.from(hosts);
        GM_setValue(CONFIG.WHITELIST_KEY, whitelist);
        Log.debug(`[白名单更新] 共 ${whitelist.length} 个站点`, whitelist);
        return whitelist;
      } catch (e) {
        Log.error("[白名单更新] 更新失败", e);
        return [];
      }
    },

    /**
     * 等待用户登录（轮询检测）
     * @returns {Promise<string|null>} 用户 ID 或 null
     */
    async waitForLogin() {
      Log.debug("[登录检测] 开始等待用户登录...");

      for (let i = 0; i < CONFIG.LOGIN_CHECK_MAX_ATTEMPTS; i++) {
        const userId = this.getUserIdFromStorage();
        if (userId) {
          Log.success(`[登录检测] 检测到登录，用户 ID: ${userId}`);
          return userId;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.LOGIN_CHECK_INTERVAL),
        );
      }

      Log.debug("[登录检测] 超时，未检测到登录");
      return null;
    },

    /**
     * 监听 localStorage 变化（用于检测登录）
     * @param {Function} callback - 回调函数
     */
    watchLoginStatus(callback) {
      // 监听 storage 事件
      window.addEventListener("storage", (e) => {
        if (e.key === "user" && e.newValue) {
          Log.debug("[登录监听] 检测到 user 数据变化");
          const userId = this.getUserIdFromStorage();
          if (userId) {
            callback(userId);
          }
        }
      });

      // 轮询检测（用于同一标签页的变化）
      let lastUserId = this.getUserIdFromStorage();
      setInterval(() => {
        const currentUserId = this.getUserIdFromStorage();
        if (currentUserId && currentUserId !== lastUserId) {
          Log.debug("[登录监听] 轮询检测到登录");
          lastUserId = currentUserId;
          callback(currentUserId);
        }
      }, CONFIG.LOGIN_CHECK_INTERVAL);
    },
  };

  // ==================== API 请求模块 ====================
  const API = {
    // 并发请求队列
    _requestQueue: [],
    _activeRequests: 0,
    _activeBackgroundRequests: 0, // 后台请求计数

    /**
     * 发送 HTTP 请求（带并发控制和优先级）
     * @param {string} method - HTTP 方法
     * @param {string} host - 主机名
     * @param {string} path - 请求路径
     * @param {string|null} token - 认证令牌
     * @param {string|null} userId - 用户 ID
     * @param {object|null} body - 请求体（用于 POST/PUT 等）
     * @param {boolean} isInteractive - 是否为用户交互请求（高优先级）
     * @returns {Promise<object>} 响应数据
     */
    async request(
      method,
      host,
      path,
      token = null,
      userId = null,
      body = null,
      isInteractive = false,
    ) {
      // 并发控制：用户交互请求优先
      if (isInteractive) {
        // 交互请求：等待总并发数小于最大值
        while (this._activeRequests >= CONFIG.MAX_CONCURRENT_REQUESTS) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } else {
        // 后台请求：等待后台请求数小于限制（最多占用10个并发）
        const MAX_BACKGROUND_REQUESTS = 10;
        while (
          this._activeRequests >= CONFIG.MAX_CONCURRENT_REQUESTS ||
          this._activeBackgroundRequests >= MAX_BACKGROUND_REQUESTS
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        this._activeBackgroundRequests++;
      }

      this._activeRequests++;
      Log.debug(
        `[请求] ${method} ${host}${path} (并发: ${this._activeRequests}/${CONFIG.MAX_CONCURRENT_REQUESTS}, 后台: ${this._activeBackgroundRequests}, 交互: ${isInteractive})`,
      );

      try {
        const result = await new Promise((resolve, reject) => {
          const requestConfig = {
            method,
            url: `https://${host}${path}`,
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...(userId ? { "New-Api-User": userId } : {}),
            },
            timeout: CONFIG.REQUEST_TIMEOUT,
            onload: (res) => {
              try {
                const data = JSON.parse(res.responseText);
                if (res.status >= 200 && res.status < 300) {
                  Log.debug(`[响应成功] ${method} ${host}${path}`, data);
                  resolve(data);
                } else {
                  Log.warn(
                    `[响应错误] ${method} ${host}${path} - 状态码: ${res.status}`,
                    data,
                  );
                  resolve({
                    success: false,
                    error: `HTTP ${res.status}`,
                    data,
                  });
                }
              } catch (e) {
                Log.error(`[解析失败] ${method} ${host}${path}`, e);
                resolve({ success: false, error: "解析响应失败" });
              }
            },
            onerror: (err) => {
              Log.error(`[网络错误] ${method} ${host}${path}`, err);
              resolve({ success: false, error: "网络错误" });
            },
            ontimeout: () => {
              Log.warn(`[请求超时] ${method} ${host}${path}`);
              resolve({ success: false, error: "请求超时" });
            },
          };

          // 如果有 body，添加到请求配置中
          if (body) {
            requestConfig.data = JSON.stringify(body);
          }

          GM_xmlhttpRequest(requestConfig);
        });

        return result;
      } finally {
        this._activeRequests--;
        if (!isInteractive) {
          this._activeBackgroundRequests--;
        }
      }
    },

    /**
     * 更新站点状态（优化数据一致性和登录检测）
     * @param {string} host - 主机名
     * @param {string} userId - 用户 ID
     * @param {boolean} force - 是否强制更新
     * @returns {Promise<object>} 站点数据
     */
    async updateSiteStatus(host, userId, force = false) {
      try {
        let data = Utils.getSiteData(host);
        const settings = GM_getValue(CONFIG.SETTINGS_KEY, {
          interval: CONFIG.DEFAULT_INTERVAL,
        });

        // 检查是否需要更新（间隔逻辑）
        if (
          !force &&
          data.ts &&
          Date.now() - data.ts < settings.interval * 60 * 1000
        ) {
          Log.debug(
            `[跳过更新] ${host} - 距离上次更新 ${Math.round((Date.now() - data.ts) / 60000)} 分钟`,
          );
          return data;
        }

        Log.info(`[开始更新] ${host} (用户: ${userId}, 强制: ${force})`);

        // 获取 token（如果没有）
        if (!data.token) {
          Log.debug(`[获取 Token] ${host}`);
          const tokenRes = await this.request(
            "GET",
            host,
            "/api/user/token",
            null,
            userId,
          );
          if (tokenRes.success && tokenRes.data) {
            data.token = tokenRes.data;
            Log.success(`[Token 获取成功] ${host}`);
          } else {
            Log.error(`[Token 获取失败] ${host}`, tokenRes);
            return data;
          }
        }

        // 第一步：从 /api/user/self 获取余额
        Log.debug(`[获取用户信息] ${host}`);
        const selfRes = await this.request(
          "GET",
          host,
          "/api/user/self",
          data.token,
          userId,
        );

        let quota = null;
        if (selfRes.success && selfRes.data) {
          quota = selfRes.data?.quota;
          Log.debug(`[用户信息] ${host} - 额度: ${quota}`);
        } else {
          Log.error(`[用户信息获取失败] ${host}`, selfRes);
        }

        // 第二步：从签到接口获取签到状态
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        Log.debug(`[获取签到数据] ${host} - 月份: ${monthStr}`);

        const checkinRes = await this.request(
          "GET",
          host,
          `/api/user/checkin?month=${monthStr}`,
          data.token,
          userId,
        );

        let checkedInToday = false;
        let checkinSupported = true; // 是否支持签到
        let lastCheckinDate = data.lastCheckinDate || null; // 保留原有的签到日期

        if (checkinRes.success && checkinRes.data) {
          checkedInToday = !!checkinRes.data?.stats?.checked_in_today;

          // 特殊处理：wzw.pp.ua (WONG 公益站)
          if (host === "wzw.pp.ua") {
            Log.debug(`[签到数据] ${host} - 特殊站点`);
            checkedInToday = !!checkinRes.data?.checked_in;
          }

          // 如果已签到，更新签到日期为今天
          if (checkedInToday) {
            lastCheckinDate = todayStr;
          }

          Log.debug(
            `[签到数据] ${host} - 已签到: ${checkedInToday}, 签到日期: ${lastCheckinDate}`,
          );
        } else {
          // 无法调用 checkin 接口：旧版本或站外签到
          Log.warn(
            `[签到数据获取失败] ${host} - 可能不支持签到功能`,
            checkinRes,
          );
          checkinSupported = false;
          checkedInToday = null; // 标记为不支持签到
        }

        // 更新数据
        data.quota = quota;
        data.checkedInToday = checkedInToday;
        data.checkinSupported = checkinSupported;
        data.lastCheckinDate = lastCheckinDate;
        data.userId = userId;
        Utils.saveSiteData(host, data);

        const checkinStatus = checkinSupported
          ? checkedInToday
            ? "是"
            : "否"
          : "不支持";
        Log.success(
          `[更新完成] ${host} - 额度: $${Utils.formatQuota(quota)}, 签到: ${checkinStatus}`,
        );
        return data;
      } catch (e) {
        Log.error(`[更新异常] ${host}`, e);
        return Utils.getSiteData(host);
      }
    },

    /**
     * 获取站点详细信息（模型和密钥）
     * @param {string} host - 主机名
     * @param {string} token - 认证令牌
     * @param {string} userId - 用户 ID
     * @returns {Promise<object>} 详细信息
     */
    async fetchDetails(host, token, userId) {
      try {
        Log.debug(`[获取详情] ${host}`);
        const [pricingRes, tokenRes] = await Promise.all([
          this.request("GET", host, "/api/pricing", token, userId, null, true),
          this.request(
            "GET",
            host,
            "/api/token/?p=1&size=1000",
            token,
            userId,
            null,
            true,
          ),
        ]);

        const models = pricingRes.success ? pricingRes.data : [];
        const keys = tokenRes.success ? tokenRes.data?.items || [] : [];

        Log.debug(
          `[详情获取完成] ${host} - 模型: ${Array.isArray(models) ? models.length : 0}, 密钥: ${Array.isArray(keys) ? keys.length : 0}`,
        );

        return { models, keys };
      } catch (e) {
        Log.error(`[获取详情异常] ${host}`, e);
        return { models: [], keys: [] };
      }
    },

    /**
     * 获取用户分组列表
     * @param {string} host - 主机名
     * @param {string} token - 认证令牌
     * @param {string} userId - 用户 ID
     * @returns {Promise<object>} 分组列表
     */
    async fetchGroups(host, token, userId) {
      try {
        Log.debug(`[获取分组列表] ${host}`);
        const res = await this.request(
          "GET",
          host,
          "/api/user/self/groups",
          token,
          userId,
          null,
          true,
        );

        if (res.success && res.data) {
          Log.debug(
            `[分组列表获取完成] ${host} - 分组数: ${Object.keys(res.data).length}`,
          );
          return res.data;
        }

        Log.warn(`[分组列表获取失败] ${host}`, res);
        return {};
      } catch (e) {
        Log.error(`[获取分组列表异常] ${host}`, e);
        return {};
      }
    },

    /**
     * 创建密钥
     * @param {string} host - 主机名
     * @param {string} token - 认证令牌
     * @param {string} userId - 用户 ID
     * @param {string} name - 密钥名称
     * @param {string} group - 分组名称
     * @returns {Promise<object>} 创建结果
     */
    async createToken(host, token, userId, name, group) {
      try {
        Log.debug(`[创建密钥] ${host} - 名称: ${name}, 分组: ${group}`);
        const res = await this.request(
          "POST",
          host,
          "/api/token/",
          token,
          userId,
          {
            remain_quota: 0,
            expired_time: -1,
            unlimited_quota: true,
            model_limits_enabled: false,
            model_limits: "",
            cross_group_retry: false,
            name: name,
            group: group,
            allow_ips: "",
          },
          true,
        );

        if (res.success) {
          Log.success(`[密钥创建成功] ${host}`);
        } else {
          Log.error(`[密钥创建失败] ${host}`, res);
        }

        return res;
      } catch (e) {
        Log.error(`[创建密钥异常] ${host}`, e);
        return { success: false, error: "创建密钥异常" };
      }
    },

    /**
     * 删除密钥
     * @param {string} host - 主机名
     * @param {string} token - 认证令牌
     * @param {string} userId - 用户 ID
     * @param {number} tokenId - 密钥 ID
     * @returns {Promise<object>} 删除结果
     */
    async deleteToken(host, token, userId, tokenId) {
      try {
        Log.debug(`[删除密钥] ${host} - ID: ${tokenId}`);
        const res = await this.request(
          "DELETE",
          host,
          `/api/token/${tokenId}`,
          token,
          userId,
          null,
          true,
        );

        if (res.success) {
          Log.success(`[密钥删除成功] ${host}`);
        } else {
          Log.error(`[密钥删除失败] ${host}`, res);
        }

        return res;
      } catch (e) {
        Log.error(`[删除密钥异常] ${host}`, e);
        return { success: false, error: "删除密钥异常" };
      }
    },
  };

  // ==================== UI 渲染函数 ====================
  /**
   * 渲染卡片助手信息（带手动刷新按钮）
   * @param {HTMLElement} card - 卡片元素
   * @param {string} host - 主机名
   * @param {object} data - 站点数据
   */
  function renderHelper(card, host, data) {
    let container = card.querySelector(`.${CONFIG.DOM.HELPER_CONTAINER_CLASS}`);
    const ut = Array.from(card.querySelectorAll("div")).find(
      (el) =>
        el.textContent.includes("更新时间") &&
        (el.children.length === 0 ||
          el.querySelector(`.${CONFIG.DOM.HELPER_CONTAINER_CLASS}`)),
    );

    if (!container) {
      container = document.createElement("div");
      container.className = CONFIG.DOM.HELPER_CONTAINER_CLASS;

      if (ut) {
        // 融入更新时间行：完美对齐且不破坏原始布局
        ut.style.display = "flex";
        ut.style.alignItems = "center";
        ut.style.justifyContent = "space-between";
        ut.style.gap = "8px";

        // 确保原始文本不被挤压
        if (ut.children.length === 0) {
          const textSpan = document.createElement("span");
          textSpan.textContent = ut.textContent.trim();
          ut.textContent = "";
          ut.appendChild(textSpan);
        }
        ut.appendChild(container);
      } else {
        container.style.position = "absolute";
        container.style.bottom = "8px";
        container.style.right = "8px";
        card.appendChild(container);
      }
    }

    const balance = Utils.formatQuota(data.quota);

    container.innerHTML = "";

    // 信息栏
    const infoBar = document.createElement("div");
    infoBar.className = "ldoh-info-bar";

    const balanceSpan = document.createElement("span");
    balanceSpan.style.color = "#d97706"; // 更深更鲜明的琥珀金
    balanceSpan.textContent = `$${balance}`;
    infoBar.appendChild(balanceSpan);

    // 只有支持签到的站点才显示签到状态
    if (data.checkinSupported !== false) {
      const separator = document.createElement("span");
      separator.style.opacity = "0.5";
      separator.textContent = "|";
      infoBar.appendChild(separator);

      const checkinText = data.checkedInToday ? "已签到" : "未签到";
      const checkinSpan = document.createElement("span");
      checkinSpan.style.color = data.checkedInToday
        ? "var(--ldoh-success)"
        : "var(--ldoh-warning)";
      checkinSpan.textContent = checkinText;
      infoBar.appendChild(checkinSpan);
    }

    container.appendChild(infoBar);

    // 刷新按钮 (缩小化)
    const refreshBtn = document.createElement("div");
    refreshBtn.className = "ldoh-btn ldoh-refresh-btn";
    refreshBtn.title = "刷新数据";
    refreshBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
    refreshBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (refreshBtn.classList.contains("loading")) return;

      try {
        refreshBtn.classList.add("loading");
        const fresh = await API.updateSiteStatus(host, data.userId, true);
        renderHelper(card, host, fresh);
        FloatingPanel.refresh();
        Utils.toast.success(`${host} 数据已更新`);
      } catch (e) {
        Log.error(`[刷新失败] ${host}`, e);
        Utils.toast.error("刷新失败");
      } finally {
        refreshBtn.classList.remove("loading");
      }
    };
    container.appendChild(refreshBtn);

    // 更多按钮
    const moreBtn = document.createElement("div");
    moreBtn.className = "ldoh-btn";
    moreBtn.title = "密钥与模型详情";
    moreBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;
    moreBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showDetailsDialog(host, data);
    };
    container.appendChild(moreBtn);
  }

  /**
   * 显示详情对话框
   * @param {string} host - 主机名
   * @param {object} data - 站点数据
   */
  async function showDetailsDialog(host, data) {
    try {
      const overlay = UI.createOverlay(
        '<div class="ldh-header"><div class="ldh-title">正在获取密钥和模型...</div></div><div class="ldh-content" style="align-items:center;justify-content:center;min-height:200px"><div class="ldoh-refresh-btn loading"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg></div></div>',
      );

      const details = await API.fetchDetails(host, data.token, data.userId);
      overlay.remove();

      const { models, keys } = details;
      const keyArray = Array.isArray(keys) ? keys : [];
      const modelArray =
        models && Array.isArray(models.data)
          ? models.data
          : Array.isArray(models)
            ? models
            : [];

      // 构建对话框内容
      const dialog = document.createElement("div");
      dialog.className = "ldh-dialog";

      // 头部
      const header = document.createElement("div");
      header.className = "ldh-header";

      const title = document.createElement("div");
      title.className = "ldh-title";
      title.textContent = host;
      header.appendChild(title);

      const closeBtn = document.createElement("div");
      closeBtn.className = "ldh-close";
      closeBtn.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      closeBtn.onclick = () => {
        const currentOverlay = document.querySelector(".ldh-overlay");
        if (currentOverlay) {
          const dialog = currentOverlay.querySelector(".ldh-dialog");
          dialog.style.animation = "ldoh-zoom-in 0.2s ease-in reverse forwards";
          currentOverlay.style.animation =
            "ldoh-fade-in-blur 0.2s ease-in reverse forwards";
          setTimeout(() => currentOverlay.remove(), 200);
        }
      };
      header.appendChild(closeBtn);

      dialog.appendChild(header);

      // 内容区
      const content = document.createElement("div");
      content.className = "ldh-content";

      // 密钥部分
      const keysSecHeader = document.createElement("div");
      keysSecHeader.className = "ldh-sec-header";

      const keysTitle = document.createElement("div");
      keysTitle.className = "ldh-sec-title";
      keysTitle.innerHTML = `<span>🔑 密钥列表</span><span class="ldh-sec-badge">${keyArray.length}</span>`;
      keysSecHeader.appendChild(keysTitle);

      // 创建密钥按钮
      const createKeyBtn = document.createElement("button");
      createKeyBtn.style.cssText =
        "padding: 4px 12px; background: var(--ldoh-primary); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;";
      createKeyBtn.textContent = "+ 创建密钥";
      createKeyBtn.onmouseover = () =>
        (createKeyBtn.style.background = "var(--ldoh-primary-hover)");
      createKeyBtn.onmouseout = () =>
        (createKeyBtn.style.background = "var(--ldoh-primary)");
      keysSecHeader.appendChild(createKeyBtn);

      content.appendChild(keysSecHeader);

      // 创建密钥表单（初始隐藏）
      const createForm = document.createElement("div");
      createForm.style.cssText =
        "display: none; padding: 16px; background: #f8fafc; border: 1px solid var(--ldoh-border); border-radius: var(--ldoh-radius); margin-bottom: 12px;";

      const formGrid = document.createElement("div");
      formGrid.style.cssText =
        "display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end;";

      // 名称输入框
      const nameWrapper = document.createElement("div");
      const nameLabel = document.createElement("div");
      nameLabel.style.cssText =
        "font-size: 12px; font-weight: 600; color: var(--ldoh-text); margin-bottom: 6px;";
      nameLabel.textContent = "密钥名称";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "请输入密钥名称";
      nameInput.style.cssText =
        "width: 100%; padding: 8px 10px; border: 1px solid var(--ldoh-border); border-radius: 6px; font-size: 13px; outline: none; transition: all 0.2s;";
      nameInput.onfocus = () =>
        (nameInput.style.borderColor = "var(--ldoh-primary)");
      nameInput.onblur = () =>
        (nameInput.style.borderColor = "var(--ldoh-border)");
      nameWrapper.appendChild(nameLabel);
      nameWrapper.appendChild(nameInput);
      formGrid.appendChild(nameWrapper);

      // 分组选择
      const groupWrapper = document.createElement("div");
      const groupLabel = document.createElement("div");
      groupLabel.style.cssText =
        "font-size: 12px; font-weight: 600; color: var(--ldoh-text); margin-bottom: 6px;";
      groupLabel.textContent = "选择分组";
      const groupSelect = document.createElement("select");
      groupSelect.style.cssText =
        "width: 100%; padding: 8px 10px; border: 1px solid var(--ldoh-border); border-radius: 6px; font-size: 13px; outline: none; transition: all 0.2s; cursor: pointer; background: white;";
      groupSelect.onfocus = () =>
        (groupSelect.style.borderColor = "var(--ldoh-primary)");
      groupSelect.onblur = () =>
        (groupSelect.style.borderColor = "var(--ldoh-border)");
      groupWrapper.appendChild(groupLabel);
      groupWrapper.appendChild(groupSelect);
      formGrid.appendChild(groupWrapper);

      // 按钮组
      const buttonGroup = document.createElement("div");
      buttonGroup.style.cssText = "display: flex; gap: 8px;";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "取消";
      cancelBtn.style.cssText =
        "padding: 8px 16px; background: #e2e8f0; color: var(--ldoh-text); border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;";
      cancelBtn.onmouseover = () => (cancelBtn.style.background = "#cbd5e1");
      cancelBtn.onmouseout = () => (cancelBtn.style.background = "#e2e8f0");
      cancelBtn.onclick = () => {
        createForm.style.display = "none";
        createKeyBtn.textContent = "+ 创建密钥";
        nameInput.value = "";
      };

      const submitBtn = document.createElement("button");
      submitBtn.textContent = "创建";
      submitBtn.style.cssText =
        "padding: 8px 16px; background: var(--ldoh-primary); color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;";
      submitBtn.onmouseover = () =>
        (submitBtn.style.background = "var(--ldoh-primary-hover)");
      submitBtn.onmouseout = () =>
        (submitBtn.style.background = "var(--ldoh-primary)");
      submitBtn.onclick = async () => {
        const name = nameInput.value.trim();
        const group = groupSelect.value;

        if (!name) {
          Utils.toast.warning("请输入密钥名称");
          nameInput.focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "创建中...";
        submitBtn.style.opacity = "0.6";
        submitBtn.style.cursor = "not-allowed";

        try {
          const result = await API.createToken(
            host,
            data.token,
            data.userId,
            name,
            group,
          );

          if (result.success) {
            Utils.toast.success("密钥创建成功");
            createForm.style.display = "none";
            createKeyBtn.textContent = "+ 创建密钥";
            nameInput.value = "";
            // 关闭当前对话框并重新打开以刷新列表
            const currentOverlay = document.querySelector(".ldh-overlay");
            if (currentOverlay) {
              currentOverlay.remove();
            }
            setTimeout(() => showDetailsDialog(host, data), 300);
          } else {
            Utils.toast.error(result.message || "密钥创建失败");
            submitBtn.disabled = false;
            submitBtn.textContent = "创建";
            submitBtn.style.opacity = "1";
            submitBtn.style.cursor = "pointer";
          }
        } catch (e) {
          Log.error("创建密钥失败", e);
          Utils.toast.error("创建密钥失败");
          submitBtn.disabled = false;
          submitBtn.textContent = "创建";
          submitBtn.style.opacity = "1";
          submitBtn.style.cursor = "pointer";
        }
      };

      buttonGroup.appendChild(cancelBtn);
      buttonGroup.appendChild(submitBtn);
      formGrid.appendChild(buttonGroup);

      createForm.appendChild(formGrid);
      content.appendChild(createForm);

      // 创建密钥按钮点击事件
      createKeyBtn.onclick = async () => {
        if (createForm.style.display === "none") {
          // 展开表单，先获取分组列表
          createKeyBtn.disabled = true;
          createKeyBtn.textContent = "加载中...";

          try {
            const groups = await API.fetchGroups(host, data.token, data.userId);

            // 清空并填充分组选项
            groupSelect.innerHTML = "";
            Object.entries(groups).forEach(([groupName, groupInfo]) => {
              const option = document.createElement("option");
              option.value = groupName;
              option.textContent = `${groupName} - ${groupInfo.desc} (倍率: ${groupInfo.ratio})`;
              groupSelect.appendChild(option);
            });

            createForm.style.display = "block";
            createKeyBtn.textContent = "收起表单";
            setTimeout(() => nameInput.focus(), 100);
          } catch (e) {
            Log.error("获取分组列表失败", e);
            Utils.toast.error("获取分组列表失败");
          } finally {
            createKeyBtn.disabled = false;
          }
        } else {
          // 收起表单
          createForm.style.display = "none";
          createKeyBtn.textContent = "+ 创建密钥";
          nameInput.value = "";
        }
      };

      const keysGrid = document.createElement("div");
      keysGrid.className = "ldh-grid";

      let selectedGroup = null;
      const modelItems = [];

      if (keyArray.length) {
        keyArray.forEach((k) => {
          const item = document.createElement("div");
          item.className = "ldh-item ldh-key-item";
          item.dataset.group = k.group || "";
          item.dataset.key = `sk-${k.key}`;
          item.style.position = "relative";

          item.innerHTML = `
            <div style="font-weight: 700; color: var(--ldoh-text)">${Utils.escapeHtml(k.name || "未命名")}</div>
            ${k.group ? `<div style="font-size: 10px; color: var(--ldoh-primary); font-weight: 600">Group: ${Utils.escapeHtml(k.group)}</div>` : ""}
            <div style="font-size: 10px; color: var(--ldoh-text-light); font-family: monospace; overflow: hidden; text-overflow: ellipsis">sk-${k.key.substring(0, 16)}...</div>
          `;

          // 删除按钮
          const deleteBtn = document.createElement("div");
          deleteBtn.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
          deleteBtn.style.cssText =
            "position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: transparent; border-radius: 4px; cursor: pointer; opacity: 0; transition: all 0.2s; color: var(--ldoh-danger);";
          deleteBtn.title = "删除密钥";

          deleteBtn.onmouseover = () => {
            deleteBtn.style.background = "rgba(239, 68, 68, 0.1)";
          };
          deleteBtn.onmouseout = () => {
            deleteBtn.style.background = "transparent";
          };

          deleteBtn.onclick = async (e) => {
            e.stopPropagation();

            const confirmDelete = window.confirm(
              `确定要删除密钥 "${k.name || "未命名"}" 吗？\n\n此操作不可恢复！`,
            );
            if (!confirmDelete) return;

            try {
              deleteBtn.style.opacity = "0.5";
              deleteBtn.style.cursor = "not-allowed";

              const result = await API.deleteToken(
                host,
                data.token,
                data.userId,
                k.id,
              );

              if (result.success) {
                Utils.toast.success("密钥删除成功");
                // 从 DOM 中移除该项
                item.style.animation =
                  "ldoh-slide-in 0.3s ease-in reverse forwards";
                setTimeout(() => {
                  item.remove();
                  // 更新密钥数量徽章
                  const badge = document.querySelector(
                    ".ldh-sec-title .ldh-sec-badge",
                  );
                  if (badge) {
                    const currentCount = parseInt(badge.textContent) || 0;
                    badge.textContent = Math.max(0, currentCount - 1);
                  }
                }, 300);
              } else {
                Utils.toast.error(result.message || "密钥删除失败");
                deleteBtn.style.opacity = "1";
                deleteBtn.style.cursor = "pointer";
              }
            } catch (e) {
              Log.error("删除密钥失败", e);
              Utils.toast.error("删除密钥失败");
              deleteBtn.style.opacity = "1";
              deleteBtn.style.cursor = "pointer";
            }
          };

          item.appendChild(deleteBtn);

          // 鼠标悬停时显示删除按钮
          item.onmouseenter = () => {
            deleteBtn.style.opacity = "1";
          };
          item.onmouseleave = () => {
            deleteBtn.style.opacity = "0";
          };

          item.onclick = (e) => {
            // 如果点击的是删除按钮，不执行复制逻辑
            if (e.target.closest("div") === deleteBtn) return;

            const isAlreadyActive = item.classList.contains("active");
            keysGrid
              .querySelectorAll(".ldh-item")
              .forEach((el) => el.classList.remove("active"));

            if (isAlreadyActive) {
              selectedGroup = null;
              Utils.copy(item.dataset.key);
              Utils.toast.success("已复制密钥");
            } else {
              item.classList.add("active");
              selectedGroup = item.dataset.group;
              Utils.copy(item.dataset.key);
              Utils.toast.success(
                `已选中分组 ${selectedGroup || "默认"} 并复制密钥`,
              );
            }

            let visibleCount = 0;
            modelItems.forEach((mi) => {
              let isVisible = true;
              if (selectedGroup) {
                try {
                  const groups = JSON.parse(mi.dataset.modelGroups || "[]");
                  isVisible = groups.includes(selectedGroup);
                } catch (e) {
                  isVisible = mi.dataset.modelName
                    .toLowerCase()
                    .includes(selectedGroup.toLowerCase());
                }
              }
              mi.style.display = isVisible ? "" : "none";
              if (isVisible) visibleCount++;
            });
            modelsBadge.textContent = selectedGroup
              ? `${visibleCount}/${modelArray.length}`
              : modelArray.length;
          };

          keysGrid.appendChild(item);
        });
      } else {
        const empty = document.createElement("div");
        empty.style.gridColumn = "1/-1";
        empty.style.textAlign = "center";
        empty.style.padding = "20px";
        empty.style.color = "var(--ldoh-text-light)";
        empty.textContent = "暂无可用密钥";
        keysGrid.appendChild(empty);
      }
      content.appendChild(keysGrid);

      // 模型部分
      const modelsSecHeader = document.createElement("div");
      modelsSecHeader.className = "ldh-sec-header";

      const modelsTitle = document.createElement("div");
      modelsTitle.className = "ldh-sec-title";
      modelsTitle.innerHTML = `<span>🤖 模型列表</span>`;
      const modelsBadge = document.createElement("span");
      modelsBadge.className = "ldh-sec-badge";
      modelsBadge.textContent = modelArray.length;
      modelsTitle.appendChild(modelsBadge);
      modelsSecHeader.appendChild(modelsTitle);
      content.appendChild(modelsSecHeader);

      const modelsGrid = document.createElement("div");
      modelsGrid.className = "ldh-grid";

      if (modelArray.length) {
        modelArray.forEach((m) => {
          const item = document.createElement("div");
          item.className = "ldh-item";
          const modelName = m.model_name || m;
          item.dataset.copy = modelName;
          item.dataset.modelName = modelName;
          item.dataset.modelGroups = JSON.stringify(m.enable_groups || []);

          item.innerHTML = `
            <div style="font-weight: 600">${Utils.escapeHtml(modelName)}</div>
            <div style="font-size: 9px; color: var(--ldoh-text-light)">点击复制</div>
          `;

          item.onclick = () => {
            Utils.copy(item.dataset.copy);
            Utils.toast.success("已复制模型名");
          };

          modelsGrid.appendChild(item);
          modelItems.push(item);
        });
      } else {
        const empty = document.createElement("div");
        empty.style.gridColumn = "1/-1";
        empty.style.textAlign = "center";
        empty.style.padding = "20px";
        empty.style.color = "var(--ldoh-text-light)";
        empty.textContent = "暂无可用模型";
        modelsGrid.appendChild(empty);
      }

      content.appendChild(modelsGrid);
      dialog.appendChild(content);

      const newOverlay = UI.createOverlay("");
      newOverlay.querySelector(".ldh-dialog").replaceWith(dialog);
    } catch (e) {
      Log.error(`[详情失败] ${host}`, e);
      Utils.toast.error("获取详情失败");
    }
  }

  // ==================== UI 工具 ====================
  const UI = {
    /**
     * 创建遮罩层对话框
     * @param {string} html - 对话框 HTML 内容
     * @returns {HTMLElement} 遮罩层元素
     */
    createOverlay(html) {
      Utils.injectStyles();
      const ov = document.createElement("div");
      ov.className = "ldh-overlay";
      ov.innerHTML = `<div class="ldh-dialog">${html}</div>`;
      ov.onclick = (e) => {
        if (e.target === ov) {
          const dialog = ov.querySelector(".ldh-dialog");
          dialog.style.animation = "ldoh-zoom-in 0.2s ease-in reverse forwards";
          ov.style.animation =
            "ldoh-fade-in-blur 0.2s ease-in reverse forwards";
          setTimeout(() => ov.remove(), 200);
        }
      };
      document.body.appendChild(ov);
      return ov;
    },
  };

  // ==================== 卡片查找与悬浮面板 ====================

  /**
   * 从卡片 DOM 提取站点名称
   * @param {HTMLElement} card - 卡片元素
   * @param {string|null} fallback - 备用值
   * @returns {string|null} 站点名称
   */
  function extractSiteName(card, fallback) {
    // LDOH 卡片标准结构：站点名称在 h3 > a 中
    const h3Link = card.querySelector("h3 a");
    if (h3Link) {
      const text = h3Link.textContent.trim();
      if (text && text.length >= 2 && text.length <= 40 && !text.includes("http")) {
        return text;
      }
    }
    // 回退：h3 文本
    const h3 = card.querySelector("h3");
    if (h3) {
      const text = h3.textContent.trim();
      if (text && text.length >= 2 && text.length <= 40 && !text.includes("http")) {
        return text;
      }
    }
    return fallback;
  }

  /**
   * 根据 host 查找对应的卡片元素
   * @param {string} host - 主机名
   * @returns {HTMLElement|null} 卡片元素
   */
  function findCardByHost(host) {
    const normalizedHost = Utils.normalizeHost(host);
    const cards = document.querySelectorAll(CONFIG.DOM.CARD_SELECTOR);
    for (const card of cards) {
      const links = Array.from(card.querySelectorAll("a"));
      const siteLink =
        links.find((a) => a.href.startsWith("http") && !a.href.includes("linux.do")) ||
        links[0];
      if (!siteLink) continue;
      try {
        if (Utils.normalizeHost(new URL(siteLink.href).hostname) === normalizedHost)
          return card;
      } catch (e) {}
    }
    return null;
  }

  /**
   * 悬浮面板（仅 LDOH 主站）
   */
  const FloatingPanel = {
    _fab: null,
    _panel: null,
    _isOpen: false,
    _searchQuery: "",

    init() {
      if (document.getElementById("ldoh-fab")) return;
      Utils.injectStyles();

      // FAB 按钮
      const fab = document.createElement("button");
      fab.id = "ldoh-fab";
      fab.className = "ldoh-fab";
      fab.title = "站点总览";
      fab.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span class="ldoh-fab-badge" id="ldoh-fab-badge" style="display:none">0</span>
      `;
      fab.onclick = (e) => { e.stopPropagation(); this.toggle(); };
      document.body.appendChild(fab);
      this._fab = fab;

      // 面板
      const panel = document.createElement("div");
      panel.id = "ldoh-floating-panel";
      panel.className = "ldoh-floating-panel";
      panel.style.display = "none";
      document.body.appendChild(panel);
      this._panel = panel;

      // 点击面板外部关闭
      document.addEventListener("click", (e) => {
        if (this._isOpen && !panel.contains(e.target) && !fab.contains(e.target)) {
          this.close();
        }
      });

      this._updateBadge();
      Log.debug("[FloatingPanel] 初始化完成");
    },

    toggle() {
      this._isOpen ? this.close() : this.open();
    },

    open() {
      this._isOpen = true;
      this._panel.style.display = "flex";
      this._panel.classList.add("ldoh-panel-in");
      setTimeout(() => this._panel.classList.remove("ldoh-panel-in"), 300);
      this.render();
    },

    close() {
      this._isOpen = false;
      this._searchQuery = "";
      this._panel.style.display = "none";
    },

    refresh() {
      this._updateBadge();
      if (this._isOpen) this.render();
    },

    _updateBadge() {
      const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
      const count = Object.values(allData).filter((d) => d.userId).length;
      const badge = document.getElementById("ldoh-fab-badge");
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? "flex" : "none";
      }
    },

    render() {
      if (!this._panel) return;
      const allData = GM_getValue(CONFIG.STORAGE_KEY, {});

      // 按余额从大到小排序，过滤无 userId 站点
      const sorted = Object.entries(allData)
        .filter(([, d]) => d.userId)
        .sort(([, a], [, b]) => (b.quota || 0) - (a.quota || 0));

      const totalBalance = sorted.reduce((sum, [, d]) => sum + (d.quota || 0), 0);

      this._panel.innerHTML = "";

      // 头部
      const hd = document.createElement("div");
      hd.className = "ldoh-panel-hd";
      hd.innerHTML = `
        <div class="ldoh-panel-hd-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          站点总览 <span class="ldh-sec-badge">${sorted.length}</span>
        </div>
        <div class="ldoh-panel-hd-total">合计 <strong style="color:#d97706">$${Utils.formatQuota(totalBalance)}</strong></div>
      `;
      const closeBtn = document.createElement("div");
      closeBtn.className = "ldoh-btn";
      closeBtn.title = "关闭";
      closeBtn.style.flexShrink = "0";
      closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      closeBtn.onclick = () => this.close();
      hd.appendChild(closeBtn);
      this._panel.appendChild(hd);

      // 搜索栏
      const searchBar = document.createElement("div");
      searchBar.className = "ldoh-panel-search";
      searchBar.innerHTML = `
        <div class="ldoh-panel-search-wrap">
          <svg class="ldoh-panel-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="ldoh-panel-search-input" placeholder="搜索站点名称..." value="${Utils.escapeHtml(this._searchQuery)}">
        </div>
      `;
      this._panel.appendChild(searchBar);

      // 列表
      const body = document.createElement("div");
      body.className = "ldoh-panel-body";

      if (!sorted.length) {
        const empty = document.createElement("div");
        empty.className = "ldoh-panel-empty";
        empty.innerHTML = `<div>暂无站点数据</div><div style="font-size:11px;margin-top:4px;opacity:0.7">访问各站点后自动收录</div>`;
        body.appendChild(empty);
      } else {
        sorted.forEach(([host, siteData]) => {
          const row = document.createElement("div");
          row.className = "ldoh-panel-row";

          // 签到状态
          let checkinClass = "na", checkinText = "─";
          if (siteData.checkinSupported !== false) {
            if (siteData.checkedInToday === true) {
              checkinClass = "ok"; checkinText = "已签到";
            } else if (siteData.checkedInToday === false) {
              checkinClass = "no"; checkinText = "未签到";
            }
          }

          const displayName = siteData.siteName || host;
          row.dataset.searchKey = `${displayName} ${host}`.toLowerCase();
          if (this._searchQuery && !row.dataset.searchKey.includes(this._searchQuery)) {
            row.style.display = "none";
          }

          const nameEl = document.createElement("div");
          nameEl.className = "ldoh-panel-name";
          nameEl.title = host;
          nameEl.textContent = displayName;

          const checkinEl = document.createElement("div");
          checkinEl.className = `ldoh-panel-checkin ${checkinClass}`;
          checkinEl.textContent = checkinText;

          const balanceEl = document.createElement("div");
          balanceEl.className = "ldoh-panel-balance";
          balanceEl.textContent = `$${Utils.formatQuota(siteData.quota)}`;

          row.appendChild(nameEl);
          row.appendChild(checkinEl);
          row.appendChild(balanceEl);

          // 密钥按钮
          const keyBtn = document.createElement("div");
          keyBtn.className = "ldoh-btn";
          keyBtn.title = "密钥与模型";
          keyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;
          keyBtn.onclick = (e) => { e.stopPropagation(); showDetailsDialog(host, siteData); };

          // 刷新按钮
          const refreshBtn = document.createElement("div");
          refreshBtn.className = "ldoh-btn ldoh-refresh-btn";
          refreshBtn.title = "刷新数据";
          refreshBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
          refreshBtn.onclick = async (e) => {
            e.stopPropagation();
            if (refreshBtn.classList.contains("loading")) return;
            try {
              refreshBtn.classList.add("loading");
              const fresh = await API.updateSiteStatus(host, siteData.userId, true);
              const card = findCardByHost(host);
              if (card) renderHelper(card, host, fresh);
              FloatingPanel.refresh();
              Utils.toast.success(`${host} 已更新`);
            } catch (err) {
              Log.error(`[面板刷新] ${host}`, err);
              Utils.toast.error("刷新失败");
            } finally {
              refreshBtn.classList.remove("loading");
            }
          };

          // 定位按钮
          const locateBtn = document.createElement("div");
          locateBtn.className = "ldoh-btn";
          locateBtn.title = "定位卡片";
          locateBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
          locateBtn.onclick = (e) => {
            e.stopPropagation();
            const card = findCardByHost(host);
            if (card) {
              card.scrollIntoView({ behavior: "smooth", block: "center" });
              card.style.outline = "2px solid var(--ldoh-primary)";
              card.style.outlineOffset = "2px";
              setTimeout(() => { card.style.outline = ""; card.style.outlineOffset = ""; }, 2000);
            } else {
              Utils.toast.warning(`未找到 ${host} 的卡片`);
            }
          };

          row.appendChild(keyBtn);
          row.appendChild(refreshBtn);
          row.appendChild(locateBtn);

          // 删除按钮
          const deleteBtn = document.createElement("div");
          deleteBtn.className = "ldoh-btn";
          deleteBtn.title = "删除缓存数据";
          deleteBtn.style.color = "var(--ldoh-danger)";
          deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
          deleteBtn.onmouseenter = () => (deleteBtn.style.background = "rgba(239, 68, 68, 0.1)");
          deleteBtn.onmouseleave = () => (deleteBtn.style.background = "transparent");
          deleteBtn.onclick = (e) => {
            e.stopPropagation();

            // 关闭已有气泡
            document.getElementById("ldoh-confirm-pop")?.remove();

            const pop = document.createElement("div");
            pop.id = "ldoh-confirm-pop";
            pop.className = "ldoh-confirm-pop";
            pop.innerHTML = `
              <span>确认删除？</span>
              <button class="ldoh-pop-btn ldoh-pop-cancel">取消</button>
              <button class="ldoh-pop-btn ldoh-pop-confirm">确认</button>
            `;

            // 定位到删除按钮上方，右对齐
            const rect = deleteBtn.getBoundingClientRect();
            pop.style.top = `${rect.top - 48}px`;
            pop.style.right = `${window.innerWidth - rect.right}px`;
            document.body.appendChild(pop);

            pop.querySelector(".ldoh-pop-cancel").onclick = (e2) => {
              e2.stopPropagation();
              pop.remove();
            };

            pop.querySelector(".ldoh-pop-confirm").onclick = (e2) => {
              e2.stopPropagation();
              pop.remove();
              const all = GM_getValue(CONFIG.STORAGE_KEY, {});
              delete all[Utils.normalizeHost(host)];
              GM_setValue(CONFIG.STORAGE_KEY, all);
              const card = findCardByHost(host);
              if (card) {
                const container = card.querySelector(`.${CONFIG.DOM.HELPER_CONTAINER_CLASS}`);
                if (container) container.remove();
              }
              FloatingPanel.refresh();
              Utils.toast.success(`已删除 ${host} 的缓存数据`);
            };

            // 点击外部关闭
            const onOutside = (e2) => {
              if (!pop.contains(e2.target) && e2.target !== deleteBtn) {
                pop.remove();
                document.removeEventListener("click", onOutside);
              }
            };
            setTimeout(() => document.addEventListener("click", onOutside), 0);
          };
          row.appendChild(deleteBtn);

          body.appendChild(row);
        });
      }
      this._panel.appendChild(body);

      // 绑定搜索过滤（在 body 渲染完成后绑定，避免先绑定找不到 rows）
      const searchInput = searchBar.querySelector(".ldoh-panel-search-input");
      let searchDebounceTimer = null;
      searchInput.oninput = () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          this._searchQuery = searchInput.value.toLowerCase().trim();
          body.querySelectorAll(".ldoh-panel-row").forEach((row) => {
            const match = !this._searchQuery || row.dataset.searchKey.includes(this._searchQuery);
            row.style.display = match ? "" : "none";
          });
        }, 200);
      };
      // 自动聚焦（仅在有已有内容时）
      if (this._searchQuery) searchInput.focus();
    },
  };

  // ==================== LDOH ====================
  /**
   * 运行 LDOH模式（扫描并渲染所有卡片）
   */
  function runPortalMode() {
    try {
      Utils.injectStyles();

      const allCards = document.querySelectorAll(CONFIG.DOM.CARD_SELECTOR);
      const cards = Array.from(allCards).filter(
        (c) => !c.querySelector(`.${CONFIG.DOM.HELPER_CONTAINER_CLASS}`),
      );

      if (!cards.length) {
        Log.debug("[LDOH] 没有新卡片需要处理");
        return;
      }

      Log.debug(`[LDOH] 发现 ${cards.length} 个新卡片`);

      cards.forEach(async (card) => {
        try {
          const links = Array.from(card.querySelectorAll("a"));
          const siteLink =
            links.find(
              (a) => a.href.startsWith("http") && !a.href.includes("linux.do"),
            ) || links[0];
          if (!siteLink) {
            Log.debug("[LDOH] 卡片中未找到有效链接");
            return;
          }

          let host;
          try {
            host = new URL(siteLink.href).hostname;
          } catch (e) {
            Log.warn("[LDOH] 无效的 URL", siteLink.href);
            return;
          }

          const normalizedHost = Utils.normalizeHost(host);
          let data = Utils.getSiteData(normalizedHost);

          // 从 DOM 提取站点名称并更新（每次都更新，修正可能的缓存错误）
          const siteName = extractSiteName(card, null);
          if (siteName && siteName !== data.siteName) {
            Utils.saveSiteData(normalizedHost, { siteName });
            data = { ...data, siteName };
          } else if (siteName) {
            data = { ...data, siteName };
          }

          if (data.userId) {
            Log.debug(`[LDOH] 渲染卡片: ${host}`);
            renderHelper(card, host, data);

            // 异步更新数据
            const fresh = await API.updateSiteStatus(host, data.userId);
            if (fresh.ts !== data.ts) {
              Log.debug(`[LDOH] 更新卡片: ${host}`);
              renderHelper(card, host, fresh);
              FloatingPanel.refresh();
            }
          } else {
            // 标记为已检查，避免重复打印日志
            if (!card.dataset.ldohChecked) {
              card.dataset.ldohChecked = "true";
              Log.debug(`[LDOH] 卡片 ${host} 没有用户数据，跳过`);
            }
          }
        } catch (e) {
          Log.error("[LDOH] 处理卡片失败", e);
        }
      });
    } catch (e) {
      Log.error("[LDOH] 运行失败", e);
    }
  }

  // ==================== 初始化和清理 ====================
  let observerInstance = null;
  let debounceTimer = null;

  /**
   * 初始化脚本
   */
  async function init() {
    try {
      const host = window.location.hostname;
      const isPortal = host === "ldoh.105117.xyz";

      Log.info(`初始化开始 | 主机: ${host}`);

      if (isPortal) {
        // LDOH：监听 DOM 变化并渲染卡片
        Log.info("环境: LDOH");

        // 等待卡片加载完成后更新白名单（只执行一次）
        const initWhitelist = async () => {
          // 等待卡片加载（最多等待 5 秒）
          let attempts = 0;
          const maxAttempts = 10;
          while (attempts < maxAttempts) {
            const cards = document.querySelectorAll(CONFIG.DOM.CARD_SELECTOR);
            if (cards.length > 0) {
              Log.debug(`[LDOH] 检测到 ${cards.length} 个卡片，更新白名单`);
              Utils.updateSiteWhitelist();
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            attempts++;
          }
          if (attempts >= maxAttempts) {
            Log.warn("[LDOH] 等待卡片加载超时，使用现有白名单");
          }
        };

        // 异步初始化白名单
        initWhitelist();

        // 立即运行一次
        runPortalMode();

        // 使用防抖的 runPortalMode
        const debouncedRunPortalMode = Utils.debounce(
          runPortalMode,
          CONFIG.DEBOUNCE_DELAY,
        );

        observerInstance = new MutationObserver(() => {
          debouncedRunPortalMode();
        });

        observerInstance.observe(document.body, {
          childList: true,
          subtree: true,
        });

        Log.debug("[LDOH] MutationObserver 已启动");
        FloatingPanel.init();
      } else {
        // 公益站：检测是否为 New API 站点
        Log.info("环境: 公益站");

        const isNewApi = await Utils.isNewApiSite();
        if (!isNewApi) {
          Log.info(`${host} 不在 LDOH 白名单中或者不是 New API 站点，脚本退出`);
          return;
        }

        Log.success(`${host} 识别为 New API 站点`);

        // 检测登录状态
        let userId = Utils.getUserIdFromStorage();

        if (userId) {
          // 已登录：立即更新数据
          Log.success(`识别到登录 UID: ${userId}，正在记录站点数据...`);
          API.updateSiteStatus(window.location.host, userId, true).catch(
            (e) => {
              Log.error("更新站点状态失败", e);
            },
          );
        } else {
          // 未登录：等待登录或监听登录
          Log.debug("未检测到登录状态，开始监听...");

          // 先尝试等待登录（OAuth 场景）
          userId = await Utils.waitForLogin();
          if (userId) {
            Log.success(`OAuth 登录成功，用户 ID: ${userId}`);
            API.updateSiteStatus(window.location.host, userId, true).catch(
              (e) => {
                Log.error("更新站点状态失败", e);
              },
            );
          }

          // 持续监听登录状态变化
          Utils.watchLoginStatus((newUserId) => {
            Log.success(`检测到登录，用户 ID: ${newUserId}`);
            Utils.toast.success("检测到登录，正在获取站点数据...");
            API.updateSiteStatus(window.location.host, newUserId, true).catch(
              (e) => {
                Log.error("更新站点状态失败", e);
              },
            );
          });
        }
      }

      Log.info("初始化完成");
    } catch (e) {
      Log.error("初始化失败", e);
    }
  }

  /**
   * 清理资源（页面卸载时）
   */
  function cleanup() {
    try {
      Log.debug("清理资源...");

      if (observerInstance) {
        observerInstance.disconnect();
        observerInstance = null;
        Log.debug("MutationObserver 已断开");
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      Log.debug("清理完成");
    } catch (e) {
      Log.error("清理失败", e);
    }
  }

  // 页面卸载时清理
  window.addEventListener("beforeunload", cleanup);

  // 启动脚本
  init();

  // ==================== 菜单命令 ====================
  GM_registerMenuCommand("⚙️ 设置更新间隔", () => {
    try {
      const current = GM_getValue(CONFIG.SETTINGS_KEY, {
        interval: CONFIG.DEFAULT_INTERVAL,
      }).interval;
      const val = prompt(
        `请输入更新间隔（分钟）\n当前值: ${current} 分钟\n建议范围: 30-120 分钟`,
        current,
      );

      if (val === null) return; // 用户取消

      const interval = parseInt(val, 10);
      if (isNaN(interval) || interval < 1) {
        Utils.toast.error("无效的间隔值，请输入大于 0 的整数");
        return;
      }

      if (interval < 30) {
        const confirm = window.confirm(
          `⚠️ 间隔时间较短（${interval} 分钟）可能导致频繁请求。\n是否继续？`,
        );
        if (!confirm) return;
      }

      GM_setValue(CONFIG.SETTINGS_KEY, { interval });
      Log.success(`更新间隔已设置为 ${interval} 分钟`);
      Utils.toast.success(
        `更新间隔已设置为 ${interval} 分钟，页面将刷新`,
        2000,
      );
      setTimeout(() => location.reload(), 2000);
    } catch (e) {
      Log.error("设置更新间隔失败", e);
      Utils.toast.error("设置失败，请查看控制台");
    }
  });

  GM_registerMenuCommand("🔄 手动刷新所有站点", async () => {
    try {
      const isPortal = window.location.hostname === "ldoh.105117.xyz";
      if (!isPortal) {
        Utils.toast.warning("此功能仅在 LDOH 页面可用");
        return;
      }

      const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
      const siteCount = Object.keys(allData).length;

      if (siteCount === 0) {
        Utils.toast.info("没有站点数据需要刷新");
        return;
      }

      const confirm = window.confirm(
        `🔄 将刷新 ${siteCount} 个站点的数据\n这可能需要一些时间，是否继续？`,
      );
      if (!confirm) return;

      Log.info(`开始手动刷新 ${siteCount} 个站点`);

      // 创建持久的进度 toast（duration 为 0 表示不自动消失）
      const progressToast = Utils.toast.show(
        `正在刷新站点 0/${siteCount}...`,
        "info",
        0,
      );

      // 跟踪完成数量
      let completedCount = 0;

      // 等待所有站点刷新完成
      const hosts = Object.keys(allData);
      const promises = hosts.map(async (host) => {
        const data = allData[host];
        if (data.userId) {
          try {
            await API.updateSiteStatus(host, data.userId, true);
            completedCount++;
            // 更新进度
            const messageEl = progressToast.querySelector(
              ".ldoh-toast-message",
            );
            if (messageEl) {
              messageEl.textContent = `正在刷新站点 ${completedCount}/${siteCount}...`;
            }
          } catch (e) {
            Log.error(`刷新站点失败: ${host}`, e);
            completedCount++;
            // 即使失败也更新进度
            const messageEl = progressToast.querySelector(
              ".ldoh-toast-message",
            );
            if (messageEl) {
              messageEl.textContent = `正在刷新站点 ${completedCount}/${siteCount}...`;
            }
          }
        } else {
          completedCount++;
          const messageEl = progressToast.querySelector(".ldoh-toast-message");
          if (messageEl) {
            messageEl.textContent = `正在刷新站点 ${completedCount}/${siteCount}...`;
          }
        }
      });

      await Promise.all(promises);

      // 移除进度 toast
      Utils.toast.remove(progressToast);

      Utils.toast.success(`已完成刷新 ${siteCount} 个站点，页面即将刷新`, 800);
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      Log.error("手动刷新失败", e);
      Utils.toast.error("刷新失败，请查看控制台");
    }
  });

  GM_registerMenuCommand("🗑️ 清理缓存", () => {
    try {
      const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
      const siteCount = Object.keys(allData).length;

      if (siteCount === 0) {
        Utils.toast.info("缓存已经是空的");
        return;
      }

      const confirm = window.confirm(
        `⚠️ 将清除 ${siteCount} 个站点的缓存数据\n此操作不可恢复，是否继续？`,
      );
      if (!confirm) return;

      GM_setValue(CONFIG.STORAGE_KEY, {});
      Log.success("缓存已清理");
      Utils.toast.success("缓存已清理，页面将刷新", 2000);
      setTimeout(() => location.reload(), 2000);
    } catch (e) {
      Log.error("清理缓存失败", e);
      Utils.toast.error("清理失败，请查看控制台");
    }
  });

  GM_registerMenuCommand("🐛 调试：查看缓存", () => {
    try {
      const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
      const settings = GM_getValue(CONFIG.SETTINGS_KEY, {
        interval: CONFIG.DEFAULT_INTERVAL,
      });
      const whitelist = GM_getValue(CONFIG.WHITELIST_KEY, []);

      console.group(
        "%c[NewAPI Helper] 调试信息",
        "color: #8b5cf6; font-weight: bold; font-size: 14px",
      );
      console.log("%c配置信息", "color: #3b82f6; font-weight: bold");
      console.log("更新间隔:", settings.interval, "分钟");
      console.log("并发限制:", CONFIG.MAX_CONCURRENT_REQUESTS);
      console.log("请求超时:", CONFIG.REQUEST_TIMEOUT, "毫秒");

      console.log("\n%c站点白名单", "color: #f59e0b; font-weight: bold");
      console.log("白名单站点数量:", whitelist.length);
      console.log("白名单站点列表:", whitelist);

      console.log("\n%c站点数据", "color: #10b981; font-weight: bold");
      console.log("站点数量:", Object.keys(allData).length);
      console.table(
        Object.entries(allData).map(([host, data]) => ({
          站点: host,
          用户ID: data.userId || "无",
          额度:
            data.quota !== undefined
              ? `$${Utils.formatQuota(data.quota)}`
              : "未知",
          已签到: data.checkedInToday ? "是" : "否",
          最后更新: data.ts
            ? new Date(data.ts).toLocaleString("zh-CN")
            : "从未",
        })),
      );
      console.groupEnd();

      Utils.toast.success("调试信息已输出到控制台，请按 F12 查看", 4000);
    } catch (e) {
      Log.error("查看缓存失败", e);
      Utils.toast.error("查看失败，请查看控制台");
    }
  });

  GM_registerMenuCommand("ℹ️ 关于", () => {
    alert(
      `LDOH New API Helper v1.0.3\n\n` +
        `✨ 功能特性：\n` +
        `• 自动同步站点额度和签到状态\n` +
        `• 现代化的 UI 交互体验\n` +
        `• 密钥与模型智能过滤筛选\n` +
        `• 高性能并发请求控制系统\n` +
        `• 仅识别 LDOH 白名单中的站点\n\n` +
        `🎨 界面优化：\n` +
        `• 全新设计的现代感界面 (Tailwind Style)\n` +
        `• 极速响应的动画与微交互\n` +
        `• 精心调校的排版与色彩方案\n\n` +
        `📝 作者: @JoJoJotarou\n` +
        `📄 许可: MIT License`,
    );
  });
})();
