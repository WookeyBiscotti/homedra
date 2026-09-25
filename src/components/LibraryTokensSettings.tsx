import { useEffect, useRef, useState } from 'react'
import {
  applyProfilePackage,
  buildProfilePackage,
  parseProfileJson,
  readProfileInventory,
  summarizeProfile,
  type ProfileInventory,
} from '../models/profilePackage'
import {
  LIBRARY_TOKEN_KEYS,
  readLibraryTokens,
  TOKEN_META,
  writeLibraryTokens,
  type LibraryTokens,
} from '../models/tokens'
import { useBuildingStore } from '../store/buildingStore'

const KEYS = LIBRARY_TOKEN_KEYS

function emptyInventory(): ProfileInventory {
  return { keys: 0, localModels: 0, collectionItems: 0, textures: 0 }
}

function formatInventory(inv: ProfileInventory): string {
  return [
    `Ключи: ${inv.keys}`,
    `Загрузки: ${inv.localModels}`,
    `Коллекция: ${inv.collectionItems}`,
    `Текстуры: ${inv.textures}`,
  ].join(' · ')
}

function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function LibraryTokensSettings() {
  const open = useBuildingStore((s) => s.libraryTokensOpen)
  const setOpen = useBuildingStore((s) => s.setLibraryTokensOpen)
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<LibraryTokens>({})
  const [saved, setSaved] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const [inventory, setInventory] = useState<ProfileInventory>(emptyInventory)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [transferMsg, setTransferMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDraft(readLibraryTokens())
      setSaved(false)
      setTestMsg(null)
      setTransferMsg(null)
      setBusy(null)
      void readProfileInventory().then(setInventory)
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
        aria-label="Профиль"
      >
        <header className="tex-modal-header">
          <h3>Профиль</h3>
          <button type="button" className="ghost" onClick={() => setOpen(false)}>
            Закрыть
          </button>
        </header>
        <p className="muted">
          Ключи API хранятся только в этом браузере и не попадают в экспорт
          проекта. Чтобы перенести их вместе с моделями и текстурами, скачайте
          профиль.
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
              void readProfileInventory().then(setInventory)
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
              if (tokens.pixabay) {
                try {
                  const q = new URLSearchParams({
                    key: tokens.pixabay,
                    q: 'texture',
                    per_page: '3',
                  })
                  const res = await fetch(
                    `/proxy/ext?url=${encodeURIComponent(
                      `https://pixabay.com/api/?${q}`,
                    )}`,
                  )
                  lines.push(
                    res.ok ? 'Pixabay: OK' : `Pixabay: ${res.status}`,
                  )
                } catch {
                  lines.push('Pixabay: сеть / CORS')
                }
              }
              if (tokens.pexels) {
                try {
                  const res = await fetch(
                    `/proxy/ext?url=${encodeURIComponent(
                      'https://api.pexels.com/v1/search?query=texture&per_page=1',
                    )}`,
                    { headers: { Authorization: tokens.pexels } },
                  )
                  lines.push(
                    res.ok ? 'Pexels: OK' : `Pexels: ${res.status}`,
                  )
                } catch {
                  lines.push('Pexels: сеть / CORS')
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

        <section className="profile-transfer">
          <h4>Экспорт профиля</h4>
          <p className="muted">
            В файл попадают ключи API, загруженные GLB, коллекция моделей и
            коллекция текстур. Планировка в профиль не входит — её по-прежнему
            экспортируйте из верхней панели. Файл содержит секреты, не
            публикуйте его.
          </p>
          <p className="muted">{formatInventory(inventory)}</p>
          <div className="token-actions">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                void (async () => {
                  setBusy('export')
                  setTransferMsg(null)
                  try {
                    writeLibraryTokens(draft)
                    const pkg = await buildProfilePackage()
                    const stamp = new Date(pkg.exportedAt)
                      .toISOString()
                      .slice(0, 10)
                    downloadJson(
                      `interior-profile-${stamp}.json`,
                      JSON.stringify(pkg),
                    )
                    setInventory(summarizeProfile(pkg))
                    setTransferMsg('Профиль скачан')
                  } catch (e) {
                    setTransferMsg(
                      e instanceof Error
                        ? e.message
                        : 'Не удалось собрать профиль',
                    )
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
            >
              {busy === 'export' ? 'Сборка…' : 'Скачать профиль'}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
            >
              {busy === 'import' ? 'Импорт…' : 'Импорт профиля'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                void (async () => {
                  setBusy('import')
                  setTransferMsg(null)
                  try {
                    const pkg = parseProfileJson(await file.text())
                    await applyProfilePackage(pkg)
                    setDraft(readLibraryTokens())
                    setInventory(await readProfileInventory())
                    setSaved(true)
                    const inv = summarizeProfile(pkg)
                    setTransferMsg(`Импортировано · ${formatInventory(inv)}`)
                  } catch (err) {
                    setTransferMsg(
                      err instanceof Error
                        ? err.message
                        : 'Не удалось импортировать профиль',
                    )
                  } finally {
                    setBusy(null)
                  }
                })()
              }}
            />
          </div>
          {transferMsg && <p className="muted">{transferMsg}</p>}
        </section>
      </div>
    </div>
  )
}
