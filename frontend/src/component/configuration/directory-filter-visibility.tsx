"use client";

import { useSyncExternalStore } from "react";

/** Identificador da tela de configuração para uma chave distinta no `localStorage`. */
export type DirectoryFilterStorageSegment =
  | "scope"
  | "tenant"
  | "member"
  | "event"
  | "field"
  | "action"
  | "location"
  | "item";

const STORAGE_KEY_PREFIX = "valora.configuration.directoryFilterVisible.";

function storageKey(segment: DirectoryFilterStorageSegment): string {
  return STORAGE_KEY_PREFIX + segment;
}

function readStored(segment: DirectoryFilterStorageSegment | undefined): boolean {
  if (segment == null || typeof window === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(storageKey(segment)) === "true";
  } catch {
    return false;
  }
}

function writeStored(segment: DirectoryFilterStorageSegment, value: boolean): void {
  try {
    localStorage.setItem(storageKey(segment), value ? "true" : "false");
  } catch {
    /* quota ou modo privado */
  }
}

const listenerMap = new Map<DirectoryFilterStorageSegment, Set<() => void>>();

function emit(segment: DirectoryFilterStorageSegment): void {
  listenerMap.get(segment)?.forEach((listener) => listener());
}

function subscribe(
  segment: DirectoryFilterStorageSegment | undefined,
  onChange: () => void
): () => void {
  if (segment == null) {
    return () => {};
  }
  let set = listenerMap.get(segment);
  if (!set) {
    set = new Set();
    listenerMap.set(segment, set);
  }
  set.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey(segment)) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    set?.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setDirectoryFilterPanelVisible(
  segment: DirectoryFilterStorageSegment,
  value: boolean
): void {
  writeStored(segment, value);
  emit(segment);
}

/** Inverte o estado guardado (útil no clique do switch, sempre alinhado ao `localStorage`). */
export function toggleDirectoryFilterPanelVisible(segment: DirectoryFilterStorageSegment): void {
  setDirectoryFilterPanelVisible(segment, !readStored(segment));
}

export function useDirectoryFilterPanelVisible(
  segment: DirectoryFilterStorageSegment | undefined
): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(segment, onChange),
    () => readStored(segment),
    () => false
  );
}

