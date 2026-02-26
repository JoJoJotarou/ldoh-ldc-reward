// ==UserScript==
// @name         LDOH New API Helper
// @namespace    jojojotarou.ldoh.newapi.helper
// @version      1.0.17
// @description  LDOH New API 助手（余额查询、自动签到、密钥管理、模型查询）
// @author       @JoJoJotarou
// @match        https://ldoh.105117.xyz/*
// @include      *
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        unsafeWindow
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/**
 * 版本更新日志
 * v1.0.17 (2026-02-26)
 * - refactor：DEFAULT_CHECKIN_SKIP 改为 Map（host → reason），支持内置跳过原因
 * - fix：悬浮面板签到跳过按钮 hover 展示内置跳过原因；恢复签到二次确认中显示原因
 * - fix：悬浮面板 refresh() 加防抖，有活跃弹窗时推迟刷新，关闭后补刷
 * - fix：render() 保存/恢复滚动位置，避免刷新后回到顶部
 * - refactor：删除 CF Turnstile 相关逻辑
 *
 * v1.0.16 (2026-02-26)
 * - feat: 更新 Token 缓存有效期至 12 小时，优化签到逻辑
 *
 * v1.0.15 (2026-02-26)
 * - feat：监控 LDOH /api/sites 自动同步白名单、站点名及签到支持状态，无需手动刷新
 * - feat：公益站签到成功后即时同步数据；跨标签页实时更新悬浮按钮数字
 * - feat：支持 CF Turnstile 验证码签到（invisible 模式），站点配置自动缓存
 * - feat：不支持签到的站点按钮置灰禁用，hover 显示原因说明
 * - fix：密钥创建后原地刷新列表及数量角标；修复二次创建按钮失效的 bug
 * - refactor：runPortalMode 仅负责 UI 注入，数据刷新改由定时器/手动触发；页面加载立即检查过期缓存
 * - refactor：登录检测改为严格互斥分支，减少冗余监听器注册
 *
 * v1.0.14 (2026-02-26)
 * - fix：签到状态渲染改为对比 lastCheckinDate 与当天日期，避免跨日后仍显示「已签到」
 * - feat：新增后台自动定时刷新，按 interval 设定周期自动更新过期缓存
 * - perf：并发控制从 100ms 轮询改为 semaphore 事件唤醒，刷新全部自动受并发上限约束
 *
 * v1.0.13 (2026-02-25)
 * - feat：删除 GM 菜单中的「清理缓存」「调试：查看缓存」「关于」选项
 * - feat：悬浮面板新增「清理缓存」、「刷新站点白名单」设置项（从当前页面 DOM 重新扫描站点列表）
 * - feat：「关于」改为「使用说明」，覆盖所有功能要点，通过 overlay 对话框展示
 * - refactor：移除 GM_registerMenuCommand，去掉 GM_registerMenuCommand grant
 *
 * v1.0.12 (2026-02-25)
 * - feat：新增「设置并发数」设置项，支持独立配置总并发数和后台并发数上限
 * - refactor：并发控制从 CONFIG 常量改为运行时读取 SETTINGS_KEY，实时生效
 *
 * v1.0.11 (2026-02-25)
 * - feat：检测黑名单与签到跳过列表改为可配置，新增 BLACKLIST_KEY / CHECKIN_SKIP_KEY 存储
 * - feat：悬浮面板每行新增「加入/移出站点黑名单」和「跳过/恢复自动签到」按钮
 * - feat：设置菜单新增「重置站点黑名单」和「重置签到黑名单」选项
 *
 * v1.0.10 (2026-02-25)
 * - fix：删除设置更新间隔时 30 分钟以下的二次确认限制，允许任意 ≥ 5 分钟的值
 * - fix：设置更新间隔后不再刷新页面（interval 仅作缓存 TTL，运行时实时读取，无需重载）
 *
 * v1.0.9 (2026-02-25)
 * - feat：新增自动签到功能
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
    BLACKLIST_KEY: "ldoh_site_blacklist", // 用户自定义站点黑名单
    BLACKLIST_REMOVED_KEY: "ldoh_site_blacklist_removed", // 用户移除的内置站点黑名单
    CHECKIN_SKIP_KEY: "ldoh_checkin_skip", // 用户自定义签到跳过列表
    CHECKIN_SKIP_REMOVED_KEY: "ldoh_checkin_skip_removed", // 用户移除的内置签到跳过列表
    BLACKLIST: [
      "elysiver.h-e.top", // CF 拦截
      "demo.voapi.top", // 非 New API 站点
      "windhub.cc", // 非 New API 站点
      "ai.qaq.al", // 非 New API 站点
    ],
    DEFAULT_CHECKIN_SKIP: new Map([
      ["justdoitme.me", "CF Turnstile 拦截"],
      ["api.67.si", "CF Turnstile 拦截"],
      ["runanytime.hxi.me", "CF Turnstile 拦截"],
      ["anyrouter.top", "登录自动签到"],
    ]),
    DEFAULT_INTERVAL: 60, // 默认 60 分钟
    DEFAULT_MAX_CONCURRENT: 15, // 默认最大总并发数
    DEFAULT_MAX_BACKGROUND: 10, // 默认最大后台并发数
    QUOTA_CONVERSION_RATE: 500000, // New API 额度转美元固定汇率
    PORTAL_HOST: "ldoh.105117.xyz",
    REQUEST_TIMEOUT: 10000, // 请求超时时间（毫秒）
    TOKEN_TTL_MS: 12 * 60 * 60 * 1000, // Token 缓存有效期（12 小时）
    DEBOUNCE_DELAY: 800, // 防抖延迟（毫秒）
    LOGIN_CHECK_INTERVAL: 500, // 登录检测间隔（毫秒）
    LOGIN_CHECK_MAX_ATTEMPTS: 10, // 登录检测最大尝试次数（5秒）
    ANIMATION_FAST_MS: 200, // 快速动画时长（毫秒）
    ANIMATION_NORMAL_MS: 300, // 普通动画时长（毫秒）
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

  // ==================== 日期工具 ====================
  /**
   * 获取今天的日期字符串，格式 "YYYY-MM-DD"
   * @returns {string}
   */
  function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  /**
   * 获取当前月份字符串，格式 "YYYY-MM"
   * @returns {string}
   */
  function getCurrentMonthString() {
    return getTodayString().slice(0, 7);
  }

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
      background: #fff; width: min(520px, 94vw); max-height: 85vh;
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
      display: grid; grid-template-columns: 1fr 54px 64px 22px 22px 22px 22px 22px 22px;
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

    /* 设置菜单 */
    .ldoh-settings-pop {
      position: fixed; z-index: 1000;
      background: #fff; border: 1px solid var(--ldoh-border); border-radius: 10px;
      box-shadow: 0 6px 20px -4px rgba(0,0,0,0.15);
      padding: 6px; width: 140px;
      animation: ldoh-fade-in 0.15s ease-out;
    }
    .ldoh-settings-item {
      width: 100%; border: none; background: transparent;
      padding: 8px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap;
      font-size: 12px; font-weight: 600; color: var(--ldoh-text);
      text-align: left; transition: background 0.15s;
    }
    .ldoh-settings-item:hover { background: #f8fafc; }

    .ldoh-interval-pop {
      position: fixed; z-index: 1000;
      background: #fff; border: 1px solid var(--ldoh-border); border-radius: 10px;
      box-shadow: 0 6px 20px -4px rgba(0,0,0,0.15);
      padding: 10px; width: 220px;
      animation: ldoh-fade-in 0.15s ease-out;
    }
    .ldoh-interval-title {
      font-size: 12px; font-weight: 700; color: var(--ldoh-text);
      margin-bottom: 8px;
    }
    .ldoh-interval-hint {
      font-size: 11px; color: var(--ldoh-text-light);
      margin-top: 6px;
    }
    .ldoh-interval-input {
      width: 100%;
      border: 1px solid var(--ldoh-border);
      border-radius: 8px;
      padding: 7px 9px;
      font-size: 12px;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      box-sizing: border-box;
    }
    .ldoh-interval-input:focus {
      border-color: var(--ldoh-primary);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
    }
    .ldoh-interval-actions {
      margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px;
    }
  `;

  // ==================== 托管列表辅助 ====================
  /**
   * 判断规范化 host 是否在托管列表中（builtinList ∪ added \ removed）
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
          Log.debug(`从 localStorage 获取到用户 ID: ${user.id}`);
          return user.id;
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
     * 判断站点是否在黑名单中（内置 ∪ 用户追加 \ 用户移除）
     */
    isBlacklisted(host) {
      return _isInManagedList(
        this.normalizeHost(host),
        CONFIG.BLACKLIST,
        CONFIG.BLACKLIST_KEY,
        CONFIG.BLACKLIST_REMOVED_KEY,
      );
    },

    /**
     * 切换站点在黑名单中的状态
     * @returns {boolean} true=已加入黑名单，false=已移出
     */
    toggleBlacklist(host) {
      return _toggleManagedList(
        this.normalizeHost(host),
        CONFIG.BLACKLIST,
        CONFIG.BLACKLIST_KEY,
        CONFIG.BLACKLIST_REMOVED_KEY,
      );
    },

    /**
     * 获取站点在内置签到跳过列表中的原因（不在则返回 null）
     */
    getBuiltinCheckinSkipReason(host) {
      const n = this.normalizeHost(host);
      const list = CONFIG.DEFAULT_CHECKIN_SKIP;
      return list instanceof Map ? (list.get(n) ?? null) : (list[n] ?? null);
    },

    /**
     * 判断站点是否跳过自动签到（内置 ∪ 用户追加 \ 用户移除）
     */
    isCheckinSkipped(host) {
      const n = this.normalizeHost(host);
      if (this.getSiteData(n).checkinSupported === false) return true;
      return _isInManagedList(
        n,
        CONFIG.DEFAULT_CHECKIN_SKIP,
        CONFIG.CHECKIN_SKIP_KEY,
        CONFIG.CHECKIN_SKIP_REMOVED_KEY,
      );
    },

    /**
     * 切换站点在签到跳过列表中的状态
     * @returns {boolean} true=已加入跳过列表，false=已移出
     */
    toggleCheckinSkip(host) {
      return _toggleManagedList(
        this.normalizeHost(host),
        CONFIG.DEFAULT_CHECKIN_SKIP,
        CONFIG.CHECKIN_SKIP_KEY,
        CONFIG.CHECKIN_SKIP_REMOVED_KEY,
      );
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
    async isNewApiSite(retryCount = 5) {
      try {
        const host = window.location.hostname;

        // LDOH 站点直接返回 true
        if (host === CONFIG.PORTAL_HOST) {
          return true;
        }

        const normalizedHost = this.normalizeHost(host);

        // 第一步：检查是否在黑名单中（优先级最高）
        if (Utils.isBlacklisted(normalizedHost)) {
          Log.debug(`[站点识别] ${host} - 在黑名单中，跳过`);
          return false;
        }

        // 第二步：检查是否在 LDOH 站点白名单中
        const whitelist = GM_getValue(CONFIG.WHITELIST_KEY, []);
        const inWhitelist = whitelist.includes(normalizedHost);

        if (!inWhitelist) {
          Log.debug(`[站点识别] ${host} - 不在 LDOH 站点白名单中，跳过`);
          return false;
        }

        if (retryCount > 0) {
          Log.debug(
            `[站点识别] ${host} - 在 LDOH 白名单中，继续检测 New API 特征`,
          );
        }
        // 第三步：检查是否符合 New API 站点特征
        // 检查 localStorage 中是否有 user 数据（已登录过）
        let hasUserData = !!localStorage.getItem("user");

        // OAuth 场景：如果没有 user 数据，等待一会再检查
        if (!hasUserData && retryCount > 0) {
          Log.debug(
            `[站点识别] ${host} - 暂无用户数据，${
              retryCount === 1 ? "结束" : "等待"
            }重试...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
          return this.isNewApiSite(retryCount - 1);
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
    // 并发信号量
    _waiters: [], // { resolve, isInteractive }[]
    _activeRequests: 0,
    _activeBackgroundRequests: 0,

    /** 释放一个槽位，尝试唤醒等待队列中下一个可执行的请求 */
    _release(isInteractive) {
      this._activeRequests--;
      if (!isInteractive) this._activeBackgroundRequests--;
      const settings = GM_getValue(CONFIG.SETTINGS_KEY, {});
      const maxConcurrent =
        settings.maxConcurrent || CONFIG.DEFAULT_MAX_CONCURRENT;
      const maxBackground =
        settings.maxBackground || CONFIG.DEFAULT_MAX_BACKGROUND;
      // 优先唤醒交互请求
      let idx = this._waiters.findIndex(
        (w) => w.isInteractive && this._activeRequests < maxConcurrent,
      );
      if (idx < 0) {
        idx = this._waiters.findIndex(
          (w) =>
            !w.isInteractive &&
            this._activeRequests < maxConcurrent &&
            this._activeBackgroundRequests < maxBackground,
        );
      }
      if (idx >= 0) {
        const w = this._waiters.splice(idx, 1)[0];
        this._activeRequests++;
        if (!w.isInteractive) this._activeBackgroundRequests++;
        w.resolve();
      }
    },

    /** 获取一个槽位，若无可用槽位则挂起等待 */
    async _acquire(isInteractive) {
      const settings = GM_getValue(CONFIG.SETTINGS_KEY, {});
      const maxConcurrent =
        settings.maxConcurrent || CONFIG.DEFAULT_MAX_CONCURRENT;
      const maxBackground =
        settings.maxBackground || CONFIG.DEFAULT_MAX_BACKGROUND;
      const canRun = () =>
        this._activeRequests < maxConcurrent &&
        (isInteractive || this._activeBackgroundRequests < maxBackground);
      if (!canRun()) {
        await new Promise((resolve) =>
          this._waiters.push({ resolve, isInteractive }),
        );
        return; // 计数已由 _release 中预增
      }
      this._activeRequests++;
      if (!isInteractive) this._activeBackgroundRequests++;
    },

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
      await this._acquire(isInteractive);
      Log.debug(
        `[请求] ${method} ${host}${path} (并发: ${this._activeRequests}, 后台: ${this._activeBackgroundRequests}, 交互: ${isInteractive})`,
      );

      try {
        const result = await new Promise((resolve, reject) => {
          const requestConfig = {
            method,
            url: `https://${host}${path}`,
            headers: {
              "Content-Type": "application/json",
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0",
              Referer: `https://${host}/`,
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
        this._release(isInteractive);
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
          maxConcurrent: CONFIG.DEFAULT_MAX_CONCURRENT,
          maxBackground: CONFIG.DEFAULT_MAX_BACKGROUND,
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

        // 获取 token（首次或超过 12 小时重新获取）
        const tokenExpired =
          data.token &&
          (!data.tokenTs || Date.now() - data.tokenTs >= CONFIG.TOKEN_TTL_MS);
        if (!data.token || tokenExpired) {
          if (tokenExpired) Log.debug(`[Token 过期] ${host} - 重新获取`);
          else Log.debug(`[获取 Token] ${host}`);
          const tokenRes = await this.request(
            "GET",
            host,
            "/api/user/token",
            null,
            userId,
          );
          Log.debug(`[Token 响应] ${host}`, tokenRes);
          if (tokenRes.success && tokenRes.data) {
            data.token = tokenRes.data;
            data.tokenTs = Date.now();
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
        const monthStr = getCurrentMonthString();
        const todayStr = getTodayString();

        let checkedInToday = false;
        let checkinSupported = true;
        let lastCheckinDate = data.lastCheckinDate || null;

        // 若 LDOH 明确标记不支持签到，跳过探测，省一次 API 调用
        if (data.checkinSupported === false) {
          checkinSupported = false;
          checkedInToday = null;
          Log.debug(`[签到数据] ${host} - LDOH 标记不支持签到，跳过探测`);
        } else {
          Log.debug(`[获取签到数据] ${host} - 月份: ${monthStr}`);
          const checkinRes = await this.request(
            "GET",
            host,
            `/api/user/checkin?month=${monthStr}`,
            data.token,
            userId,
          );

          if (checkinRes.success && checkinRes.data) {
            checkedInToday = !!checkinRes.data?.stats?.checked_in_today;

            // 特殊处理：wzw.pp.ua (WONG 公益站)
            if (host === "wzw.pp.ua") {
              Log.debug(`[签到数据] ${host} - 特殊站点`);
              checkedInToday = !!checkinRes.data?.checked_in;
            }

            if (checkedInToday) lastCheckinDate = todayStr;

            Log.debug(
              `[签到数据] ${host} - 已签到: ${checkedInToday}, 签到日期: ${lastCheckinDate}`,
            );
          } else {
            Log.warn(
              `[签到数据获取失败] ${host} - 接口请求失败，保留现有签到支持状态`,
              checkinRes,
            );
            // 不强制写 false：请求失败可能是网络/CF 等临时问题，保留 LDOH 同步的值
            checkinSupported = data.checkinSupported ?? true;
            checkedInToday = null;
          }
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
            "/api/token/?p=0&size=1000",
            token,
            userId,
            null,
            true,
          ),
        ]);

        const models = pricingRes.success ? pricingRes.data : [];
        const keys = tokenRes.success
          ? Array.isArray(tokenRes.data)
            ? tokenRes.data
            : tokenRes.data?.items || []
          : [];

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

    /**
     * 签到
     * @param {string} host - 主机名
     * @param {string} token - 认证令牌
     * @param {string} userId - 用户 ID
     * @returns {Promise<object>} 签到结果
     */
    async checkin(host, token, userId) {
      try {
        Log.debug(`[签到] ${host}`);

        const res = await this.request(
          "POST",
          host,
          "/api/user/checkin",
          token,
          userId,
          null,
          true,
        );

        if (res.success) {
          const quotaAwarded = res.data?.quota_awarded || 0;
          Log.success(
            `[签到成功] ${host} - 获得额度: ${Utils.formatQuota(quotaAwarded)}`,
          );
        } else if (res.message && res.message.includes("已签到")) {
          // 今日已签到，视为成功
          Log.success(`[已签到] ${host} - 今日已签到`);
          // 标记为已签到状态，便于上层处理
          res.alreadyCheckedIn = true;
        } else {
          Log.error(`[签到失败] ${host}`, res);
        }

        return res;
      } catch (e) {
        Log.error(`[签到异常] ${host}`, e);
        return { success: false, error: "签到异常" };
      }
    },
  };

  // ==================== UI 渲染函数 ====================
  /**
   * 判断站点今日是否已签到（对比 lastCheckinDate 与当天日期，避免跨日后误判）
   */
  function isCheckedInToday(data) {
    if (data.checkedInToday !== true) return false;
    if (!data.lastCheckinDate) return true; // 旧缓存无日期字段，兼容处理
    return data.lastCheckinDate === getTodayString();
  }

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

      const checkinText = isCheckedInToday(data) ? "已签到" : "未签到";
      const checkinSpan = document.createElement("span");
      checkinSpan.style.color = isCheckedInToday(data)
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

  // ==================== 详情对话框辅助函数 ====================

  /** 关闭对话框 overlay（带退出动画） */
  function _closeDetailDialog() {
    const ov = document.querySelector(".ldh-overlay");
    if (!ov) return;
    ov.querySelector(".ldh-dialog").style.animation =
      `ldoh-zoom-in ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
    ov.style.animation = `ldoh-fade-in-blur ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
    setTimeout(() => ov.remove(), CONFIG.ANIMATION_FAST_MS);
  }

  /** 构建对话框头部（标题 + 关闭按钮） */
  function _buildDetailHeader(host) {
    const header = document.createElement("div");
    header.className = "ldh-header";
    const title = document.createElement("div");
    title.className = "ldh-title";
    title.textContent = host;
    const closeBtn = document.createElement("div");
    closeBtn.className = "ldh-close";
    closeBtn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.onclick = _closeDetailDialog;
    header.appendChild(title);
    header.appendChild(closeBtn);
    return header;
  }

  /** 构建创建密钥表单（含按钮），返回 { createForm, createKeyBtn } */
  function _buildCreateKeyForm(host, data, onCreated) {
    const createKeyBtn = document.createElement("button");
    createKeyBtn.style.cssText =
      "padding:4px 12px;background:var(--ldoh-primary);color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;";
    createKeyBtn.textContent = "+ 创建密钥";
    createKeyBtn.onmouseover = () =>
      (createKeyBtn.style.background = "var(--ldoh-primary-hover)");
    createKeyBtn.onmouseout = () =>
      (createKeyBtn.style.background = "var(--ldoh-primary)");

    const createForm = document.createElement("div");
    createForm.style.cssText =
      "display:none;padding:16px;background:#f8fafc;border:1px solid var(--ldoh-border);border-radius:var(--ldoh-radius);margin-bottom:12px;";

    const formGrid = document.createElement("div");
    formGrid.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;";

    // 名称输入
    const nameWrapper = document.createElement("div");
    const nameLabel = document.createElement("div");
    nameLabel.style.cssText =
      "font-size:12px;font-weight:600;color:var(--ldoh-text);margin-bottom:6px;";
    nameLabel.textContent = "密钥名称";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "请输入密钥名称";
    nameInput.style.cssText =
      "width:100%;padding:8px 10px;border:1px solid var(--ldoh-border);border-radius:6px;font-size:13px;outline:none;transition:all 0.2s;box-sizing:border-box;";
    nameInput.onfocus = () =>
      (nameInput.style.borderColor = "var(--ldoh-primary)");
    nameInput.onblur = () =>
      (nameInput.style.borderColor = "var(--ldoh-border)");
    nameWrapper.appendChild(nameLabel);
    nameWrapper.appendChild(nameInput);

    // 分组选择
    const groupWrapper = document.createElement("div");
    const groupLabel = document.createElement("div");
    groupLabel.style.cssText =
      "font-size:12px;font-weight:600;color:var(--ldoh-text);margin-bottom:6px;";
    groupLabel.textContent = "选择分组";
    const groupSelect = document.createElement("select");
    groupSelect.style.cssText =
      "width:100%;padding:8px 10px;border:1px solid var(--ldoh-border);border-radius:6px;font-size:13px;outline:none;cursor:pointer;background:white;box-sizing:border-box;";
    groupSelect.onfocus = () =>
      (groupSelect.style.borderColor = "var(--ldoh-primary)");
    groupSelect.onblur = () =>
      (groupSelect.style.borderColor = "var(--ldoh-border)");
    groupWrapper.appendChild(groupLabel);
    groupWrapper.appendChild(groupSelect);

    // 取消 / 创建按钮组
    const btnGroup = document.createElement("div");
    btnGroup.style.cssText = "display:flex;gap:8px;";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "取消";
    cancelBtn.style.cssText =
      "padding:8px 16px;background:#e2e8f0;color:var(--ldoh-text);border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;";
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
      "padding:8px 16px;background:var(--ldoh-primary);color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;";
    submitBtn.onmouseover = () =>
      (submitBtn.style.background = "var(--ldoh-primary-hover)");
    submitBtn.onmouseout = () =>
      (submitBtn.style.background = "var(--ldoh-primary)");
    submitBtn.onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) {
        Utils.toast.warning("请输入密钥名称");
        nameInput.focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "创建中...";
      submitBtn.style.opacity = "0.6";
      try {
        const result = await API.createToken(
          host,
          data.token,
          data.userId,
          name,
          groupSelect.value,
        );
        if (result.success) {
          Utils.toast.success("密钥创建成功");
          createForm.style.display = "none";
          createKeyBtn.textContent = "+ 创建密钥";
          nameInput.value = "";
          onCreated?.();
        } else {
          Utils.toast.error(result.message || "密钥创建失败");
        }
      } catch (e) {
        Log.error("创建密钥失败", e);
        Utils.toast.error("创建密钥失败");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "创建";
        submitBtn.style.opacity = "1";
      }
    };

    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(submitBtn);
    formGrid.appendChild(nameWrapper);
    formGrid.appendChild(groupWrapper);
    formGrid.appendChild(btnGroup);
    createForm.appendChild(formGrid);

    // 展开/收起表单
    createKeyBtn.onclick = async () => {
      if (createForm.style.display === "none") {
        createKeyBtn.disabled = true;
        createKeyBtn.textContent = "加载中...";
        try {
          const groups = await API.fetchGroups(host, data.token, data.userId);
          groupSelect.innerHTML = "";
          Object.entries(groups).forEach(([gName, gInfo]) => {
            const opt = document.createElement("option");
            opt.value = gName;
            opt.textContent = `${gName} - ${gInfo.desc} (倍率: ${gInfo.ratio})`;
            groupSelect.appendChild(opt);
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
        createForm.style.display = "none";
        createKeyBtn.textContent = "+ 创建密钥";
        nameInput.value = "";
      }
    };

    return { createForm, createKeyBtn };
  }

  /**
   * 构建单个密钥卡片 item
   * @param {object} k - 密钥数据
   * @param {string} host
   * @param {object} data - 站点数据
   * @param {HTMLElement} keysGrid
   * @param {Array} modelItems - 模型 item 引用数组（用于按分组过滤）
   * @param {HTMLElement} modelsBadge - 模型数量徽章
   * @param {Array} modelArray - 完整模型列表
   */
  function _buildKeyItem(
    k,
    host,
    data,
    keysGrid,
    modelItems,
    modelsBadge,
    modelArray,
  ) {
    let selectedGroup = null;

    const item = document.createElement("div");
    item.className = "ldh-item ldh-key-item";
    item.dataset.group = k.group || "";
    item.dataset.key = `sk-${k.key}`;
    item.style.position = "relative";
    item.innerHTML = `
      <div style="font-weight:700;color:var(--ldoh-text)">${Utils.escapeHtml(k.name || "未命名")}</div>
      ${k.group ? `<div style="font-size:10px;color:var(--ldoh-primary);font-weight:600">Group: ${Utils.escapeHtml(k.group)}</div>` : ""}
      <div style="font-size:10px;color:var(--ldoh-text-light);font-family:monospace;overflow:hidden;text-overflow:ellipsis">sk-${k.key.substring(0, 16)}...</div>
    `;

    // 删除按钮
    const deleteBtn = document.createElement("div");
    deleteBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    deleteBtn.style.cssText =
      "position:absolute;top:8px;right:8px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;opacity:0;transition:all 0.2s;color:var(--ldoh-danger);";
    deleteBtn.title = "删除密钥";
    deleteBtn.onmouseover = () =>
      (deleteBtn.style.background = "rgba(239,68,68,0.1)");
    deleteBtn.onmouseout = () => (deleteBtn.style.background = "transparent");
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      UI.confirm(deleteBtn, `删除密钥 "${k.name || "未命名"}"？`, async () => {
        deleteBtn.style.opacity = "0.5";
        try {
          const result = await API.deleteToken(
            host,
            data.token,
            data.userId,
            k.id,
          );
          if (result.success) {
            Utils.toast.success("密钥删除成功");
            item.style.animation =
              "ldoh-slide-in 0.3s ease-in reverse forwards";
            setTimeout(() => {
              item.remove();
              const badge = document.querySelector(
                ".ldh-sec-title .ldh-sec-badge",
              );
              if (badge)
                badge.textContent = Math.max(
                  0,
                  (parseInt(badge.textContent) || 0) - 1,
                );
            }, CONFIG.ANIMATION_NORMAL_MS);
          } else {
            Utils.toast.error(result.message || "密钥删除失败");
            deleteBtn.style.opacity = "1";
          }
        } catch (e) {
          Log.error("删除密钥失败", e);
          Utils.toast.error("删除密钥失败");
          deleteBtn.style.opacity = "1";
        }
      });
    };

    item.appendChild(deleteBtn);
    item.onmouseenter = () => (deleteBtn.style.opacity = "1");
    item.onmouseleave = () => (deleteBtn.style.opacity = "0");

    // 点击：复制密钥 + 按分组过滤模型
    item.onclick = (e) => {
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
        Utils.toast.success(`已选中分组 ${selectedGroup || "默认"} 并复制密钥`);
      }
      let visibleCount = 0;
      modelItems.forEach((mi) => {
        let isVisible = true;
        if (selectedGroup) {
          try {
            isVisible = JSON.parse(mi.dataset.modelGroups || "[]").includes(
              selectedGroup,
            );
          } catch {
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

    return item;
  }

  /**
   * 显示详情对话框
   * @param {string} host - 主机名
   * @param {object} data - 站点数据
   */
  async function showDetailsDialog(host, data) {
    try {
      const loadingOverlay = UI.createOverlay(
        '<div class="ldh-header"><div class="ldh-title">正在获取密钥和模型...</div></div>' +
          '<div class="ldh-content" style="align-items:center;justify-content:center;min-height:200px">' +
          '<div class="ldoh-refresh-btn loading"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg></div></div>',
      );

      const details = await API.fetchDetails(host, data.token, data.userId);
      loadingOverlay.remove();

      const { models, keys } = details;
      const keyArray = Array.isArray(keys) ? keys : [];
      const modelArray =
        models?.data && Array.isArray(models.data)
          ? models.data
          : Array.isArray(models)
            ? models
            : [];

      const dialog = document.createElement("div");
      dialog.className = "ldh-dialog";
      dialog.appendChild(_buildDetailHeader(host));

      const content = document.createElement("div");
      content.className = "ldh-content";

      // ── 密钥区域 ──
      const modelItems = [];
      const modelsBadge = document.createElement("span");
      modelsBadge.className = "ldh-sec-badge";
      modelsBadge.textContent = modelArray.length;

      const keysSecHeader = document.createElement("div");
      keysSecHeader.className = "ldh-sec-header";
      const keysTitle = document.createElement("div");
      keysTitle.className = "ldh-sec-title";
      keysTitle.innerHTML = `<span>🔑 密钥列表</span><span class="ldh-sec-badge">${keyArray.length}</span>`;
      keysSecHeader.appendChild(keysTitle);

      // keysGrid 需先于 _buildCreateKeyForm 创建，供 onCreated 回调引用
      const keysGrid = document.createElement("div");
      keysGrid.className = "ldh-grid";
      if (keyArray.length) {
        keyArray.forEach((k) =>
          keysGrid.appendChild(
            _buildKeyItem(
              k,
              host,
              data,
              keysGrid,
              modelItems,
              modelsBadge,
              modelArray,
            ),
          ),
        );
      } else {
        const empty = document.createElement("div");
        empty.style.cssText =
          "grid-column:1/-1;text-align:center;padding:20px;color:var(--ldoh-text-light);";
        empty.textContent = "暂无可用密钥";
        keysGrid.appendChild(empty);
      }

      // 创建成功后就地刷新密钥列表，无需关/开弹窗
      const onCreated = async () => {
        const tokenRes = await API.request(
          "GET",
          host,
          "/api/token/?p=1&size=1000",
          data.token,
          data.userId,
          null,
          true,
        );
        const newKeys = tokenRes.success
          ? Array.isArray(tokenRes.data)
            ? tokenRes.data
            : tokenRes.data?.items || []
          : [];
        keysGrid.innerHTML = "";
        if (newKeys.length) {
          newKeys.forEach((k) =>
            keysGrid.appendChild(
              _buildKeyItem(
                k,
                host,
                data,
                keysGrid,
                modelItems,
                modelsBadge,
                modelArray,
              ),
            ),
          );
        } else {
          const empty = document.createElement("div");
          empty.style.cssText =
            "grid-column:1/-1;text-align:center;padding:20px;color:var(--ldoh-text-light);";
          empty.textContent = "暂无可用密钥";
          keysGrid.appendChild(empty);
        }
        const badge = keysTitle.querySelector(".ldh-sec-badge");
        if (badge) badge.textContent = newKeys.length;
      };

      const { createForm, createKeyBtn } = _buildCreateKeyForm(
        host,
        data,
        onCreated,
      );
      keysSecHeader.appendChild(createKeyBtn);
      content.appendChild(keysSecHeader);
      content.appendChild(createForm);
      content.appendChild(keysGrid);

      // ── 模型区域 ──
      const modelsSecHeader = document.createElement("div");
      modelsSecHeader.className = "ldh-sec-header";
      const modelsTitle = document.createElement("div");
      modelsTitle.className = "ldh-sec-title";
      modelsTitle.innerHTML = `<span>🤖 模型列表</span>`;
      modelsTitle.appendChild(modelsBadge);
      modelsSecHeader.appendChild(modelsTitle);
      content.appendChild(modelsSecHeader);

      const modelsGrid = document.createElement("div");
      modelsGrid.className = "ldh-grid";
      if (modelArray.length) {
        modelArray.forEach((m) => {
          const modelName = m.model_name || m;
          const item = document.createElement("div");
          item.className = "ldh-item";
          item.dataset.copy = modelName;
          item.dataset.modelName = modelName;
          item.dataset.modelGroups = JSON.stringify(m.enable_groups || []);
          item.innerHTML = `
            <div style="font-weight:600">${Utils.escapeHtml(modelName)}</div>
            <div style="font-size:9px;color:var(--ldoh-text-light)">点击复制</div>
          `;
          item.onclick = () => {
            Utils.copy(modelName);
            Utils.toast.success("已复制模型名");
          };
          modelsGrid.appendChild(item);
          modelItems.push(item);
        });
      } else {
        const empty = document.createElement("div");
        empty.style.cssText =
          "grid-column:1/-1;text-align:center;padding:20px;color:var(--ldoh-text-light);";
        empty.textContent = "暂无可用模型";
        modelsGrid.appendChild(empty);
      }
      content.appendChild(modelsGrid);

      dialog.appendChild(content);

      const overlay = UI.createOverlay("");
      overlay.querySelector(".ldh-dialog").replaceWith(dialog);
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
          ov.querySelector(".ldh-dialog").style.animation =
            `ldoh-zoom-in ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
          ov.style.animation = `ldoh-fade-in-blur ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
          setTimeout(() => ov.remove(), CONFIG.ANIMATION_FAST_MS);
        }
      };
      document.body.appendChild(ov);
      return ov;
    },

    /**
     * 弹出锚定在 anchorEl 附近的确认 Popover
     * @param {HTMLElement} anchorEl - 锚定元素
     * @param {string} text - 提示文本
     * @param {Function} onConfirm - 确认回调（支持异步）
     */
    confirm(anchorEl, text, onConfirm) {
      if (!anchorEl) return;
      document.getElementById("ldoh-confirm-pop")?.remove();
      Utils.injectStyles();

      const pop = document.createElement("div");
      pop.id = "ldoh-confirm-pop";
      pop.className = "ldoh-confirm-pop";
      pop.innerHTML = `
        <span style="white-space:pre-line">${Utils.escapeHtml(text)}</span>
        <button class="ldoh-pop-btn ldoh-pop-cancel">取消</button>
        <button class="ldoh-pop-btn ldoh-pop-confirm">确认</button>
      `;

      const rect = anchorEl.getBoundingClientRect();
      pop.style.top = `${rect.top - 48}px`;
      pop.style.right = `${window.innerWidth - rect.right}px`;
      document.body.appendChild(pop);

      let outsideHandler;
      const remove = () => {
        if (outsideHandler)
          document.removeEventListener("click", outsideHandler);
        pop.remove();
      };

      pop.querySelector(".ldoh-pop-cancel").onclick = (e) => {
        e.stopPropagation();
        remove();
      };
      pop.querySelector(".ldoh-pop-confirm").onclick = (e) => {
        e.stopPropagation();
        remove();
        try {
          const r = onConfirm?.();
          if (r?.then) r.catch((err) => Log.error("[确认操作执行失败]", err));
        } catch (err) {
          Log.error("[确认操作执行失败]", err);
        }
      };

      setTimeout(() => {
        outsideHandler = (e) => {
          if (!pop.contains(e.target) && !anchorEl.contains(e.target)) remove();
        };
        document.addEventListener("click", outsideHandler);
      }, 0);
    },
  };

  // ==================== 卡片查找与悬浮面板 ====================

  /**
   * 从卡片 DOM 提取站点名称
   * @param {HTMLElement} card - 卡片元素
   * @param {string|null} fallback - 备用值
   * @returns {string|null} 站点名称
   */
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
        links.find(
          (a) => a.href.startsWith("http") && !a.href.includes("linux.do"),
        ) || links[0];
      if (!siteLink) continue;
      try {
        if (
          Utils.normalizeHost(new URL(siteLink.href).hostname) ===
          normalizedHost
        )
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
    _checkinRunning: false,
    _refreshAllRunning: false,
    _confirmPop: null,
    _confirmOutsideHandler: null,
    _settingsPop: null,
    _settingsOutsideHandler: null,
    _intervalPop: null,
    _intervalOutsideHandler: null,
    _concurrencyPop: null,
    _concurrencyOutsideHandler: null,
    _pendingRefresh: false,
    _refreshTimer: null,
    _rendering: false,

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
      fab.onclick = (e) => {
        e.stopPropagation();
        this.toggle();
      };
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
        const isOnPopover =
          (this._confirmPop && this._confirmPop.contains(e.target)) ||
          (this._settingsPop && this._settingsPop.contains(e.target)) ||
          (this._intervalPop && this._intervalPop.contains(e.target)) ||
          (this._concurrencyPop && this._concurrencyPop.contains(e.target));
        if (
          this._isOpen &&
          !panel.contains(e.target) &&
          !fab.contains(e.target) &&
          !isOnPopover
        ) {
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
      setTimeout(
        () => this._panel.classList.remove("ldoh-panel-in"),
        CONFIG.ANIMATION_NORMAL_MS,
      );
      this.render();
    },

    close() {
      this._isOpen = false;
      this._searchQuery = "";
      this._removeIntervalPopover();
      this._removeSettingsMenu();
      this._removeConfirmPopover();
      this._removeConcurrencyPopover();
      this._panel.style.display = "none";
    },

    refresh() {
      this._updateBadge();
      if (!this._isOpen) return;
      // 有活跃交互弹窗时推迟刷新，避免打断用户操作
      if (
        this._confirmPop ||
        this._settingsPop ||
        this._intervalPop ||
        this._concurrencyPop
      ) {
        this._pendingRefresh = true;
        return;
      }
      // 防抖：多次连续调用（如批量刷新每站触发一次）合并为一次渲染
      clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => this.render(), 150);
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

    _removeConfirmPopover() {
      if (this._confirmOutsideHandler) {
        document.removeEventListener("click", this._confirmOutsideHandler);
        this._confirmOutsideHandler = null;
      }
      if (this._confirmPop) {
        this._confirmPop.remove();
        this._confirmPop = null;
      } else {
        document.getElementById("ldoh-confirm-pop")?.remove();
      }
      if (!this._rendering) this._flushPendingRefresh();
    },

    _showConfirmPopover(anchorEl, text, onConfirm) {
      if (!anchorEl) return;
      this._removeIntervalPopover();
      this._removeSettingsMenu();
      this._removeConfirmPopover();
      this._removeConcurrencyPopover();

      const pop = document.createElement("div");
      pop.id = "ldoh-confirm-pop";
      pop.className = "ldoh-confirm-pop";
      pop.innerHTML = `
        <span style="white-space:pre-line">${Utils.escapeHtml(text)}</span>
        <button class="ldoh-pop-btn ldoh-pop-cancel">取消</button>
        <button class="ldoh-pop-btn ldoh-pop-confirm">确认</button>
      `;

      const rect = anchorEl.getBoundingClientRect();
      pop.style.top = `${rect.top - 48}px`;
      pop.style.right = `${window.innerWidth - rect.right}px`;
      document.body.appendChild(pop);
      this._confirmPop = pop;

      pop.querySelector(".ldoh-pop-cancel").onclick = (e) => {
        e.stopPropagation();
        this._removeConfirmPopover();
      };

      pop.querySelector(".ldoh-pop-confirm").onclick = (e) => {
        e.stopPropagation();
        this._removeConfirmPopover();
        try {
          const maybePromise = onConfirm?.();
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.catch((err) => {
              Log.error("[确认操作执行失败]", err);
            });
          }
        } catch (err) {
          Log.error("[确认操作执行失败]", err);
        }
      };

      this._confirmOutsideHandler = (e) => {
        if (!pop.contains(e.target) && !anchorEl.contains(e.target)) {
          this._removeConfirmPopover();
        }
      };
      setTimeout(
        () => document.addEventListener("click", this._confirmOutsideHandler),
        0,
      );
    },

    _removeIntervalPopover() {
      if (this._intervalOutsideHandler) {
        document.removeEventListener("click", this._intervalOutsideHandler);
        this._intervalOutsideHandler = null;
      }
      if (this._intervalPop) {
        this._intervalPop.remove();
        this._intervalPop = null;
      } else {
        document.getElementById("ldoh-interval-pop")?.remove();
      }
      if (!this._rendering) this._flushPendingRefresh();
    },

    _removeConcurrencyPopover() {
      if (this._concurrencyOutsideHandler) {
        document.removeEventListener("click", this._concurrencyOutsideHandler);
        this._concurrencyOutsideHandler = null;
      }
      if (this._concurrencyPop) {
        this._concurrencyPop.remove();
        this._concurrencyPop = null;
      } else {
        document.getElementById("ldoh-concurrency-pop")?.remove();
      }
      if (!this._rendering) this._flushPendingRefresh();
    },

    _showConcurrencyPopover(anchorEl) {
      if (!anchorEl) return;
      this._removeConfirmPopover();
      this._removeSettingsMenu();
      this._removeIntervalPopover();
      this._removeConcurrencyPopover();

      const s = GM_getValue(CONFIG.SETTINGS_KEY, {});
      const curConcurrent = s.maxConcurrent || CONFIG.DEFAULT_MAX_CONCURRENT;
      const curBackground = s.maxBackground || CONFIG.DEFAULT_MAX_BACKGROUND;

      const pop = document.createElement("div");
      pop.id = "ldoh-concurrency-pop";
      pop.className = "ldoh-interval-pop";
      pop.style.width = "240px";
      pop.innerHTML = `
        <div class="ldoh-interval-title">设置并发数</div>
        <div style="margin-bottom:6px">
          <div style="font-size:11px;color:var(--ldoh-text-light);margin-bottom:4px">总并发数（交互 + 后台, 默认值 15）</div>
          <input id="ldoh-conc-total" class="ldoh-interval-input" type="number" min="1" max="50" step="1" value="${curConcurrent}">
        </div>
        <div>
          <div style="font-size:11px;color:var(--ldoh-text-light);margin-bottom:4px">后台并发数上限（默认值 10）</div>
          <input id="ldoh-conc-bg" class="ldoh-interval-input" type="number" min="1" max="50" step="1" value="${curBackground}">
        </div>
        <div class="ldoh-interval-hint">后台并发应 ≤ 总并发</div>
        <div class="ldoh-interval-actions">
          <button class="ldoh-pop-btn ldoh-pop-cancel">取消</button>
          <button class="ldoh-pop-btn ldoh-pop-confirm">保存</button>
        </div>
      `;

      const rect = anchorEl.getBoundingClientRect();
      pop.style.top = `${rect.bottom + 6}px`;
      pop.style.right = `${window.innerWidth - rect.right}px`;
      document.body.appendChild(pop);
      this._concurrencyPop = pop;
      pop.addEventListener("click", (e) => e.stopPropagation());

      const totalInput = pop.querySelector("#ldoh-conc-total");
      const bgInput = pop.querySelector("#ldoh-conc-bg");
      const cancelBtn = pop.querySelector(".ldoh-pop-cancel");
      const saveBtn = pop.querySelector(".ldoh-pop-confirm");

      const applyValue = () => {
        const total = parseInt(totalInput.value, 10);
        const bg = parseInt(bgInput.value, 10);
        if (isNaN(total) || total < 1) {
          Utils.toast.error("总并发数无效，请输入不小于 1 的整数");
          totalInput.focus();
          return;
        }
        if (isNaN(bg) || bg < 1) {
          Utils.toast.error("后台并发数无效，请输入不小于 1 的整数");
          bgInput.focus();
          return;
        }
        if (bg > total) {
          Utils.toast.error("后台并发数不能大于总并发数");
          bgInput.focus();
          return;
        }
        const existing = GM_getValue(CONFIG.SETTINGS_KEY, {});
        GM_setValue(CONFIG.SETTINGS_KEY, {
          ...existing,
          maxConcurrent: total,
          maxBackground: bg,
        });
        Log.success(`并发数已设置：总 ${total}，后台 ${bg}`);
        Utils.toast.success(`并发数已更新：总 ${total} / 后台 ${bg}`, 2000);
        this._removeConcurrencyPopover();
      };

      cancelBtn.onclick = (e) => {
        e.stopPropagation();
        this._removeConcurrencyPopover();
      };
      saveBtn.onclick = (e) => {
        e.stopPropagation();
        applyValue();
      };
      [totalInput, bgInput].forEach((input) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            applyValue();
          }
        });
      });
      setTimeout(() => totalInput.focus(), 0);

      this._concurrencyOutsideHandler = (e) => {
        if (!pop.contains(e.target) && !anchorEl.contains(e.target)) {
          this._removeConcurrencyPopover();
        }
      };
      setTimeout(
        () =>
          document.addEventListener("click", this._concurrencyOutsideHandler),
        0,
      );
    },

    _removeSettingsMenu() {
      if (this._settingsOutsideHandler) {
        document.removeEventListener("click", this._settingsOutsideHandler);
        this._settingsOutsideHandler = null;
      }
      if (this._settingsPop) {
        this._settingsPop.remove();
        this._settingsPop = null;
      } else {
        document.getElementById("ldoh-settings-pop")?.remove();
      }
      if (!this._rendering) this._flushPendingRefresh();
    },

    /** 若有待刷新且当前无活跃弹窗，立即执行渲染 */
    _flushPendingRefresh() {
      if (
        this._pendingRefresh &&
        this._isOpen &&
        !this._confirmPop &&
        !this._settingsPop &&
        !this._intervalPop &&
        !this._concurrencyPop
      ) {
        this._pendingRefresh = false;
        this.render();
      }
    },

    _showSettingsMenu(anchorEl) {
      if (!anchorEl) return;
      this._removeIntervalPopover();
      this._removeConfirmPopover();
      this._removeSettingsMenu();

      const actions = [
        {
          label: "设置更新间隔",
          handler: (triggerEl) => this._showIntervalPopover(triggerEl),
        },
        {
          label: "设置并发数",
          handler: (triggerEl) => this._showConcurrencyPopover(triggerEl),
        },
        {
          label: "重置检测黑名单",
          handler: (triggerEl) => {
            this._showConfirmPopover(triggerEl, "确认重置检测黑名单？", () => {
              GM_setValue(CONFIG.BLACKLIST_KEY, []);
              GM_setValue(CONFIG.BLACKLIST_REMOVED_KEY, []);
              Utils.toast.success("检测黑名单已重置");
              FloatingPanel.refresh();
            });
          },
        },
        {
          label: "重置签到黑名单",
          handler: (triggerEl) => {
            this._showConfirmPopover(triggerEl, "确认重置签到黑名单？", () => {
              GM_setValue(CONFIG.CHECKIN_SKIP_KEY, []);
              GM_setValue(CONFIG.CHECKIN_SKIP_REMOVED_KEY, []);
              Utils.toast.success("签到黑名单已重置");
              FloatingPanel.refresh();
            });
          },
        },
        {
          label: "清理缓存",
          danger: true,
          handler: (triggerEl) => {
            const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
            const siteCount = Object.keys(allData).length;
            if (siteCount === 0) {
              Utils.toast.info("缓存已经是空的");
              return;
            }
            this._showConfirmPopover(
              triggerEl,
              `确认清除 ${siteCount} 个站点的缓存？`,
              () => {
                try {
                  GM_setValue(CONFIG.STORAGE_KEY, {});
                  Log.success("缓存已清理");
                  Utils.toast.success("缓存已清理，页面将刷新", 2000);
                  setTimeout(() => location.reload(), 2000);
                } catch (e) {
                  Log.error("清理缓存失败", e);
                  Utils.toast.error("清理失败，请查看控制台");
                }
              },
            );
          },
        },
        {
          label: "使用说明",
          handler: () => this._showHelpDialog(),
        },
      ];

      const pop = document.createElement("div");
      pop.id = "ldoh-settings-pop";
      pop.className = "ldoh-settings-pop";

      actions.forEach(({ label, handler, danger }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ldoh-settings-item";
        btn.textContent = label;
        if (danger) btn.style.color = "var(--ldoh-danger, #ef4444)";
        btn.onclick = (e) => {
          e.stopPropagation();
          this._removeSettingsMenu();
          handler(anchorEl);
        };
        pop.appendChild(btn);
      });

      const rect = anchorEl.getBoundingClientRect();
      pop.style.top = `${rect.bottom + 6}px`;
      pop.style.right = `${window.innerWidth - rect.right}px`;
      document.body.appendChild(pop);
      this._settingsPop = pop;

      this._settingsOutsideHandler = (e) => {
        if (!pop.contains(e.target) && !anchorEl.contains(e.target)) {
          this._removeSettingsMenu();
        }
      };
      setTimeout(
        () => document.addEventListener("click", this._settingsOutsideHandler),
        0,
      );
    },

    _showHelpDialog() {
      const settings = GM_getValue(CONFIG.SETTINGS_KEY, {});
      const interval = settings.interval || CONFIG.DEFAULT_INTERVAL;
      const maxConcurrent =
        settings.maxConcurrent || CONFIG.DEFAULT_MAX_CONCURRENT;
      const maxBackground =
        settings.maxBackground || CONFIG.DEFAULT_MAX_BACKGROUND;
      const html = `
        <div style="padding:24px">
        <h2 style="margin:0 0 16px;font-size:16px;font-weight:700;color:var(--ldoh-text)">使用说明</h2>
        <div style="font-size:13px;color:var(--ldoh-text-muted);line-height:1.7;max-height:60vh;overflow-y:auto;padding-right:4px">
          <p style="margin:0 0 12px"><strong style="color:var(--ldoh-text)">LDOH New API Helper v1.0.16</strong><br>自动同步 LDOH 白名单站点的额度与签到状态，并提供悬浮面板快速操作。</p>

          <p style="margin:0 0 6px;font-weight:600;color:var(--ldoh-text)">核心功能</p>
          <ul style="margin:0 0 12px;padding-left:16px">
            <li>自动获取并展示各站点余额 / 已用额度</li>
            <li>自动检测当日签到状态，支持一键批量签到</li>
            <li>支持一键刷新全部站点数据</li>
            <li>支持复制 API Key 与跳转到模型列表页</li>
          </ul>

          <p style="margin:0 0 6px;font-weight:600;color:var(--ldoh-text)">悬浮面板</p>
          <ul style="margin:0 0 12px;padding-left:16px">
            <li>右下角悬浮按钮，点击展开站点列表面板</li>
            <li>支持关键词搜索过滤站点</li>
            <li>每行可独立刷新、签到、复制 Key、查看模型</li>
            <li>每行可切换「检测黑名单」和「签到黑名单」状态（绿色=启用，灰色=屏蔽）</li>
          </ul>

          <p style="margin:0 0 6px;font-weight:600;color:var(--ldoh-text)">白名单 / 黑名单</p>
          <ul style="margin:0 0 12px;padding-left:16px">
            <li>仅识别 LDOH 页面上的白名单站点（通过监控 /api/sites 自动维护）</li>
            <li>检测黑名单：被屏蔽的站点不会发送 API 请求</li>
            <li>签到黑名单：被屏蔽的站点跳过自动签到</li>
            <li>内置黑名单条目可被用户覆盖移除；设置中可整体重置</li>
          </ul>

          <p style="margin:0 0 6px;font-weight:600;color:var(--ldoh-text)">设置项</p>
          <ul style="margin:0 0 12px;padding-left:16px">
            <li>更新间隔：当前 <strong style="color:var(--ldoh-text)">${interval} 分钟</strong>（最小 5 分钟），控制缓存 TTL</li>
            <li>总并发数：当前 <strong style="color:var(--ldoh-text)">${maxConcurrent}</strong>，同时发出的最大请求数</li>
            <li>后台并发数：当前 <strong style="color:var(--ldoh-text)">${maxBackground}</strong>，后台自动刷新时的最大并发</li>
            <li>清理缓存：清除所有站点的本地缓存数据（需二次确认）</li>
          </ul>

          <p style="margin:0 0 4px;font-size:11px">作者：@JoJoJotarou &nbsp;·&nbsp; 许可：MIT License</p>
        </div>
        <div style="text-align:right;margin-top:16px">
          <button type="button" class="ldh-dialog-close" style="padding:6px 20px;border-radius:6px;background:var(--ldoh-surface2);color:var(--ldoh-text);border:none;cursor:pointer;font-size:13px">关闭</button>
        </div>
        </div>`;
      const ov = UI.createOverlay(html);
      const closeBtn = ov.querySelector(".ldh-dialog-close");
      if (closeBtn) {
        closeBtn.onclick = () => {
          ov.style.opacity = "0";
          setTimeout(() => ov.remove(), 200);
        };
      }
    },

    _showIntervalPopover(anchorEl) {
      if (!anchorEl) return;
      this._removeConfirmPopover();
      this._removeSettingsMenu();
      this._removeConcurrencyPopover();
      this._removeIntervalPopover();

      const current = GM_getValue(CONFIG.SETTINGS_KEY, {
        interval: CONFIG.DEFAULT_INTERVAL,
      }).interval;

      const pop = document.createElement("div");
      pop.id = "ldoh-interval-pop";
      pop.className = "ldoh-interval-pop";
      pop.innerHTML = `
        <div class="ldoh-interval-title">设置更新间隔</div>
        <input class="ldoh-interval-input" type="number" min="5" step="1" value="${current}">
        <div class="ldoh-interval-hint">单位：分钟，最小值 5 分钟</div>
        <div class="ldoh-interval-actions">
          <button class="ldoh-pop-btn ldoh-pop-cancel">取消</button>
          <button class="ldoh-pop-btn ldoh-pop-confirm">保存</button>
        </div>
      `;

      const rect = anchorEl.getBoundingClientRect();
      pop.style.top = `${rect.bottom + 6}px`;
      pop.style.right = `${window.innerWidth - rect.right}px`;
      document.body.appendChild(pop);
      this._intervalPop = pop;
      pop.addEventListener("click", (e) => e.stopPropagation());

      const inputEl = pop.querySelector(".ldoh-interval-input");
      const cancelBtn = pop.querySelector(".ldoh-pop-cancel");
      const saveBtn = pop.querySelector(".ldoh-pop-confirm");

      const applyValue = () => {
        const val = String(inputEl.value || "").trim();
        const interval = parseInt(val, 10);
        if (isNaN(interval) || interval < 5) {
          Utils.toast.error("无效的间隔值，请输入不小于 5 的整数");
          inputEl.focus();
          return;
        }

        GM_setValue(CONFIG.SETTINGS_KEY, { interval });
        Log.success(`更新间隔已设置为 ${interval} 分钟`);
        Utils.toast.success(`更新间隔已设置为 ${interval} 分钟`, 2000);
        this._removeIntervalPopover();
      };

      cancelBtn.onclick = (e) => {
        e.stopPropagation();
        this._removeIntervalPopover();
      };
      saveBtn.onclick = (e) => {
        e.stopPropagation();
        applyValue();
      };
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyValue();
        }
      });
      setTimeout(() => inputEl.focus(), 0);

      this._intervalOutsideHandler = (e) => {
        if (!pop.contains(e.target) && !anchorEl.contains(e.target)) {
          this._removeIntervalPopover();
        }
      };
      setTimeout(
        () => document.addEventListener("click", this._intervalOutsideHandler),
        0,
      );
    },

    render() {
      if (!this._panel) return;
      this._rendering = true;
      const existingBody = this._panel.querySelector(".ldoh-panel-body");
      const savedScroll = existingBody ? existingBody.scrollTop : 0;

      this._removeIntervalPopover();
      this._removeSettingsMenu();
      this._removeConfirmPopover();
      this._removeConcurrencyPopover();

      const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
      const sorted = Object.entries(allData)
        .filter(([, d]) => d.userId)
        .sort(([, a], [, b]) => (b.quota || 0) - (a.quota || 0));
      const totalBalance = sorted.reduce(
        (sum, [, d]) => sum + (d.quota || 0),
        0,
      );

      this._panel.innerHTML = "";
      this._panel.appendChild(this._buildHeader(sorted, totalBalance));
      const { searchBar, bindSearch } = this._buildSearchBar();
      this._panel.appendChild(searchBar);
      const body = this._buildBody(sorted);
      this._panel.appendChild(body);
      bindSearch(body);
      body.scrollTop = savedScroll;
      this._rendering = false;
    },

    /** 构建面板头部（标题、总额、操作按钮） */
    _buildHeader(sorted, totalBalance) {
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

      // 刷新全部按钮
      const refreshAllBtn = document.createElement("div");
      refreshAllBtn.className = "ldoh-btn ldoh-refresh-btn";
      refreshAllBtn.title = "刷新所有站点数据";
      refreshAllBtn.style.flexShrink = "0";
      refreshAllBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>`;
      if (this._refreshAllRunning) {
        refreshAllBtn.classList.add("loading");
      }
      refreshAllBtn.onclick = (e) => {
        e.stopPropagation();
        if (this._refreshAllRunning) return;
        this._showConfirmPopover(refreshAllBtn, "确认刷新全部？", async () => {
          if (this._refreshAllRunning) return;
          this._refreshAllRunning = true;
          refreshAllBtn.classList.add("loading");
          try {
            await runRefreshAll();
          } finally {
            this._refreshAllRunning = false;
            FloatingPanel.refresh();
          }
        });
      };

      // 签到按钮
      const checkinBtn = document.createElement("div");
      checkinBtn.className = "ldoh-btn ldoh-refresh-btn";
      checkinBtn.title = "一键签到所有未签到站点";
      checkinBtn.style.flexShrink = "0";
      checkinBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>`;
      if (this._checkinRunning) {
        checkinBtn.classList.add("loading");
      }
      checkinBtn.onclick = (e) => {
        e.stopPropagation();
        if (this._checkinRunning) return;
        this._showConfirmPopover(checkinBtn, "确认自动签到？", async () => {
          if (this._checkinRunning) return;
          this._checkinRunning = true;
          checkinBtn.classList.add("loading");
          try {
            await runAutoCheckin(false);
          } finally {
            this._checkinRunning = false;
            FloatingPanel.refresh();
          }
        });
      };

      // 设置按钮
      const settingsBtn = document.createElement("div");
      settingsBtn.className = "ldoh-btn";
      settingsBtn.title = "设置";
      settingsBtn.style.flexShrink = "0";
      settingsBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
      settingsBtn.onclick = (e) => {
        e.stopPropagation();
        this._showSettingsMenu(settingsBtn);
      };

      hd.appendChild(refreshAllBtn);
      hd.appendChild(checkinBtn);
      hd.appendChild(settingsBtn);
      hd.appendChild(closeBtn);
      return hd;
    },

    /** 构建搜索栏，返回 { searchBar, bindSearch(body) } */
    _buildSearchBar() {
      const searchBar = document.createElement("div");
      searchBar.className = "ldoh-panel-search";
      searchBar.innerHTML = `
        <div class="ldoh-panel-search-wrap">
          <svg class="ldoh-panel-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="ldoh-panel-search-input" placeholder="搜索站点名称..." value="${Utils.escapeHtml(this._searchQuery)}">
        </div>
      `;

      const bindSearch = (body) => {
        const searchInput = searchBar.querySelector(".ldoh-panel-search-input");
        let timer = null;
        searchInput.oninput = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            this._searchQuery = searchInput.value.toLowerCase().trim();
            body.querySelectorAll(".ldoh-panel-row").forEach((row) => {
              row.style.display =
                !this._searchQuery ||
                row.dataset.searchKey.includes(this._searchQuery)
                  ? ""
                  : "none";
            });
          }, 200);
        };
        if (this._searchQuery) searchInput.focus();
      };

      return { searchBar, bindSearch };
    },

    /** 构建站点列表 body */
    _buildBody(sorted) {
      const body = document.createElement("div");
      body.className = "ldoh-panel-body";

      if (!sorted.length) {
        const empty = document.createElement("div");
        empty.className = "ldoh-panel-empty";
        empty.innerHTML = `<div>暂无站点数据</div><div style="font-size:11px;margin-top:4px;opacity:0.7">访问各站点后自动收录</div>`;
        body.appendChild(empty);
      } else {
        sorted.forEach(([host, siteData]) => {
          body.appendChild(this._buildSiteRow(host, siteData));
        });
      }

      return body;
    },

    /** 构建单个站点行 */
    _buildSiteRow(host, siteData) {
      const row = document.createElement("div");
      row.className = "ldoh-panel-row";

      // 签到状态
      let checkinClass = "na",
        checkinText = "─";
      if (siteData.checkinSupported !== false) {
        if (isCheckedInToday(siteData)) {
          checkinClass = "ok";
          checkinText = "已签到";
        } else if (
          siteData.checkedInToday === false ||
          siteData.lastCheckinDate
        ) {
          checkinClass = "no";
          checkinText = "未签到";
        }
      }

      const displayName = siteData.siteName || host;
      row.dataset.searchKey = `${displayName} ${host}`.toLowerCase();
      if (
        this._searchQuery &&
        !row.dataset.searchKey.includes(this._searchQuery)
      ) {
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
      keyBtn.onclick = (e) => {
        e.stopPropagation();
        showDetailsDialog(host, siteData);
      };

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
          setTimeout(() => {
            card.style.outline = "";
            card.style.outlineOffset = "";
          }, 2000);
        } else {
          Utils.toast.warning(`未找到 ${host} 的卡片`);
        }
      };

      row.appendChild(keyBtn);
      row.appendChild(refreshBtn);
      row.appendChild(locateBtn);

      // 检测黑名单按钮（绿=检测中，灰=已屏蔽）
      const isBlacklisted = Utils.isBlacklisted(host);
      const blacklistBtn = document.createElement("div");
      blacklistBtn.className = "ldoh-btn";
      blacklistBtn.title = isBlacklisted
        ? "已屏蔽（点击恢复检测）"
        : "检测中（点击加入黑名单）";
      blacklistBtn.style.color = isBlacklisted
        ? "#9ca3af"
        : "var(--ldoh-success)";
      blacklistBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      blacklistBtn.onclick = (e) => {
        e.stopPropagation();
        const confirmText = isBlacklisted
          ? `移出黑名单并恢复检测？`
          : `加入黑名单并停止检测？`;
        this._showConfirmPopover(blacklistBtn, confirmText, () => {
          const added = Utils.toggleBlacklist(host);
          Utils.toast.success(
            added ? `${host} 已加入黑名单` : `${host} 已移出黑名单`,
          );
          FloatingPanel.refresh();
        });
      };
      row.appendChild(blacklistBtn);

      // 签到黑名单按钮（绿=参与签到，灰=跳过签到）
      const isSkipped = Utils.isCheckinSkipped(host);
      const checkinNotSupported = siteData.checkinSupported === false;
      const builtinSkipReason = Utils.getBuiltinCheckinSkipReason(host);

      const skipCheckinBtn = document.createElement("div");
      skipCheckinBtn.className = "ldoh-btn";
      skipCheckinBtn.title = checkinNotSupported
        ? "LDOH 标记该站点不支持签到，如有变更请刷新页面同步"
        : isSkipped
          ? "跳过签到（点击恢复）"
          : "自动签到（点击跳过）";
      skipCheckinBtn.style.color =
        checkinNotSupported || isSkipped ? "#9ca3af" : "var(--ldoh-success)";
      if (checkinNotSupported) skipCheckinBtn.style.cursor = "default";
      skipCheckinBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>${checkinNotSupported ? `<line x1="7" y1="13" x2="17" y2="21"/><line x1="17" y1="13" x2="7" y2="21"/>` : `<polyline points="9 16 11 18 15 14"/>`}</svg>`;
      if (!checkinNotSupported) {
        skipCheckinBtn.onclick = (e) => {
          e.stopPropagation();
          const confirmText = isSkipped
            ? `恢复 ${host} 自动签到？${builtinSkipReason ? `\n（跳过原因：${builtinSkipReason}）` : ""}`
            : `跳过 ${host} 自动签到？`;
          this._showConfirmPopover(skipCheckinBtn, confirmText, () => {
            const added = Utils.toggleCheckinSkip(host);
            Utils.toast.success(
              added ? `${host} 已跳过自动签到` : `${host} 已恢复自动签到`,
            );
            FloatingPanel.refresh();
          });
        };
      }
      row.appendChild(skipCheckinBtn);

      // 删除按钮
      const deleteBtn = document.createElement("div");
      deleteBtn.className = "ldoh-btn";
      deleteBtn.title = "删除缓存数据";
      deleteBtn.style.color = "var(--ldoh-danger)";
      deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
      deleteBtn.onmouseenter = () =>
        (deleteBtn.style.background = "rgba(239, 68, 68, 0.1)");
      deleteBtn.onmouseleave = () =>
        (deleteBtn.style.background = "transparent");
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        this._showConfirmPopover(deleteBtn, "确认删除？", () => {
          const all = GM_getValue(CONFIG.STORAGE_KEY, {});
          delete all[Utils.normalizeHost(host)];
          GM_setValue(CONFIG.STORAGE_KEY, all);
          const card = findCardByHost(host);
          if (card) {
            const container = card.querySelector(
              `.${CONFIG.DOM.HELPER_CONTAINER_CLASS}`,
            );
            if (container) container.remove();
          }
          FloatingPanel.refresh();
          Utils.toast.success(`已删除 ${host} 的缓存数据`);
        });
      };
      row.appendChild(deleteBtn);

      return row;
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

      cards.forEach((card) => {
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
          const data = Utils.getSiteData(normalizedHost);

          if (data.userId) {
            Log.debug(`[LDOH] 渲染卡片: ${host}`);
            renderHelper(card, host, data);
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

  /**
   * 处理 /api/sites 响应：更新 WHITELIST_KEY（host 字符串数组）和 STORAGE_KEY（同步 siteName/checkinSupported）
   * @param {Array} sites - LDOH API 返回的站点列表
   */
  function _processSitesResponse(sites) {
    const entries = [];
    sites.forEach((site) => {
      try {
        const host = Utils.normalizeHost(new URL(site.apiBaseUrl).hostname);
        if (!host) return;
        entries.push({
          host,
          name: site.name || host,
          supportsCheckin: site.supportsCheckin === true,
        });
      } catch (_) {}
    });

    if (!entries.length) return;

    GM_setValue(
      CONFIG.WHITELIST_KEY,
      entries.map((e) => e.host),
    );

    // 将 siteName / checkinSupported 同步到 STORAGE_KEY（仅在有变化时写入）
    const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
    let changed = false;
    entries.forEach(({ host, name, supportsCheckin }) => {
      const cur = allData[host] || {};
      if (cur.siteName !== name || cur.checkinSupported !== supportsCheckin) {
        allData[host] = {
          ...cur,
          siteName: name,
          checkinSupported: supportsCheckin,
        };
        changed = true;
      }
    });

    if (changed) {
      GM_setValue(CONFIG.STORAGE_KEY, allData);
      debouncedRunPortalMode?.();
      FloatingPanel.refresh();
    }

    Log.debug(`[站点监控] 站点列表已同步: ${entries.length} 个`);
  }

  /**
   * 在 LDOH 门户 hook fetch（SWR）和 XHR，拦截 GET /api/sites 响应。
   * 排除带 ?mode=runaway 的请求（LDOH 内部特殊模式）。
   * 每次 LDOH SWR 刷新站点列表时，自动同步白名单与站点数据。
   */
  function hookLDOHSites() {
    try {
      // —— hook fetch（Next.js / SWR 默认走 fetch）——
      const _origFetch = unsafeWindow.fetch;
      unsafeWindow.fetch = new Proxy(_origFetch, {
        apply(target, thisArg, args) {
          const [input, init] = args;
          const url =
            typeof input === "string"
              ? input
              : input instanceof Request
                ? input.url
                : String(input);
          const method = (init?.method ?? "GET").toUpperCase();
          const result = Reflect.apply(target, thisArg, args);
          if (
            method === "GET" &&
            url.includes("/api/sites") &&
            !url.includes("mode=runaway")
          ) {
            result
              .then(async (res) => {
                try {
                  const data = await res.clone().json();
                  if (Array.isArray(data.sites))
                    _processSitesResponse(data.sites);
                } catch (_) {}
              })
              .catch(() => {});
          }
          return result;
        },
      });

      Log.debug("[站点监控] /api/sites hook 已启动（fetch）");
    } catch (e) {
      Log.warn("[站点监控] hookLDOHSites 失败", e);
    }
  }

  /**
   * 在公益站页面 hook XHR，监控用户手动签到，成功后即时更新 GM storage。
   * 使用 unsafeWindow 访问页面真实的 XHR（绕过脚本沙箱）。
   * 数据写入后会触发 LDOH 门户的 GM_addValueChangeListener，badge 自动更新。
   */
  function hookCheckinXHR() {
    try {
      const XHR = unsafeWindow.XMLHttpRequest;
      // 防止重复 hook
      if (XHR.prototype.__ldoh_hooked) return;
      XHR.prototype.__ldoh_hooked = true;

      const _open = XHR.prototype.open;
      const _send = XHR.prototype.send;

      XHR.prototype.open = function (method, url, ...rest) {
        this._ldoh_method = method;
        this._ldoh_url = url;
        return _open.apply(this, [method, url, ...rest]);
      };

      XHR.prototype.send = function (body) {
        if (
          this._ldoh_method?.toUpperCase() === "POST" &&
          typeof this._ldoh_url === "string" &&
          this._ldoh_url.includes("/api/user/checkin")
        ) {
          this.addEventListener("load", function () {
            try {
              const res = JSON.parse(this.responseText);
              if (res.success) {
                const host = Utils.normalizeHost(window.location.hostname);
                const siteData = Utils.getSiteData(host);
                siteData.checkedInToday = true;
                siteData.lastCheckinDate = getTodayString();
                if (res.data?.quota_awarded) {
                  siteData.quota =
                    (siteData.quota || 0) + res.data.quota_awarded;
                }
                Utils.saveSiteData(host, siteData);
                Log.success(`[签到监控] ${host} - 签到成功，已同步本地数据`);
              }
            } catch (e) {
              Log.debug("[签到监控] 解析响应失败", e);
            }
          });
        }
        return _send.apply(this, arguments);
      };

      Log.debug("[签到监控] XHR hook 已启动");
    } catch (e) {
      Log.warn("[签到监控] XHR hook 失败（unsafeWindow 不可用？）", e);
    }
  }
  let observerInstance = null;
  let storageListenerId = null;
  let debouncedRunPortalMode; // 提升至模块作用域，供 _processSitesResponse 调用

  /**
   * 初始化脚本
   */
  async function init() {
    try {
      const host = window.location.hostname;
      const isPortal = host === CONFIG.PORTAL_HOST;

      Log.info(`初始化开始 | 主机: ${host}`);

      if (isPortal) {
        // LDOH：监听 DOM 变化并渲染卡片
        Log.info("环境: LDOH");

        // Hook LDOH /api/sites 自动维护白名单
        hookLDOHSites();

        // 立即运行一次
        runPortalMode();

        // 使用防抖的 runPortalMode
        debouncedRunPortalMode = Utils.debounce(
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

        // 监听其他标签页（New API 站点）写入 STORAGE_KEY 的变化
        // remote=true 表示变更来自另一个脚本实例（跨标签），此时重扫卡片并更新 badge
        try {
          storageListenerId = GM_addValueChangeListener(
            CONFIG.STORAGE_KEY,
            (_name, _oldVal, _newVal, remote) => {
              if (remote) {
                Log.debug("[LDOH] 检测到跨标签存储变更，重新扫描卡片");
                debouncedRunPortalMode();
                FloatingPanel.refresh();
              }
            },
          );
        } catch (e) {
          Log.warn(
            "[LDOH] GM_addValueChangeListener 不可用，新站点需刷新页面后显示",
            e,
          );
        }

        // 刷新过期缓存：检查所有站点，更新缓存已过期的条目
        function refreshStaleData() {
          const settings = GM_getValue(CONFIG.SETTINGS_KEY, {});
          const intervalMs =
            (settings.interval || CONFIG.DEFAULT_INTERVAL) * 60 * 1000;
          const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
          const now = Date.now();
          Object.entries(allData).forEach(([h, d]) => {
            if (
              d.userId &&
              !Utils.isBlacklisted(h) &&
              d.ts &&
              now - d.ts >= intervalMs
            ) {
              API.updateSiteStatus(h, d.userId, false)
                .then((fresh) => {
                  const card = findCardByHost(h);
                  if (card) renderHelper(card, h, fresh);
                  FloatingPanel.refresh();
                })
                .catch((e) => Log.error(`[自动刷新] ${h}`, e));
            }
          });
        }

        // 页面加载时立即检查一次，随后每分钟定期检查
        refreshStaleData();
        setInterval(refreshStaleData, 60_000);
      } else {
        // 公益站：检测是否为 New API 站点
        Log.info("环境: 公益站");

        const isNewApi = await Utils.isNewApiSite();
        if (!isNewApi) {
          return;
        }

        Log.success(`${host} 识别为 New API 站点`);

        // 监控用户手动签到，成功后即时同步数据到 GM storage
        hookCheckinXHR();

        // 检测登录状态
        let userId = Utils.getUserIdFromStorage();

        if (userId) {
          // 已登录：立即更新数据，无需注册长期监听
          Log.success(`识别到登录 UID: ${userId}，正在记录站点数据...`);
          API.updateSiteStatus(window.location.host, userId, true).catch(
            (e) => {
              Log.error("更新站点状态失败", e);
            },
          );
        } else {
          // 未登录：先等待 OAuth 登录
          Log.debug("未检测到登录状态，开始监听...");
          userId = await Utils.waitForLogin();
          if (userId) {
            // OAuth 登录成功，无需再注册长期监听
            Log.success(`OAuth 登录成功，用户 ID: ${userId}`);
            API.updateSiteStatus(window.location.host, userId, true).catch(
              (e) => {
                Log.error("更新站点状态失败", e);
              },
            );
          } else {
            // 等待超时：注册长期监听（手动登录、Token 登录等场景）
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

      if (storageListenerId !== null) {
        try {
          GM_removeValueChangeListener(storageListenerId);
          storageListenerId = null;
          Log.debug("storageListenerId 已注销");
        } catch (e) {
          Log.warn("GM_removeValueChangeListener 调用失败", e);
        }
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

  /**
   * 刷新所有站点数据
   */
  async function runRefreshAll() {
    const allData = GM_getValue(CONFIG.STORAGE_KEY, {});

    // 只刷新有 userId 且不在黑名单中的站点
    const sites = Object.entries(allData).filter(
      ([host, data]) => data.userId && !Utils.isBlacklisted(host),
    );
    const siteCount = sites.length;

    if (siteCount === 0) {
      Utils.toast.info("没有站点数据需要刷新");
      return;
    }

    Log.info(`开始刷新 ${siteCount} 个站点`);

    const progressToast = Utils.toast.show(
      `正在刷新站点 0/${siteCount}...`,
      "info",
      0,
    );

    let completedCount = 0;

    const promises = sites.map(async ([host, data]) => {
      try {
        const fresh = await API.updateSiteStatus(host, data.userId, true);
        const card = findCardByHost(host);
        if (card) renderHelper(card, host, fresh);
      } catch (e) {
        Log.error(`刷新站点失败: ${host}`, e);
      }
      completedCount++;
      const messageEl = progressToast.querySelector(".ldoh-toast-message");
      if (messageEl) {
        messageEl.textContent = `正在刷新站点 ${completedCount}/${siteCount}...`;
      }
    });

    await Promise.all(promises);

    Utils.toast.remove(progressToast);
    Utils.toast.success(`已刷新 ${siteCount} 个站点`, 3000);
    FloatingPanel.refresh();
  }

  // ==================== 自动签到功能 ====================
  // 注意：此功能需要配合数据结构修改
  // 需要将 checkedInToday (boolean) 改为 lastCheckinDate (string, 格式: "YYYY-MM-DD")
  // 涉及修改的地方：
  // 1. updateSiteStatus 方法中保存签到状态时使用日期
  // 2. renderHelper 函数中判断签到状态时比较日期

  /**
   * 自动签到所有未签到站点
   * @param {boolean} showConfirm - 是否显示确认对话框（菜单命令传 true，面板按钮传 false）
   */
  async function runAutoCheckin(showConfirm = true) {
    const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
    const today = getTodayString();
    const sites = Object.entries(allData).filter(([host, data]) => {
      if (!data.userId || !data.token || data.checkinSupported === false)
        return false;
      if (Utils.isCheckinSkipped(host)) return false;
      const lastCheckinDate = data.lastCheckinDate || "1970-01-01";
      return lastCheckinDate !== today || data.checkedInToday === false;
    });

    if (sites.length === 0) {
      Utils.toast.info("所有站点今天都已签到");
      return;
    }

    if (showConfirm) {
      const siteList = sites
        .map(([host, data]) => {
          const lastCheckin = data.lastCheckinDate || "从未";
          return `  • ${host} (上次: ${lastCheckin})`;
        })
        .join("\n");
      const confirmed = window.confirm(
        `🎁 将对以下 ${sites.length} 个站点进行自动签到：\n\n${siteList}\n\n注意：部分站点可能有 CF 校验，签到可能失败或超时（10秒）\n\n是否继续？`,
      );
      if (!confirmed) return;
    }

    Log.info(`开始自动签到 ${sites.length} 个站点`);

    const progressToast = Utils.toast.show(
      `正在签到 0/${sites.length}...`,
      "info",
      0,
    );

    const siteResults = new Map();
    let completedCount = 0;
    const failedSites = [];

    const checkinSite = async (host, data, updateProgress = true) => {
      try {
        const result = await API.checkin(host, data.token, data.userId);

        if (updateProgress) {
          completedCount++;
          const messageEl = progressToast.querySelector(".ldoh-toast-message");
          if (messageEl) {
            messageEl.textContent = `正在签到 ${completedCount}/${sites.length}...`;
          }
        }

        if (result.success) {
          siteResults.set(host, "success");
          const siteData = Utils.getSiteData(host);
          siteData.lastCheckinDate = today;
          siteData.checkedInToday = true;
          if (result.data?.quota_awarded) {
            siteData.quota = (siteData.quota || 0) + result.data.quota_awarded;
          }
          Utils.saveSiteData(host, siteData);
          return true;
        } else if (result.alreadyCheckedIn) {
          siteResults.set(host, "already");
          const siteData = Utils.getSiteData(host);
          siteData.lastCheckinDate = today;
          siteData.checkedInToday = true;
          Utils.saveSiteData(host, siteData);
          return true;
        } else if (result.error === "签到超时（15秒）") {
          siteResults.set(host, "timeout");
          return false;
        } else {
          siteResults.set(host, "fail");
          return false;
        }
      } catch (e) {
        Log.error(`签到站点失败: ${host}`, e);
        siteResults.set(host, "fail");
        if (updateProgress) {
          completedCount++;
          const messageEl = progressToast.querySelector(".ldoh-toast-message");
          if (messageEl) {
            messageEl.textContent = `正在签到 ${completedCount}/${sites.length}...`;
          }
        }
        return false;
      }
    };

    const promises = sites.map(async ([host, data]) => {
      const success = await checkinSite(host, data);
      if (!success) failedSites.push([host, data]);
    });
    await Promise.all(promises);

    const maxRetries = 2;
    for (
      let retry = 1;
      retry <= maxRetries && failedSites.length > 0;
      retry++
    ) {
      Log.info(`第 ${retry} 次重试 ${failedSites.length} 个失败的站点`);
      const messageEl = progressToast.querySelector(".ldoh-toast-message");
      if (messageEl) {
        messageEl.textContent = `第 ${retry} 次重试 ${failedSites.length} 个失败站点...`;
      }
      const retrySites = [...failedSites];
      failedSites.length = 0;
      const retryPromises = retrySites.map(async ([host, data]) => {
        const success = await checkinSite(host, data, false);
        if (!success) failedSites.push([host, data]);
      });
      await Promise.all(retryPromises);
      completedCount = sites.length - failedSites.length;
      const progressMessageEl = progressToast.querySelector(
        ".ldoh-toast-message",
      );
      if (progressMessageEl) {
        progressMessageEl.textContent = `正在签到 ${completedCount}/${sites.length}...`;
      }
    }

    Utils.toast.remove(progressToast);

    let successCount = 0,
      alreadyCheckedCount = 0,
      timeoutCount = 0,
      failCount = 0;
    for (const status of siteResults.values()) {
      if (status === "success") successCount++;
      else if (status === "already") alreadyCheckedCount++;
      else if (status === "timeout") timeoutCount++;
      else failCount++;
    }

    if (successCount > 0 || alreadyCheckedCount > 0) {
      Utils.toast.success(
        `签到完成！成功 ${successCount} 个，已签到 ${alreadyCheckedCount} 个`,
        5000,
      );
    } else {
      Utils.toast.warning(`签到完成，但没有成功的站点`, 5000);
    }

    FloatingPanel.refresh();
  }

  // ==================== 自动签到功能结束 ====================
})();
