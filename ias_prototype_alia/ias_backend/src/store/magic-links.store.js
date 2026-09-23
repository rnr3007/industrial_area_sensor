/**
 * Tracks consumed magic-link token ids (jti) so a link can only ever be used
 * once, even though the JWT itself stays valid (and therefore replayable)
 * until it expires. In-memory is fine here: entries live at most as long as
 * JWT_MAGIC_LINK_TTL, and a backend restart simply invalidates any
 * outstanding unclicked links.
 */
const consumed = new Map(); // jti -> expiry epoch ms

function sweep() {
  const now = Date.now();
  for (const [jti, expiresAt] of consumed) {
    if (expiresAt <= now) consumed.delete(jti);
  }
}

/** Returns true and marks the jti used, or false if it was already consumed. */
export function consumeOnce(jti, expiresAtSeconds) {
  sweep();
  if (consumed.has(jti)) return false;
  consumed.set(jti, expiresAtSeconds * 1000);
  return true;
}
