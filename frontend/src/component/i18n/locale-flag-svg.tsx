type LocaleFlagSvgProps = {
  locale: string;
  className?: string;
  /** `trigger`: botão compacto na topbar; `menu`: linha do dropdown */
  size?: "menu" | "trigger";
};

const sizeClassMap = {
  menu: "h-[1.125rem] w-6",
  /** Sem altura fixa (`h-5`): proporção 22×15 evita caixa mais alta que o texto na topbar/sidebar */
  trigger: "aspect-[22/15] w-[1.35rem] h-auto"
} as const;

function BrazilFlagSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 15"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="22" height="15" fill="#009C3B" />
      <path d="M11 1.2 20.2 7.5 11 13.8 1.8 7.5Z" fill="#FFDF00" />
      <circle cx="11" cy="7.5" r="3.35" fill="#002776" />
    </svg>
  );
}

function UnitedStatesFlagSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 15"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="22" height="15" fill="#B22234" />
      <path
        fill="#FFFFFF"
        d="M0 1.15h22v1.15H0zm0 2.3h22v1.15H0zm0 2.3h22v1.15H0zm0 2.3h22v1.15H0zm0 2.3h22v1.15H0zm0 2.3h22v1.15H0z"
      />
      <rect width="9.2" height="8.05" fill="#3C3B6E" />
    </svg>
  );
}

function SpainFlagSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 15"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="22" height="3.75" y="0" fill="#AA151B" />
      <rect width="22" height="7.5" y="3.75" fill="#F1BF00" />
      <rect width="22" height="3.75" y="11.25" fill="#AA151B" />
    </svg>
  );
}

function FallbackGlobeSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 22 15"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="22" height="15" fill="var(--color-border)" />
      <circle
        cx="11"
        cy="7.5"
        r="4.5"
        fill="none"
        stroke="var(--color-text-subtle)"
        strokeWidth="0.9"
      />
      <path
        d="M6.5 7.5h9M11 3v9"
        fill="none"
        stroke="var(--color-text-subtle)"
        strokeWidth="0.7"
      />
    </svg>
  );
}

export function LocaleFlagSvg({
  locale,
  className,
  size = "menu"
}: LocaleFlagSvgProps) {
  const merged = [
    sizeClassMap[size],
    "shrink-0 overflow-hidden rounded-none",
    className
  ]
    .filter(Boolean)
    .join(" ");

  switch (locale) {
    case "pt-BR":
      return <BrazilFlagSvg className={merged} />;
    case "en-US":
      return <UnitedStatesFlagSvg className={merged} />;
    case "es-ES":
      return <SpainFlagSvg className={merged} />;
    default:
      return <FallbackGlobeSvg className={merged} />;
  }
}
