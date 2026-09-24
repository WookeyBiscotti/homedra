/** Resolve a path under Vite `public/` against `import.meta.env.BASE_URL`. */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}${path.replace(/^\//, '')}`
}
