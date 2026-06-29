// Edge-compatible session token verification using Web Crypto API (no Node.js crypto).
// Used by the proxy (middleware) which runs in Edge Runtime.
// The login route (Node.js runtime) uses auth.ts which uses Node's crypto.createHmac.
// Both are SHA-256 HMAC over the same secret + payload, so tokens are cross-compatible.

export async function verifySessionTokenEdge(token: string, secret: string): Promise<boolean> {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false

  const payload = token.slice(0, dot)
  const hexSig = token.slice(dot + 1)

  const ts = parseInt(payload, 10)
  if (isNaN(ts) || Date.now() - ts > 24 * 60 * 60 * 1000) return false

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const sigBytes = new Uint8Array(
      (hexSig.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
    )

    return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))
  } catch {
    return false
  }
}
