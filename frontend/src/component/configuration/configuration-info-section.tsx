import type { ReactNode } from "react";

import { InfoIcon } from "@/component/ui/ui-icons";

type ConfigurationInfoSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ConfigurationInfoSection({
  title,
  description,
  children
}: ConfigurationInfoSectionProps) {
  return (
    <section className="ui-card ui-form-section ui-border-accent ui-configuration-info-section">
      <div className="ui-editor-content">
        <div className="ui-section-header">
          <span className="ui-icon-badge">
            <InfoIcon className="ui-icon" />
          </span>
          <div className="ui-section-copy">
            <h2 className="ui-header-title ui-title-section">{title}</h2>
            <p className="ui-copy-body">{description}</p>
          </div>
        </div>
        <div className="ui-configuration-info-section-body">{children}</div>
      </div>
    </section>
  );
}
