/** Resolve a path under Vite `public/` against `import.meta.env.BASE_URL`. */
export function publicUrl(path: string): string {
  if (
    /^https?:\/\//i.test(path) ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path
  }
  const base = import.meta.env.BASE_URL || '/'
  if (path.startsWith(base)) return path
  return `${base}${path.replace(/^\//, '')}`
}
