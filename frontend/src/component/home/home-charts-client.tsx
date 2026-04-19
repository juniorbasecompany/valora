"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  DirectoryFilterCard,
  DirectoryFilterPanel
} from "@/component/configuration/directory-filter-panel";
import {
  toggleDirectoryFilterPanelVisible,
  useDirectoryFilterPanelVisible
} from "@/component/configuration/directory-filter-visibility";
import { ConfigurationDirectoryFilterTopSlot } from "@/component/configuration/configuration-directory-filter-top-slot";
import type {
  ScopeHomeChartSeriesResponse,
  TenantScopeFieldDirectoryResponse,
  TenantScopeRecord,
  TenantUnityDirectoryResponse
} from "@/lib/auth/types";
import {
  useStoredHomeChartId,
  writeStoredHomeChartId,
  type HomeChartFieldSlot
} from "@/component/home/home-chart-filter-storage";

const HOME_DASHBOARD_FILTER_SEGMENT = "home-dashboard" as const;

export type HomeChartsCopy = {
  plantelTitle: string;
  plantelDescription: string;
  mortalidadeTitle: string;
  mortalidadeDescription: string;
  unityLabel: string;
  plantelFactLabel: string;
  plantelStdLabel: string;
  mortalidadeFactLabel: string;
  mortalidadeStdLabel: string;
  legendFact: string;
  legendStd: string;
  empty: string;
  incompleteSelection: string;
  loadError: string;
  filterToggleAriaLabel: string;
  filterToggleLabel: string;
  ageAxisLabel: string;
  emptyScope: string;
  filterAllAria: string;
};

export type HomeChartsClientProps = {
  currentScope: TenantScopeRecord | null;
  hasAnyScope: boolean;
  unityDirectory: TenantUnityDirectoryResponse | null;
  fieldDirectory: TenantScopeFieldDirectoryResponse | null;
  copy: HomeChartsCopy;
};

type ChartPoint = {
  age: number;
  fact: number | null;
  std: number | null;
};

function parseNumericValue(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeSeriesIntoPoints(
  factPointList: Array<{ age: number; numeric_value: number | string }>,
  stdPointList: Array<{ age: number; numeric_value: number | string }>
): ChartPoint[] {
  const pointByAge = new Map<number, ChartPoint>();
  for (const point of factPointList) {
    const fact = parseNumericValue(point.numeric_value);
    pointByAge.set(point.age, { age: point.age, fact, std: null });
  }
  for (const point of stdPointList) {
    const std = parseNumericValue(point.numeric_value);
    const existing = pointByAge.get(point.age);
    if (existing) {
      existing.std = std;
    } else {
      pointByAge.set(point.age, { age: point.age, fact: null, std });
    }
  }
  return [...pointByAge.values()].sort((left, right) => left.age - right.age);
}

export function HomeChartsClient({
  currentScope,
  hasAnyScope,
  unityDirectory,
  fieldDirectory,
  copy
}: HomeChartsClientProps) {
  const filterVisible = useDirectoryFilterPanelVisible(HOME_DASHBOARD_FILTER_SEGMENT);

  const unityList = useMemo(
    () => unityDirectory?.item_list ?? [],
    [unityDirectory]
  );
  const fieldList = useMemo(
    () => fieldDirectory?.item_list ?? [],
    [fieldDirectory]
  );

  const unityIdSet = useMemo(
    () => new Set(unityList.map((row) => row.id)),
    [unityList]
  );
  const fieldIdSet = useMemo(
    () => new Set(fieldList.map((row) => row.id)),
    [fieldList]
  );

  const scopeId = currentScope?.id ?? null;
  const unityId = useStoredHomeChartId(scopeId, "unity", unityIdSet);
  const plantelFactFieldId = useStoredHomeChartId(scopeId, "plantelFact", fieldIdSet);
  const plantelStdFieldId = useStoredHomeChartId(scopeId, "plantelStd", fieldIdSet);
  const mortalidadeFactFieldId = useStoredHomeChartId(
    scopeId,
    "mortalidadeFact",
    fieldIdSet
  );
  const mortalidadeStdFieldId = useStoredHomeChartId(
    scopeId,
    "mortalidadeStd",
    fieldIdSet
  );

  const [seriesResponse, setSeriesResponse] = useState<ScopeHomeChartSeriesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const handleSlotChange = useCallback(
    (slot: HomeChartFieldSlot, value: number | null) => {
      if (scopeId == null) {
        return;
      }
      writeStoredHomeChartId(scopeId, slot, value);
    },
    [scopeId]
  );

  const selectedFieldIdList = useMemo(() => {
    const list: number[] = [];
    for (const id of [
      plantelFactFieldId,
      plantelStdFieldId,
      mortalidadeFactFieldId,
      mortalidadeStdFieldId
    ]) {
      if (id != null && !list.includes(id)) {
        list.push(id);
      }
    }
    return list;
  }, [
    plantelFactFieldId,
    plantelStdFieldId,
    mortalidadeFactFieldId,
    mortalidadeStdFieldId
  ]);

  const selectedFieldIdListKey = useMemo(
    () => selectedFieldIdList.join(","),
    [selectedFieldIdList]
  );

  useEffect(() => {
    if (scopeId == null || unityId == null || selectedFieldIdList.length === 0) {
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setLoadErrorMessage(null);
    const query = new URLSearchParams();
    query.set("unity_id", String(unityId));
    for (const fieldId of selectedFieldIdList) {
      query.append("field_id_list", String(fieldId));
    }
    fetch(
      `/api/auth/tenant/current/scopes/${scopeId}/home/chart-series?${query.toString()}`,
      { method: "GET", signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return (await response.json()) as ScopeHomeChartSeriesResponse;
      })
      .then((data) => {
        setSeriesResponse(data);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setSeriesResponse(null);
        setIsLoading(false);
        setLoadErrorMessage(
          error instanceof Error && error.message.trim()
            ? error.message
            : copy.loadError
        );
      });
    return () => {
      controller.abort();
    };
    // selectedFieldIdListKey é a identidade estável da lista de campos;
    // selectedFieldIdList (array) é só o consumidor iterável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId, unityId, selectedFieldIdListKey, copy.loadError]);

  const pointListByFieldId = useMemo(() => {
    const map = new Map<number, Array<{ age: number; numeric_value: number | string }>>();
    for (const series of seriesResponse?.series_list ?? []) {
      map.set(series.field_id, series.point_list);
    }
    return map;
  }, [seriesResponse]);

  const plantelChartData = useMemo(
    () =>
      mergeSeriesIntoPoints(
        plantelFactFieldId != null ? pointListByFieldId.get(plantelFactFieldId) ?? [] : [],
        plantelStdFieldId != null ? pointListByFieldId.get(plantelStdFieldId) ?? [] : []
      ),
    [plantelFactFieldId, plantelStdFieldId, pointListByFieldId]
  );

  const mortalidadeChartData = useMemo(
    () =>
      mergeSeriesIntoPoints(
        mortalidadeFactFieldId != null
          ? pointListByFieldId.get(mortalidadeFactFieldId) ?? []
          : [],
        mortalidadeStdFieldId != null
          ? pointListByFieldId.get(mortalidadeStdFieldId) ?? []
          : []
      ),
    [mortalidadeFactFieldId, mortalidadeStdFieldId, pointListByFieldId]
  );

  if (!currentScope) {
    return (
      <section className="ui-panel ui-empty-panel">
        {hasAnyScope ? copy.empty : copy.emptyScope}
      </section>
    );
  }

  const unityOptionList = unityList.map((row) => ({
    id: row.id,
    label: row.name.trim() || `#${row.id}`
  }));
  const fieldOptionList = fieldList.map((row) => ({
    id: row.id,
    label: row.label_name?.trim() || `#${row.id}`
  }));

  const filterPanel = (
    <DirectoryFilterPanel>
      <DirectoryFilterCard>
        <SelectFilter
          id="home-chart-unity"
          label={copy.unityLabel}
          value={unityId}
          optionList={unityOptionList}
          allAriaLabel={copy.filterAllAria}
          onChange={(nextValue) => handleSlotChange("unity", nextValue)}
        />
      </DirectoryFilterCard>
      <DirectoryFilterCard>
        <SelectFilter
          id="home-chart-plantel-fact"
          label={copy.plantelFactLabel}
          value={plantelFactFieldId}
          optionList={fieldOptionList}
          allAriaLabel={copy.filterAllAria}
          onChange={(nextValue) => handleSlotChange("plantelFact", nextValue)}
        />
      </DirectoryFilterCard>
      <DirectoryFilterCard>
        <SelectFilter
          id="home-chart-plantel-std"
          label={copy.plantelStdLabel}
          value={plantelStdFieldId}
          optionList={fieldOptionList}
          allAriaLabel={copy.filterAllAria}
          onChange={(nextValue) => handleSlotChange("plantelStd", nextValue)}
        />
      </DirectoryFilterCard>
      <DirectoryFilterCard>
        <SelectFilter
          id="home-chart-mortalidade-fact"
          label={copy.mortalidadeFactLabel}
          value={mortalidadeFactFieldId}
          optionList={fieldOptionList}
          allAriaLabel={copy.filterAllAria}
          onChange={(nextValue) => handleSlotChange("mortalidadeFact", nextValue)}
        />
      </DirectoryFilterCard>
      <DirectoryFilterCard>
        <SelectFilter
          id="home-chart-mortalidade-std"
          label={copy.mortalidadeStdLabel}
          value={mortalidadeStdFieldId}
          optionList={fieldOptionList}
          allAriaLabel={copy.filterAllAria}
          onChange={(nextValue) => handleSlotChange("mortalidadeStd", nextValue)}
        />
      </DirectoryFilterCard>
    </DirectoryFilterPanel>
  );

  const plantelIsSelected =
    unityId != null && plantelFactFieldId != null && plantelStdFieldId != null;
  const mortalidadeIsSelected =
    unityId != null && mortalidadeFactFieldId != null && mortalidadeStdFieldId != null;

  return (
    <section className="ui-page-stack">
      <div className="ui-configuration-directory-list-toolbar">
        <div className="ui-configuration-directory-list-toolbar-leading">
          <button
            type="button"
            role="switch"
            aria-checked={filterVisible}
            aria-label={copy.filterToggleAriaLabel}
            className="ui-directory-filter-visibility-switch"
            onClick={() => toggleDirectoryFilterPanelVisible(HOME_DASHBOARD_FILTER_SEGMENT)}
          >
            <span
              className="ui-directory-filter-visibility-switch-track"
              data-on={filterVisible ? "true" : undefined}
            >
              <span className="ui-directory-filter-visibility-switch-thumb" aria-hidden />
            </span>
          </button>
          <span className="ui-configuration-directory-list-toolbar-filter-label">
            {copy.filterToggleLabel}
          </span>
        </div>
      </div>

      <ConfigurationDirectoryFilterTopSlot
        filter={{
          panel: filterPanel,
          storageSegment: HOME_DASHBOARD_FILTER_SEGMENT
        }}
      />

      <div className="ui-grid-cards-2">
        <ChartPanel
          title={copy.plantelTitle}
          description={copy.plantelDescription}
          data={plantelChartData}
          isSelected={plantelIsSelected}
          isLoading={isLoading}
          loadErrorMessage={loadErrorMessage}
          emptyMessage={copy.incompleteSelection}
          legendFactLabel={copy.legendFact}
          legendStdLabel={copy.legendStd}
          ageAxisLabel={copy.ageAxisLabel}
        />
        <ChartPanel
          title={copy.mortalidadeTitle}
          description={copy.mortalidadeDescription}
          data={mortalidadeChartData}
          isSelected={mortalidadeIsSelected}
          isLoading={isLoading}
          loadErrorMessage={loadErrorMessage}
          emptyMessage={copy.incompleteSelection}
          legendFactLabel={copy.legendFact}
          legendStdLabel={copy.legendStd}
          ageAxisLabel={copy.ageAxisLabel}
        />
      </div>
    </section>
  );
}

type SelectFilterProps = {
  id: string;
  label: string;
  value: number | null;
  optionList: { id: number; label: string }[];
  onChange: (nextValue: number | null) => void;
  allAriaLabel: string;
};

function SelectFilter({
  id,
  label,
  value,
  optionList,
  onChange,
  allAriaLabel
}: SelectFilterProps) {
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="ui-input ui-input-select"
        value={value == null ? "" : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (!Number.isInteger(parsed) || parsed < 1) {
            onChange(null);
            return;
          }
          onChange(parsed);
        }}
      >
        <option value="" aria-label={allAriaLabel}></option>
        {optionList.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type ChartPanelProps = {
  title: string;
  description: string;
  data: ChartPoint[];
  isSelected: boolean;
  isLoading: boolean;
  loadErrorMessage: string | null;
  emptyMessage: string;
  legendFactLabel: string;
  legendStdLabel: string;
  ageAxisLabel: string;
};

function ChartPanel({
  title,
  description,
  data,
  isSelected,
  isLoading,
  loadErrorMessage,
  emptyMessage,
  legendFactLabel,
  legendStdLabel,
  ageAxisLabel
}: ChartPanelProps) {
  const hasData = isSelected && data.length > 0;
  const emptyMessageToShow = !isSelected
    ? emptyMessage
    : loadErrorMessage ?? (isLoading ? null : emptyMessage);

  return (
    <article className="ui-panel ui-panel-body ui-panel-chart">
      <header>
        <h2 className="ui-home-chart-title">{title}</h2>
        <p className="ui-home-chart-description">{description}</p>
      </header>
      {hasData ? (
        <div className="ui-home-chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="age"
                tickMargin={6}
                label={{ value: ageAxisLabel, position: "insideBottom", offset: -2 }}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="fact" name={legendFactLabel} fill="var(--color-accent)" />
              <Line
                type="monotone"
                dataKey="std"
                name={legendStdLabel}
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="ui-home-chart-empty" role={loadErrorMessage ? "alert" : undefined}>
          {emptyMessageToShow}
        </div>
      )}
    </article>
  );
}
