import { useId } from "react";

type IconProps = {
  className?: string;
};

type NavigationIconProps = IconProps & {
  kind:
    | "home"
    | "operation"
    | "record"
    | "import"
    | "process"
    | "audit";
};

function mergeClassName(className?: string, fallback = "h-5 w-5") {
  return [fallback, className].filter(Boolean).join(" ");
}

export function ValoraMark({ className }: IconProps) {
  const gradientId = useId();

  return (
    <svg
      className={mergeClassName(className, "h-11 w-11")}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="6" y1="6" x2="42" y2="42">
          <stop stopColor="#1E7CE3" />
          <stop offset="1" stopColor="#0E4C8C" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="40" height="40" rx="14" fill={`url(#${gradientId})`} />
      <path
        d="M14 15L22.6 33H26.2L34 15H29.9L24.3 28.3L18.2 15H14Z"
        fill="white"
      />
      <path
        d="M21.3 29.3H28.9"
        stroke="rgba(255,255,255,0.52)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 13.5h6.5V20H4zM13.5 4H20v8h-6.5zM13.5 15.5H20V20h-6.5zM4 4h6.5v6.5H4z" />
    </svg>
  );
}

export function OperationsIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 18.5V10m7 8.5V5.5m7 13V8.5" />
      <path d="M3.5 20.5h17" />
      <path d="M4 10l4.5-3 4 2.5L20 5.5" />
    </svg>
  );
}

export function RecordsIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="4" width="14" height="16" rx="3" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5" />
    </svg>
  );
}

export function ImportIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4.5v10" />
      <path d="M8.5 11 12 14.5 15.5 11" />
      <path d="M5 18.5h14" />
      <path d="M6.5 19.5v-2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function ProcessIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <circle cx="6" cy="17.5" r="2.5" />
      <path d="M8.5 7.5h5L16 10M8.5 16.5h5L16 14" />
    </svg>
  );
}

export function AuditIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5 18.5 6v5c0 4.2-2.4 7.2-6.5 9-4.1-1.8-6.5-4.8-6.5-9V6L12 3.5Z" />
      <path d="m9.5 12.2 1.7 1.7 3.6-4.1" />
    </svg>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 20V6.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 6.5V20M9 9h2M9 12.5h2M9 16h2M15 10h3.5a.5.5 0 0 1 .5.5V20M12 20v-3.5" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15.5 18.5v-.8a3 3 0 0 0-3-3H8.8a3 3 0 0 0-3 3v.8" />
      <circle cx="10.6" cy="9" r="3" />
      <path d="M19 18.5v-.6a2.6 2.6 0 0 0-2.1-2.5M15.8 6.6a2.6 2.6 0 0 1 0 4.8" />
    </svg>
  );
}

export function ScopeIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s6-4.4 6-10a6 6 0 1 0-12 0c0 5.6 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2 2 3.1 5.1 3.1 8.5S14 18.5 12 20.5c-2-2-3.1-5.1-3.1-8.5S10 5.5 12 3.5Z" />
    </svg>
  );
}

export function WorkflowIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="4.5" width="6" height="5" rx="1.4" />
      <rect x="14" y="9.5" width="6" height="5" rx="1.4" />
      <rect x="4" y="14.5" width="6" height="5" rx="1.4" />
      <path d="M10 7h2a2 2 0 0 1 2 2v1M10 17h2a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 3 1.8 4.8L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.2L12 3Z" />
      <path d="M18.5 14.5 19.4 17l2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.5ZM5.4 15.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z" />
    </svg>
  );
}

export function ArrowUpRightIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className, "h-4 w-4")}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 11.5 11.5 4.5" />
      <path d="M6 4.5h5.5V10" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3 2" />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 12A7.5 7.5 0 1 0 7 6.6" />
      <path d="M4.5 4.5v4h4" />
      <path d="M12 8v4l2.7 1.8" />
    </svg>
  );
}

export function PreviewIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 12s3.1-5.5 8.5-5.5 8.5 5.5 8.5 5.5-3.1 5.5-8.5 5.5S3.5 12 3.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8.3a3.5 3.5 0 0 1 7 0v2.2" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg
      className={mergeClassName(className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.2 2.3 4.8-5.1" />
    </svg>
  );
}

export function NavigationIcon({
  kind,
  className
}: NavigationIconProps) {
  switch (kind) {
    case "home":
      return <DashboardIcon className={className} />;
    case "operation":
      return <OperationsIcon className={className} />;
    case "record":
      return <RecordsIcon className={className} />;
    case "import":
      return <ImportIcon className={className} />;
    case "process":
      return <ProcessIcon className={className} />;
    case "audit":
      return <AuditIcon className={className} />;
    default:
      return <DashboardIcon className={className} />;
  }
}

