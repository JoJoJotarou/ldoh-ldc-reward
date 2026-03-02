/**
 * FloatingPanel 悬浮面板
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";
import { formatQuota, escapeHtml, normalizeHost } from "../utils/format.js";
import {
  isBlacklisted,
  toggleBlacklist,
  isCheckinSkipped,
  toggleCheckinSkip,
  getBuiltinCheckinSkipReason,
} from "../utils/storage.js";
import { isCheckedInToday } from "../utils/date.js";
import { injectStyles } from "../utils/misc.js";
import { Toast } from "./toast.js";
import { showDetailsDialog } from "./dialog.js";
import { createOverlay } from "./overlay.js";
import { EventBus, UI_EVENTS } from "../utils/bus.js";
import { SiteService } from "../services/site.js";
import { UI } from "./base.js";

/**
 * 根据 host 查找对应的卡片元素（内部工具，不涉及跨组件调用）
 */
function _findCardByHost(host) {
  const target = normalizeHost(host);
  const container = document.querySelector(
    `.${CONFIG.DOM.HELPER_CONTAINER_CLASS}[data-host="${target}"]`,
  );
  return container ? container.closest(CONFIG.DOM.CARD_SELECTOR) : null;
}

// ===== FloatingPanel UI =====
export const FloatingPanel = {
  _fab: null,
  _panel: null,
  _isOpen: false,
  _searchQuery: "",
  _checkinFilter: "",
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
    injectStyles();

    const fab = UI.button({
      id: "ldoh-fab",
      className: "ldoh-fab",
      title: "站点总览",
      innerHTML: `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span class="ldoh-fab-badge" id="ldoh-fab-badge" style="display:none">0</span>
      `,
      onClick: (e) => {
        e.stopPropagation();
        this.toggle();
      },
    });
    document.body.appendChild(fab);
    this._fab = fab;

    const panel = UI.div({
      id: "ldoh-floating-panel",
      className: "ldoh-floating-panel",
      style: "display: none;",
    });
    document.body.appendChild(panel);
    this._panel = panel;

    document.addEventListener("click", (e) => {
      const isOnPopover =
        (this._confirmPop && this._confirmPop.contains(e.target)) ||
        (this._settingsPop && this._settingsPop.contains(e.target)) ||
        (this._intervalPop && this._intervalPop.contains(e.target)) ||
        (this._concurrencyPop && this._concurrencyPop.contains(e.target));
      if (this._isOpen && !panel.contains(e.target) && !fab.contains(e.target) && !isOnPopover) {
        this.close();
      }
    });

    // 订阅事件
    EventBus.on(UI_EVENTS.DATA_CHANGED, (delta) => this.applyDelta(delta));
    EventBus.on(UI_EVENTS.GLOBAL_REFRESH, () => this.refresh());

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
    setTimeout(() => this._panel.classList.remove("ldoh-panel-in"), CONFIG.ANIMATION_NORMAL_MS);
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
    if (this._confirmPop || this._settingsPop || this._intervalPop || this._concurrencyPop) {
      this._pendingRefresh = true;
      return;
    }
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this.render(), 150);
  },

  _getCheckinMeta(siteData) {
    if (siteData.checkinSupported !== false) {
      if (isCheckedInToday(siteData)) {
        return { checkinClass: "ok", checkinText: "已签到" };
      }
      if (siteData.checkedInToday === false || siteData.lastCheckinDate) {
        return { checkinClass: "no", checkinText: "未签到" };
      }
    }
    return { checkinClass: "na", checkinText: "─" };
  },

  _applyRowVisibility(row) {
    const matchSearch = !this._searchQuery || row.dataset.searchKey.includes(this._searchQuery);
    const matchFilter = !this._checkinFilter || row.dataset.checkinStatus === this._checkinFilter;
    row.style.display = matchSearch && matchFilter ? "" : "none";
  },

  /**
   * 局部更新面板单行
   */
  updateSiteRow(host, siteData) {
    if (!this._isOpen || !this._panel) return false;

    const normalizedHost = normalizeHost(host);
    const row = this._panel.querySelector(`.ldoh-panel-row[data-host="${normalizedHost}"]`);
    if (!row) return false;

    const balanceEl = row.querySelector(".ldoh-panel-balance-col");
    if (balanceEl) balanceEl.textContent = `$${formatQuota(siteData.quota)}`;

    const { checkinClass, checkinText } = this._getCheckinMeta(siteData);
    const checkinEl = row.querySelector(".ldoh-panel-checkin-col");
    if (checkinEl) {
      checkinEl.className = `ldoh-panel-checkin ldoh-panel-checkin-col ${checkinClass}`;
      checkinEl.textContent = checkinText;
    }

    row.dataset.checkinStatus = checkinClass;
    this._applyRowVisibility(row);
    return true;
  },

  applyDelta(delta) {
    this._updateBadge();
    if (!this._isOpen) return { handled: false, needRefresh: false };
    if (!delta?.renderable) return { handled: false, needRefresh: true };
    const updated = this.updateSiteRow(delta.host, delta.next || {});
    return { handled: updated, needRefresh: !updated };
  },

  refreshBadgeOnly() {
    this._updateBadge();
  },

  _updateBadge() {
    const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
    const count = Object.values(allData).filter((d) => d.userId || d.quota != null).length;
    const badge = document.getElementById("ldoh-fab-badge");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "flex" : "none";
    }
  },

  _showSettingsMenu(anchorEl) {
    if (!anchorEl) return;
    this._removeIntervalPopover();
    this._removeConfirmPopover();
    this._removeSettingsMenu();

    const actions = [
      { label: "设置更新间隔", handler: (triggerEl) => this._showIntervalPopover(triggerEl) },
      { label: "设置并发数", handler: (triggerEl) => this._showConcurrencyPopover(triggerEl) },
      {
        label: "重置检测黑名单",
        handler: (triggerEl) => {
          this._showConfirmPopover(triggerEl, "确认重置检测黑名单？", () => {
            GM_setValue(CONFIG.BLACKLIST_KEY, []);
            GM_setValue(CONFIG.BLACKLIST_REMOVED_KEY, []);
            Toast.success("检测黑名单已重置");
            this.refresh();
          });
        },
      },
      {
        label: "重置签到黑名单",
        handler: (triggerEl) => {
          this._showConfirmPopover(triggerEl, "确认重置签到黑名单？", () => {
            GM_setValue(CONFIG.CHECKIN_SKIP_KEY, []);
            GM_setValue(CONFIG.CHECKIN_SKIP_REMOVED_KEY, []);
            Toast.success("签到黑名单已重置");
            this.refresh();
          });
        },
      },
      {
        label: "清理缓存",
        danger: true,
        handler: (triggerEl) => {
          const allData = GM_getValue(CONFIG.STORAGE_KEY, {});
          if (Object.keys(allData).length === 0) {
            Toast.info("缓存已经是空的");
            return;
          }
          this._showConfirmPopover(triggerEl, `确认清除缓存？`, () => {
            GM_setValue(CONFIG.STORAGE_KEY, {});
            Toast.success("缓存已清理，页面将刷新", 2000);
            setTimeout(() => location.reload(), 2000);
          });
        },
      },
      { label: "使用说明", handler: () => this._showHelpDialog() },
    ];

    const pop = UI.div({ id: "ldoh-settings-pop", className: "ldoh-settings-pop" });
    actions.forEach(({ label, handler, danger }) => {
      pop.appendChild(
        UI.button({
          className: "ldoh-settings-item",
          textContent: label,
          style: danger ? "color: var(--ldoh-danger, #ef4444)" : "",
          onClick: (e) => {
            e.stopPropagation();
            this._removeSettingsMenu();
            handler(anchorEl);
          },
        }),
      );
    });

    const rect = anchorEl.getBoundingClientRect();
    Object.assign(pop.style, {
      top: `${rect.bottom + 6}px`,
      right: `${window.innerWidth - rect.right}px`,
    });
    document.body.appendChild(pop);
    this._settingsPop = pop;

    this._settingsOutsideHandler = (e) => {
      if (!pop.contains(e.target) && !anchorEl.contains(e.target)) this._removeSettingsMenu();
    };
    setTimeout(() => document.addEventListener("click", this._settingsOutsideHandler), 0);
  },

  _showHelpDialog() {
    const html = `
      <div style="padding:24px">
      <h2 style="margin:0 0 16px;font-size:16px;font-weight:700;color:var(--ldoh-text)">使用说明</h2>
      <div style="font-size:13px;color:var(--ldoh-text-muted);line-height:1.7;max-height:60vh;overflow-y:auto;padding-right:4px">
        <p><strong>LDOH New API Helper</strong><br>自动同步站点额度与签到状态。</p>
      </div>
      <div style="text-align:right;margin-top:16px">
        <button type="button" class="ldh-dialog-close" style="padding:6px 20px;border-radius:6px;background:var(--ldoh-surface2);color:var(--ldoh-text);border:none;cursor:pointer;font-size:13px">关闭</button>
      </div>
      </div>`;
    const ov = createOverlay(html);
    const closeBtn = ov.querySelector(".ldh-dialog-close");
    if (closeBtn)
      closeBtn.onclick = () => {
        ov.style.opacity = "0";
        setTimeout(() => ov.remove(), 200);
      };
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
    const inputEl = UI.input({
      type: "number",
      min: "5",
      step: "1",
      value: current,
      className: "ldoh-interval-input",
    });

    const pop = UI.div({
      id: "ldoh-interval-pop",
      className: "ldoh-interval-pop",
      children: [
        UI.div({ className: "ldoh-interval-title", textContent: "设置更新间隔" }),
        inputEl,
        UI.div({ className: "ldoh-interval-hint", textContent: "单位：分钟，最小值 5 分钟" }),
        UI.div({
          className: "ldoh-interval-actions",
          children: [
            UI.button({
              className: "ldoh-pop-btn ldoh-pop-cancel",
              textContent: "取消",
              onClick: (e) => {
                e.stopPropagation();
                this._removeIntervalPopover();
              },
            }),
            UI.button({
              className: "ldoh-pop-btn ldoh-pop-confirm",
              textContent: "保存",
              onClick: (e) => {
                e.stopPropagation();
                const val = parseInt(inputEl.value, 10);
                if (isNaN(val) || val < 5) {
                  Toast.error("无效的间隔值");
                  return;
                }
                GM_setValue(CONFIG.SETTINGS_KEY, {
                  ...GM_getValue(CONFIG.SETTINGS_KEY, {}),
                  interval: val,
                });
                Toast.success(`已更新为 ${val} 分钟`);
                this._removeIntervalPopover();
              },
            }),
          ],
        }),
      ],
    });

    const rect = anchorEl.getBoundingClientRect();
    Object.assign(pop.style, {
      top: `${rect.bottom + 6}px`,
      right: `${window.innerWidth - rect.right}px`,
    });
    document.body.appendChild(pop);
    this._intervalPop = pop;
    pop.addEventListener("click", (e) => e.stopPropagation());
    setTimeout(() => inputEl.focus(), 0);

    this._intervalOutsideHandler = (e) => {
      if (!pop.contains(e.target) && !anchorEl.contains(e.target)) this._removeIntervalPopover();
    };
    setTimeout(() => document.addEventListener("click", this._intervalOutsideHandler), 0);
  },

  _removeConfirmPopover() {
    if (this._confirmOutsideHandler)
      document.removeEventListener("click", this._confirmOutsideHandler);
    this._confirmOutsideHandler = null;
    if (this._confirmPop) {
      this._confirmPop.remove();
      this._confirmPop = null;
    }
    if (!this._rendering) this._flushPendingRefresh();
  },

  _showConfirmPopover(anchorEl, text, onConfirm) {
    if (!anchorEl) return;
    this._removeIntervalPopover();
    this._removeSettingsMenu();
    this._removeConfirmPopover();
    this._removeConcurrencyPopover();

    const pop = UI.div({
      id: "ldoh-confirm-pop",
      className: "ldoh-confirm-pop",
      children: [
        UI.span({ style: "white-space:pre-line", textContent: text }),
        UI.button({
          className: "ldoh-pop-btn ldoh-pop-cancel",
          textContent: "取消",
          onClick: (e) => {
            e.stopPropagation();
            this._removeConfirmPopover();
          },
        }),
        UI.button({
          className: "ldoh-pop-btn ldoh-pop-confirm",
          textContent: "确认",
          onClick: (e) => {
            e.stopPropagation();
            this._removeConfirmPopover();
            onConfirm?.();
          },
        }),
      ],
    });

    const rect = anchorEl.getBoundingClientRect();
    Object.assign(pop.style, {
      top: `${rect.top - 48}px`,
      right: `${window.innerWidth - rect.right}px`,
    });
    document.body.appendChild(pop);
    this._confirmPop = pop;

    this._confirmOutsideHandler = (e) => {
      if (!pop.contains(e.target) && !anchorEl.contains(e.target)) this._removeConfirmPopover();
    };
    setTimeout(() => document.addEventListener("click", this._confirmOutsideHandler), 0);
  },

  _removeIntervalPopover() {
    if (this._intervalOutsideHandler)
      document.removeEventListener("click", this._intervalOutsideHandler);
    this._intervalOutsideHandler = null;
    if (this._intervalPop) {
      this._intervalPop.remove();
      this._intervalPop = null;
    }
    if (!this._rendering) this._flushPendingRefresh();
  },

  _removeConcurrencyPopover() {
    if (this._concurrencyOutsideHandler)
      document.removeEventListener("click", this._concurrencyOutsideHandler);
    this._concurrencyOutsideHandler = null;
    if (this._concurrencyPop) {
      this._concurrencyPop.remove();
      this._concurrencyPop = null;
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

    const totalInput = UI.input({
      type: "number",
      min: "1",
      max: "50",
      value: curConcurrent,
      className: "ldoh-interval-input",
    });
    const bgInput = UI.input({
      type: "number",
      min: "1",
      max: "50",
      value: curBackground,
      className: "ldoh-interval-input",
    });

    const pop = UI.div({
      id: "ldoh-concurrency-pop",
      className: "ldoh-interval-pop",
      style: "width:240px;",
      children: [
        UI.div({ className: "ldoh-interval-title", textContent: "设置并发数" }),
        UI.div({
          children: [
            UI.div({ style: "font-size:11px;margin-bottom:4px;", textContent: "总并发数" }),
            totalInput,
          ],
        }),
        UI.div({
          children: [
            UI.div({ style: "font-size:11px;margin-bottom:4px;", textContent: "后台并发数" }),
            bgInput,
          ],
        }),
        UI.div({ className: "ldoh-interval-hint", textContent: "后台并发应 ≤ 总并发" }),
        UI.div({
          className: "ldoh-interval-actions",
          children: [
            UI.button({
              className: "ldoh-pop-btn ldoh-pop-cancel",
              textContent: "取消",
              onClick: (e) => {
                e.stopPropagation();
                this._removeConcurrencyPopover();
              },
            }),
            UI.button({
              className: "ldoh-pop-btn ldoh-pop-confirm",
              textContent: "保存",
              onClick: (e) => {
                e.stopPropagation();
                const total = parseInt(totalInput.value, 10);
                const bg = parseInt(bgInput.value, 10);
                if (bg > total) {
                  Toast.error("后台并发不能大于总并发");
                  return;
                }
                GM_setValue(CONFIG.SETTINGS_KEY, {
                  ...GM_getValue(CONFIG.SETTINGS_KEY, {}),
                  maxConcurrent: total,
                  maxBackground: bg,
                });
                Toast.success("并发设置已更新");
                this._removeConcurrencyPopover();
              },
            }),
          ],
        }),
      ],
    });

    const rect = anchorEl.getBoundingClientRect();
    Object.assign(pop.style, {
      top: `${rect.bottom + 6}px`,
      right: `${window.innerWidth - rect.right}px`,
    });
    document.body.appendChild(pop);
    this._concurrencyPop = pop;
    pop.addEventListener("click", (e) => e.stopPropagation());
    setTimeout(() => totalInput.focus(), 0);

    this._concurrencyOutsideHandler = (e) => {
      if (!pop.contains(e.target) && !anchorEl.contains(e.target)) this._removeConcurrencyPopover();
    };
    setTimeout(() => document.addEventListener("click", this._concurrencyOutsideHandler), 0);
  },

  _removeSettingsMenu() {
    if (this._settingsOutsideHandler)
      document.removeEventListener("click", this._settingsOutsideHandler);
    this._settingsOutsideHandler = null;
    if (this._settingsPop) {
      this._settingsPop.remove();
      this._settingsPop = null;
    }
    if (!this._rendering) this._flushPendingRefresh();
  },

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
      .filter(([, d]) => d.userId || d.quota != null)
      .sort(([, a], [, b]) => (b.quota || 0) - (a.quota || 0));
    const totalBalance = sorted.reduce((sum, [, d]) => sum + (d.quota || 0), 0);

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

  _buildHeader(sorted, totalBalance) {
    const hd = UI.div({
      className: "ldoh-panel-hd",
      innerHTML: `
        <div class="ldoh-panel-hd-title">${UI.ICONS.PANEL} 站点总览 <span class="ldh-sec-badge">${sorted.length}</span></div>
        <div class="ldoh-panel-hd-total">合计 <strong style="color:#d97706">$${formatQuota(totalBalance)}</strong></div>
      `,
    });

    const refreshAllBtn = UI.div({
      className: `ldoh-btn ldoh-refresh-btn ${this._refreshAllRunning ? "loading" : ""}`,
      title: "刷新所有站点数据",
      innerHTML: UI.ICONS.REFRESH,
      onClick: (e) => {
        e.stopPropagation();
        if (this._refreshAllRunning) return;
        this._showConfirmPopover(refreshAllBtn, "确认刷新全部？", async () => {
          this._refreshAllRunning = true;
          refreshAllBtn.classList.add("loading");
          try {
            await SiteService.refreshAll();
          } finally {
            this._refreshAllRunning = false;
            this.refresh();
          }
        });
      },
    });

    const checkinBtn = UI.div({
      className: `ldoh-btn ldoh-refresh-btn ${this._checkinRunning ? "loading" : ""}`,
      title: "一键签到",
      innerHTML: UI.ICONS.CHECKIN,
      onClick: (e) => {
        e.stopPropagation();
        if (this._checkinRunning) return;
        this._showConfirmPopover(checkinBtn, "确认自动签到？", async () => {
          this._checkinRunning = true;
          checkinBtn.classList.add("loading");
          try {
            await SiteService.checkinEligibleSites(false);
          } finally {
            this._checkinRunning = false;
            this.refresh();
          }
        });
      },
    });

    const settingsBtn = UI.div({
      className: "ldoh-btn",
      title: "设置",
      innerHTML: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
      onClick: (e) => {
        e.stopPropagation();
        this._showSettingsMenu(settingsBtn);
      },
    });

    hd.appendChild(refreshAllBtn);
    hd.appendChild(checkinBtn);
    hd.appendChild(settingsBtn);
    hd.appendChild(
      UI.div({
        className: "ldoh-btn",
        title: "关闭",
        innerHTML: UI.ICONS.CLOSE,
        onClick: () => this.close(),
      }),
    );
    return hd;
  },

  _buildSearchBar() {
    const searchBar = UI.div({
      className: "ldoh-panel-search",
      innerHTML: `
        <div class="ldoh-panel-search-wrap">
          <svg class="ldoh-panel-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input class="ldoh-panel-search-input" placeholder="搜索站点..." value="${escapeHtml(this._searchQuery)}">
        </div>
        <div class="ldoh-filter-bar">
          <span class="ldoh-filter-chip ${this._checkinFilter === "" ? "active" : ""}" data-filter="">全部</span>
          <span class="ldoh-filter-chip ${this._checkinFilter === "ok" ? "active" : ""}" data-filter="ok">已签到</span>
          <span class="ldoh-filter-chip ${this._checkinFilter === "no" ? "active" : ""}" data-filter="no">未签到</span>
          <span class="ldoh-filter-chip ${this._checkinFilter === "na" ? "active" : ""}" data-filter="na">不支持/无法检测签到</span>
        </div>
      `,
    });

    const bindSearch = (body) => {
      const input = searchBar.querySelector(".ldoh-panel-search-input");
      input.oninput = () => {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
          this._searchQuery = input.value.toLowerCase().trim();
          body.querySelectorAll(".ldoh-panel-row").forEach((row) => this._applyRowVisibility(row));
        }, 200);
      };
      searchBar.querySelectorAll(".ldoh-filter-chip").forEach((chip) => {
        chip.onclick = () => {
          this._checkinFilter = chip.dataset.filter;
          searchBar
            .querySelectorAll(".ldoh-filter-chip")
            .forEach((c) => c.classList.toggle("active", c.dataset.filter === this._checkinFilter));
          body.querySelectorAll(".ldoh-panel-row").forEach((row) => this._applyRowVisibility(row));
        };
      });
    };
    return { searchBar, bindSearch };
  },

  _buildBody(sorted) {
    const body = UI.div({ className: "ldoh-panel-body" });
    if (!sorted.length) {
      body.appendChild(UI.div({ className: "ldoh-panel-empty", textContent: "暂无站点数据" }));
    } else {
      sorted.forEach(([host, siteData]) => body.appendChild(this._buildSiteRow(host, siteData)));
    }
    return body;
  },

  _buildSiteRow(host, siteData) {
    const isBlk = isBlacklisted(host);
    const { checkinClass, checkinText } = this._getCheckinMeta(siteData);
    const row = UI.div({
      className: "ldoh-panel-row",
      dataset: {
        host: normalizeHost(host),
        searchKey: `${siteData.siteName || ""} ${host}`.toLowerCase(),
        checkinStatus: checkinClass,
      },
    });

    row.appendChild(
      UI.div({
        className: "ldoh-panel-name",
        innerHTML: `<span class="ldoh-panel-name-main">${siteData.siteName || host}</span><span class="ldoh-panel-name-host">${host}</span>`,
      }),
    );
    row.appendChild(
      UI.div({
        className: `ldoh-panel-checkin ldoh-panel-checkin-col ${checkinClass}`,
        textContent: checkinText,
      }),
    );
    row.appendChild(
      UI.div({
        className: "ldoh-panel-balance ldoh-panel-balance-col",
        textContent: `$${formatQuota(siteData.quota)}`,
      }),
    );

    // 1. 详情按钮
    if (!isBlk) {
      row.appendChild(
        UI.div({
          className: "ldoh-btn",
          title: "密钥与模型详情",
          innerHTML: UI.ICONS.DETAILS,
          onClick: () => showDetailsDialog(host, siteData),
        }),
      );
    } else {
      row.appendChild(UI.div({ style: "width:22px" }));
    }

    // 2. 刷新按钮
    if (!isBlk) {
      const refreshBtn = UI.div({
        className: "ldoh-btn ldoh-refresh-btn",
        title: "刷新数据",
        innerHTML: UI.ICONS.REFRESH,
        onClick: async (e) => {
          if (refreshBtn.classList.contains("loading")) return;
          refreshBtn.classList.add("loading");
          try {
            await SiteService.refreshSite(host, siteData);
          } finally {
            refreshBtn.classList.remove("loading");
          }
        },
      });
      row.appendChild(refreshBtn);
    } else {
      row.appendChild(UI.div({ style: "width:22px" }));
    }

    // 3. 定位按钮
    row.appendChild(
      UI.div({
        className: "ldoh-btn",
        title: "定位卡片",
        innerHTML: UI.ICONS.LOCATE,
        onClick: () => {
          const card = _findCardByHost(host);
          if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.style.outline = "2px solid var(--ldoh-primary)";
            card.style.outlineOffset = "2px";
            setTimeout(() => {
              card.style.outline = "";
              card.style.outlineOffset = "";
            }, 2000);
          } else {
            Toast.warning(`未找到 ${host} 的卡片`);
          }
        },
      }),
    );

    // 4. 黑名单切换按钮
    const blkBtn = UI.div({
      className: "ldoh-btn",
      title: isBlk ? "被动监控（点击恢复主动检测）" : "主动检测（点击切换为被动监控）",
      style: `color: ${isBlk ? "#9ca3af" : "var(--ldoh-success)"}`,
      innerHTML: UI.ICONS.EYE,
      onClick: (e) => {
        e.stopPropagation();
        this._showConfirmPopover(
          blkBtn,
          isBlk ? "恢复主动检测？" : "加入黑名单（被动监控）？",
          () => {
            toggleBlacklist(host);
            Toast.success(`${host} 状态已更新`);
            this.refresh();
          },
        );
      },
    });
    row.appendChild(blkBtn);

    // 5. 签到跳过按钮
    const isSkipped = isCheckinSkipped(host);
    const noSupport = siteData.checkinSupported === false;
    const skipBtn = UI.div({
      className: "ldoh-btn",
      title: noSupport
        ? "不支持签到"
        : isSkipped
          ? "已跳过签到（点击恢复）"
          : "自动签到中（点击跳过）",
      style: `color: ${noSupport || isSkipped || isBlk ? "#9ca3af" : "var(--ldoh-success)"}; cursor: ${noSupport || isBlk ? "default" : "pointer"}`,
      innerHTML: noSupport ? UI.ICONS.CHECKIN_OFF : UI.ICONS.CHECKIN,
      onClick: (e) => {
        if (noSupport || isBlk) return;
        const reason = getBuiltinCheckinSkipReason(host);
        this._showConfirmPopover(
          skipBtn,
          isSkipped ? `恢复自动签到？${reason ? `\n(原因: ${reason})` : ""}` : "跳过自动签到？",
          () => {
            toggleCheckinSkip(host);
            Toast.success(`${host} 签到策略已更新`);
            this.refresh();
          },
        );
      },
    });
    row.appendChild(skipBtn);

    // 6. 删除按钮
    const delBtn = UI.div({
      className: "ldoh-btn",
      title: "删除缓存数据",
      style: "color: var(--ldoh-danger)",
      innerHTML: UI.ICONS.TRASH,
      onMouseOver: (e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"),
      onMouseOut: (e) => (e.currentTarget.style.background = "transparent"),
      onClick: (e) => {
        e.stopPropagation();
        this._showConfirmPopover(delBtn, "确认彻底删除该站点缓存？", () => {
          SiteService.deleteSiteData(host);
          Toast.success(`已删除 ${host} 缓存`);
        });
      },
    });
    row.appendChild(delBtn);

    this._applyRowVisibility(row);
    return row;
  },
};
