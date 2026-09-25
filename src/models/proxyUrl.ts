import { publicUrl } from '../publicUrl'

/**
 * Rewrite cross-origin asset URLs through the Vite same-origin proxy
 * so GLTFLoader / fetch work without CORS errors.
 */
export function proxiedAssetUrl(url: string): string {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  // Dev-only Vite proxy — leave path as-is (no public/ prefix).
  if (url.startsWith('/proxy/')) return url
  if (url.startsWith('/') || url.startsWith('.')) return publicUrl(url)
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    if (u.origin === (typeof window !== 'undefined' ? window.location.origin : '')) {
      return u.pathname + u.search
    }
  } catch {
    return url
  }
  return `/proxy/ext?url=${encodeURIComponent(url)}`
}

/**
 * Same-origin proxy for user-supplied image URLs (any host, image only).
 * Falls back to the original URL if the proxy is unavailable.
 */
export function proxiedTextureUrl(url: string): string {
  if (!url) return url
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (url.startsWith('/proxy/')) return url
  try {
    const u = new URL(
      url,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    )
    if (
      u.origin ===
      (typeof window !== 'undefined' ? window.location.origin : '')
    ) {
      return u.pathname + u.search
    }
  } catch {
    return url
  }
  return `/proxy/tex?url=${encodeURIComponent(url)}`
}
