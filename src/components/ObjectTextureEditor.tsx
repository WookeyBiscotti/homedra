import type { ObjectAppearance } from '../engine/types'
import { setAppearanceMaterial } from '../models/objectAppearance'
import { useObjectMaterials } from '../models/objectMaterialRegistry'
import { MaterialSlot } from './TextureBrowser'

/** Texture slots for a selected placed object — picker opens on the collection. */
export function ObjectTextureEditor({
  objectId,
  appearance,
  onChange,
}: {
  objectId: string
  appearance?: ObjectAppearance
  onChange: (next: ObjectAppearance | undefined) => void
}) {
  const mats = useObjectMaterials(objectId)
  const showSlots = mats.length > 1

  return (
    <div className="object-tex-editor">
      <h4 className="object-tex-title">Текстуры</h4>
      <p className="muted object-tex-hint">
        Из коллекции текстур или каталогов. Слот перекрывает «все материалы».
      </p>
      <MaterialSlot
        label={showSlots ? 'Все материалы' : mats[0]?.label ?? 'Текстура'}
        value={appearance?.material}
        preferCollection
        onChange={(ref) => onChange(setAppearanceMaterial(appearance, ref))}
        onClear={() => onChange(setAppearanceMaterial(appearance, null))}
      />
      {showSlots &&
        mats.map((mat) => (
          <MaterialSlot
            key={mat.id}
            label={mat.label}
            value={appearance?.slots?.[mat.id]?.material}
            preferCollection
            onChange={(ref) =>
              onChange(setAppearanceMaterial(appearance, ref, mat.id))
            }
            onClear={() =>
              onChange(setAppearanceMaterial(appearance, null, mat.id))
            }
          />
        ))}
    </div>
  )
}
