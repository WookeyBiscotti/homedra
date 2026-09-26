import { publicUrl } from '../publicUrl'

/** Vite `/proxy/ext` and `/proxy/tex` exist only in `vite` / `vite preview`. */
const USE_VITE_PROXY = import.meta.env.DEV

function isLocalOrSpecial(url: string): boolean {
  return (
    !url ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('/proxy/')
  )
}

function sameOriginPath(url: string): string | null {
  if (url.startsWith('/') || url.startsWith('.')) return publicUrl(url)
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
  return null
}

/**
 * Rewrite cross-origin asset URLs through the Vite same-origin proxy
 * so GLTFLoader / fetch work without CORS errors in local dev.
 * On GitHub Pages (and other static hosts) there is no proxy — use the
 * original URL so we don't 404 on `/proxy/ext`.
 */
export function proxiedAssetUrl(url: string): string {
  if (isLocalOrSpecial(url)) return url
  const local = sameOriginPath(url)
  if (local) return local
  if (!USE_VITE_PROXY) return url
  return `/proxy/ext?url=${encodeURIComponent(url)}`
}

/**
 * Same-origin proxy for user-supplied image URLs (any host, image only).
 * Production / GitHub Pages: original URL (img tags do not need CORS).
 */
export function proxiedTextureUrl(url: string): string {
  if (isLocalOrSpecial(url)) return url
  const local = sameOriginPath(url)
  if (local) return local
  if (!USE_VITE_PROXY) return url
  return `/proxy/tex?url=${encodeURIComponent(url)}`
}
