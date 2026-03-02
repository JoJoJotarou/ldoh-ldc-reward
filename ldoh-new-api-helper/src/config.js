/**
 * 全局配置常量
 */
export const CONFIG = {
  STORAGE_KEY: "ldoh_newapi_data",
  SETTINGS_KEY: "ldoh_newapi_settings",
  WHITELIST_KEY: "ldoh_site_whitelist",
  BLACKLIST_KEY: "ldoh_site_blacklist",
  BLACKLIST_REMOVED_KEY: "ldoh_site_blacklist_removed",
  CHECKIN_SKIP_KEY: "ldoh_checkin_skip",
  CHECKIN_SKIP_REMOVED_KEY: "ldoh_checkin_skip_removed",
  BLACKLIST: ["elysiver.h-e.top", "anthorpic.us.ci", "demo.voapi.top", "windhub.cc", "ai.qaq.al"],
  DEFAULT_CHECKIN_SKIP: new Map([
    ["api.67.si", "CF Turnstile 拦截"],
    ["runanytime.hxi.me", "CF Turnstile 拦截"],
    ["anyrouter.top", "登录自动签到"],
    ["x666.me", "站外签到"],
  ]),
  DEFAULT_INTERVAL: 60,
  DEFAULT_MAX_CONCURRENT: 15,
  DEFAULT_MAX_BACKGROUND: 10,
  QUOTA_CONVERSION_RATE: 500000,
  PORTAL_HOST: "ldoh.105117.xyz",
  REQUEST_TIMEOUT: 10000,
  DEBOUNCE_DELAY: 800,
  LOGIN_CHECK_INTERVAL: 500,
  LOGIN_CHECK_MAX_ATTEMPTS: 10,
  ANIMATION_FAST_MS: 200,
  ANIMATION_NORMAL_MS: 300,
  DOM: {
    CARD_SELECTOR: ".rounded-xl.shadow.group.relative",
    HELPER_CONTAINER_CLASS: "ldoh-helper-container",
    STYLE_ID: "ldoh-helper-css",
  },
};
