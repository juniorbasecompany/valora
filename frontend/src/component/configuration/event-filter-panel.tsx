"use client";

import { HierarchyDropdownField } from "@/component/configuration/hierarchy-dropdown-field";
import { TenantDateTimePicker } from "@/component/ui/tenant-date-time-picker";
import {
  DirectoryFilterCard,
  DirectoryFilterPanel,
  DirectoryFilterSelectField
} from "@/component/configuration/directory-filter-panel";
import type { TenantLocationRecord, TenantUnityRecord } from "@/lib/auth/types";

type EventFilterOption = {
  id: number;
  label: string;
};

type EventFilterPanelCopy = {
  momentFromLabel: string;
  momentToLabel: string;
  locationLabel: string;
  unityLabel: string;
  actionLabel: string;
  allLabel: string;
  allAriaLabel: string;
  confirmLabel: string;
};

type EventFilterPanelProps = {
  locale: string;
  copy: EventFilterPanelCopy;
  filterMomentFromInput: string;
  filterMomentToInput: string;
  filterLocationIdList: number[];
  filterUnityIdList: number[];
  filterActionId: number | null;
  locationItemList: TenantLocationRecord[];
  unityItemList: TenantUnityRecord[];
  actionOptionList: EventFilterOption[];
  onFilterMomentFromChange: (value: Date | null) => void;
  onFilterMomentToChange: (value: Date | null) => void;
  onFilterLocationChange: (valueList: number[]) => void;
  onFilterUnityChange: (valueList: number[]) => void;
  onFilterActionChange: (value: string) => void;
};

export function EventFilterPanel({
  locale,
  copy,
  filterMomentFromInput,
  filterMomentToInput,
  filterLocationIdList,
  filterUnityIdList,
  filterActionId,
  locationItemList,
  unityItemList,
  actionOptionList,
  onFilterMomentFromChange,
  onFilterMomentToChange,
  onFilterLocationChange,
  onFilterUnityChange,
  onFilterActionChange
}: EventFilterPanelProps) {
  return (
    <DirectoryFilterPanel>
      <DirectoryFilterCard>
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="event-filter-moment-from">
            {copy.momentFromLabel}
          </label>
          <TenantDateTimePicker
            id="event-filter-moment-from"
            value={filterMomentFromInput ? new Date(filterMomentFromInput) : null}
            onChange={onFilterMomentFromChange}
            locale={locale}
            hidePlaceholder
            periodBoundary="start"
          />
        </div>
      </DirectoryFilterCard>

      <DirectoryFilterCard>
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="event-filter-moment-to">
            {copy.momentToLabel}
          </label>
          <TenantDateTimePicker
            id="event-filter-moment-to"
            value={filterMomentToInput ? new Date(filterMomentToInput) : null}
            onChange={onFilterMomentToChange}
            locale={locale}
            hidePlaceholder
            periodBoundary="end"
          />
        </div>
      </DirectoryFilterCard>

      <DirectoryFilterCard>
        <HierarchyDropdownField
          id="event-filter-location"
          label={copy.locationLabel}
          itemList={locationItemList}
          selectedValueList={filterLocationIdList}
          onChange={onFilterLocationChange}
          getParentId={(item) => item.parent_location_id ?? null}
          allLabel={copy.allLabel}
          confirmLabel={copy.confirmLabel}
        />
      </DirectoryFilterCard>

      <DirectoryFilterCard>
        <HierarchyDropdownField
          id="event-filter-unity"
          label={copy.unityLabel}
          itemList={unityItemList}
          selectedValueList={filterUnityIdList}
          onChange={onFilterUnityChange}
          getParentId={(item) => item.parent_unity_id ?? null}
          allLabel={copy.allLabel}
          confirmLabel={copy.confirmLabel}
        />
      </DirectoryFilterCard>

      <DirectoryFilterCard>
        <DirectoryFilterSelectField
          id="event-filter-action"
          label={copy.actionLabel}
          value={filterActionId == null ? "" : String(filterActionId)}
          onChange={onFilterActionChange}
          allAriaLabel={copy.allAriaLabel}
          optionList={actionOptionList.map((item) => ({
            value: String(item.id),
            label: item.label
          }))}
        />
      </DirectoryFilterCard>
    </DirectoryFilterPanel>
  );
}
