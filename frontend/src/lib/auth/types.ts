export type LoginAction = "issue_token" | "select_tenant" | "create_tenant";

export type TenantOption = {
  tenant_id: number;
  name: string;
  display_name: string;
  role: number;
};

export type InviteOption = {
  member_id: number;
  tenant_id: number;
  name: string;
  display_name: string;
  role: number;
  status: string;
};

export type AuthResponse = {
  access_token?: string | null;
  token_type: string;
  requires_tenant_selection: boolean;
  next_action?: LoginAction | null;
  tenant_list: TenantOption[];
  invite_list: InviteOption[];
};

export type TenantListResponse = {
  tenant_list: TenantOption[];
  invite_list: InviteOption[];
};

export type TenantCurrentResponse = {
  id: number;
  name: string;
  display_name: string;
  can_edit: boolean;
  can_delete: boolean;
};

export type TenantDeleteResponse = {
  deleted_tenant_id: number;
};

export type TenantMemberRecord = {
  id: number;
  name?: string | null;
  display_name?: string | null;
  email: string;
  role: number;
  role_name: string;
  status: string;
  account_id?: number | null;
  can_edit: boolean;
  can_edit_access: boolean;
  can_delete: boolean;
};

export type TenantMemberDirectoryResponse = {
  can_edit: boolean;
  /** Ausente em respostas antigas do backend; usar `can_edit` como fallback na UI. */
  can_create?: boolean;
  item_list: TenantMemberRecord[];
};

export type TenantScopeRecord = {
  id: number;
  name: string;
  display_name: string;
  can_edit: boolean;
  can_delete: boolean;
};

export type TenantScopeDirectoryResponse = {
  can_edit: boolean;
  can_create: boolean;
  current_scope_id?: number | null;
  item_list: TenantScopeRecord[];
};

/** Campos comuns às árvores hierárquicas por escopo (locais, unidades produtivas, …). */
export type TenantScopeHierarchyItemBase = {
  id: number;
  name: string;
  display_name: string;
  sort_order: number;
  depth: number;
  path_labels: string[];
  children_count: number;
  descendants_count: number;
  can_edit: boolean;
  can_delete: boolean;
  can_create_child: boolean;
  can_move: boolean;
};

export type TenantLocationRecord = TenantScopeHierarchyItemBase & {
  parent_location_id?: number | null;
};

export type TenantLocationDirectoryResponse = {
  scope_id: number;
  scope_name: string;
  scope_display_name: string;
  can_edit: boolean;
  can_create: boolean;
  item_list: TenantLocationRecord[];
};

export type TenantUnityRecord = TenantScopeHierarchyItemBase & {
  parent_unity_id?: number | null;
};

export type TenantUnityDirectoryResponse = {
  scope_id: number;
  scope_name: string;
  scope_display_name: string;
  can_edit: boolean;
  can_create: boolean;
  item_list: TenantUnityRecord[];
};

export type TenantScopeFieldRecord = {
  id: number;
  scope_id: number;
  sql_type: string;
  label_id?: number | null;
  label_name?: string | null;
};

export type TenantScopeFieldDirectoryResponse = {
  can_edit: boolean;
  item_list: TenantScopeFieldRecord[];
};

export type TenantScopeActionRecord = {
  id: number;
  scope_id: number;
  label_id?: number | null;
  label_name?: string | null;
};

export type TenantScopeActionDirectoryResponse = {
  can_edit: boolean;
  item_list: TenantScopeActionRecord[];
};

export type TenantScopeEventRecord = {
  id: number;
  location_id: number;
  unity_id: number;
  action_id: number;
  moment_utc: string;
};

export type TenantScopeEventDirectoryResponse = {
  can_edit: boolean;
  item_list: TenantScopeEventRecord[];
};

export type ScopeFormulaRecord = {
  id: number;
  action_id: number;
  step: number;
  statement: string;
};

export type ScopeFormulaListResponse = {
  can_edit: boolean;
  item_list: ScopeFormulaRecord[];
};

export type ScopeInputRecord = {
  id: number;
  event_id: number;
  field_id: number;
  value: string;
};

export type ScopeInputListResponse = {
  can_edit: boolean;
  item_list: ScopeInputRecord[];
};

export type AuditLogTableName =
  | "tenant"
  | "member"
  | "scope"
  | "location"
  | "unity"
  | "field"
  | "action"
  | "event";

export type AuditLogActionType = "I" | "U" | "D";

export type AuditLogDiffState = "not_applicable" | "ready" | "missing_previous";

export type AuditLogFieldChange = {
  field_name: string;
  previous_value: unknown;
  current_value: unknown;
};

export type AuditLogRecord = {
  id: number;
  moment_utc: string;
  actor_name?: string | null;
  action_type: AuditLogActionType;
  row_id: number;
  row: Record<string, unknown> | null;
  field_change_list: AuditLogFieldChange[];
  diff_state: AuditLogDiffState;
};

export type AuditLogListResponse = {
  item_list: AuditLogRecord[];
  has_more: boolean;
  next_offset?: number | null;
};

export type AuthSessionResponse = {
  account: {
    id: number;
    email: string;
    name: string;
    display_name: string;
    provider: string;
  };
  member: {
    id: number;
    role: number;
    status: string;
    name?: string | null;
    display_name?: string | null;
    email: string;
    current_scope_id?: number | null;
  };
  tenant: {
    id: number;
    name: string;
    display_name: string;
  };
};

export type CurrentScopeSelectionResponse = {
  current_scope_id?: number | null;
};

export type TenantSelectionSnapshot = {
  tenant_list: TenantOption[];
  invite_list: InviteOption[];
  next_action?: LoginAction | null;
};
