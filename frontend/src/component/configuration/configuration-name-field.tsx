import type { Dispatch, SetStateAction } from "react";

import { ConfigurationPrimaryTextFieldSection } from "@/component/configuration/configuration-primary-text-field-section";

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
  onAfterFieldEdit
}: ConfigurationNameFieldProps) {
  return (
    <ConfigurationPrimaryTextFieldSection
      inputId={inputId}
      value={name}
      onValueChange={(next) => {
        setName(next);
        setFieldError((previous) => ({
          ...previous,
          name: undefined
        }));
      }}
      label={label}
      hint={hint}
      error={fieldError.name}
      disabled={disabled}
      flashActive={flashActive}
      onAfterEdit={onAfterFieldEdit}
    />
  );
}
