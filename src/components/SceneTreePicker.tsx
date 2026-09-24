import { useEffect, useMemo, useState } from 'react'
import type { ScenePart, SceneTreeNode } from '../models/sceneParts'
import { findTreeNode } from '../models/sceneParts'

function collectOpenIds(
  nodes: SceneTreeNode[],
  depth: number,
  maxDepth: number,
  into: Set<string>,
) {
  for (const n of nodes) {
    if (n.children.length === 0) continue
    if (depth < maxDepth) {
      into.add(n.id)
      collectOpenIds(n.children, depth + 1, maxDepth, into)
    }
  }
}

function ancestorIds(nodes: SceneTreeNode[], id: string): string[] {
  const walk = (
    list: SceneTreeNode[],
    trail: string[],
  ): string[] | null => {
    for (const n of list) {
      if (n.id === id) return trail
      const hit = walk(n.children, [...trail, n.id])
      if (hit) return hit
    }
    return null
  }
  return walk(nodes, []) ?? []
}

function TreeRow({
  node,
  depth,
  selectedId,
  explodeIds,
  expanded,
  onToggleExpand,
  onSelect,
  onToggleExplode,
  onMarkChildren,
}: {
  node: SceneTreeNode
  depth: number
  selectedId?: string
  explodeIds: Set<string>
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onSelect: (id: string) => void
  onToggleExplode: (id: string) => void
  onMarkChildren: (id: string) => void
}) {
  const hasKids = node.children.length > 0
  const isOpen = expanded.has(node.id)
  const selected = selectedId === node.id
  const exploded = explodeIds.has(node.id)

  return (
    <li className="scene-tree-item">
      <div
        className={
          selected ? 'scene-tree-row active' : 'scene-tree-row'
        }
        style={{ paddingLeft: `${0.25 + depth * 0.75}rem` }}
        onClick={() => onSelect(node.id)}
      >
        {hasKids ? (
          <button
            type="button"
            className="scene-tree-twist"
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="scene-tree-twist spacer" />
        )}
        <label
          className="scene-tree-check"
          title="Отдельный объект в коллекции"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={exploded}
            onChange={() => onToggleExplode(node.id)}
          />
        </label>
        <span className="scene-tree-label" title={node.id}>
          <span className="scene-tree-kind" data-kind={node.kind}>
            {node.kind === 'mesh' ? 'M' : 'G'}
          </span>
          {node.label}
        </span>
        {node.children.length >= 2 && (
          <button
            type="button"
            className="scene-tree-mark-kids"
            title="Отметить детей как отдельные объекты"
            onClick={(e) => {
              e.stopPropagation()
              onMarkChildren(node.id)
            }}
          >
            Дети
          </button>
        )}
      </div>
      {hasKids && isOpen && (
        <ul className="scene-tree-list">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              explodeIds={explodeIds}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onToggleExplode={onToggleExplode}
              onMarkChildren={onMarkChildren}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * Scene hierarchy picker: click a row to preview that subtree;
 * checkboxes mark which nodes become separate collection items.
 */
export function SceneTreePicker({
  tree,
  selectedId,
  explodeParts,
  onSelect,
  onExplodePartsChange,
}: {
  tree: SceneTreeNode[]
  selectedId?: string
  explodeParts: ScenePart[]
  onSelect: (objectId: string | undefined) => void
  onExplodePartsChange: (parts: ScenePart[]) => void
}) {
  const explodeIds = useMemo(
    () => new Set(explodeParts.map((p) => p.id)),
    [explodeParts],
  )

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>()
    collectOpenIds(tree, 0, 2, init)
    if (selectedId) {
      for (const id of ancestorIds(tree, selectedId)) init.add(id)
    }
    return init
  })

  useEffect(() => {
    if (!selectedId) return
    const trail = ancestorIds(tree, selectedId)
    if (trail.length === 0) return
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of trail) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedId, tree])

  if (tree.length === 0) return null

  const partFromNode = (n: SceneTreeNode): ScenePart => ({
    id: n.id,
    label: n.label,
  })

  const onToggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onToggleExplode = (id: string) => {
    const node = findTreeNode(tree, id)
    if (!node) return
    if (explodeIds.has(id)) {
      onExplodePartsChange(explodeParts.filter((p) => p.id !== id))
    } else {
      onExplodePartsChange([...explodeParts, partFromNode(node)])
    }
  }

  const onMarkChildren = (id: string) => {
    const node = findTreeNode(tree, id)
    if (!node || node.children.length < 2) return
    onExplodePartsChange(node.children.map(partFromNode))
    onSelect(id)
    setExpanded((prev) => new Set(prev).add(id))
  }

  return (
    <div className="scene-tree-picker" aria-label="Дерево сцены">
      <div className="scene-tree-picker-header">
        <span className="muted model-part-picker-label">Дерево сцены</span>
        <button
          type="button"
          className={!selectedId ? 'active' : undefined}
          onClick={() => onSelect(undefined)}
        >
          Вся сцена
        </button>
      </div>
      <p className="muted scene-tree-hint">
        Клик — превью узла. Галочка — отдельный объект при «весь ассет».
        «Дети» — отметить дочерние узлы (например два окна, не стёкла).
      </p>
      <ul className="scene-tree-list scene-tree-root">
        {tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            explodeIds={explodeIds}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onToggleExplode={onToggleExplode}
            onMarkChildren={onMarkChildren}
          />
        ))}
      </ul>
      {explodeParts.length >= 2 && (
        <p className="muted scene-tree-explode-count">
          В коллекцию по частям: {explodeParts.length}
          {explodeParts.length <= 8
            ? ` — ${explodeParts.map((p) => p.label).join(', ')}`
            : ` — ${explodeParts
                .slice(0, 6)
                .map((p) => p.label)
                .join(', ')}…`}
        </p>
      )}
    </div>
  )
}
