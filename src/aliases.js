// Pure stable alias allocator.
//
// Contract:
//   * the exact same source value always maps to the same alias
//   * aliases are allocated in first-seen order (per type: EMAIL_1, EMAIL_2, ...)
//   * allocation is deterministic, so re-running on the same input yields
//     identical aliases
//
// No DOM, no I/O.

export const TYPE_LABELS = {
  email: 'EMAIL',
  phone: 'PHONE',
  ipv4: 'IPV4',
  ipv6: 'IPV6',
  credit_card: 'CARD',
  iban: 'IBAN',
  url_cred: 'URL',
  token: 'TOKEN',
  custom: 'CUSTOM',
};

export function labelForType(type) {
  return TYPE_LABELS[type] ?? String(type).toUpperCase();
}

// Returns an allocator object:
//   aliasFor(type, value) -> 'EMAIL_1' (stable per value)
//   entries()             -> [[value, alias], ...] in allocation order
//   size                  -> number of distinct values allocated
export function createAliasAllocator() {
  const byValue = new Map();
  const counters = new Map();
  return {
    aliasFor(type, value) {
      const existing = byValue.get(value);
      if (existing !== undefined) return existing;
      const label = labelForType(type);
      const next = (counters.get(label) ?? 0) + 1;
      counters.set(label, next);
      const alias = `${label}_${next}`;
      byValue.set(value, alias);
      return alias;
    },
    entries() {
      return [...byValue.entries()];
    },
    get size() {
      return byValue.size;
    },
  };
}
