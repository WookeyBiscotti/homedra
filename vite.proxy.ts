import type { Plugin, ProxyOptions } from 'vite'

/** Hosts allowed through `/proxy/ext?url=…` (GLB / thumbs / API assets). */
const EXT_ALLOW = [
  'raw.githubusercontent.com',
  'media.githubusercontent.com',
  'cdn.jsdelivr.net',
  'api.poly.pizza',
  'static.poly.pizza',
  'cdn.poly.pizza',
  'poly.pizza',
  'www.poly.pizza',
  'api.polyhaven.com',
  'cdn.polyhaven.com',
  'dl.polyhaven.com',
  'dl.polyhaven.org',
  'cdn.polyhaven.org',
  'api.si.edu',
  'ids.si.edu',
  '3d.si.edu',
  'smithsonian-open-access.s3.amazonaws.com',
  'api.sketchfab.com',
  'media.sketchfab.com',
  'static.sketchfab.com',
  'sketchfab-prod-media.s3.amazonaws.com',
]

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h.endsWith('.poly.pizza') || h === 'poly.pizza') return true
  if (h.endsWith('.polyhaven.org') || h === 'polyhaven.org') return true
  if (h.endsWith('.polyhaven.com') || h === 'polyhaven.com') return true
  if (h.endsWith('.si.edu') || h === 'si.edu') return true
  if (h.endsWith('.sketchfab.com') || h === 'sketchfab.com') return true
  // Sketchfab signed archives live on sketchfab-*-media.s3*.amazonaws.com
  if (h.includes('sketchfab') && h.endsWith('.amazonaws.com')) return true
  if (h.endsWith('.r2.dev')) return true
  return EXT_ALLOW.some((a) => h === a || h.endsWith(`.${a}`))
}

function isLfsPointer(buf: Buffer): boolean {
  const head = buf.subarray(0, 64).toString('utf8')
  return head.startsWith('version https://git-lfs.github.com/spec/v1')
}

function toMediaGithubUrl(rawUrl: string): string | null {
  // https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/path
  // → https://media.githubusercontent.com/media/nasa/NASA-3D-Resources/master/path
  try {
    const u = new URL(rawUrl)
    if (u.hostname !== 'raw.githubusercontent.com') return null
    const parts = u.pathname.split('/').filter(Boolean)
    // owner, repo, ref, ...path
    if (parts.length < 4) return null
    const [owner, repo, ref, ...rest] = parts
    return `https://media.githubusercontent.com/media/${owner}/${repo}/${ref}/${rest.join('/')}`
  } catch {
    return null
  }
}

async function fetchAllowed(
  dest: URL,
  headers: Record<string, string>,
): Promise<{ status: number; contentType: string | null; buf: Buffer }> {
  const upstream = await fetch(dest.href, { headers, redirect: 'follow' })
  const buf = Buffer.from(await upstream.arrayBuffer())
  return {
    status: upstream.status,
    contentType: upstream.headers.get('content-type'),
    buf,
  }
}

/**
 * Same-origin proxy so the browser can load NASA / Poly Pizza assets
 * without CORS failures.
 */
export function assetProxyPlugin(): Plugin {
  const attach = (middlewares: {
    use: (fn: (req: any, res: any, next: () => void) => void) => void
  }) => {
    middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/proxy/ext')) {
        next()
        return
      }
      try {
        const incoming = new URL(req.url, 'http://localhost')
        const target = incoming.searchParams.get('url')
        if (!target) {
          res.statusCode = 400
          res.end('missing url')
          return
        }
        let dest: URL
        try {
          dest = new URL(target)
        } catch {
          res.statusCode = 400
          res.end('bad url')
          return
        }
        if (dest.protocol !== 'https:' && dest.protocol !== 'http:') {
          res.statusCode = 400
          res.end('unsupported protocol')
          return
        }
        if (!isAllowedHost(dest.hostname)) {
          res.statusCode = 403
          res.end(`host not allowed: ${dest.hostname}`)
          return
        }

        const headers: Record<string, string> = {
          'User-Agent': 'InteriorCADPlanner/1.0',
          Accept: '*/*',
        }
        const auth = req.headers['authorization']
        const token = req.headers['x-auth-token']
        if (typeof auth === 'string') headers.Authorization = auth
        if (typeof token === 'string') headers['X-Auth-Token'] = token

        let result = await fetchAllowed(dest, headers)

        // Git LFS pointer on raw.githubusercontent.com → retry media CDN
        if (
          result.status === 200 &&
          isLfsPointer(result.buf) &&
          dest.hostname === 'raw.githubusercontent.com'
        ) {
          const media = toMediaGithubUrl(dest.href)
          if (media && isAllowedHost(new URL(media).hostname)) {
            result = await fetchAllowed(new URL(media), headers)
          }
        }

        res.statusCode = result.status
        if (result.contentType) res.setHeader('Content-Type', result.contentType)
        else if (dest.pathname.endsWith('.glb')) {
          res.setHeader('Content-Type', 'model/gltf-binary')
        }
        res.setHeader('Content-Length', String(result.buf.byteLength))
        res.setHeader('Cache-Control', 'public, max-age=3600')
        res.end(result.buf)
      } catch (err) {
        res.statusCode = 502
        res.end(
          err instanceof Error ? `proxy error: ${err.message}` : 'proxy error',
        )
      }
    })
  }

  return {
    name: 'interior-asset-proxy',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}

/** Declarative proxies for Poly Pizza API (forwards path + headers). */
export const apiProxies: Record<string, ProxyOptions> = {
  '/proxy/poly-api': {
    target: 'https://api.poly.pizza',
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(/^\/proxy\/poly-api/, ''),
  },
}
