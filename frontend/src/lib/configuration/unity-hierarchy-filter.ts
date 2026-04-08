import type { TenantItemRecord, TenantLocationRecord, TenantUnityRecord } from "@/lib/auth/types";

/** Ascendentes do local da unity na árvore de locais do escopo (para seletor hierárquico). */
export function filterLocationListByUnity(
  fullList: TenantLocationRecord[],
  selectedUnity: TenantUnityRecord | null
): TenantLocationRecord[] {
  if (selectedUnity == null) {
    return fullList;
  }
  const allowedId = selectedUnity.location_id;
  const ancestorIdSet = new Set<number>();
  const byId = new Map(fullList.map((row) => [row.id, row]));
  let current = byId.get(allowedId);
  while (current) {
    ancestorIdSet.add(current.id);
    const parentId = current.parent_location_id ?? null;
    current = parentId == null ? undefined : byId.get(parentId);
  }
  return fullList.filter((row) => ancestorIdSet.has(row.id));
}

/** Itens permitidos pela unity mais ancestrais na árvore de itens (para seletor hierárquico). */
export function filterItemListByUnity(
  fullList: TenantItemRecord[],
  selectedUnity: TenantUnityRecord | null
): TenantItemRecord[] {
  if (selectedUnity == null) {
    return fullList;
  }
  const allowedIdSet = new Set(selectedUnity.item_id_list);
  const byId = new Map(fullList.map((row) => [row.id, row]));
  const resultIdSet = new Set<number>();
  for (const id of allowedIdSet) {
    let current = byId.get(id);
    while (current) {
      if (resultIdSet.has(current.id)) break;
      resultIdSet.add(current.id);
      const parentId = current.parent_item_id ?? null;
      current = parentId == null ? undefined : byId.get(parentId);
    }
  }
  return fullList.filter((row) => resultIdSet.has(row.id));
}
