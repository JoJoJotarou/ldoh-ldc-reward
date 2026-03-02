/**
 * 格式化工具函数
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";

/**
 * 转换额度为美元格式
 */
export function formatQuota(q) {
  if (q === undefined || q === null || isNaN(q)) return "0.00";
  return (q / CONFIG.QUOTA_CONVERSION_RATE).toFixed(2);
}

/**
 * 标准化主机名（移除端口，转小写）
 */
export function normalizeHost(host) {
  if (!host || typeof host !== "string") {
    Log.warn("normalizeHost 收到无效的 host", host);
    return "";
  }
  return host.toLowerCase().split(":")[0];
}

/**
 * 转义 HTML 特殊字符防止 XSS
 */
export function escapeHtml(str) {
  if (!str || typeof str !== "string") return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
