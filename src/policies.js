// Pure replacement policies: given a match, produce the replacement string.
// No DOM, no I/O.

export const POLICIES = ['alias', 'mask_all', 'keep_last4', 'keep_domain'];

// Default policy per detector type. `alias` preserves readability with stable
// placeholders; masks favour privacy.
export const DEFAULT_POLICIES = {
  email: 'alias',
  phone: 'alias',
  ipv4: 'alias',
  ipv6: 'alias',
  credit_card: 'keep_last4',
  iban: 'keep_last4',
  url_cred: 'mask_all',
  token: 'mask_all',
  custom: 'mask_all',
};

// Apply a policy to one match.
//
//   alias       -> the allocated alias, e.g. 'EMAIL_1'
//   mask_all    -> '***'
//   keep_last4  -> '•••• 4242' — last 4 characters of the value after
//                  removing spaces and dashes
//   keep_domain -> 'j***@example.com' — first character of the local part,
//                  then '***', then '@' + domain. Falls back to '***' when
//                  the value has no '@'.
//
// Throws on an unknown policy name (caller/UI only offers POLICIES).
export function applyPolicy(policy, type, value, alias) {
  switch (policy) {
    case 'alias': {
      if (typeof alias !== 'string' || alias.length === 0) {
        throw new Error("policy 'alias' requires an allocated alias");
      }
      return alias;
    }
    case 'mask_all':
      return '***';
    case 'keep_last4': {
      const cleaned = String(value).replace(/[\s-]/g, '');
      const tail = cleaned.slice(-4);
      return tail ? `•••• ${tail}` : '***';
    }
    case 'keep_domain': {
      const s = String(value);
      const at = s.lastIndexOf('@');
      if (at > 0 && at < s.length - 1) {
        return `${s[0]}***@${s.slice(at + 1)}`;
      }
      return '***';
    }
    default:
      throw new RangeError(`unknown policy: ${policy}`);
  }
}
