"use client";

import { RegistryFilters } from "@/lib/types";
import { Search, X, SlidersHorizontal } from "lucide-react";

interface FilterBarProps {
  filters: RegistryFilters;
  onFilterChange: (filters: RegistryFilters) => void;
  options: {
    districts: string[];
    surfaceTypes: string[];
    jurisdictions: string[];
    categories: string[];
    statuses: string[];
    bands: string[];
  };
  totalCount: number;
  filteredCount: number;
}

export default function FilterBar({
  filters,
  onFilterChange,
  options,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const hasFilters =
    filters.district ||
    filters.surfaceType ||
    filters.jurisdiction ||
    filters.category ||
    filters.status ||
    filters.band ||
    filters.search;

  const clearAll = () =>
    onFilterChange({
      search: "",
      district: "",
      surfaceType: "",
      jurisdiction: "",
      category: "",
      status: "",
      band: "",
    });

  const update = (key: keyof RegistryFilters, val: string) =>
    onFilterChange({ ...filters, [key]: val });

  const activeCount = [
    filters.district,
    filters.surfaceType,
    filters.jurisdiction,
    filters.category,
    filters.status,
    filters.band,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Search + result count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search road ID, name, district, NH number…"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            className="w-full pl-10 pr-4 h-10 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
          {filters.search && (
            <button
              onClick={() => update("search", "")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="font-bold text-gray-800">{filteredCount}</span>
          <span>of {totalCount}</span>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-gray-400 mr-1">
          <SlidersHorizontal size={13} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">Filters</span>
          {activeCount > 0 && (
            <span className="flex items-center justify-center w-4.5 h-4.5 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
              {activeCount}
            </span>
          )}
        </div>

        <ChipSelect
          label="District"
          value={filters.district}
          options={options.districts}
          onChange={(v) => update("district", v)}
        />
        <ChipSelect
          label="Surface"
          value={filters.surfaceType}
          options={options.surfaceTypes}
          onChange={(v) => update("surfaceType", v)}
        />
        <ChipSelect
          label="Jurisdiction"
          value={filters.jurisdiction}
          options={options.jurisdictions}
          onChange={(v) => update("jurisdiction", v)}
        />
        <ChipSelect
          label="Category"
          value={filters.category}
          options={options.categories}
          onChange={(v) => update("category", v)}
        />
        <ChipSelect
          label="Status"
          value={filters.status}
          options={options.statuses}
          onChange={(v) => update("status", v)}
        />
        <ChipSelect
          label="Band"
          value={filters.band}
          options={options.bands}
          onChange={(v) => update("band", v)}
        />

        {hasFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-600 bg-red-50 text-[11px] font-semibold hover:bg-red-100 transition-colors"
          >
            <X size={11} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ChipSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 px-2.5 rounded-lg border text-[12px] font-medium transition-all cursor-pointer appearance-none pr-6 ${
        value
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
      }`}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%239ca3af' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 6px center",
      }}
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
