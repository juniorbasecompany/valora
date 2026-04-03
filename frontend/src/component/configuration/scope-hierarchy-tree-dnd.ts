import type { TenantScopeHierarchyItemBase } from "@/lib/auth/types";

export type HierarchyDropParsed =
  | { kind: "gap"; parentId: number | null; targetIndex: number }
  | { kind: "into"; parentId: number };

export function hierarchyDragId(itemId: number): string {
  return `drag:${itemId}`;
}

export function hierarchyGapId(parentId: number | null, gapIndex: number): string {
  const p = parentId === null ? "root" : String(parentId);
  return `gap:${p}:${gapIndex}`;
}

export function hierarchyIntoId(itemId: number): string {
  return `into:${itemId}`;
}

export function parseDragId(activeId: string | null | undefined): number | null {
  if (activeId == null || !activeId.startsWith("drag:")) {
    return null;
  }
  const n = Number(activeId.slice(5));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseDropId(overId: string | null | undefined): HierarchyDropParsed | null {
  if (overId == null) {
    return null;
  }
  if (overId.startsWith("gap:")) {
    const parts = overId.split(":");
    if (parts.length !== 3) {
      return null;
    }
    const parentToken = parts[1];
    const parentId = parentToken === "root" ? null : Number(parentToken);
    if (parentId !== null && (!Number.isInteger(parentId) || parentId < 1)) {
      return null;
    }
    const targetIndex = Number(parts[2]);
    if (!Number.isInteger(targetIndex) || targetIndex < 0) {
      return null;
    }
    return { kind: "gap", parentId, targetIndex };
  }
  if (overId.startsWith("into:")) {
    const id = Number(overId.slice(5));
    if (!Number.isInteger(id) || id < 1) {
      return null;
    }
    return { kind: "into", parentId: id };
  }
  return null;
}

/** Descendentes diretos e indirectos de `rootId` (não inclui o próprio `rootId`). */
export function collectStrictDescendantIdSet(
  rootId: number,
  childrenByParent: Map<number | null, TenantScopeHierarchyItemBase[]>
): Set<number> {
  const out = new Set<number>();
  const walk = (id: number) => {
    for (const child of childrenByParent.get(id) ?? []) {
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(rootId);
  return out;
}

function findParentIdOf(
  itemId: number,
  childrenByParent: Map<number | null, TenantScopeHierarchyItemBase[]>
): number | null {
  for (const [parentId, list] of childrenByParent) {
    if (list.some((c) => c.id === itemId)) {
      return parentId;
    }
  }
  return null;
}

/**
 * Calcula o corpo do move ou `null` se for inválido ou sem efeito.
 */
export function computeHierarchyMove<T extends TenantScopeHierarchyItemBase>(
  dragId: number,
  drop: HierarchyDropParsed,
  childrenByParent: Map<number | null, T[]>
): { parentId: number | null; targetIndex: number } | null {
  const strictDescendants = collectStrictDescendantIdSet(dragId, childrenByParent);

  if (drop.kind === "into") {
    const intoId = drop.parentId;
    if (intoId === dragId || strictDescendants.has(intoId)) {
      return null;
    }
    const siblingsExcludingDrag = (childrenByParent.get(intoId) ?? []).filter(
      (s) => s.id !== dragId
    );
    return { parentId: intoId, targetIndex: siblingsExcludingDrag.length };
  }

  const newParentId = drop.parentId;
  const gapIndex = drop.targetIndex;

  if (newParentId !== null && (newParentId === dragId || strictDescendants.has(newParentId))) {
    return null;
  }

  const oldParentId = findParentIdOf(dragId, childrenByParent);

  const fullSiblings = childrenByParent.get(oldParentId) ?? [];
  const oldIndex = fullSiblings.findIndex((s) => s.id === dragId);
  if (oldIndex < 0) {
    return null;
  }

  /*
   * Os gaps na UI são 0..n (n = número de irmãos com o arrastado ainda na lista).
   * O backend espera `target_index` na lista de irmãos *sem* o item movido (insert em 0..len).
   * Ao reordenar no mesmo pai: `oldIndex < gapIndex` implica índice ajustado gapIndex - 1.
   */
  let targetIndex = gapIndex;
  if (newParentId === oldParentId) {
    targetIndex = oldIndex < gapIndex ? gapIndex - 1 : gapIndex;
  }

  if (newParentId === oldParentId && targetIndex === oldIndex) {
    return null;
  }

  return { parentId: newParentId, targetIndex };
}

export function buildMoveRequestBody(
  parentId: number | null,
  targetIndex: number,
  parentField: "parent_location_id" | "parent_unity_id"
): Record<string, unknown> {
  return {
    [parentField]: parentId,
    target_index: targetIndex
  };
}
