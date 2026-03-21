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
      className="ui-button-secondary rounded-full text-sm transition disabled:opacity-60"
    >
      {isPending ? pendingLabel : label}
    </button>
  );
}
