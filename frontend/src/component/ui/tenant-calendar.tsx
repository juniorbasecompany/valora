"use client";

import type { ReactNode } from "react";

export interface TenantCalendarProps {
  selectedDate: Date | null;
  tempDate: Date | null;
  displayMonth: Date;
  onDisplayMonthChange: (date: Date) => void;
  onDateSelect: (day: number) => void;
  onDateDoubleClick?: (day: number) => void;
  onClear?: () => void;
  onToday?: () => void;
  minDate?: Date;
  maxDate?: Date;
  width?: string;
  showActionButtons?: boolean;
  headerContent?: ReactNode;
  footerContent?: ReactNode;
  locale?: string;
}

function normalizeDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function weekdayShortList(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const baseSunday = new Date(Date.UTC(2024, 0, 7));
  return Array.from({ length: 7 }, (_, index) => {
    const next = new Date(baseSunday);
    next.setUTCDate(baseSunday.getUTCDate() + index);
    return formatter.format(next);
  });
}

export function TenantCalendar({
  selectedDate,
  tempDate,
  displayMonth,
  onDisplayMonthChange,
  onDateSelect,
  onDateDoubleClick,
  onClear,
  onToday,
  minDate,
  maxDate,
  width = "w-[380px]",
  showActionButtons = true,
  headerContent,
  footerContent,
  locale = "pt-BR"
}: TenantCalendarProps) {
  const goToPreviousMonth = () => {
    onDisplayMonthChange(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    onDisplayMonthChange(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1));
  };

  const goToPreviousYear = () => {
    onDisplayMonthChange(new Date(displayMonth.getFullYear() - 1, displayMonth.getMonth(), 1));
  };

  const goToNextYear = () => {
    onDisplayMonthChange(new Date(displayMonth.getFullYear() + 1, displayMonth.getMonth(), 1));
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return firstDay.getDay();
  };

  const isSelected = (day: number) => {
    const dateToCheck = tempDate ?? selectedDate;
    if (!dateToCheck) {
      return false;
    }
    return (
      day === dateToCheck.getDate() &&
      displayMonth.getMonth() === dateToCheck.getMonth() &&
      displayMonth.getFullYear() === dateToCheck.getFullYear()
    );
  };

  const minDateOnly = minDate ? normalizeDate(minDate) : null;
  const maxDateOnly = maxDate ? normalizeDate(maxDate) : null;

  const isDisabled = (day: number) => {
    const date = normalizeDate(new Date(displayMonth.getFullYear(), displayMonth.getMonth(), day));
    if (minDateOnly && date < minDateOnly) {
      return true;
    }
    if (maxDateOnly && date > maxDateOnly) {
      return true;
    }
    return false;
  };

  const daysInMonth = getDaysInMonth(displayMonth);
  const firstDay = getFirstDayOfMonth(displayMonth);
  const dayList: (number | null)[] = [];

  for (let index = 0; index < firstDay; index += 1) {
    dayList.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    dayList.push(day);
  }

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long" }).format(displayMonth);
  const dayNameList = weekdayShortList(locale);

  return (
    <div className={`${width} flex-shrink-0 flex flex-col relative`}>
      {headerContent ? (
        <div className="mb-3">
          {headerContent}
        </div>
      ) : null}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Mês anterior"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <span className="text-sm text-gray-700 min-w-[7rem] text-center capitalize">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={goToNextMonth}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Próximo mês"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPreviousYear}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Ano anterior"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <span className="text-sm text-gray-700 min-w-[3.5rem] text-center">
            {displayMonth.getFullYear()}
          </span>
          <button
            type="button"
            onClick={goToNextYear}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Próximo ano"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNameList.map((dayName, index) => (
          <div key={`${dayName}-${index}`} className="text-center text-xs font-medium text-gray-500 py-1">
            {dayName}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 mb-4">
        {dayList.map((day, index) => {
          if (day == null) {
            return <div key={index} className="py-2" />;
          }

          const disabled = isDisabled(day);
          const selected = isSelected(day);

          return (
            <button
              key={index}
              type="button"
              onClick={() => !disabled && onDateSelect(day)}
              onDoubleClick={() => !disabled && onDateDoubleClick?.(day)}
              disabled={disabled}
              className={`w-full py-2 px-1 text-sm rounded-md min-w-[48px] ${selected
                ? "bg-gray-200 text-gray-800"
                : disabled
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-700 hover:bg-gray-100"
                }`}
              aria-label={`Selecionar dia ${day}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {showActionButtons ? (
        <div className="flex justify-between items-center">
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="py-1 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
            >
              Limpar
            </button>
          ) : <span />}
          {onToday ? (
            <button
              type="button"
              onClick={onToday}
              className="py-1 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
            >
              Hoje
            </button>
          ) : null}
        </div>
      ) : null}

      {footerContent ? (
        <div className="absolute bottom-0 left-0">
          {footerContent}
        </div>
      ) : null}
    </div>
  );
}
