/**
 * 站点相关的业务逻辑服务层 (Service Layer)
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";
import { API } from "../api.js";
import { Toast } from "../ui/toast.js";
import { normalizeHost } from "../utils/format.js";
import { getTodayString } from "../utils/date.js";
import { isBlacklisted, getSiteData, saveSiteData, isCheckinSkipped } from "../utils/storage.js";
import { EventBus, UI_EVENTS } from "../utils/bus.js";

export const SiteService = {
  /**
   * 刷新全部站点数据。
   */
  async refreshAll() {
    const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
    const sites = Object.entries(allData).filter(
      ([host, data]) => data.userId && data.token && !isBlacklisted(host),
    );
    const siteCount = sites.length;

    if (siteCount === 0) {
      Toast.info("没有站点数据需要刷新");
      return;
    }

    const progressToast = Toast.show(`正在刷新站点 0/${siteCount}...`, "info", 0);
    let completedCount = 0;

    const promises = sites.map(async ([host, data]) => {
      try {
        const fresh = await API.updateSiteStatus(host, data.userId, true);
        // 通过 EventBus 通知外部：数据已更新。让感兴趣的 UI 自行决定如何渲染。
        EventBus.emit(UI_EVENTS.DATA_CHANGED, { host, next: fresh, renderable: true });
      } catch (e) {
        Log.error(`[SiteRefresh] 刷新站点失败: ${host}`, e);
      }

      completedCount++;
      const messageEl = progressToast.querySelector(".ldoh-toast-message");
      if (messageEl) {
        messageEl.textContent = `正在刷新站点 ${completedCount}/${siteCount}...`;
      }
    });

    await Promise.all(promises);
    Toast.remove(progressToast);
    Toast.success(`已刷新 ${siteCount} 个站点`, 3000);
    // 通知面板或全局：整体刷新完成
    EventBus.emit(UI_EVENTS.GLOBAL_REFRESH);
  },

  /**
   * 一键签到符合条件的站点。
   * @param {boolean} showConfirm
   */
  async checkinEligibleSites(showConfirm = true) {
    const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
    const today = getTodayString();
    const sites = Object.entries(allData).filter(([host, data]) => {
      if (!data.userId || !data.token || data.checkinSupported === false) return false;
      if (isCheckinSkipped(host)) return false;
      const lastCheckinDate = data.lastCheckinDate || "1970-01-01";
      return lastCheckinDate !== today || data.checkedInToday === false;
    });

    if (sites.length === 0) {
      Toast.info("所有站点今天都已签到");
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

    const progressToast = Toast.show(`正在签到 0/${sites.length}...`, "info", 0);
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

        if (result.success || result.alreadyCheckedIn) {
          siteResults.set(host, result.success ? "success" : "already");
          const siteData = getSiteData(host);
          siteData.lastCheckinDate = today;
          siteData.checkedInToday = true;
          if (result.success && result.data?.quota_awarded) {
            siteData.quota = (siteData.quota || 0) + result.data.quota_awarded;
          }
          saveSiteData(host, siteData);

          // 通知外部数据变更
          EventBus.emit(UI_EVENTS.DATA_CHANGED, { host, next: siteData, renderable: true });
          return true;
        }

        if (result.error === "签到超时（15秒）") {
          siteResults.set(host, "timeout");
          return false;
        }

        siteResults.set(host, "fail");
        return false;
      } catch (e) {
        Log.error(`[AutoCheckin] 签到站点失败: ${host}`, e);
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

    await Promise.all(
      sites.map(async ([host, data]) => {
        const success = await checkinSite(host, data);
        if (!success) failedSites.push([host, data]);
      }),
    );

    const maxRetries = 2;
    for (let retry = 1; retry <= maxRetries && failedSites.length > 0; retry++) {
      const messageEl = progressToast.querySelector(".ldoh-toast-message");
      if (messageEl) {
        messageEl.textContent = `第 ${retry} 次重试 ${failedSites.length} 个失败站点...`;
      }
      const retrySites = [...failedSites];
      failedSites.length = 0;
      await Promise.all(
        retrySites.map(async ([host, data]) => {
          const success = await checkinSite(host, data, false);
          if (!success) failedSites.push([host, data]);
        }),
      );
      completedCount = sites.length - failedSites.length;
      const progressMessageEl = progressToast.querySelector(".ldoh-toast-message");
      if (progressMessageEl) {
        progressMessageEl.textContent = `正在签到 ${completedCount}/${sites.length}...`;
      }
    }

    Toast.remove(progressToast);

    let successCount = 0;
    let alreadyCheckedCount = 0;
    for (const status of siteResults.values()) {
      if (status === "success") successCount++;
      else if (status === "already") alreadyCheckedCount++;
    }

    if (successCount > 0 || alreadyCheckedCount > 0) {
      Toast.success(`签到完成！成功 ${successCount} 个，已签到 ${alreadyCheckedCount} 个`, 5000);
    } else {
      Toast.warning("签到完成，但没有成功的站点", 5000);
    }

    EventBus.emit(UI_EVENTS.GLOBAL_REFRESH);
  },

  /**
   * 批量刷新过期站点。
   */
  async refreshStaleSitesBatch() {
    const settings = GM_getValue(CONFIG.SETTINGS_KEY, {});
    const intervalMs = (settings.interval || CONFIG.DEFAULT_INTERVAL) * 60 * 1000;
    const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
    const now = Date.now();

    const staleSites = Object.entries(allData).filter(([host, siteData]) => {
      return (
        siteData.userId &&
        siteData.token &&
        !isBlacklisted(host) &&
        siteData.ts &&
        now - siteData.ts >= intervalMs
      );
    });
    if (!staleSites.length) return;

    let hasAnySuccessfulUpdate = false;
    await Promise.allSettled(
      staleSites.map(async ([host, siteData]) => {
        try {
          const fresh = await API.updateSiteStatus(host, siteData.userId, false);
          EventBus.emit(UI_EVENTS.DATA_CHANGED, { host, next: fresh, renderable: true });
          hasAnySuccessfulUpdate = true;
        } catch (e) {
          Log.error(`[自动刷新] ${host}`, e);
        }
      }),
    );

    if (hasAnySuccessfulUpdate) {
      EventBus.emit(UI_EVENTS.GLOBAL_REFRESH);
    }
  },

  /**
   * 单个站点刷新
   */
  async refreshSite(host, siteData, showToast = true) {
    try {
      const fresh = await API.updateSiteStatus(host, siteData.userId, true);
      EventBus.emit(UI_EVENTS.DATA_CHANGED, { host, next: fresh, renderable: true });
      if (showToast) Toast.success(`${host} 已更新`);
      return fresh;
    } catch (err) {
      Log.error(`[站点刷新] ${host}`, err);
      if (showToast) Toast.error("刷新失败");
      throw err;
    }
  },

  /**
   * 删除站点缓存数据，并通知 UI 移除对应元素
   */
  async deleteSiteData(host) {
    const normalizedHost = normalizeHost(host);
    const all = GM_getValue(CONFIG.STORAGE_KEY, {});
    if (all[normalizedHost]) {
      delete all[normalizedHost];
      GM_setValue(CONFIG.STORAGE_KEY, all);

      // 通过 DATA_CHANGED 信号，让 CardView 自动 remove，让 Panel 自动更新
      EventBus.emit(UI_EVENTS.DATA_CHANGED, {
        host: normalizedHost,
        next: null,
        renderable: false,
      });
      // 发送全局刷新信号，让面板重新计算排序和徽标
      EventBus.emit(UI_EVENTS.GLOBAL_REFRESH);

      return true;
    }
    return false;
  },
};
