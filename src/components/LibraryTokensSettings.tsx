import { useEffect, useState } from 'react'
import {
  readLibraryTokens,
  TOKEN_META,
  writeLibraryTokens,
  type LibraryTokenKey,
  type LibraryTokens,
} from '../models/tokens'
import { useBuildingStore } from '../store/buildingStore'

const KEYS: LibraryTokenKey[] = ['polyPizza', 'smithsonian', 'sketchfab']

export function LibraryTokensSettings() {
  const open = useBuildingStore((s) => s.libraryTokensOpen)
  const setOpen = useBuildingStore((s) => s.setLibraryTokensOpen)
  const [draft, setDraft] = useState<LibraryTokens>({})
  const [saved, setSaved] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(readLibraryTokens())
      setSaved(false)
      setTestMsg(null)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="tex-modal-backdrop"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="tex-modal tokens-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="API ключи библиотек"
      >
        <header className="tex-modal-header">
          <h3>API ключи библиотек</h3>
          <button type="button" className="ghost" onClick={() => setOpen(false)}>
            Закрыть
          </button>
        </header>
        <p className="muted">
          Ключи хранятся только в localStorage этого браузера и не попадают в
          экспорт проекта.
        </p>
        {KEYS.map((key) => {
          const meta = TOKEN_META[key]
          return (
            <label key={key} className="token-field">
              <span className="token-label">
                {meta.label}{' '}
                <a href={meta.helpUrl} target="_blank" rel="noreferrer">
                  получить
                </a>
              </span>
              <input
                type="password"
                autoComplete="off"
                value={draft[key] ?? ''}
                placeholder={meta.hint}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
              />
            </label>
          )
        })}
        <div className="token-actions">
          <button
            type="button"
            onClick={() => {
              writeLibraryTokens(draft)
              setSaved(true)
              setTestMsg(null)
            }}
          >
            Сохранить
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              writeLibraryTokens({})
              setDraft({})
              setSaved(true)
              setTestMsg('Ключи очищены')
            }}
          >
            Очистить все
          </button>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              const tokens = { ...draft }
              writeLibraryTokens(tokens)
              const lines: string[] = []
              if (tokens.polyPizza) {
                try {
                  const res = await fetch(
                    'https://api.poly.pizza/v1/search/chair?limit=1',
                    { headers: { 'X-Auth-Token': tokens.polyPizza } },
                  )
                  lines.push(
                    res.ok
                      ? 'Poly Pizza: OK'
                      : `Poly Pizza: ${res.status}`,
                  )
                } catch {
                  lines.push('Poly Pizza: сеть / CORS')
                }
              }
              if (tokens.smithsonian) {
                try {
                  const q = new URLSearchParams({
                    q: 'glb',
                    rows: '1',
                    api_key: tokens.smithsonian,
                  })
                  const res = await fetch(
                    `/proxy/ext?url=${encodeURIComponent(
                      `https://api.si.edu/openaccess/api/v1.0/search?${q}`,
                    )}`,
                  )
                  lines.push(
                    res.ok
                      ? 'Smithsonian: OK'
                      : `Smithsonian: ${res.status}`,
                  )
                } catch {
                  lines.push('Smithsonian: сеть / CORS')
                }
              }
              if (tokens.sketchfab) {
                try {
                  const res = await fetch(
                    `/proxy/ext?url=${encodeURIComponent(
                      'https://api.sketchfab.com/v3/me',
                    )}`,
                    {
                      headers: {
                        Authorization: `Token ${tokens.sketchfab}`,
                      },
                    },
                  )
                  lines.push(
                    res.ok
                      ? 'Sketchfab: OK'
                      : `Sketchfab: ${res.status}`,
                  )
                } catch {
                  lines.push('Sketchfab: сеть / CORS')
                }
              }
              setTestMsg(
                lines.length ? lines.join(' · ') : 'Нет ключей для проверки',
              )
              setSaved(true)
            }}
          >
            Проверить
          </button>
        </div>
        {saved && !testMsg && <p className="muted">Сохранено</p>}
        {testMsg && <p className="muted">{testMsg}</p>}
      </div>
    </div>
  )
}
