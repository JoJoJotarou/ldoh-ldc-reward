/**
 * 日期工具函数
 */

/**
 * 获取今天的日期字符串，格式 "YYYY-MM-DD"
 */
export function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * 获取当前月份字符串，格式 "YYYY-MM"
 */
export function getCurrentMonthString() {
  return getTodayString().slice(0, 7);
}

/**
 * 业务判断：站点今日是否已签到
 * 迁移自 CardView，确保 UI 组件间解耦
 */
export function isCheckedInToday(siteData) {
  if (!siteData) return false;
  const today = getTodayString();
  return (
    siteData.checkedInToday === true &&
    (!siteData.lastCheckinDate || siteData.lastCheckinDate === today)
  );
}
