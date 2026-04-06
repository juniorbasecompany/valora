export function expandSelectedIdsWithAncestors(
  selectedIdList: number[],
  getParentIdById: (id: number) => number | null | undefined
): Set<number> {
  const expandedIdSet = new Set<number>();

  for (const id of selectedIdList) {
    let currentId: number | null | undefined = id;
    while (currentId != null && !expandedIdSet.has(currentId)) {
      expandedIdSet.add(currentId);
      currentId = getParentIdById(currentId);
    }
  }

  return expandedIdSet;
}

function hasStrictSelectedDescendant(
  candidateId: number,
  selectedIdSet: Set<number>,
  getParentIdById: (id: number) => number | null | undefined
): boolean {
  for (const selectedId of selectedIdSet) {
    if (selectedId === candidateId) {
      continue;
    }

    let currentParentId = getParentIdById(selectedId);
    while (currentParentId != null) {
      if (currentParentId === candidateId) {
        return true;
      }
      currentParentId = getParentIdById(currentParentId);
    }
  }

  return false;
}

function normalizeIndependentHierarchySelection(
  selectedPickIdList: number[],
  getParentIdById: (id: number) => number | null | undefined
): number[] {
  const selectedIdSet = new Set(selectedPickIdList);
  return selectedPickIdList.filter(
    (id) => !hasStrictSelectedDescendant(id, selectedIdSet, getParentIdById)
  );
}

export function toggleIndependentHierarchySelection(
  selectedPickIdList: number[],
  toggledId: number,
  getParentIdById: (id: number) => number | null | undefined,
  getChildrenIdsByParentId: (id: number) => number[]
): number[] {
  const normalizedSelectedPickIdList = normalizeIndependentHierarchySelection(
    selectedPickIdList,
    getParentIdById
  );
  const expandedSelectedIdSet = expandSelectedIdsWithAncestors(
    normalizedSelectedPickIdList,
    getParentIdById
  );

  if (!expandedSelectedIdSet.has(toggledId)) {
    const ancestorIdSet = new Set<number>();
    let currentParentId = getParentIdById(toggledId);
    while (currentParentId != null) {
      ancestorIdSet.add(currentParentId);
      currentParentId = getParentIdById(currentParentId);
    }

    const nextSelectedPickIdList = normalizedSelectedPickIdList.filter(
      (id) => !ancestorIdSet.has(id)
    );
    return nextSelectedPickIdList.includes(toggledId)
      ? nextSelectedPickIdList
      : [...nextSelectedPickIdList, toggledId];
  }

  const removedIdSet = new Set<number>([toggledId]);
  const pendingIdList = [...getChildrenIdsByParentId(toggledId)];

  while (pendingIdList.length > 0) {
    const currentId = pendingIdList.pop();
    if (currentId == null || removedIdSet.has(currentId)) {
      continue;
    }

    removedIdSet.add(currentId);
    pendingIdList.push(...getChildrenIdsByParentId(currentId));
  }

  return normalizedSelectedPickIdList.filter((id) => !removedIdSet.has(id));
}
