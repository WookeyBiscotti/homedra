import { useBuildingStore } from '../../store/buildingStore'

export function LightingPanel() {
  const open = useBuildingStore((s) => s.lightingMenuOpen)
  const lighting = useBuildingStore((s) => s.lighting)
  const setLighting = useBuildingStore((s) => s.setLighting)
  const resetLighting = useBuildingStore((s) => s.resetLighting)
  const setLightingMenuOpen = useBuildingStore((s) => s.setLightingMenuOpen)

  if (!open) return null

  return (
    <aside className="lighting-panel" aria-label="Настройки освещения">
      <div className="lighting-panel-head">
        <h2 className="panel-title">Освещение</h2>
        <button
          type="button"
          className="lighting-close"
          onClick={() => setLightingMenuOpen(false)}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      <div className="prop-section">
        <h3>Глобальный свет</h3>
        <label>
          Интенсивность
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={lighting.ambientIntensity}
            onChange={(e) =>
              setLighting({ ambientIntensity: Number(e.target.value) })
            }
          />
          <span className="lighting-value">
            {lighting.ambientIntensity.toFixed(2)}
          </span>
        </label>
        <label>
          Экспозиция
          <input
            type="range"
            min={0.4}
            max={2}
            step={0.05}
            value={lighting.exposure}
            onChange={(e) =>
              setLighting({ exposure: Number(e.target.value) })
            }
          />
          <span className="lighting-value">
            {lighting.exposure.toFixed(2)}
          </span>
        </label>
        <label>
          Цвет неба
          <input
            type="color"
            value={lighting.skyColor}
            onChange={(e) => setLighting({ skyColor: e.target.value })}
          />
        </label>
        <label>
          Цвет земли
          <input
            type="color"
            value={lighting.groundColor}
            onChange={(e) => setLighting({ groundColor: e.target.value })}
          />
        </label>
      </div>

      <div className="prop-section">
        <h3>Солнце</h3>
        <label>
          Интенсивность
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={lighting.sunIntensity}
            onChange={(e) =>
              setLighting({ sunIntensity: Number(e.target.value) })
            }
          />
          <span className="lighting-value">
            {lighting.sunIntensity.toFixed(2)}
          </span>
        </label>
        <label>
          Азимут (°)
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={lighting.sunAzimuth}
            onChange={(e) =>
              setLighting({ sunAzimuth: Number(e.target.value) })
            }
          />
          <span className="lighting-value">{Math.round(lighting.sunAzimuth)}°</span>
        </label>
        <label>
          Высота (°)
          <input
            type="range"
            min={5}
            max={85}
            step={1}
            value={lighting.sunElevation}
            onChange={(e) =>
              setLighting({ sunElevation: Number(e.target.value) })
            }
          />
          <span className="lighting-value">
            {Math.round(lighting.sunElevation)}°
          </span>
        </label>
      </div>

      <div className="prop-section">
        <h3>Тени</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={lighting.shadowsEnabled}
            onChange={(e) =>
              setLighting({ shadowsEnabled: e.target.checked })
            }
          />
          Включить тени
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={lighting.contactShadows}
            onChange={(e) =>
              setLighting({ contactShadows: e.target.checked })
            }
          />
          Contact shadows
        </label>
      </div>

      <div className="prop-section">
        <h3>Постэффекты</h3>
        <label>
          AO (N8AO)
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={lighting.aoIntensity}
            onChange={(e) =>
              setLighting({ aoIntensity: Number(e.target.value) })
            }
          />
          <span className="lighting-value">
            {lighting.aoIntensity.toFixed(2)}
          </span>
        </label>
        <label>
          Bloom
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={lighting.bloomIntensity}
            onChange={(e) =>
              setLighting({ bloomIntensity: Number(e.target.value) })
            }
          />
          <span className="lighting-value">
            {lighting.bloomIntensity.toFixed(2)}
          </span>
        </label>
        <label>
          Vignette
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={lighting.vignetteDarkness}
            onChange={(e) =>
              setLighting({ vignetteDarkness: Number(e.target.value) })
            }
          />
          <span className="lighting-value">
            {lighting.vignetteDarkness.toFixed(2)}
          </span>
        </label>
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
          SMAA всегда включён. 0 на слайдере — эффект выключен.
        </p>
      </div>

      <button type="button" className="prop-action" onClick={resetLighting}>
        Сбросить
      </button>
    </aside>
  )
}
