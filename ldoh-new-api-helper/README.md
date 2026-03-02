# LDOH New API Helper

一款为 LDOH 门户及相关公益站设计的增强型 Tampermonkey 脚本。

## 🌟 核心功能

- **门户深度集成**：在 LDOH 门户卡片上直接注入额度与签到状态，支持即时刷新。
- **自动化同步**：通过拦截请求（Hooks）与后台刷新，保持各站余额始终为最新。
- **一键/自动签到**：支持对符合条件的站点进行批量自动签到，并在面板中实时展示进度。
- **悬浮总览面板**：
  - **站点总览**：按余额排序展示所有已识别站点。
  - **搜索与过滤**：快速查找站点，或按签到状态（已签/未签/不支持）进行筛选。
  - **批量操作**：一键刷新全部数据或触发自动签到。
- **详情弹窗 (Details Dialog)**：
  - **密钥管理**：直接在门户创建或删除站点密钥，支持一键复制。
  - **模型查询**：查看站点支持的所有模型及其价格/倍率信息。
- **跨标签同步**：利用 GM 存储监听机制，实现多个浏览器标签页之间的数据秒级同步。

## 🏗 架构设计：Service-View-EventBus

本项目采用现代化的前端解耦模式，确保代码的高可维护性与扩展性：

- **Service (业务逻辑层)**：封装所有 API 调用、存储写入及复杂计算。
- **View (视图渲染层)**：高度自治的 UI 组件（Card, Panel, Dialog），通过订阅事件流驱动内容更新。
- **EventBus (事件中心)**：组件间通信的唯一渠道，彻底消除 Props Drilling 和组件间的物理耦合。
- **Hooks (被动监控层)**：拦截 XHR/fetch 请求，静默捕获用户身份与数据变更。

## 🛠 开发与构建

### 1. 环境准备

```bash
cd ldoh-new-api-helper
npm install
```

### 2. 开发命令

- **执行构建**: `npm run build`
  - _流水线逻辑：Prettier 格式化 -> ESLint 静态检查 -> Esbuild 打包。_
- **静态检查**: `npm run lint` (检查未定义变量、语法错误等)。
- **实时开发**: `npm run watch` (保存即编译，建议配合 `file:///` 协议进行本地调试)。

#### 实时开发

1. 浏览器扩展管理中为 Tampermonkey 勾选 `允许访问文件 URL`。
2. 打开 Tampermonkey 管理界面，点击 `添加新脚本`，粘贴如下内容（将 `YOUR/PATH` 替换为实际项目路径）：

   ```
   // ==UserScript==
   // @name         LDOH New API Helper (Debug Local)
   // @namespace    jojojotarou.ldoh.newapi.helper
   // @version      0.0.1
   // @description  LDOH New API 助手（余额查询、自动签到、密钥管理、模型查询）
   // @author       @JoJoJotarou
   // @match        https://ldoh.105117.xyz/*
   // @include      *
   // @grant        GM_setValue
   // @grant        GM_getValue
   // @grant        GM_xmlhttpRequest
   // @grant        GM_setClipboard
   // @grant        GM_addValueChangeListener
   // @grant        GM_removeValueChangeListener
   // @grant        unsafeWindow
   // @connect      *
   // @run-at       document-idle
   // @license      MIT
   // @require      file:///YOUR/PATH/ldoh-ldc-reward/ldoh-new-api-helper/dist/ldoh-new-api-helper.user.js
   // ==/UserScript==
   ```

## 📁 目录结构

```text
src/
├── services/   # 核心业务 (SiteService)
├── ui/         # UI 组件 (Card, Panel, Dialog, Toast, Base)
├── utils/      # 基础设施 (EventBus, Storage, Date, Format)
├── api.js      # API 通信层 (带并发控制信号量)
├── hooks.js    # 流量拦截钩子
├── config.js   # 全局常量与 DOM 选择器配置
└── main.js     # 入口引导程序
```

## 📜 贡献指南

任何代码修改请务必遵守 [AGENTS.md](./AGENTS.md) 中定义的工程规范。
