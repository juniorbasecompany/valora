"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { TenantCalendar } from "@/component/ui/tenant-calendar";

export interface TenantDateTimePickerProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  id?: string;
  name?: string;
  showFlash?: boolean;
  locale?: string;
  periodBoundary?: "start" | "end";
}

function get12Hour(hour24: number): number {
  if (hour24 === 0 || hour24 === 12) {
    return 0;
  }
  if (hour24 > 12) {
    return hour24 - 12;
  }
  return hour24;
}

function getAmPm(hour24: number): "AM" | "PM" {
  return hour24 >= 12 ? "PM" : "AM";
}

function formatDateTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

export function TenantDateTimePicker({
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  minDate,
  maxDate,
  id,
  name,
  showFlash = false,
  locale = "pt-BR",
  periodBoundary
}: TenantDateTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => value || new Date());
  const [tempDate, setTempDate] = useState<Date | null>(value);
  const [tempHour12, setTempHour12] = useState(() => {
    if (value) {
      return get12Hour(value.getHours());
    }
    return get12Hour(new Date().getHours());
  });
  const [tempMinuteTens, setTempMinuteTens] = useState(() => {
    if (value) {
      return Math.floor(value.getMinutes() / 10) * 10;
    }
    return Math.floor(new Date().getMinutes() / 10) * 10;
  });
  const [tempMinuteUnits, setTempMinuteUnits] = useState(() => {
    if (value) {
      return value.getMinutes() % 10;
    }
    return new Date().getMinutes() % 10;
  });
  const [tempAmPm, setTempAmPm] = useState<"AM" | "PM">(() => {
    if (value) {
      return getAmPm(value.getHours());
    }
    return getAmPm(new Date().getHours());
  });
  const [isMounted, setIsMounted] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const calculatePopoverPosition = () => {
    if (!containerRef.current) {
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const popoverWidth = 700;
    const popoverPadding = 8;
    const viewportWidth = window.innerWidth;
    const leftCandidate = rect.left;
    const leftMax = viewportWidth - popoverWidth - popoverPadding;
    const left = Math.max(popoverPadding, Math.min(leftCandidate, leftMax));
    setPopoverStyle({
      top: Math.round(rect.bottom + 4),
      left: Math.round(left)
    });
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    calculatePopoverPosition();
    window.addEventListener("resize", calculatePopoverPosition);
    window.addEventListener("scroll", calculatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", calculatePopoverPosition);
      window.removeEventListener("scroll", calculatePopoverPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (value) {
      const next = new Date(value);
      setTempDate(next);
      setTempHour12(get12Hour(next.getHours()));
      setTempMinuteTens(Math.floor(next.getMinutes() / 10) * 10);
      setTempMinuteUnits(next.getMinutes() % 10);
      setTempAmPm(getAmPm(next.getHours()));
      return;
    }
    const now = new Date();
    setTempDate(now);
    setTempHour12(get12Hour(now.getHours()));
    setTempMinuteTens(Math.floor(now.getMinutes() / 10) * 10);
    setTempMinuteUnits(now.getMinutes() % 10);
    setTempAmPm(getAmPm(now.getHours()));
  }, [isOpen, value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const targetNode = event.target as Node;
      const clickedInsideInput =
        containerRef.current && containerRef.current.contains(targetNode);
      const clickedInsidePopover =
        popoverRef.current && popoverRef.current.contains(targetNode);
      if (!clickedInsideInput && !clickedInsidePopover) {
        setIsOpen(false);
      }
    }
    if (!isOpen) {
      return;
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const displayPlaceholder =
    placeholder || (locale.startsWith("pt") ? "dd/mm/aaaa --:--" : "mm/dd/yyyy --:--");
  const displayValue = value ? formatDateTime(value, locale) : "";

  const getDateForSelectedDay = (day: number) => {
    if (!tempDate) {
      return new Date(displayMonth.getFullYear(), displayMonth.getMonth(), day);
    }
    const next = new Date(tempDate);
    next.setFullYear(displayMonth.getFullYear());
    next.setMonth(displayMonth.getMonth());
    next.setDate(day);
    return next;
  };

  const applyStartOfDayTempTime = () => {
    setTempHour12(0);
    setTempMinuteTens(0);
    setTempMinuteUnits(0);
    setTempAmPm("AM");
  };

  const applyEndOfDayTempTime = () => {
    setTempHour12(11);
    setTempMinuteTens(50);
    setTempMinuteUnits(9);
    setTempAmPm("PM");
  };

  const handleDateSelect = (day: number) => {
    setTempDate(getDateForSelectedDay(day));
    if (periodBoundary === "end") {
      applyEndOfDayTempTime();
      return;
    }
    if (periodBoundary === "start") {
      applyStartOfDayTempTime();
    }
  };

  const handleConfirm = () => {
    if (!tempDate) {
      return;
    }
    const finalDate = new Date(tempDate);
    let hour24 = tempHour12;
    if (tempAmPm === "PM") {
      hour24 = tempHour12 === 0 ? 12 : tempHour12 + 12;
    } else {
      hour24 = tempHour12;
    }
    const totalMinutes = tempMinuteTens + tempMinuteUnits;
    finalDate.setHours(hour24);
    finalDate.setMinutes(totalMinutes);
    finalDate.setSeconds(0);
    finalDate.setMilliseconds(0);
    onChange(finalDate);
    setIsOpen(false);
  };

  const handleDateDoubleClick = (day: number) => {
    const selectedDate = getDateForSelectedDay(day);
    setTempDate(selectedDate);
    if (periodBoundary === "end") {
      applyEndOfDayTempTime();
      const finalDate = new Date(selectedDate);
      finalDate.setHours(23);
      finalDate.setMinutes(59);
      finalDate.setSeconds(0);
      finalDate.setMilliseconds(0);
      onChange(finalDate);
      setIsOpen(false);
      return;
    }
    if (periodBoundary === "start") {
      applyStartOfDayTempTime();
      const finalDate = new Date(selectedDate);
      finalDate.setHours(0);
      finalDate.setMinutes(0);
      finalDate.setSeconds(0);
      finalDate.setMilliseconds(0);
      onChange(finalDate);
      setIsOpen(false);
      return;
    }

    setTimeout(() => {
      const finalDate = new Date(selectedDate);
      finalDate.setHours(tempAmPm === "PM" ? (tempHour12 === 0 ? 12 : tempHour12 + 12) : tempHour12);
      finalDate.setMinutes(tempMinuteTens + tempMinuteUnits);
      finalDate.setSeconds(0);
      finalDate.setMilliseconds(0);
      onChange(finalDate);
      setIsOpen(false);
    }, 0);
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(null);
    setIsOpen(false);
  };

  const handleCalendarClear = () => {
    onChange(null);
    setIsOpen(false);
  };

  const handleCalendarToday = () => {
    const now = new Date();
    setTempDate(now);
    setDisplayMonth(now);
  };

  const hours12 = Array.from({ length: 12 }, (_, index) => index);
  const minuteTens = [0, 10, 20, 30, 40, 50];
  const minuteUnits = Array.from({ length: 10 }, (_, index) => index);
  const amPmOptions: ("AM" | "PM")[] = ["AM", "PM"];

  return (
    <div ref={containerRef} className="relative w-full">
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      ) : null}

      <div className="relative">
        <input
          type="text"
          readOnly
          value={displayValue}
          placeholder={displayPlaceholder}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((previous) => !previous)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!disabled) {
                setIsOpen((previous) => !previous);
              }
            }
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          className={`w-full px-3 py-2 pr-20 border rounded-md shadow-sm focus:outline-none focus:ring-[0.5px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${showFlash
            ? "border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500"
            : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
            }`}
          id={id}
          name={name}
          aria-label={label || "Selecionar data e hora"}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value ? (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
              aria-label="Limpar data e hora"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => !disabled && setIsOpen((previous) => !previous)}
            disabled={disabled}
            className="p-1 text-gray-400 hover:text-gray-600 focus:outline-none disabled:opacity-50"
            aria-label="Abrir calendário"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      {isOpen && isMounted ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[130] bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex flex-col lg:flex-row gap-6 max-w-[calc(100vw-2rem)]"
          style={{ top: popoverStyle.top, left: popoverStyle.left }}
        >
          <TenantCalendar
            selectedDate={value}
            tempDate={tempDate}
            displayMonth={displayMonth}
            onDisplayMonthChange={setDisplayMonth}
            onDateSelect={handleDateSelect}
            onDateDoubleClick={handleDateDoubleClick}
            onClear={handleCalendarClear}
            onToday={handleCalendarToday}
            minDate={minDate}
            maxDate={maxDate}
            width="w-full lg:w-[380px] min-w-[280px]"
            showActionButtons
            locale={locale}
            headerContent={
              tempDate ? (
                <div className="text-base font-medium text-blue-600">
                  {(() => {
                    const preview = new Date(tempDate);
                    const hour24 = tempAmPm === "PM"
                      ? (tempHour12 === 0 ? 12 : tempHour12 + 12)
                      : tempHour12;
                    const minute = tempMinuteTens + tempMinuteUnits;
                    preview.setHours(hour24);
                    preview.setMinutes(minute);
                    preview.setSeconds(0);
                    preview.setMilliseconds(0);
                    return formatDateTime(preview, locale);
                  })()}
                </div>
              ) : null
            }
          />

          <div className="w-full lg:w-[270px] flex-shrink-0 pt-4 lg:pt-0 lg:pl-6 flex flex-col relative border-t lg:border-t-0 lg:border-l border-gray-200">
            <div className="flex gap-3 items-start justify-center">
              <div className="flex flex-col items-center relative">
                <div className="text-xs text-gray-500 absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-1">hora</div>
                <div className="border border-gray-300 rounded w-14 pt-2 px-1 pb-1">
                  {hours12.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      onClick={() => setTempHour12(hour)}
                      className={`w-full py-2 text-sm rounded-md ${tempHour12 === hour
                        ? "bg-gray-200 text-gray-800"
                        : "text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                      {String(hour).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center relative">
                <div className="text-xs text-gray-500 absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-1">minuto</div>
                <div className="border border-gray-300 rounded p-1 pt-2 flex gap-1">
                  <div className="flex flex-col items-center">
                    <div className="rounded w-12">
                      {minuteTens.map((tens) => (
                        <button
                          key={tens}
                          type="button"
                          onClick={() => setTempMinuteTens(tens)}
                          className={`w-full py-2 text-sm rounded-md ${tempMinuteTens === tens
                            ? "bg-gray-200 text-gray-800"
                            : "text-gray-700 hover:bg-gray-100"
                            }`}
                        >
                          {String(tens).padStart(2, "0")}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="rounded w-12">
                      {minuteUnits.map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => setTempMinuteUnits(unit)}
                          className={`w-full py-2 text-sm rounded-md ${tempMinuteUnits === unit
                            ? "bg-gray-200 text-gray-800"
                            : "text-gray-700 hover:bg-gray-100"
                            }`}
                        >
                          {String(unit)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="rounded w-12 pt-[9px]">
                  {amPmOptions.map((ampm) => (
                    <button
                      key={ampm}
                      type="button"
                      onClick={() => setTempAmPm(ampm)}
                      className={`w-full py-2 text-sm rounded-md ${tempAmPm === ampm
                        ? "bg-gray-200 text-gray-800"
                        : "text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                      {ampm}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {tempDate ? (
              <div className="absolute bottom-0 right-0">
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="ui-button-primary"
                >
                  Ok
                </button>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
