import type { Dispatch, SetStateAction } from "react";

import { EditorPanelFlashOverlay } from "@/component/configuration/editor-panel-flash-overlay";

export type NameFieldError = {
  name?: string;
};

type ConfigurationNameFieldProps = {
  inputId: string;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  setFieldError: Dispatch<SetStateAction<NameFieldError>>;
  fieldError: NameFieldError;
  disabled: boolean;
  label: string;
  hint: string;
  flashActive?: boolean;
  /** Chamado após limpar erro de campo (ex.: limpar mensagem de sucesso ou erro de request). */
  onAfterFieldEdit?: () => void;
  multiline?: boolean;
};

export function ConfigurationNameField({
  inputId,
  name,
  setName,
  setFieldError,
  fieldError,
  disabled,
  label,
  hint,
  flashActive = false,
  onAfterFieldEdit,
  multiline = false
}: ConfigurationNameFieldProps) {
  const controlClassName = multiline
    ? "ui-input ui-input-textarea"
    : "ui-input";

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
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldError((previous) => ({
                  ...previous,
                  name: undefined
                }));
                onAfterFieldEdit?.();
              }}
              disabled={disabled}
              aria-invalid={Boolean(fieldError.name)}
            />
          ) : (
            <input
              id={inputId}
              className={controlClassName}
              data-editor-primary-field="true"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldError((previous) => ({
                  ...previous,
                  name: undefined
                }));
                onAfterFieldEdit?.();
              }}
              disabled={disabled}
              aria-invalid={Boolean(fieldError.name)}
            />
          )}
          <p className="ui-field-hint">{hint}</p>
          {fieldError.name ? (
            <p className="ui-field-error">{fieldError.name}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
