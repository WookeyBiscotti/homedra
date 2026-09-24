/** BYOK library API tokens — stored only in localStorage, never in project JSON. */

export type LibraryTokenKey = 'polyPizza' | 'smithsonian' | 'sketchfab'

export type LibraryTokens = Partial<Record<LibraryTokenKey, string>>

const STORAGE_KEY = 'interior-library-tokens'

const listeners = new Set<() => void>()

export function readLibraryTokens(): LibraryTokens {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as LibraryTokens
    return {
      polyPizza: data.polyPizza?.trim() || undefined,
      smithsonian: data.smithsonian?.trim() || undefined,
      sketchfab: data.sketchfab?.trim() || undefined,
    }
  } catch {
    return {}
  }
}

export function writeLibraryTokens(tokens: LibraryTokens): void {
  const next: LibraryTokens = {}
  if (tokens.polyPizza?.trim()) next.polyPizza = tokens.polyPizza.trim()
  if (tokens.smithsonian?.trim()) next.smithsonian = tokens.smithsonian.trim()
  if (tokens.sketchfab?.trim()) next.sketchfab = tokens.sketchfab.trim()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  for (const l of listeners) l()
}

export function getLibraryToken(key: LibraryTokenKey): string | undefined {
  return readLibraryTokens()[key]
}

export function subscribeLibraryTokens(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const TOKEN_META: Record<
  LibraryTokenKey,
  { label: string; helpUrl: string; hint: string }
> = {
  polyPizza: {
    label: 'Poly Pizza',
    helpUrl: 'https://poly.pizza/settings/api',
    hint: 'X-Auth-Token с poly.pizza/settings/api',
  },
  smithsonian: {
    label: 'Smithsonian (api.data.gov)',
    helpUrl: 'https://api.data.gov/signup/',
    hint: 'Бесплатный ключ api.data.gov для Open Access API',
  },
  sketchfab: {
    label: 'Sketchfab',
    helpUrl: 'https://sketchfab.com/settings/password',
    hint: 'API token из настроек Sketchfab (Password & API)',
  },
}
