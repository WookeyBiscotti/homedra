/** BYOK library API tokens — stored only in localStorage, never in project JSON. */

export const LIBRARY_TOKEN_KEYS = [
  'polyPizza',
  'smithsonian',
  'sketchfab',
  'pixabay',
  'pexels',
] as const

export type LibraryTokenKey = (typeof LIBRARY_TOKEN_KEYS)[number]

export type LibraryTokens = Partial<Record<LibraryTokenKey, string>>

const STORAGE_KEY = 'interior-library-tokens'

const listeners = new Set<() => void>()

function pickTokens(data: LibraryTokens): LibraryTokens {
  const next: LibraryTokens = {}
  for (const key of LIBRARY_TOKEN_KEYS) {
    const value = data[key]?.trim()
    if (value) next[key] = value
  }
  return next
}

export function readLibraryTokens(): LibraryTokens {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return pickTokens(JSON.parse(raw) as LibraryTokens)
  } catch {
    return {}
  }
}

export function writeLibraryTokens(tokens: LibraryTokens): void {
  const next = pickTokens(tokens)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  for (const l of listeners) l()
}

export function getLibraryToken(key: LibraryTokenKey): string | undefined {
  return readLibraryTokens()[key]
}

export function subscribeLibraryTokens(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
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
  pixabay: {
    label: 'Pixabay',
    helpUrl: 'https://pixabay.com/api/docs/',
    hint: 'Бесплатный ключ с pixabay.com/api/docs',
  },
  pexels: {
    label: 'Pexels',
    helpUrl: 'https://www.pexels.com/api/',
    hint: 'Бесплатный API key с pexels.com/api',
  },
}
