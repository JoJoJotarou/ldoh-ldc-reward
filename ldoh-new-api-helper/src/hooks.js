/**
 * XHR / fetch hook（各站点页面 + LDOH 门户）
 */
import { CONFIG } from "./config.js";
import { Log } from "./logger.js";
import { normalizeHost } from "./utils/format.js";
import { getSiteData, saveSiteData } from "./utils/storage.js";
import { getTodayString } from "./utils/date.js";
import { API } from "./api.js";
import { EventBus, UI_EVENTS } from "./utils/bus.js";

/**
 * 处理 /api/sites 响应：更新 WHITELIST_KEY 和 STORAGE_KEY
 */
function _processSitesResponse(sites) {
  const entries = [];
  sites.forEach((site) => {
    try {
      const host = normalizeHost(new URL(site.apiBaseUrl).hostname);
      if (!host) return;
      entries.push({
        host,
        name: site.name || host,
        supportsCheckin: site.supportsCheckin === true,
      });
    } catch (_e) {
      // 忽略无效 URL
    }
  });

  if (!entries.length) return;

  GM_setValue(
    CONFIG.WHITELIST_KEY,
    entries.map((e) => e.host),
  );

  const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
  let changedCount = 0;
  entries.forEach(({ host, name, supportsCheckin }) => {
    const cur = allData[host] || {};
    if (cur.siteName !== name || cur.checkinSupported !== supportsCheckin) {
      allData[host] = { ...cur, siteName: name, checkinSupported: supportsCheckin };
      changedCount++;
    }
  });

  if (changedCount > 0) {
    GM_setValue(CONFIG.STORAGE_KEY, allData);
    EventBus.emit(UI_EVENTS.GLOBAL_REFRESH);
  }

  Log.debug(`[站点监控] 站点列表已同步: ${entries.length} 个`);
}

export const Hooks = {
  /**
   * 在 LDOH 门户 hook fetch，拦截 GET /api/sites 响应。
   */
  installPortalSitesFetchHook() {
    try {
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
          if (method === "GET" && url.includes("/api/sites") && !url.includes("mode=runaway")) {
            result
              .then(async (res) => {
                try {
                  const data = await res.clone().json();
                  if (Array.isArray(data.sites)) _processSitesResponse(data.sites);
                } catch (_e) {
                  // 忽略 JSON 解析失败
                }
              })
              .catch(() => {});
          }
          return result;
        },
      });
      Log.debug("[站点监控] /api/sites hook 已启动");
    } catch (e) {
      Log.warn("[站点监控] installPortalSitesFetchHook 失败", e);
    }
  },

  /**
   * 在公益站页面 hook XHR，监控用户手动签到。
   */
  installCheckinXhrHook() {
    try {
      const XHR = unsafeWindow.XMLHttpRequest;
      if (XHR.prototype.__ldoh_hooked) return;
      XHR.prototype.__ldoh_hooked = true;

      const _open = XHR.prototype.open;
      const _send = XHR.prototype.send;

      XHR.prototype.open = function (method, url, ...rest) {
        this._ldoh_method = method;
        this._ldoh_url = url;
        return _open.apply(this, [method, url, ...rest]);
      };

      XHR.prototype.send = function (_body) {
        if (
          this._ldoh_method?.toUpperCase() === "POST" &&
          typeof this._ldoh_url === "string" &&
          this._ldoh_url.includes("/api/user/checkin")
        ) {
          this.addEventListener("load", function () {
            try {
              const res = JSON.parse(this.responseText);
              if (res.success) {
                const host = normalizeHost(window.location.hostname);
                const siteData = getSiteData(host);
                siteData.checkedInToday = true;
                siteData.lastCheckinDate = getTodayString();
                if (res.data?.quota_awarded) {
                  siteData.quota = (siteData.quota || 0) + res.data.quota_awarded;
                }
                saveSiteData(host, siteData);
                EventBus.emit(UI_EVENTS.DATA_CHANGED, { host, next: siteData, renderable: true });
                Log.success(`[签到监控] ${host} - 签到成功`);
              }
            } catch (e) {
              Log.debug("[签到监控] 解析失败", e);
            }
          });
        }
        return _send.apply(this, arguments);
      };
      Log.debug("[签到监控] XHR hook 已启动");
    } catch (e) {
      Log.warn("[签到监控] XHR hook 失败", e);
    }
  },

  /**
   * 薄荷公益站（up.x666.me）签到监控
   */
  installX666CheckinHook() {
    try {
      if (unsafeWindow.__ldoh_x666_fetch_hooked) return;
      unsafeWindow.__ldoh_x666_fetch_hooked = true;
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
          if (method === "POST" && url.includes("/api/checkin/spin")) {
            result
              .then(async (res) => {
                try {
                  const data = await res.clone().json();
                  if (data?.success) {
                    const host = "x666.me";
                    const siteData = getSiteData(host);
                    siteData.checkedInToday = true;
                    siteData.lastCheckinDate = getTodayString();
                    if (typeof data.new_balance === "number") siteData.quota = data.new_balance;
                    saveSiteData(host, siteData);
                    EventBus.emit(UI_EVENTS.DATA_CHANGED, {
                      host,
                      next: siteData,
                      renderable: true,
                    });
                    Log.success(`[签到监控] ${host} - 签到成功`);
                  }
                } catch (_e) {
                  // ignore
                }
              })
              .catch(() => {});
          }
          return result;
        },
      });
      Log.debug("[签到监控] x666 hook 已启动");
    } catch (e) {
      Log.warn("[签到监控] x666 hook 失败", e);
    }
  },

  /**
   * runanytime 福利转盘监控
   */
  installRunanytimeWheelHook() {
    try {
      if (unsafeWindow.__ldoh_runanytime_wheel_fetch_hooked) return;
      unsafeWindow.__ldoh_runanytime_wheel_fetch_hooked = true;
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

          if (method === "POST" && url.includes("/api/wheel")) {
            result
              .then(async (res) => {
                try {
                  const data = await res.clone().json();
                  if (data?.success !== true) return;
                  const host = "runanytime.hxi.me";
                  const siteData = getSiteData(host);
                  if (!siteData.token || !siteData.userId) return;
                  const selfRes = await API.fetchSelf(host, siteData.token, siteData.userId);
                  if (selfRes.success && selfRes.data?.quota != null) {
                    siteData.quota = selfRes.data.quota;
                    saveSiteData(host, siteData);
                    EventBus.emit(UI_EVENTS.DATA_CHANGED, {
                      host,
                      next: siteData,
                      renderable: true,
                    });
                    Log.success(`[福利转盘] ${host} - 余额已同步`);
                  }
                } catch (_e) {
                  // ignore
                }
              })
              .catch(() => {});
          }
          return result;
        },
      });
      Log.debug("[福利转盘] runanytime hook 已启动");
    } catch (e) {
      Log.warn("[福利转盘] runanytime hook 失败", e);
    }
  },

  /**
   * hook XHR，监听 GET /api/user/self，被动同步余额
   */
  installSelfProfileXhrHook() {
    try {
      const XHR = unsafeWindow.XMLHttpRequest;
      if (XHR.prototype.__ldoh_self_hooked) return;
      XHR.prototype.__ldoh_self_hooked = true;

      const _open = XHR.prototype.open;
      XHR.prototype.open = function (method, url, ...rest) {
        this._ldoh_self_method = method;
        this._ldoh_self_url = url;
        return _open.apply(this, [method, url, ...rest]);
      };

      const _send = XHR.prototype.send;
      XHR.prototype.send = function (_body) {
        if (
          this._ldoh_self_method?.toUpperCase() === "GET" &&
          typeof this._ldoh_self_url === "string" &&
          this._ldoh_self_url.includes("/api/user/self")
        ) {
          this.addEventListener("load", function () {
            try {
              const res = JSON.parse(this.responseText);
              if (res.success && res.data?.quota != null) {
                const host = normalizeHost(window.location.hostname);
                const siteData = getSiteData(host);
                siteData.quota = res.data.quota;
                saveSiteData(host, siteData);
                EventBus.emit(UI_EVENTS.DATA_CHANGED, { host, next: siteData, renderable: true });
                Log.success(`[余额监控] ${host} - 余额已更新`);
              }
            } catch (_e) {
              // ignore
            }
          });
        }
        return _send.apply(this, arguments);
      };
      Log.debug("[余额监控] XHR hook 已启动");
    } catch (e) {
      Log.warn("[余额监控] XHR hook 失败", e);
    }
  },

  /**
   * hook XHR，监听 POST /api/user/topup，兑换码成功后更新余额。
   */
  installTopupXhrHook() {
    try {
      const XHR = unsafeWindow.XMLHttpRequest;
      if (XHR.prototype.__ldoh_topup_hooked) return;
      XHR.prototype.__ldoh_topup_hooked = true;

      const _open = XHR.prototype.open;
      XHR.prototype.open = function (method, url, ...rest) {
        this._ldoh_topup_method = method;
        this._ldoh_topup_url = url;
        return _open.apply(this, [method, url, ...rest]);
      };

      const _send = XHR.prototype.send;
      XHR.prototype.send = function (_body) {
        if (
          this._ldoh_topup_method?.toUpperCase() === "POST" &&
          typeof this._ldoh_topup_url === "string" &&
          this._ldoh_topup_url.includes("/api/user/topup")
        ) {
          this.addEventListener("load", function () {
            try {
              const res = JSON.parse(this.responseText);
              if (res.success && res.data > 0) {
                const host = normalizeHost(window.location.hostname);
                const siteData = getSiteData(host);
                API.fetchSelf(host, siteData.token, siteData.userId)
                  .then((selfRes) => {
                    if (selfRes.success && selfRes.data?.quota != null) {
                      siteData.quota = selfRes.data.quota;
                      saveSiteData(host, siteData);
                      EventBus.emit(UI_EVENTS.DATA_CHANGED, {
                        host,
                        next: siteData,
                        renderable: true,
                      });
                      Log.success(`[兑换码] ${host} - 余额已更新`);
                    }
                  })
                  .catch(() => {});
              }
            } catch (_e) {
              // ignore
            }
          });
        }
        return _send.apply(this, arguments);
      };
      Log.debug("[兑换码] XHR hook 已启动");
    } catch (e) {
      Log.warn("[兑换码] XHR hook 失败", e);
    }
  },
};
