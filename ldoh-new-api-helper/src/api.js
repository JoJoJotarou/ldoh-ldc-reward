/**
 * API 请求模块（并发信号量 + 所有站点 API）
 */
import { CONFIG } from "./config.js";
import { Log } from "./logger.js";
import { formatQuota } from "./utils/format.js";
import { saveSiteData, getSiteData } from "./utils/storage.js";
import { getTodayString, getCurrentMonthString } from "./utils/date.js";

// ── 并发信号量 ──

const _state = {
  waiters: [],
  activeRequests: 0,
  activeBackgroundRequests: 0,
};

function _release(isInteractive) {
  _state.activeRequests--;
  if (!isInteractive) _state.activeBackgroundRequests--;

  const settings = GM_getValue(CONFIG.SETTINGS_KEY, {});
  const maxConcurrent = settings.maxConcurrent || CONFIG.DEFAULT_MAX_CONCURRENT;
  const maxBackground = settings.maxBackground || CONFIG.DEFAULT_MAX_BACKGROUND;

  let idx = _state.waiters.findIndex(
    (w) => w.isInteractive && _state.activeRequests < maxConcurrent,
  );
  if (idx < 0) {
    idx = _state.waiters.findIndex(
      (w) =>
        !w.isInteractive &&
        _state.activeRequests < maxConcurrent &&
        _state.activeBackgroundRequests < maxBackground,
    );
  }
  if (idx >= 0) {
    const w = _state.waiters.splice(idx, 1)[0];
    _state.activeRequests++;
    if (!w.isInteractive) _state.activeBackgroundRequests++;
    w.resolve();
  }
}

async function _acquire(isInteractive) {
  const settings = GM_getValue(CONFIG.SETTINGS_KEY, {});
  const maxConcurrent = settings.maxConcurrent || CONFIG.DEFAULT_MAX_CONCURRENT;
  const maxBackground = settings.maxBackground || CONFIG.DEFAULT_MAX_BACKGROUND;
  const canRun = () =>
    _state.activeRequests < maxConcurrent &&
    (isInteractive || _state.activeBackgroundRequests < maxBackground);

  if (!canRun()) {
    await new Promise((resolve) => _state.waiters.push({ resolve, isInteractive }));
    return;
  }
  _state.activeRequests++;
  if (!isInteractive) _state.activeBackgroundRequests++;
}

// ── HTTP 请求 ──

/**
 * 发送 HTTP 请求（带并发控制和优先级）
 */
async function request(
  method,
  host,
  path,
  token = null,
  userId = null,
  body = null,
  isInteractive = false,
  extraHeaders = {},
) {
  await _acquire(isInteractive);
  Log.debug(
    `[请求] ${method} ${host}${path} (并发: ${_state.activeRequests}, 后台: ${_state.activeBackgroundRequests}, 交互: ${isInteractive})`,
  );

  try {
    const result = await new Promise((resolve, _reject) => {
      const requestConfig = {
        method,
        url: `https://${host}${path}`,
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0",
          Referer: `https://${host}/`,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(userId ? { "New-Api-User": userId } : {}),
          ...extraHeaders,
        },
        timeout: CONFIG.REQUEST_TIMEOUT,
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            if (res.status >= 200 && res.status < 300) {
              Log.debug(`[响应成功] ${method} ${host}${path}`, data);
              resolve(data);
            } else {
              Log.warn(`[响应错误] ${method} ${host}${path} - 状态码: ${res.status}`, data);
              resolve({ success: false, error: `HTTP ${res.status}`, data });
            }
          } catch (e) {
            Log.error(`[解析失败] ${method} ${host}${path}`, e);
            resolve({ success: false, error: "解析响应失败" });
          }
        },
        onerror: (err) => {
          Log.error(`[网络错误] ${method} ${host}${path}`, err);
          resolve({ success: false, error: "网络错误" });
        },
        ontimeout: () => {
          Log.warn(`[请求超时] ${method} ${host}${path}`);
          resolve({ success: false, error: "请求超时" });
        },
      };

      if (body) requestConfig.data = JSON.stringify(body);
      GM_xmlhttpRequest(requestConfig);
    });

    return result;
  } finally {
    _release(isInteractive);
  }
}

// ── 内部业务辅助函数 ──

/** 探测站点余额 */
async function _probeQuota(host, token, userId) {
  Log.debug(`[获取用户信息] ${host}`);
  const res = await request("GET", host, "/api/user/self", token, userId);
  if (res.success && res.data) {
    Log.debug(`[用户信息] ${host} - 额度: ${res.data.quota}`);
    return { success: true, quota: res.data.quota, error: null };
  }
  Log.error(`[用户信息获取失败] ${host}`, res);
  return { success: false, quota: null, error: res?.error || "请求失败" };
}

/** 探测站点签到状态 */
async function _probeCheckinStatus(host, token, userId, currentData) {
  const monthStr = getCurrentMonthString();
  const todayStr = getTodayString();

  if (currentData.checkinSupported === false) {
    Log.debug(`[签到数据] ${host} - LDOH 标记不支持签到，跳过探测`);
    return {
      success: true,
      error: null,
      data: {
        checkedInToday: null,
        checkinSupported: false,
        lastCheckinDate: currentData.lastCheckinDate,
      },
    };
  }

  Log.debug(`[获取签到数据] ${host} - 月份: ${monthStr}`);
  const res = await request("GET", host, `/api/user/checkin?month=${monthStr}`, token, userId);

  if (res.success && res.data) {
    let checkedInToday = !!res.data?.stats?.checked_in_today;
    if (host === "wzw.pp.ua") checkedInToday = !!res.data?.checked_in;
    const lastCheckinDate = checkedInToday ? todayStr : currentData.lastCheckinDate;
    Log.debug(`[签到数据] ${host} - 已签到: ${checkedInToday}`);
    return {
      success: true,
      error: null,
      data: { checkedInToday, checkinSupported: true, lastCheckinDate },
    };
  }

  Log.warn(`[签到数据获取失败] ${host} - 接口请求失败`, res);
  return {
    success: false,
    error: res?.error || "请求失败",
    data: {
      checkedInToday: null,
      checkinSupported: currentData.checkinSupported ?? true,
      lastCheckinDate: currentData.lastCheckinDate,
    },
  };
}

// ── 站点 API ──

/**
 * 更新站点状态（余额 + 签到状态）
 */
async function updateSiteStatus(host, userId, force = false, strict = false) {
  let data = getSiteData(host);
  const settings = GM_getValue(CONFIG.SETTINGS_KEY, { interval: CONFIG.DEFAULT_INTERVAL });

  if (!force && data.ts && Date.now() - data.ts < settings.interval * 60 * 1000) {
    Log.debug(
      `[跳过更新] ${host} - 距离上次更新 ${Math.round((Date.now() - data.ts) / 60000)} 分钟`,
    );
    return data;
  }

  Log.info(`[开始更新] ${host} (强制: ${force})`);
  if (!data.token) {
    Log.warn(`[跳过更新] ${host} - token 不存在`);
    return data;
  }

  // 1. 获取余额
  const quotaResult = await _probeQuota(host, data.token, userId);
  if (!quotaResult.success) {
    if (quotaResult.error === "请求超时") {
      throw new Error(`${host} 请求超时`);
    }
    if (strict) {
      throw new Error(`${host} 接口请求失败`);
    }
  }
  if (quotaResult.success && quotaResult.quota != null) data.quota = quotaResult.quota;

  // 2. 获取签到状态
  const checkinResult = await _probeCheckinStatus(host, data.token, userId, data);
  if (!checkinResult.success) {
    if (checkinResult.error === "请求超时") {
      throw new Error(`${host} 请求超时`);
    }
    if (strict) {
      throw new Error(`${host} 接口请求失败`);
    }
  }
  Object.assign(data, checkinResult.data);

  data.userId = userId;
  saveSiteData(host, data);

  const checkinLabel = data.checkinSupported ? (data.checkedInToday ? "是" : "否") : "不支持";
  Log.success(`[更新完成] ${host} - 额度: $${formatQuota(data.quota)}, 签到: ${checkinLabel}`);
  return data;
}

/**
 * 获取 token（首次；失败时自动用 session cookie 重试）
 */
async function fetchToken(host, userId) {
  try {
    let res = await request("GET", host, "/api/user/token", null, userId);
    if (!res.success || !res.data) {
      const sessionVal = document.cookie
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("session="))
        ?.slice("session=".length);
      if (sessionVal) {
        Log.debug(`[Token] ${host} - 尝试 session cookie 重试`);
        res = await request("GET", host, "/api/user/token", null, userId, null, false, {
          Cookie: `session=${sessionVal}`,
        });
      }
    }
    if (res.success && res.data) {
      Log.success(`[Token] ${host} - 获取成功`);
      return res.data;
    }
    Log.error(`[Token] ${host} - 获取失败`, res);
    return null;
  } catch (e) {
    Log.error(`[Token] ${host} - 异常`, e);
    return null;
  }
}

/**
 * 获取用户余额
 */
async function fetchSelf(host, token, userId) {
  return request("GET", host, "/api/user/self", token, userId);
}

/**
 * 获取密钥列表
 */
async function fetchKeys(host, token, userId, page = 0) {
  try {
    const res = await request(
      "GET",
      host,
      `/api/token/?p=${page}&size=1000`,
      token,
      userId,
      null,
      true,
    );
    return res.success ? (Array.isArray(res.data) ? res.data : res.data?.items || []) : [];
  } catch (e) {
    Log.error(`[fetchKeys] ${host}`, e);
    return [];
  }
}

/**
 * 创建密钥
 */
async function createToken(host, token, userId, name, group) {
  try {
    Log.debug(`[创建密钥] ${host} - 名称: ${name}, 分组: ${group}`);
    const res = await request(
      "POST",
      host,
      "/api/token/",
      token,
      userId,
      {
        remain_quota: 0,
        expired_time: -1,
        unlimited_quota: true,
        model_limits_enabled: false,
        model_limits: "",
        cross_group_retry: false,
        name,
        group,
        allow_ips: "",
      },
      true,
    );

    if (res.success) Log.success(`[密钥创建成功] ${host}`);
    else Log.error(`[密钥创建失败] ${host}`, res);
    return res;
  } catch (e) {
    Log.error(`[创建密钥异常] ${host}`, e);
    return { success: false, error: "创建密钥异常" };
  }
}

/**
 * 删除密钥
 */
async function deleteToken(host, token, userId, tokenId) {
  try {
    Log.debug(`[删除密钥] ${host} - ID: ${tokenId}`);
    const res = await request("DELETE", host, `/api/token/${tokenId}`, token, userId, null, true);
    if (res.success) Log.success(`[密钥删除成功] ${host}`);
    else Log.error(`[密钥删除失败] ${host}`, res);
    return res;
  } catch (e) {
    Log.error(`[删除密钥异常] ${host}`, e);
    return { success: false, error: "删除密钥异常" };
  }
}

/**
 * 签到
 */
async function checkin(host, token, userId) {
  try {
    Log.debug(`[签到] ${host}`);
    const res = await request("POST", host, "/api/user/checkin", token, userId, null, true);
    if (res.success) {
      const awarded = res.data?.quota_awarded || 0;
      Log.success(`[签到成功] ${host} - 获得额度: ${formatQuota(awarded)}`);
    } else if (res.message && res.message.includes("已签到")) {
      Log.success(`[已签到] ${host} - 今日已签到`);
      res.alreadyCheckedIn = true;
    } else Log.error(`[签到失败] ${host}`, res);
    return res;
  } catch (e) {
    Log.error(`[签到异常] ${host}`, e);
    return { success: false, error: "签到异常" };
  }
}

/**
 * 获取站点详细信息
 */
async function fetchDetails(host, token, userId) {
  try {
    Log.debug(`[获取详情] ${host}`);
    const [pricingRes, keys] = await Promise.all([
      request("GET", host, "/api/pricing", token, userId, null, true),
      fetchKeys(host, token, userId),
    ]);
    const models = pricingRes.success ? pricingRes.data : [];
    return { models, keys };
  } catch (e) {
    Log.error(`[获取详情异常] ${host}`, e);
    return { models: [], keys: [] };
  }
}

/**
 * 获取用户分组列表
 */
async function fetchGroups(host, token, userId) {
  try {
    Log.debug(`[获取分组列表] ${host}`);
    const res = await request("GET", host, "/api/user/self/groups", token, userId, null, true);
    if (res.success && res.data) return res.data;
    Log.warn(`[分组列表获取失败] ${host}`, res);
    return {};
  } catch (e) {
    Log.error(`[获取分组列表异常] ${host}`, e);
    return {};
  }
}

export const API = {
  request,
  updateSiteStatus,
  fetchToken,
  fetchSelf,
  fetchKeys,
  createToken,
  deleteToken,
  checkin,
  fetchDetails,
  fetchGroups,
};
