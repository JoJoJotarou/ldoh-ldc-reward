/**
 * 卡片助手渲染（LDOH 门户页面）
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";
import { normalizeHost, formatQuota } from "../utils/format.js";
import { getSiteData } from "../utils/storage.js";
import { isCheckedInToday } from "../utils/date.js";
import { isBlacklisted } from "../utils/storage.js";
import { EventBus, UI_EVENTS } from "../utils/bus.js";
import { debounce, injectStyles } from "../utils/misc.js";
import { UI } from "./base.js";
import { SiteService } from "../services/site.js";
import { showDetailsDialog } from "./dialog.js";

export const CardView = {
  _observer: null,

  /**
   * 初始化：开启扫描、注册观察器、订阅事件
   */
  init() {
    injectStyles();

    // 1. 建立防抖扫描函数
    const scheduleRescan = debounce(() => this.rescan(), CONFIG.DEBOUNCE_DELAY);

    // 2. 订阅事件流（必须在扫描前订阅，确保 DATA_CHANGED 能被处理）
    EventBus.on(UI_EVENTS.DATA_CHANGED, (delta) => {
      if (delta.renderable) {
        // 优先快速更新内容
        if (!this.updateByHost(delta.host, delta.next)) {
          // 如果页面上没找到带标签的容器，可能是还没扫描到，触发重扫
          scheduleRescan();
        }
      } else {
        this.removeByHost(delta.host);
      }
    });

    // 订阅全局刷新信号
    EventBus.on(UI_EVENTS.GLOBAL_REFRESH, () => scheduleRescan());

    // 3. 初次扫描渲染
    this.rescan();

    // 4. 注册 DOM 观察器（根节点选 document.body 确保万无一失）
    this._observer = new MutationObserver((mutations) => {
      const hasCardChanges = mutations.some((m) =>
        [...m.addedNodes, ...m.removedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches?.(CONFIG.DOM.CARD_SELECTOR) ||
              node.querySelector?.(CONFIG.DOM.CARD_SELECTOR)),
        ),
      );
      if (hasCardChanges) scheduleRescan();
    });

    this._observer.observe(document.body, { childList: true, subtree: true });

    Log.debug("[CardView] 初始化完成，已开启自动监控");
  },

  /**
   * 扫描全页卡片并挂载 UI
   */
  rescan() {
    const cards = Array.from(document.querySelectorAll(CONFIG.DOM.CARD_SELECTOR));
    if (cards.length === 0) return;

    cards.forEach((card) => {
      const links = Array.from(card.querySelectorAll("a"));
      const siteLink =
        links.find((a) => a.href.startsWith("http") && !a.href.includes("linux.do")) || links[0];
      if (!siteLink) return;

      try {
        const host = normalizeHost(new URL(siteLink.href).hostname);
        const container = this.ensureHostAnchor(card, host);
        const siteData = getSiteData(host);
        if (siteData.userId || siteData.quota != null) {
          this.render(card, host, siteData);
        } else if (container) {
          // 无数据时仅保留锚点用于定位，不展示辅助 UI
          container.innerHTML = "";
          container.style.display = "none";
        }
      } catch (_e) {
        // ignore
      }
    });
  },

  /**
   * 快速更新所有匹配 host 的卡片内容
   */
  updateByHost(host, data) {
    const target = normalizeHost(host);
    const containers = document.querySelectorAll(
      `.${CONFIG.DOM.HELPER_CONTAINER_CLASS}[data-host="${target}"]`,
    );
    if (containers.length === 0) return false;
    containers.forEach((container) => {
      container.style.display = "";
      this.renderContent(container, host, data);
    });
    return true;
  },

  /**
   * 移除匹配 host 的辅助 UI
   */
  removeByHost(host) {
    const target = normalizeHost(host);
    const containers = document.querySelectorAll(
      `.${CONFIG.DOM.HELPER_CONTAINER_CLASS}[data-host="${target}"]`,
    );
    containers.forEach((c) => c.remove());
    return containers.length > 0;
  },

  /**
   * 渲染/挂载卡片助手 UI
   */
  render(card, host, data) {
    const container = this.ensureHostAnchor(card, host);
    container.style.display = "";
    this.renderContent(container, host, data);
  },

  /**
   * 确保卡片存在可定位锚点，并写入 data-host
   */
  ensureHostAnchor(card, host) {
    const targetHost = normalizeHost(host);
    let container = card.querySelector(`.${CONFIG.DOM.HELPER_CONTAINER_CLASS}`);

    if (!container) {
      container = UI.div({
        className: CONFIG.DOM.HELPER_CONTAINER_CLASS,
        dataset: { host: targetHost },
      });

      // 查找 LDOH 卡片原本的 "更新时间" 所在的 div
      const ut = Array.from(card.querySelectorAll("div")).find(
        (el) =>
          el.textContent.includes("更新时间") &&
          (el.children.length === 0 || el.querySelector(`.${CONFIG.DOM.HELPER_CONTAINER_CLASS}`)),
      );

      if (ut) {
        Object.assign(ut.style, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
        });
        if (ut.children.length === 0) {
          const text = UI.span({ textContent: ut.textContent.trim() });
          ut.textContent = "";
          ut.appendChild(text);
        }
        ut.appendChild(container);
      } else {
        // 兜底挂载
        Object.assign(container.style, {
          position: "absolute",
          bottom: "8px",
          right: "8px",
        });
        card.appendChild(container);
      }
    }

    container.dataset.host = targetHost;
    return container;
  },

  /**
   * 纯内容渲染逻辑
   */
  renderContent(container, host, data) {
    container.innerHTML = "";
    const isOk = isCheckedInToday(data);
    const hasCheckin =
      data.checkinSupported !== false &&
      (isOk || data.checkedInToday === false || data.lastCheckinDate);

    container.appendChild(
      UI.div({
        className: "ldoh-info-bar",
        children: [
          UI.span({
            style: { color: "#d97706" },
            textContent: `$${formatQuota(data.quota)}`,
          }),
          hasCheckin ? UI.span({ style: { opacity: "0.5" }, textContent: "|" }) : null,
          hasCheckin
            ? UI.span({
                style: {
                  color: isOk ? "var(--ldoh-success)" : "var(--ldoh-warning)",
                },
                textContent: isOk ? "已签到" : "未签到",
              })
            : null,
        ],
      }),
    );

    if (!isBlacklisted(host)) {
      container.appendChild(
        UI.div({
          className: "ldoh-btn ldoh-refresh-btn",
          title: "刷新数据",
          innerHTML: UI.ICONS.REFRESH,
          onClick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const btn = e.currentTarget;
            if (btn.classList.contains("loading")) return;
            btn.classList.add("loading");
            try {
              await SiteService.refreshSite(host, data);
            } finally {
              btn.classList.remove("loading");
            }
          },
        }),
      );

      container.appendChild(
        UI.div({
          className: "ldoh-btn ldoh-details-btn",
          title: "详情",
          innerHTML: UI.ICONS.DETAILS,
          onClick: async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const btn = e.currentTarget;
            if (btn.classList.contains("loading")) return;
            btn.classList.add("loading");
            try {
              await showDetailsDialog(host, data);
            } finally {
              btn.classList.remove("loading");
            }
          },
        }),
      );
    }
  },

  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  },
};
