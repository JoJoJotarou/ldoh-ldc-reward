/**
 * 全局样式定义
 */
export const STYLES = `
  :root {
    --ldoh-primary: #6366f1;
    --ldoh-primary-hover: #4f46e5;
    --ldoh-success: #10b981;
    --ldoh-warning: #f59e0b;
    --ldoh-danger: #ef4444;
    --ldoh-text: #1e293b;
    --ldoh-text-light: #64748b;
    --ldoh-bg: #ffffff;
    --ldoh-card-bg: rgba(255, 255, 255, 0.85);
    --ldoh-border: #e2e8f0;
    --ldoh-radius: 12px;
    --ldoh-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04);
  }

  .ldoh-helper-container {
    display: flex; align-items: center; gap: 4px; z-index: 10;
    pointer-events: auto; animation: ldoh-fade-in 0.3s ease-out;
  }
  @keyframes ldoh-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

  .ldoh-info-bar {
    display: flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 600; color: inherit;
    white-space: nowrap;
  }

  .status-ok { background: var(--ldoh-success); }
  .status-none { background: #9ca3af; }

  .ldoh-btn {
    width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
    background: transparent; border-radius: 4px; border: none;
    cursor: pointer; color: inherit; transition: all 0.2s; flex-shrink: 0;
  }
  .ldoh-btn:hover { background: rgba(99, 102, 241, 0.1); color: var(--ldoh-primary); opacity: 1; transform: scale(1.1); }
  .ldoh-btn:active { transform: scale(0.95); }

  .ldoh-refresh-btn.loading svg { animation: ldoh-spin 0.8s linear infinite; }
  @keyframes ldoh-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  /* Dialog */
  .ldh-overlay {
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4);
    z-index: 900; display: flex; justify-content: center; align-items: center;
    backdrop-filter: blur(6px); animation: ldoh-fade-in-blur 0.3s ease-out;
  }
  @keyframes ldoh-fade-in-blur { from { opacity: 0; backdrop-filter: blur(0); } to { opacity: 1; backdrop-filter: blur(6px); } }

  .ldh-dialog {
    background: #fff; width: min(720px, 94vw); max-height: 85vh;
    border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex; flex-direction: column; overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.2); font-size: 13px;
    transform-origin: center; animation: ldoh-zoom-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes ldoh-zoom-in { from { transform: scale(0.9) translateY(20px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }

  .ldh-header {
    padding: 18px 24px; border-bottom: 1px solid var(--ldoh-border);
    display: flex; justify-content: space-between; align-items: center;
    background: linear-gradient(to right, #f8fafc, #ffffff);
  }
  .ldh-title { font-size: 16px; font-weight: 700; color: var(--ldoh-text); }
  .ldh-close {
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; color: var(--ldoh-text-light); cursor: pointer; transition: all 0.2s;
  }
  .ldh-close:hover { background: #f1f5f9; color: var(--ldoh-danger); transform: rotate(90deg); }

  .ldh-content { padding: 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 24px; scrollbar-width: thin; }
  .ldh-sec-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .ldh-sec-title { font-size: 14px; font-weight: 700; color: var(--ldoh-text); display: flex; align-items: center; gap: 6px; }
  .ldh-sec-badge { font-size: 11px; padding: 2px 8px; background: #f1f5f9; border-radius: 20px; color: var(--ldoh-text-light); }

  .ldh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .ldh-grid-models { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .ldh-item {
    padding: 12px; border: 1px solid var(--ldoh-border); border-radius: var(--ldoh-radius);
    font-size: 13px; color: var(--ldoh-text); background: #fff; cursor: pointer;
    position: relative; transition: all 0.2s ease;
    display: flex; flex-direction: column; gap: 4px;
  }
  .ldh-item:hover { border-color: var(--ldoh-primary); background: #f5f3ff; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1); }
  .ldh-item:active { transform: translateY(0); }

  .ldh-item.active { border-color: var(--ldoh-primary); background: #f5f3ff; box-shadow: inset 0 0 0 1px var(--ldoh-primary); }

  .ldh-quota { color: var(--ldoh-warning); font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

  /* Toast */
  .ldoh-toast-container { position: fixed; top: 24px; right: 24px; z-index: 950; display: flex; flex-direction: column; gap: 12px; pointer-events: none; }
  .ldoh-toast {
    min-width: 300px; max-width: 450px; padding: 14px 18px; background: #fff; border-radius: 14px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 600;
    pointer-events: auto; animation: ldoh-slide-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border-left: 5px solid var(--ldoh-primary);
  }
  @keyframes ldoh-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  .ldoh-toast.success { border-left-color: var(--ldoh-success); }
  .ldoh-toast.error { border-left-color: var(--ldoh-danger); }
  .ldoh-toast.warning { border-left-color: var(--ldoh-warning); }

  .ldoh-toast-icon { width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .ldoh-toast.success .ldoh-toast-icon { background: #ecfdf5; color: var(--ldoh-success); }
  .ldoh-toast.error .ldoh-toast-icon { background: #fef2f2; color: var(--ldoh-danger); }
  .ldoh-toast.warning .ldoh-toast-icon { background: #fffbeb; color: var(--ldoh-warning); }
  .ldoh-toast.info .ldoh-toast-icon { background: #f0f9ff; color: var(--ldoh-primary); }

  .ldoh-toast-message { flex: 1; color: var(--ldoh-text); line-height: 1.5; }
  .ldoh-toast-close { width: 24px; height: 24px; flex-shrink: 0; cursor: pointer; color: var(--ldoh-text-light); display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.2s; }
  .ldoh-toast-close:hover { background: #f1f5f9; color: var(--ldoh-text); }

  /* ---- 悬浮面板 FAB ---- */
  .ldoh-fab {
    position: fixed; right: 20px; bottom: 20px; width: 44px; height: 44px;
    border-radius: 50%; background: var(--ldoh-primary); color: white; border: none;
    cursor: pointer; z-index: 800; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.45);
    transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .ldoh-fab:hover { background: var(--ldoh-primary-hover); transform: scale(1.08); }
  .ldoh-fab-badge {
    position: absolute; top: -4px; right: -4px; background: var(--ldoh-danger); color: white;
    border-radius: 99px; font-size: 9px; font-weight: 700; min-width: 16px; height: 16px;
    display: flex; align-items: center; justify-content: center; padding: 0 3px; border: 2px solid white;
  }
  .ldoh-floating-panel {
    position: fixed; right: 20px; bottom: 76px; width: 500px; max-height: 62vh;
    background: #fff; border-radius: 16px; z-index: 799; flex-direction: column; overflow: hidden;
    box-shadow: 0 20px 40px -8px rgba(0,0,0,0.18), 0 4px 12px -2px rgba(0,0,0,0.08);
    border: 1px solid var(--ldoh-border); transform-origin: bottom right;
  }
  @keyframes ldoh-panel-in {
    from { opacity: 0; transform: scale(0.85) translateY(16px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .ldoh-panel-in { animation: ldoh-panel-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .ldoh-panel-hd {
    padding: 10px 14px; border-bottom: 1px solid var(--ldoh-border);
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    background: linear-gradient(to right, #f8fafc, #fff);
  }
  .ldoh-panel-hd-title {
    flex: 1; font-size: 13px; font-weight: 700; color: var(--ldoh-text);
    display: flex; align-items: center; gap: 6px;
  }
  .ldoh-panel-hd-total { font-size: 11px; color: var(--ldoh-text-light); }
  .ldoh-panel-search {
    padding: 7px 12px 6px; border-bottom: 1px solid var(--ldoh-border); flex-shrink: 0; background: #fff;
  }
  .ldoh-panel-search-wrap { position: relative; }
  .ldoh-panel-search-icon {
    position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
    opacity: 0.35; pointer-events: none;
  }
  .ldoh-panel-search-input {
    width: 100%; box-sizing: border-box; padding: 5px 8px 5px 28px;
    border: 1px solid var(--ldoh-border); border-radius: 6px; font-size: 12px;
    outline: none; background: #f8fafc; transition: border-color 0.2s, background 0.2s;
  }
  .ldoh-panel-search-input:focus { border-color: var(--ldoh-primary); background: #fff; }
  .ldoh-filter-bar { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
  .ldoh-filter-chip {
    font-size: 10px; padding: 2px 8px; border-radius: 10px; cursor: pointer;
    border: 1px solid var(--ldoh-border); background: #f8fafc; color: var(--ldoh-text-light);
    user-select: none; transition: all 0.15s; white-space: nowrap;
  }
  .ldoh-filter-chip:hover { border-color: #cbd5e1; color: var(--ldoh-text); }
  .ldoh-filter-chip.active { background: var(--ldoh-primary); color: #fff; border-color: var(--ldoh-primary); }
  .ldoh-panel-body { overflow-y: auto; flex: 1; scrollbar-width: thin; min-height: 200px; }
  .ldoh-panel-row {
    display: grid; grid-template-columns: 1fr 54px 64px 22px 22px 22px 22px 22px 22px;
    align-items: center; gap: 6px; padding: 7px 12px;
    border-bottom: 1px solid #f1f5f9; transition: background 0.15s; font-size: 12px;
  }
  .ldoh-panel-row:hover { background: #f8fafc; }
  .ldoh-panel-row:last-child { border-bottom: none; }
  .ldoh-panel-name {
    font-weight: 600; color: var(--ldoh-text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: flex; flex-direction: column; gap: 1px; min-width: 0;
  }
  .ldoh-panel-name-main {
    font-weight: 600; color: var(--ldoh-text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ldoh-panel-name-host {
    font-size: 10px; font-weight: 400; color: var(--ldoh-text-light);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ldoh-panel-checkin {
    font-size: 10px; padding: 2px 5px; border-radius: 8px; font-weight: 600; text-align: center;
  }
  .ldoh-panel-checkin.ok { background: #ecfdf5; color: #059669; }
  .ldoh-panel-checkin.no { background: #fffbeb; color: #d97706; }
  .ldoh-panel-checkin.na { background: #f1f5f9; color: var(--ldoh-text-light); }
  .ldoh-panel-balance {
    font-weight: 700; color: #d97706; font-family: ui-monospace, monospace;
    font-size: 12px; text-align: right; white-space: nowrap;
  }
  .ldoh-panel-empty { padding: 32px; text-align: center; color: var(--ldoh-text-light); font-size: 13px; }

  /* 删除确认气泡 */
  .ldoh-confirm-pop {
    position: fixed; z-index: 1000;
    background: #fff; border: 1px solid var(--ldoh-border); border-radius: 10px;
    box-shadow: 0 6px 20px -4px rgba(0,0,0,0.15);
    padding: 8px 10px; display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 600; color: var(--ldoh-text); white-space: nowrap;
    animation: ldoh-fade-in 0.15s ease-out;
  }
  .ldoh-confirm-pop::after {
    content: ""; position: absolute; bottom: -5px; right: 10px;
    width: 8px; height: 8px; background: #fff;
    border-right: 1px solid var(--ldoh-border); border-bottom: 1px solid var(--ldoh-border);
    transform: rotate(45deg);
  }
  .ldoh-pop-btn {
    padding: 3px 10px; border-radius: 6px; border: none; font-size: 11px;
    font-weight: 600; cursor: pointer; transition: all 0.15s;
  }
  .ldoh-pop-cancel { background: #f1f5f9; color: var(--ldoh-text); }
  .ldoh-pop-cancel:hover { background: #e2e8f0; }
  .ldoh-pop-confirm { background: var(--ldoh-danger); color: #fff; }
  .ldoh-pop-confirm:hover { background: #dc2626; }

  /* 设置菜单 */
  .ldoh-settings-pop {
    position: fixed; z-index: 1000;
    background: #fff; border: 1px solid var(--ldoh-border); border-radius: 10px;
    box-shadow: 0 6px 20px -4px rgba(0,0,0,0.15);
    padding: 6px; width: 140px;
    animation: ldoh-fade-in 0.15s ease-out;
  }
  .ldoh-settings-item {
    width: 100%; border: none; background: transparent;
    padding: 8px 10px; border-radius: 8px; cursor: pointer; white-space: nowrap;
    font-size: 12px; font-weight: 600; color: var(--ldoh-text);
    text-align: left; transition: background 0.15s;
  }
  .ldoh-settings-item:hover { background: #f8fafc; }

  .ldoh-interval-pop {
    position: fixed; z-index: 1000;
    background: #fff; border: 1px solid var(--ldoh-border); border-radius: 10px;
    box-shadow: 0 6px 20px -4px rgba(0,0,0,0.15);
    padding: 10px; width: 220px;
    animation: ldoh-fade-in 0.15s ease-out;
  }
  .ldoh-interval-title {
    font-size: 12px; font-weight: 700; color: var(--ldoh-text);
    margin-bottom: 8px;
  }
  .ldoh-interval-hint {
    font-size: 11px; color: var(--ldoh-text-light);
    margin-top: 6px;
  }
  .ldoh-interval-input {
    width: 100%;
    border: 1px solid var(--ldoh-border);
    border-radius: 8px;
    padding: 7px 9px;
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .ldoh-interval-input:focus {
    border-color: var(--ldoh-primary);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  }
  .ldoh-interval-actions {
    margin-top: 10px; display: flex; justify-content: flex-end; gap: 8px;
  }
`;
