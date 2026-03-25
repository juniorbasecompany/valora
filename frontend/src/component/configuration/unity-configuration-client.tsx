"use client";

import { ScopeHierarchyConfigurationClient } from "@/component/configuration/scope-hierarchy-configuration-client";
import type {
    TenantScopeRecord,
    TenantUnityDirectoryResponse,
    TenantUnityRecord
} from "@/lib/auth/types";

type Props = {
    locale: string;
    currentScope: TenantScopeRecord | null;
    hasAnyScope: boolean;
    initialUnityDirectory: TenantUnityDirectoryResponse | null;
    copy: Record<string, string>;
};

export function UnityConfigurationClient({
    locale,
    currentScope,
    hasAnyScope,
    initialUnityDirectory,
    copy
}: Props) {
    return (
        <ScopeHierarchyConfigurationClient<TenantUnityRecord, TenantUnityDirectoryResponse>
            locale={locale}
            currentScope={currentScope}
            hasAnyScope={hasAnyScope}
            initialDirectory={initialUnityDirectory}
            copy={copy}
            configurationSegment="unity"
            queryParamKey="unity"
            apiSegment="unities"
            formIds={{
                nameInput: "unity-name",
                displayTextarea: "unity-display-name",
                historyHeading: "unity-history-heading"
            }}
            getParentId={(item) => item.parent_unity_id ?? null}
            buildSavePayload={({ name, display_name, parentId }) => ({
                name,
                display_name,
                parent_unity_id: parentId
            })}
        />
    );
}
