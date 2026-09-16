/**
 * Decodes a JWT's payload client-side (no signature verification - the
 * server is the only thing that needs to trust this token; the client only
 * needs to read its own `exp` claim to know when to stop trusting it).
 */
export function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Returns the token's expiry as an epoch-ms timestamp, or null if unreadable. */
export function getTokenExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
}
