# 版本更新日志

## v2.0.1 (2026-03-06)

- fix：单站点刷新改为严格模式；任一接口请求失败或超时时不再写入站点数据，并直接提示刷新失败
- fix：修复单站点刷新在请求超时时仍提示“已更新”的问题，超时改为明确提示“刷新超时”
- feat：密钥详情、刷新单站点、刷新全部、自动签到按钮增加执行中防重复点击，避免重复触发请求
- feat：刷新全部完成提示改为成功/失败分开统计（成功 X 个，失败 Y 个）

## v2.0.0 (2026-03-02)

- **refactor**: 架构重大升级，引入 **Service-View-EventBus** 模式，实现业务逻辑与 UI 渲染彻底解耦。
- **feat**: 引入 **EventBus** 事件中心，通过 `DATA_CHANGED` 信号驱动全站 UI（卡片、面板）局部实时刷新。
- **feat**: 引入 **UI 原子化工厂**，规范 DOM 构建，移除冗余 innerHTML 代码。
- **perf**: 门户卡片采用 **Data Tagging (标签化更新)** 策略，解决异步加载导致的同步失效问题。
- **feat**: 强化工程化链路，集成 **Prettier 格式化** 与 **ESLint (v9) 静态检查**，构建脚本自动熔断。

## v1.0.25 (2026-02-28)

- refactor：token 刷新逻辑移出 updateSiteStatus，仅在公益站点初始化时通过 API.fetchToken() 获取一次
- feat：token 获取失败时自动用 document.cookie 中的 session 字段重试
- refactor：新增 API.fetchToken / API.fetchSelf / API.fetchKeys，消除所有外部 API.request() 直接调用
- fix：updateSiteStatus / refreshStaleData / runRefreshAll 均加 token 存在性守卫，避免无凭证发起请求

## v1.0.24 (2026-02-28)

- feat：黑名单语义调整为"XHR 被动监控"：注入 hookCheckinXHR + hookSelfXHR + hookTopupXHR，跳过主动 API 调用
- feat：新增独立函数 hookSelfXHR()、hookTopupXHR()，与 hookCheckinXHR() 并列；topup 黑名单分支直接累加充入量，非黑名单分支调 API 拉取准确余额
- feat：黑名单站点现可在面板中显示（过滤条件改为 d.userId || d.quota != null），按钮精简（密钥/刷新隐藏，签到跳过置灰保留）
- fix：黑名单行签到/余额列与普通行对齐（空占位替代密钥/刷新）

## v1.0.23 (2026-02-28)

- fix：up.x666.me XHR hook 中 const host 先于声明被引用（暂时性死区），导致监听静默失败

## v1.0.22 (2026-02-27)

- fix：topup/up.x666.me 签到监听存储 quota 改为原始单位，修复余额显示 $0.00 的问题

## v1.0.21 (2026-02-27)

- feat：XHR 监听 /api/user/topup，兑换码成功后自动拉取余额并更新存储
- fix：updateSiteStatus 中 /api/user/self 失败时不再覆盖余额为 null/0，保留旧值
- feat：模型弹窗改为 3 列，展示按量/按次计费价格；弹窗加宽至 720px，字体增大

## v1.0.20 (2026-02-27)

- feat：悬浮面板搜索栏下方新增签到状态筛选 chip（全部/已签到/未签到/不支持/无法检测签到），关闭面板不重置
- fix：panel body 加 min-height，筛选切换时面板高度不再抖动

## v1.0.19 (2026-02-27)

- feat：监听 up.x666.me /api/checkin/spin，手动签到成功后即时同步 x666.me 数据 （up.x666.me 签到站绕过白名单检测直接注入 XHR hook）

## v1.0.18 (2026-02-27)

- fix：normalizeHost 不再去除 www. 前缀，避免 www 站点 key 错误
- fix：自动签到成功后同步更新页面卡片签到状态
- fix：悬浮面板与卡片签到状态逻辑对齐，API 失败时均不显示状态
- feat：悬浮面板站点名下方小字显示完整地址（https://host）

## v1.0.17 (2026-02-26)

- refactor：DEFAULT_CHECKIN_SKIP 改为 Map（host → reason），支持内置跳过原因
- fix：悬浮面板签到跳过按钮 hover 展示内置跳过原因；恢复签到二次确认中显示原因
- fix：悬浮面板 refresh() 加防抖，有活跃弹窗时推迟刷新，关闭后补刷
- fix：render() 保存/恢复滚动位置，避免刷新后回到顶部
- refactor：删除 CF Turnstile 相关逻辑

## v1.0.16 (2026-02-26)

- feat: 更新 Token 缓存有效期至 12 小时，优化签到逻辑

## v1.0.15 (2026-02-26)

- feat：监控 LDOH /api/sites 自动同步白名单、站点名及签到支持状态，无需手动刷新
- feat：公益站签到成功后即时同步数据；跨标签页实时更新悬浮按钮数字
- feat：支持 CF Turnstile 验证码签到（invisible 模式），站点配置自动缓存
- feat：不支持签到的站点按钮置灰禁用，hover 显示原因说明
- fix：密钥创建后原地刷新列表及数量角标；修复二次创建按钮失效的 bug
- refactor：runPortalMode 仅负责 UI 注入，数据刷新改由定时器/手动触发；页面加载立即检查过期缓存
- refactor：登录检测改为严格互斥分支，减少冗余监听器注册

## v1.0.14 (2026-02-26)

- fix：签到状态渲染改为对比 lastCheckinDate 与当天日期，避免跨日后仍显示「已签到」
- feat：新增后台自动定时刷新，按 interval 设定周期自动更新过期缓存
- perf：并发控制从 100ms 轮询改为 semaphore 事件唤醒，刷新全部自动受并发上限约束

## v1.0.13 (2026-02-25)

- feat：删除 GM 菜单中的「清理缓存」「调试：查看缓存」「关于」选项
- feat：悬浮面板新增「清理缓存」、「刷新站点白名单」设置项（从当前页面 DOM 重新扫描站点列表）
- feat：「关于」改为「使用说明」，覆盖所有功能要点，通过 overlay 对话框展示
- refactor：移除 GM_registerMenuCommand，去掉 GM_registerMenuCommand grant

## v1.0.12 (2026-02-25)

- feat：新增「设置并发数」设置项，支持独立配置总并发数和后台并发数上限
- refactor：并发控制从 CONFIG 常量改为运行时读取 SETTINGS_KEY，实时生效

## v1.0.11 (2026-02-25)

- feat：检测黑名单与签到跳过列表改为可配置，新增 BLACKLIST_KEY / CHECKIN_SKIP_KEY 存储
- feat：悬浮面板每行新增「加入/移出站点黑名单」和「跳过/恢复自动签到」按钮
- feat：设置菜单新增「重置站点黑名单」和「重置签到黑名单」选项

## v1.0.10 (2026-02-25)

- fix：删除设置更新间隔时 30 分钟以下的二次确认限制，允许任意 ≥ 5 分钟的值
- fix：设置更新间隔后不再刷新页面（interval 仅作缓存 TTL，运行时实时读取，无需重载）

## v1.0.9 (2026-02-25)

- feat：新增自动签到功能

## v1.0.8 (2026-02-25)

- feat：新增右下角悬浮面板，仅在 LDOH 主站显示，按余额排序展示所有站点（签到、余额、密钥、刷新、定位）
- feat：自动提取并缓存站点名称，悬浮面板优先显示友好名称
  v1.0.7 (2026-02-13)
- feat：新增黑名单机制，屏蔽已知非 New API 站点或者 CF 拦截站点

## v1.0.6 (2026-02-12)

- bug：修复签到状态接口返回余额不正确的问题（统一从/api/user/self接口获取余额）

## v1.0.5 (2026-02-12)

- bug：修复签到状态接口获取余额错误的问题
- 优化：增加并发数到 15 个，后台请求最多占用 10 个并发（之前是 5 个），提升性能和响应速度

## v1.0.4 (2026-02-12)

- 优化： new api id 获取逻辑，使用 user.id 更可靠

## v1.0.3 (2026-02-12)

- 新增：LDOH 站点白名单机制，只识别 LDOH 卡片中的站点（白名单仅在页面加载时更新一次，避免频繁更新和筛选影响）
- 优化：两步验证机制（白名单检查 + New API 特征检测）

## v1.0.2

- 新增：密钥管理功能（创建、删除）
- 优化：请求并发控制和优先级

## v1.0.1

- 初始版本：余额查询、签到状态、模型列表
