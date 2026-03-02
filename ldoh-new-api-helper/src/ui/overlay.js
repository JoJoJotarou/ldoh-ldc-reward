/**
 * 遮罩层 & 确认气泡
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";
import { injectStyles } from "../utils/misc.js";
import { escapeHtml } from "../utils/format.js";

/**
 * 创建遮罩层对话框
 */
export function createOverlay(html) {
  injectStyles();
  const ov = document.createElement("div");
  ov.className = "ldh-overlay";
  ov.innerHTML = `<div class="ldh-dialog">${html}</div>`;
  ov.onclick = (e) => {
    if (e.target !== ov) return;
    ov.querySelector(".ldh-dialog").style.animation =
      `ldoh-zoom-in ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
    ov.style.animation = `ldoh-fade-in-blur ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
    setTimeout(() => ov.remove(), CONFIG.ANIMATION_FAST_MS);
  };
  document.body.appendChild(ov);
  return ov;
}

/**
 * 弹出锚定在 anchorEl 附近的确认 Popover
 */
export function confirm(anchorEl, text, onConfirm) {
  if (!anchorEl) return;
  document.getElementById("ldoh-confirm-pop")?.remove();
  injectStyles();

  const pop = document.createElement("div");
  pop.id = "ldoh-confirm-pop";
  pop.className = "ldoh-confirm-pop";
  pop.innerHTML = `
    <span style="white-space:pre-line">${escapeHtml(text)}</span>
    <button class="ldoh-pop-btn ldoh-pop-cancel">取消</button>
    <button class="ldoh-pop-btn ldoh-pop-confirm">确认</button>
  `;

  const rect = anchorEl.getBoundingClientRect();
  pop.style.top = `${rect.top - 48}px`;
  pop.style.right = `${window.innerWidth - rect.right}px`;
  document.body.appendChild(pop);

  let outsideHandler;
  const remove = () => {
    if (outsideHandler) document.removeEventListener("click", outsideHandler);
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
}
