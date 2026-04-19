"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Persistência em `localStorage` das seleções de unidade e campos do painel de
 * filtros da home. As chaves são escopadas por `scopeId` para não vazar seleção
 * entre escopos distintos.
 */

const STORAGE_KEY_PREFIX = "valora.home.chart.";

export type HomeChartFieldSlot =
  | "unity"
  | "plantelFact"
  | "plantelStd"
  | "mortalidadeFact"
  | "mortalidadeStd";

function storageKey(scopeId: number, slot: HomeChartFieldSlot): string {
  return `${STORAGE_KEY_PREFIX}${scopeId}.${slot}Id`;
}

function readStoredNumber(scopeId: number, slot: HomeChartFieldSlot): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(storageKey(scopeId, slot));
    if (raw == null || raw === "") {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const listenerMap = new Map<string, Set<() => void>>();

function emit(scopeId: number, slot: HomeChartFieldSlot): void {
  listenerMap.get(storageKey(scopeId, slot))?.forEach((listener) => listener());
}

function subscribe(
  scopeId: number | null,
  slot: HomeChartFieldSlot,
  onChange: () => void
): () => void {
  if (scopeId == null || typeof window === "undefined") {
    return () => {};
  }
  const key = storageKey(scopeId, slot);
  let set = listenerMap.get(key);
  if (!set) {
    set = new Set();
    listenerMap.set(key, set);
  }
  set.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === key) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set?.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeStoredHomeChartId(
  scopeId: number,
  slot: HomeChartFieldSlot,
  value: number | null
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const key = storageKey(scopeId, slot);
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(value));
    }
  } catch {
    /* quota ou modo privado */
  }
  emit(scopeId, slot);
}

/**
 * Lê, de forma reativa e compatível com SSR, a seleção guardada do filtro da
 * home. O valor retornado é validado contra `validIdSet` antes de ser exposto;
 * ids ausentes do conjunto (ex.: campo removido do escopo) são tratados como
 * "sem seleção".
 */
export function useStoredHomeChartId(
  scopeId: number | null,
  slot: HomeChartFieldSlot,
  validIdSet: ReadonlySet<number>
): number | null {
  const subscribeForSlot = useCallback(
    (onChange: () => void) => subscribe(scopeId, slot, onChange),
    [scopeId, slot]
  );
  const getSnapshot = useCallback(() => {
    if (scopeId == null) {
      return null;
    }
    const storedId = readStoredNumber(scopeId, slot);
    if (storedId == null || !validIdSet.has(storedId)) {
      return null;
    }
    return storedId;
  }, [scopeId, slot, validIdSet]);
  const getServerSnapshot = useCallback(() => null, []);
  return useSyncExternalStore(subscribeForSlot, getSnapshot, getServerSnapshot);
}
