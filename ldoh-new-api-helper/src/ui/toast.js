/**
 * Toast 通知系统
 */
import { escapeHtml } from "../utils/format.js";

let _container = null;

function _initContainer() {
  if (!_container) {
    _container = document.createElement("div");
    _container.className = "ldoh-toast-container";
    document.body.appendChild(_container);
  }
}

const ICONS = {
  success:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  error:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  warning:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
};

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.animation = "ldoh-slide-in 0.3s ease-in reverse forwards";
  setTimeout(() => toast.remove(), 300);
}

function showToast(message, type = "info", duration = 3000) {
  _initContainer();
  const toast = document.createElement("div");
  toast.className = `ldoh-toast ${type}`;
  toast.innerHTML = `
    <div class="ldoh-toast-icon">${ICONS[type] || ICONS.info}</div>
    <div class="ldoh-toast-message">${escapeHtml(message)}</div>
    <div class="ldoh-toast-close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
  `;
  toast.querySelector(".ldoh-toast-close").onclick = () => removeToast(toast);
  _container.appendChild(toast);
  if (duration > 0) setTimeout(() => removeToast(toast), duration);
  return toast;
}

export const Toast = {
  show: showToast,
  remove: removeToast,
  success: (msg, duration) => showToast(msg, "success", duration),
  error: (msg, duration) => showToast(msg, "error", duration),
  warning: (msg, duration) => showToast(msg, "warning", duration),
  info: (msg, duration) => showToast(msg, "info", duration),
};
