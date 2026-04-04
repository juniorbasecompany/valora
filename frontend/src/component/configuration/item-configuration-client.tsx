"use client";

import { ScopeHierarchyConfigurationClient } from "@/component/configuration/scope-hierarchy-configuration-client";
import type {
  TenantItemDirectoryResponse,
  TenantItemRecord,
  TenantScopeRecord
} from "@/lib/auth/types";

type Props = {
  locale: string;
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  initialItemDirectory: TenantItemDirectoryResponse | null;
  copy: Record<string, string>;
};

export function ItemConfigurationClient({
  locale,
  currentScope,
  hasAnyScope,
  initialItemDirectory,
  copy
}: Props) {
  return (
    <ScopeHierarchyConfigurationClient<TenantItemRecord, TenantItemDirectoryResponse>
      locale={locale}
      currentScope={currentScope}
      hasAnyScope={hasAnyScope}
      initialDirectory={initialItemDirectory}
      copy={copy}
      configurationSegment="item"
      queryParamKey="item"
      apiSegment="items"
      historyTableName="item"
      formIds={{
        nameInput: "item-name",
        displayTextarea: "item-display-name",
        historyHeading: "item-history-heading"
      }}
      getParentId={(row) => row.parent_item_id ?? null}
      buildSavePayload={({ name, display_name, parentId }) => ({
        name,
        display_name,
        parent_item_id: parentId
      })}
    />
  );
}
