// Basit bellek içi sayaç: pencere içinde `max` denemeden fazlasına izin vermez
export function limiter(max, windowMs) {
  const hits = new Map();
  const live = (key, now) => (hits.get(key) || []).filter((t) => now - t < windowMs);
  return {
    /** Sayaca bir deneme yazar; limit dolduysa false döner */
    take(key, now = Date.now()) {
      const list = live(key, now);
      if (list.length >= max) { hits.set(key, list); return false; }
      list.push(now); hits.set(key, list);
      if (hits.size > 5000) for (const [k] of hits) if (!live(k, now).length) hits.delete(k);
      return true;
    },
    /** Sayaca yazmadan: limit doldu mu? */
    full: (key, now = Date.now()) => live(key, now).length >= max,
    reset: (key) => hits.delete(key),
  };
}
