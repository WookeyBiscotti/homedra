/**
 * Rewrite cross-origin asset URLs through the Vite same-origin proxy
 * so GLTFLoader / fetch work without CORS errors.
 */
export function proxiedAssetUrl(url: string): string {
  if (!url) return url
  if (
    url.startsWith('/') ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('.')
  ) {
    return url
  }
  // Already proxied
  if (url.startsWith('/proxy/')) return url
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
