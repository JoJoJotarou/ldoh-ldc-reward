/**
 * 基础 UI 组件工厂，用于减少直接操作 DOM 带来的代码冗余
 */

export const UI = {
  /**
   * 创建一个通用元素
   */
  element(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.style) {
      if (typeof options.style === "string") {
        el.style.cssText = options.style;
      } else {
        Object.assign(el.style, options.style);
      }
    }
    if (options.innerHTML) el.innerHTML = options.innerHTML;
    if (options.textContent) el.textContent = options.textContent;
    if (options.title) el.title = options.title;
    if (options.dataset) {
      for (const [key, val] of Object.entries(options.dataset)) {
        el.dataset[key] = val;
      }
    }
    if (options.onClick) el.onclick = options.onClick;
    if (options.onMouseOver) el.onmouseover = options.onMouseOver;
    if (options.onMouseOut) el.onmouseout = options.onMouseOut;

    if (options.children) {
      options.children.forEach((child) => {
        if (child) el.appendChild(child);
      });
    }
    return el;
  },

  /**
   * 创建一个容器 (div)
   */
  div(options = {}) {
    return this.element("div", options);
  },

  /**
   * 创建一个 span
   */
  span(options = {}) {
    return this.element("span", options);
  },

  /**
   * 创建一个按钮
   */
  button(options = {}) {
    const el = this.element("button", options);
    if (options.type) el.type = options.type;
    if (options.disabled) el.disabled = options.disabled;
    return el;
  },

  /**
   * 创建一个输入框
   */
  input(options = {}) {
    const el = this.element("input", options);
    el.type = options.type || "text";
    if (options.placeholder) el.placeholder = options.placeholder;
    if (options.value) el.value = options.value;
    if (options.min) el.min = options.min;
    if (options.step) el.step = options.step;
    if (options.max) el.max = options.max;
    if (options.onFocus) el.onfocus = options.onFocus;
    if (options.onBlur) el.onblur = options.onBlur;
    if (options.onInput) el.oninput = options.onInput;
    if (options.onKeyDown) el.addEventListener("keydown", options.onKeyDown);
    return el;
  },

  /**
   * 创建 SVG 图标
   */
  icon(svgContent, options = {}) {
    const wrapper = this.element("div", options);
    wrapper.innerHTML = svgContent;
    return wrapper.firstElementChild || wrapper;
  },

  /**
   * 预定义的一些常用 SVG 字符串
   */
  ICONS: {
    REFRESH:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>',
    DETAILS:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
    CLOSE:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    CLOSE_LG:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    TRASH:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    PANEL:
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    EYE: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    CHECKIN:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>',
    CHECKIN_OFF:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="13" x2="17" y2="21"/><line x1="17" y1="13" x2="7" y2="21"/></svg>',
    LOCATE:
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  },
};
