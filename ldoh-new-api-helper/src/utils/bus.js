/**
 * 简单的事件总线，用于组件间解耦通信
 */
export const EventBus = {
  _listeners: new Map(),

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    // 返回取消订阅函数
    return () => this.off(event, callback);
  },

  off(event, callback) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(callback);
    }
  },

  emit(event, ...args) {
    if (this._listeners.has(event)) {
      for (const callback of this._listeners.get(event)) {
        try {
          callback(...args);
        } catch (e) {
          console.error(`[EventBus] Error in listener for event ${event}:`, e);
        }
      }
    }
  },

  clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  },
};

export const UI_EVENTS = {
  SHOW_DETAILS: "site:show_details",
  GLOBAL_REFRESH: "ui:global_refresh", // 全局刷新信号
  DATA_CHANGED: "data:changed",
};
