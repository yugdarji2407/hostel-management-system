// Stable identity helpers. These are defensive data-integrity helpers,
// not CSS/rendering workarounds.
export function dedupeById(items, idField = "id") {
  if (!Array.isArray(items)) return items;
  const seen = new Set();
  return items.filter((item) => {
    const value = item?.[idField];
    if (value == null) return true;
    const key = String(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeByKey(items, keyFn) {
  if (!Array.isArray(items)) return items;
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (key == null) return true;
    const normalized = String(key);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
