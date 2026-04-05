import { useId } from "react";

type IconProps = {
    className?: string;
};

type NavigationIconProps = IconProps & {
    kind: "home" | "location" | "item" | "field" | "action" | "unity" | "event";
};

function mergeClassName(className?: string, fallback = "ui-icon") {
    return [fallback, className].filter(Boolean).join(" ");
}

export function ValoraMark({ className }: IconProps) {
    const gradientId = useId();

    return (
        <svg
            className={mergeClassName(className, "ui-mark-size")}
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
            <rect x="4" y="4" width="40" height="40" rx="0" fill={`url(#${gradientId})`} />
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
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            {/* Painel: coluna de resumo + widgets com série e barras */}
            <rect x="3" y="3.5" width="9.5" height="17" rx="1" />
            <rect x="14.5" y="3.5" width="6.5" height="7.5" rx="1" />
            <rect x="14.5" y="12.5" width="6.5" height="8" rx="1" />
            <path d="M5.2 7.8h5.2M5.2 10.8h4M5.2 13.8h5.2" />
            <path d="m15.3 8.9 1.3-1.2 1.2.6 1.4-1.6 1.3.4" />
            <path d="M15.8 17v3M17.4 15.8v4.2M19 16.6v3.4" />
        </svg>
    );
}

export function LocationIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M12 21s-6.5-4.4-6.5-10a6.5 6.5 0 0 1 13 0c0 5.6-6.5 10-6.5 10Z" />
            <circle cx="12" cy="11" r="2.25" />
        </svg>
    );
}

export function ItemIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
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
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M5 20V6.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 6.5V20M9 9h2M9 12.5h2M9 16h2M15 10h3.5a.5.5 0 0 1 .5.5V20M12 20v-3.5" />
        </svg>
    );
}

export function UnityIcon({ className }: IconProps) {
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
            <path d="m12 2.8 3.7 2.2V9L12 11.2 8.3 9V5Z" />
            <path d="m8.3 5 3.7 2.2L15.7 5" />
            <path d="M12 7.2v4" />
            <path d="m4.1 10.1 3.7 2.2v4L4.1 18.5.4 16.3v-4Z" />
            <path d="m.4 12.3 3.7 2.2 3.7-2.2" />
            <path d="M4.1 14.5v4" />
            <path d="m19.9 10.1 3.7 2.2v4l-3.7 2.2-3.7-2.2v-4Z" />
            <path d="m16.2 12.3 3.7 2.2 3.7-2.2" />
            <path d="M19.9 14.5v4" />
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
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <rect x="4" y="4.5" width="6" height="5" rx="0" />
            <rect x="14" y="9.5" width="6" height="5" rx="0" />
            <rect x="4" y="14.5" width="6" height="5" rx="0" />
            <path d="M10 7h2a2 2 0 0 1 2 2v1M10 17h2a2 2 0 0 0 2-2v-1" />
        </svg>
    );
}

/** Marcos ao longo do fluxo: traçado espelhado; bandeira no canto superior direito com pano a abrir para a direita (vinco à direita). */
export function MilestonePathIcon({ className }: IconProps) {
    const sw = 2;
    const nodeR = 1.2;
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <g transform="translate(24, 0) scale(-1, 1)">
                {/*
                  Só o caminho e os nós: espelho x→24−x. Segmento superior estendido (L 3.25 10) para, após o espelho,
                  encontrar o mastro da bandeira. Níveis y=18 / 14 / 10; r=2; cúbicas com κ*r.
                */}
                <path d="M 20 18 L 5 18 A 2 2 0 0 1 3 16 A 2 2 0 0 1 5 14 L 20 14 C 21.105 14 22 13.105 22 12 C 22 10.895 21.105 10 20 10 L 3.25 10" />
                <circle cx="20" cy="18" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="12.5" cy="18" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="5" cy="18" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="5" cy="14" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="12.5" cy="14" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="20" cy="14" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="20" cy="10" r={nodeR} fill="currentColor" stroke="none" />
            </g>
            {/*
              Mesma geometria canónica do pano (vinco na borda direita), transladada para o canto superior direito;
              não é espelho em x (antes o mastro à direita fazia o pano apontar para a esquerda).
            */}
            <path d="M 14.95 2.1 L 20.3 2.1 L 18.65 4.05 L 20.3 6 L 14.95 6 Z" />
            <line x1="14.5" y1="10.35" x2="14.5" y2="1.65" />
        </svg>
    );
}

/** Cópia do ícone de action para uso exclusivo de event. */
export function EventPathIcon({ className }: IconProps) {
    const sw = 2;
    const nodeR = 1.2;
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <g transform="translate(24, 0) scale(-1, 1)">
                <path d="M 20 18 L 5 18 A 2 2 0 0 1 3 16 A 2 2 0 0 1 5 14 L 20 14 C 21.105 14 22 13.105 22 12 C 22 10.895 21.105 10 20 10 L 3.25 10" />
                <circle cx="20" cy="18" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="12.5" cy="18" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="5" cy="18" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="5" cy="14" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="12.5" cy="14" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="20" cy="14" r={nodeR} fill="currentColor" stroke="none" />
                <circle cx="20" cy="10" r={nodeR} fill="currentColor" stroke="none" />
            </g>
            <path d="M 14.95 2.1 L 20.3 2.1 L 18.65 4.05 L 20.3 6 L 14.95 6 Z" />
            <line x1="14.5" y1="10.35" x2="14.5" y2="1.65" />
        </svg>
    );
}

/** Checklist de ação: tarefas com marcação de conclusão. */
export function ActionChecklistIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <circle cx="6" cy="6.2" r="2.4" />
            <path d="M10.9 6.2H20" />

            <circle cx="6" cy="12.6" r="2.4" />
            <path d="M10.9 12.6H20" />

            <circle cx="6" cy="19" r="2.4" />
            <path d="M10.9 19H20" />
        </svg>
    );
}

/** Régua horizontal compacta: metáfora de medida nos campos de regra. */
export function RulerIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M3 8.5h18v7H3z" />
            <path d="M4.9 8.5v2.4M8 8.5v1.3M11.1 8.5v2.4M14.2 8.5v1.3M17.3 8.5v2.4M19.1 8.5v1.3" />
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
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="m12 3 1.8 4.8L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.2L12 3Z" />
            <path d="M18.5 14.5 19.4 17l2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.5ZM5.4 15.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z" />
        </svg>
    );
}

export function InfoIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 10.4v5" />
            <circle cx="12" cy="7.6" r="0.75" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Seta para baixo (dropdown, expansão). */
export function ChevronDownIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

/** Ícone de inclusão (adicionar). */
export function PlusIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
        </svg>
    );
}

/** Ícone de lixeira (exclusão). */
export function TrashIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6M14 11v6" />
        </svg>
    );
}

export function ArrowUpRightIcon({ className }: IconProps) {
    return (
        <svg
            className={mergeClassName(className, "ui-icon")}
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
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            <rect x="5.5" y="10.5" width="13" height="9" rx="0" />
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
        case "location":
            return <LocationIcon className={className} />;
        case "item":
            return <ItemIcon className={className} />;
        case "field":
            return <RulerIcon className={className} />;
        case "action":
            return <ActionChecklistIcon className={className} />;
        case "unity":
            return <UnityIcon className={className} />;
        case "event":
            return <EventPathIcon className={className} />;
        default:
            return <DashboardIcon className={className} />;
    }
}

