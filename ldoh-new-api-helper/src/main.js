/**
 * 入口：环境检测、模块初始化、资源清理
 */
import { CONFIG } from "./config.js";
import { Log } from "./logger.js";
import { normalizeHost } from "./utils/format.js";
import { getSiteData, saveSiteData, getAndSyncUserId, isBlacklisted } from "./utils/storage.js";
import { isNewApiSite, waitForLogin, watchLoginStatus } from "./utils/misc.js";
import { Toast } from "./ui/toast.js";
import { API } from "./api.js";
import { FloatingPanel } from "./ui/panel.js";
import { CardView } from "./ui/card.js";
import { attachStorageSync } from "./ui/sync.js";
import { showDetailsDialog } from "./ui/dialog.js";
import { Hooks } from "./hooks.js";
import { EventBus, UI_EVENTS } from "./utils/bus.js";
import { SiteService } from "./services/site.js";

// 只在顶级窗口运行，屏蔽 Iframe
if (window.top === window.self && !window.__LDOH_HELPER_RUNNING__) {
  window.__LDOH_HELPER_RUNNING__ = true;
  ("use strict");

  let storageChangeListenerId = null;
  let staleDataRefreshTimer = null;

  /**
   * 站点环境：确保用户身份并同步首轮数据
   */
  async function ensureSiteIdentityAndSync(host) {
    const syncStatus = async (uid) => {
      const normalizedHost = normalizeHost(host);
      const siteData = getSiteData(normalizedHost);
      // 如果没有 token，尝试获取一次
      if (!siteData.token) {
        const token = await API.fetchToken(normalizedHost, uid);
        if (token) {
          siteData.token = token;
          saveSiteData(normalizedHost, siteData);
        }
      }
      // 执行首轮静默刷新
      await SiteService.refreshSite(host, siteData, false);
    };

    // 1. 尝试直接获取并同步本地存储的 userId
    let userId = getAndSyncUserId(host);

    if (userId) {
      syncStatus(userId).catch(() => {});
    } else {
      // 2. 如果没获取到（可能是还没加载出来），开启监听等待登录
      userId =
        (await waitForLogin()) || (await new Promise((resolve) => watchLoginStatus(resolve)));
      if (userId) {
        Toast.success("识别到登录，正在同步...");
        // 再次调用以确保保存到 GM 存储
        userId = getAndSyncUserId(host);
        syncStatus(userId).catch(() => {});
      }
    }
  }

  /**
   * 程序总入口
   */
  async function init() {
    try {
      const host = window.location.hostname;
      const isPortal = host === CONFIG.PORTAL_HOST;

      // 1. 注册全局 UI 事件（跨组件通用）
      EventBus.on(UI_EVENTS.SHOW_DETAILS, (host, data) => showDetailsDialog(host, data));

      if (isPortal) {
        Log.info("环境: LDOH 门户");

        // 2. 初始化各大视图组件
        CardView.init();
        FloatingPanel.init();

        // 3. 开启核心数据服务
        Hooks.installPortalSitesFetchHook();
        storageChangeListenerId = attachStorageSync({ storageKey: CONFIG.STORAGE_KEY });

        SiteService.refreshStaleSitesBatch();
        staleDataRefreshTimer = setInterval(() => SiteService.refreshStaleSitesBatch(), 60_000);
      } else {
        Log.info(`环境: 站点 ${host}`);
        if (host === "up.x666.me") return Hooks.installX666CheckinHook();
        if (host === "fuli.hxi.me") return Hooks.installRunanytimeWheelHook();

        if (await isNewApiSite()) {
          Hooks.installCheckinXhrHook();
          Hooks.installSelfProfileXhrHook();
          Hooks.installTopupXhrHook();
          if (!isBlacklisted(normalizeHost(host))) await ensureSiteIdentityAndSync(host);
        }
      }
    } catch (e) {
      Log.error("初始化失败", e);
    }
  }

  // 资源清理
  window.addEventListener("beforeunload", () => {
    CardView.destroy();
    if (storageChangeListenerId) GM_removeValueChangeListener(storageChangeListenerId);
    if (staleDataRefreshTimer) clearInterval(staleDataRefreshTimer);
  });

  init();
}
