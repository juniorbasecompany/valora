"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  locale: string;
  label: string;
  pendingLabel: string;
};

export function LogoutButton({
  locale,
  label,
  pendingLabel
}: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
    } finally {
      router.replace(`/${locale}/login?reason=signed_out`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="ui-topbar-chip px-4 py-2 text-sm font-medium transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] disabled:opacity-60"
    >
      {isPending ? pendingLabel : label}
    </button>
  );
}
