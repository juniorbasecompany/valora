"use client";

import type { ReactNode } from "react";

import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";

/**
 * Limite único para texto principal nos painéis de configuração (alinhado a colunas Text no backend).
 * Política: campo de uma linha (`input`), sem textarea por omissão.
 */
export const PRIMARY_CONFIGURATION_TEXT_MAX_LENGTH = 8192;

export type ConfigurationPrimaryTextFieldSectionProps = {
  inputId: string;
  value: string;
  onValueChange: (next: string) => void;
  label: string;
  hint: string;
  error?: string;
  disabled: boolean;
  flashActive?: boolean;
  onAfterEdit?: () => void;
  /** Só usar quando o domínio exigir texto longo visível em várias linhas. */
  multiline?: boolean;
  maxLength?: number;
  autoComplete?: string;
  /** Conteúdo extra no mesmo cartão, após o campo principal (ex.: segundo `ui-field`). */
  children?: ReactNode;
};

export function ConfigurationPrimaryTextFieldSection({
  inputId,
  value,
  onValueChange,
  label,
  hint,
  error,
  disabled,
  flashActive = false,
  onAfterEdit,
  multiline = false,
  maxLength = PRIMARY_CONFIGURATION_TEXT_MAX_LENGTH,
  autoComplete = "off",
  children
}: ConfigurationPrimaryTextFieldSectionProps) {
  const controlClassName = multiline ? "ui-input ui-input-textarea" : "ui-input";

  return (
    <section className="ui-card ui-form-section ui-border-accent">
      <EditorPanelFlashOverlay active={flashActive} />

      <div className="ui-editor-content">
        <div className="ui-field">
          <label className="ui-field-label" htmlFor={inputId}>
            {label}
          </label>
          {multiline ? (
            <textarea
              id={inputId}
              className={controlClassName}
              data-editor-primary-field="true"
              value={value}
              maxLength={maxLength}
              onChange={(event) => {
                onValueChange(event.target.value);
                onAfterEdit?.();
              }}
              disabled={disabled}
              aria-invalid={Boolean(error)}
            />
          ) : (
            <input
              id={inputId}
              type="text"
              className={controlClassName}
              data-editor-primary-field="true"
              value={value}
              maxLength={maxLength}
              autoComplete={autoComplete}
              onChange={(event) => {
                onValueChange(event.target.value);
                onAfterEdit?.();
              }}
              disabled={disabled}
              aria-invalid={Boolean(error)}
            />
          )}
          <p className="ui-field-hint">{hint}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
