import { useCallback, useState } from "react";

/**
 * Contador por intenção de «Novo»: incrementar em cada clique no botão Novo para que
 * `editorFlashKey` mude mesmo já em modo criar e o flash/scroll/foco voltem a correr.
 */
export function useEditorNewIntentGeneration() {
  const [generation, setGeneration] = useState(0);
  const bumpNewIntent = useCallback(() => {
    setGeneration((previous) => previous + 1);
  }, []);
  return { newIntentGeneration: generation, bumpNewIntent };
}
