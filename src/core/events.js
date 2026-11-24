// ============================================================
//  Мини event-bus: развязка систем (звук, розыск, тосты...).
// ============================================================

const listeners = new Map();

export const bus = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => bus.off(name, fn);
  },
  off(name, fn) {
    const set = listeners.get(name);
    if (set) set.delete(fn);
  },
  emit(name, payload) {
    const set = listeners.get(name);
    if (set) for (const fn of set) {
      try { fn(payload); } catch (e) { console.error('[bus]', name, e); }
    }
  }
};
