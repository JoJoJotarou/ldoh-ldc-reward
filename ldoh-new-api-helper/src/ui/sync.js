import { normalizeHost } from "../utils/format.js";
import { EventBus, UI_EVENTS } from "../utils/bus.js";

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toComparable(data) {
  if (!data || typeof data !== "object") return null;
  return {
    userId: data.userId ?? null,
    quota: data.quota ?? null,
    checkedInToday: data.checkedInToday ?? null,
    lastCheckinDate: data.lastCheckinDate ?? null,
    checkinSupported: data.checkinSupported ?? null,
    siteName: data.siteName ?? null,
  };
}

function isRenderable(data) {
  return !!(data && (data.userId || data.quota != null));
}

export function computeStorageDiff(oldValue, newValue) {
  const oldData = toObject(oldValue);
  const nextData = toObject(newValue);

  const allHosts = new Set([...Object.keys(oldData), ...Object.keys(nextData)]);
  const deltas = [];

  allHosts.forEach((rawHost) => {
    const host = normalizeHost(rawHost);
    if (!host) return;

    const prev = oldData[rawHost] || null;
    const next = nextData[rawHost] || null;
    const prevComparable = toComparable(prev);
    const nextComparable = toComparable(next);
    const changed = JSON.stringify(prevComparable) !== JSON.stringify(nextComparable);
    if (!changed) return;

    deltas.push({
      host,
      prev,
      next,
      changed,
      added: !prev && !!next,
      removed: !!prev && !next,
      renderable: isRenderable(next),
    });
  });

  return deltas;
}

export function attachStorageSync({ storageKey, remoteOnly = true } = {}) {
  if (!storageKey) throw new Error("attachStorageSync: storageKey is required");

  return GM_addValueChangeListener(storageKey, (_name, oldValue, newValue, remote) => {
    if (remoteOnly && !remote) return;
    const deltas = computeStorageDiff(oldValue, newValue);
    if (!deltas.length) return;

    deltas.forEach((delta) => {
      EventBus.emit(UI_EVENTS.DATA_CHANGED, delta);
    });
    EventBus.emit(UI_EVENTS.PANEL_REFRESH);
  });
}
