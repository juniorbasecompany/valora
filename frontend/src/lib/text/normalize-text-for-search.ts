/**
 * Normalização para comparação de filtro no cliente: sem distinguir caixa nem
 * acentuação, alinhado a `architecture/system-principles.md` (equivalente ao
 * espírito de `lower(unaccent(...))` no SQL; aqui usa Unicode NFD no browser).
 */
export function normalizeTextForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
