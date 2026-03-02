/**
 * 详情对话框（密钥 + 模型）
 */
import { CONFIG } from "../config.js";
import { Log } from "../logger.js";
import { escapeHtml } from "../utils/format.js";
import { copy } from "../utils/misc.js";
import { API } from "../api.js";
import { Toast } from "./toast.js";
import { createOverlay } from "./overlay.js";
import { UI } from "./base.js";

/** 关闭详情对话框（带退出动画） */
function _closeDetailDialog() {
  const ov = document.querySelector(".ldh-overlay");
  if (!ov) return;
  const dialog = ov.querySelector(".ldh-dialog");
  if (dialog) {
    dialog.style.animation = `ldoh-zoom-in ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
  }
  ov.style.animation = `ldoh-fade-in-blur ${CONFIG.ANIMATION_FAST_MS}ms ease-in reverse forwards`;
  setTimeout(() => ov.remove(), CONFIG.ANIMATION_FAST_MS);
}

/** 构建对话框头部 */
function _buildDetailHeader(host) {
  return UI.div({
    className: "ldh-header",
    children: [
      UI.div({ className: "ldh-title", textContent: host }),
      UI.div({
        className: "ldh-close",
        innerHTML: UI.ICONS.CLOSE_LG,
        onClick: _closeDetailDialog,
      }),
    ],
  });
}

/** 构建密钥列表区域 */
function _renderKeySection(host, data, keys, modelItems, modelsBadge, modelArray) {
  const container = UI.div({ className: "ldh-sec-wrapper" });
  const keysBadge = UI.span({ className: "ldh-sec-badge", textContent: keys.length });
  const keysGrid = UI.div({ className: "ldh-grid" });

  const refreshKeys = (list) => {
    keysGrid.innerHTML = "";
    if (list.length) {
      list.forEach((k) =>
        keysGrid.appendChild(
          _buildKeyItem(k, host, data, keysGrid, modelItems, modelsBadge, modelArray),
        ),
      );
    } else {
      keysGrid.appendChild(
        UI.div({
          style: "grid-column:1/-1;text-align:center;padding:20px;color:var(--ldoh-text-light);",
          textContent: "暂无可用密钥",
        }),
      );
    }
  };

  const { createForm, createKeyBtn } = _buildCreateKeyForm(host, data, async () => {
    const newKeys = await API.fetchKeys(host, data.token, data.userId, 1);
    refreshKeys(newKeys);
    keysBadge.textContent = newKeys.length;
  });

  container.appendChild(
    UI.div({
      className: "ldh-sec-header",
      children: [
        UI.div({
          className: "ldh-sec-title",
          children: [UI.span({ textContent: "🔑 密钥列表" }), keysBadge],
        }),
        createKeyBtn,
      ],
    }),
  );
  container.appendChild(createForm);
  container.appendChild(keysGrid);
  refreshKeys(keys);

  return container;
}

/** 构建模型列表区域 */
function _renderModelSection(models, modelItems, modelsBadge) {
  const container = UI.div({ className: "ldh-sec-wrapper" });
  container.appendChild(
    UI.div({
      className: "ldh-sec-header",
      children: [
        UI.div({
          className: "ldh-sec-title",
          children: [UI.span({ textContent: "🤖 模型列表" }), modelsBadge],
        }),
      ],
    }),
  );

  const modelsGrid = UI.div({ className: "ldh-grid-models" });
  if (models.length) {
    const fmtPrice = (v) => parseFloat(v.toFixed(6)).toString();
    models.forEach((m) => {
      const modelName = m.model_name || m;
      let priceHtml = "";
      if (typeof m.quota_type === "number") {
        priceHtml =
          m.quota_type === 1
            ? `<div style="font-size:10px;font-weight:600;color:#64748b">$${fmtPrice(m.model_price)} /次</div>`
            : `<div style="font-size:10px;font-weight:600;color:#64748b">输入: $${fmtPrice(m.model_ratio * 2)}/M · 输出: $${fmtPrice(m.model_ratio * (m.completion_ratio || 1) * 2)}/M</div>`;
      }
      const item = UI.div({
        className: "ldh-item",
        dataset: { modelName, modelGroups: JSON.stringify(m.enable_groups || []) },
        innerHTML: `<div style="font-weight:600;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(modelName)}</div>${priceHtml}<div style="font-size:9px;color:var(--ldoh-text-light)">点击复制</div>`,
        onClick: () => {
          copy(modelName);
          Toast.success("已复制模型名");
        },
      });
      modelsGrid.appendChild(item);
      modelItems.push(item);
    });
  } else {
    modelsGrid.appendChild(
      UI.div({
        style: "grid-column:1/-1;text-align:center;padding:20px;color:var(--ldoh-text-light);",
        textContent: "暂无可用模型",
      }),
    );
  }
  container.appendChild(modelsGrid);
  return container;
}

/** 构建创建密钥表单 */
function _buildCreateKeyForm(host, data, onCreated) {
  const createKeyBtn = UI.button({
    style:
      "padding:4px 12px;background:var(--ldoh-primary);color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;",
    textContent: "+ 创建密钥",
    onMouseOver: (e) => (e.target.style.background = "var(--ldoh-primary-hover)"),
    onMouseOut: (e) => (e.target.style.background = "var(--ldoh-primary)"),
  });

  const createForm = UI.div({
    style:
      "display:none;padding:16px;background:#f8fafc;border:1px solid var(--ldoh-border);border-radius:var(--ldoh-radius);margin-bottom:12px;",
  });

  const nameInput = UI.input({
    placeholder: "请输入密钥名称",
    style:
      "width:100%;padding:8px 10px;border:1px solid var(--ldoh-border);border-radius:6px;font-size:13px;outline:none;transition:all 0.2s;box-sizing:border-box;",
    onFocus: (e) => (e.target.style.borderColor = "var(--ldoh-primary)"),
    onBlur: (e) => (e.target.style.borderColor = "var(--ldoh-border)"),
  });

  const groupSelect = document.createElement("select");
  groupSelect.style.cssText =
    "width:100%;padding:8px 10px;border:1px solid var(--ldoh-border);border-radius:6px;font-size:13px;outline:none;cursor:pointer;background:white;box-sizing:border-box;";

  const submitBtn = UI.button({
    textContent: "创建",
    style:
      "padding:8px 16px;background:var(--ldoh-primary);color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;",
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) {
        Toast.warning("请输入密钥名称");
        nameInput.focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "创建中...";
      submitBtn.style.opacity = "0.6";
      try {
        const result = await API.createToken(
          host,
          data.token,
          data.userId,
          name,
          groupSelect.value,
        );
        if (result.success) {
          Toast.success("密钥创建成功");
          createForm.style.display = "none";
          createKeyBtn.textContent = "+ 创建密钥";
          nameInput.value = "";
          onCreated?.();
        } else {
          Toast.error(result.message || "密钥创建失败");
        }
      } catch (e) {
        Log.error("创建密钥失败", e);
        Toast.error("创建密钥失败");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "创建";
        submitBtn.style.opacity = "1";
      }
    },
  });

  const cancelBtn = UI.button({
    textContent: "取消",
    style:
      "padding:8px 16px;background:#e2e8f0;color:var(--ldoh-text);border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;",
    onClick: () => {
      createForm.style.display = "none";
      createKeyBtn.textContent = "+ 创建密钥";
      nameInput.value = "";
    },
  });

  createForm.appendChild(
    UI.div({
      style: "display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;",
      children: [
        UI.div({
          children: [
            UI.div({
              style: "font-size:12px;font-weight:600;margin-bottom:6px;",
              textContent: "密钥名称",
            }),
            nameInput,
          ],
        }),
        UI.div({
          children: [
            UI.div({
              style: "font-size:12px;font-weight:600;margin-bottom:6px;",
              textContent: "选择分组",
            }),
            groupSelect,
          ],
        }),
        UI.div({ style: "display:flex;gap:8px;", children: [cancelBtn, submitBtn] }),
      ],
    }),
  );

  createKeyBtn.onclick = async () => {
    if (createForm.style.display === "none") {
      createKeyBtn.disabled = true;
      createKeyBtn.textContent = "加载中...";
      try {
        const groups = await API.fetchGroups(host, data.token, data.userId);
        groupSelect.innerHTML = "";
        Object.entries(groups).forEach(([gName, gInfo]) => {
          const opt = document.createElement("option");
          opt.value = gName;
          opt.textContent = `${gName} - ${gInfo.desc} (倍率: ${gInfo.ratio})`;
          groupSelect.appendChild(opt);
        });
        createForm.style.display = "block";
        createKeyBtn.textContent = "收起表单";
        setTimeout(() => nameInput.focus(), 100);
      } catch (e) {
        Log.error("获取分组列表失败", e);
        Toast.error("获取分组列表失败");
      } finally {
        createKeyBtn.disabled = false;
      }
    } else {
      createForm.style.display = "none";
      createKeyBtn.textContent = "+ 创建密钥";
      nameInput.value = "";
    }
  };

  return { createForm, createKeyBtn };
}

/** 构建单个密钥条目 */
function _buildKeyItem(k, host, data, keysGrid, modelItems, modelsBadge, modelArray) {
  const item = UI.div({
    className: "ldh-item ldh-key-item",
    dataset: { group: k.group || "", key: `sk-${k.key}` },
    style: "position: relative;",
    innerHTML: `
      <div style="font-weight:700;color:var(--ldoh-text)">${escapeHtml(k.name || "未命名")}</div>
      ${k.group ? `<div style="font-size:10px;color:var(--ldoh-primary);font-weight:600">Group: ${escapeHtml(k.group)}</div>` : ""}
      <div style="font-size:10px;color:var(--ldoh-text-light);font-family:monospace;overflow:hidden;text-overflow:ellipsis">sk-${k.key.substring(0, 16)}...</div>
    `,
  });

  const deleteBtn = UI.div({
    className: "ldh-delete-btn",
    innerHTML: UI.ICONS.TRASH,
    style:
      "position:absolute;top:8px;right:8px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;opacity:0;transition:all 0.2s;color:var(--ldoh-danger);",
    title: "删除密钥",
    onMouseOver: (e) =>
      (e.target.closest(".ldh-delete-btn").style.background = "rgba(239,68,68,0.1)"),
    onMouseOut: (e) => (e.target.closest(".ldh-delete-btn").style.background = "transparent"),
    onClick: (e) => {
      e.stopPropagation();
      if (!window.confirm(`删除密钥 "${k.name || "未命名"}"？`)) return;
      API.deleteToken(host, data.token, data.userId, k.id).then((res) => {
        if (res.success) {
          Toast.success("密钥删除成功");
          item.remove();
        } else Toast.error(res.message || "密钥删除失败");
      });
    },
  });

  item.appendChild(deleteBtn);
  item.onmouseenter = () => (deleteBtn.style.opacity = "1");
  item.onmouseleave = () => (deleteBtn.style.opacity = "0");

  item.onclick = (e) => {
    if (e.target.closest(".ldh-delete-btn")) return;
    const isAlreadyActive = item.classList.contains("active");
    keysGrid.querySelectorAll(".ldh-item").forEach((el) => el.classList.remove("active"));

    let selectedGroup = null;
    if (!isAlreadyActive) {
      item.classList.add("active");
      selectedGroup = item.dataset.group;
      copy(item.dataset.key);
      Toast.success(`已选中分组 ${selectedGroup || "默认"} 并复制密钥`);
    } else {
      copy(item.dataset.key);
      Toast.success("已复制密钥");
    }

    let visibleCount = 0;
    modelItems.forEach((mi) => {
      let isVisible = true;
      if (selectedGroup) {
        try {
          isVisible = JSON.parse(mi.dataset.modelGroups || "[]").includes(selectedGroup);
        } catch (_err) {
          isVisible = mi.dataset.modelName.toLowerCase().includes(selectedGroup.toLowerCase());
        }
      }
      mi.style.display = isVisible ? "" : "none";
      if (isVisible) visibleCount++;
    });
    modelsBadge.textContent = selectedGroup
      ? `${visibleCount}/${modelArray.length}`
      : modelArray.length;
  };

  return item;
}

/**
 * 显示详情对话框
 */
export async function showDetailsDialog(host, data) {
  try {
    const loadingOverlay = createOverlay(
      '<div class="ldh-header"><div class="ldh-title">正在获取密钥和模型...</div></div>' +
        '<div class="ldh-content" style="align-items:center;justify-content:center;min-height:200px">' +
        '<div class="ldoh-refresh-btn loading">' +
        UI.ICONS.REFRESH +
        "</div></div>",
    );

    const details = await API.fetchDetails(host, data.token, data.userId);
    loadingOverlay.remove();

    const { models, keys } = details;
    const modelArray =
      models?.data && Array.isArray(models.data)
        ? models.data
        : Array.isArray(models)
          ? models
          : [];

    const dialog = UI.div({ className: "ldh-dialog", children: [_buildDetailHeader(host)] });
    const content = UI.div({ className: "ldh-content" });

    const modelItems = [];
    const modelsBadge = UI.span({ className: "ldh-sec-badge", textContent: modelArray.length });

    // 分别渲染密钥和模型区域
    content.appendChild(
      _renderKeySection(host, data, keys || [], modelItems, modelsBadge, modelArray),
    );
    content.appendChild(_renderModelSection(modelArray, modelItems, modelsBadge));

    dialog.appendChild(content);
    const overlay = createOverlay("");
    overlay.querySelector(".ldh-dialog").replaceWith(dialog);
  } catch (e) {
    Log.error(`[详情失败] ${host}`, e);
    Toast.error("获取详情失败");
  }
}
