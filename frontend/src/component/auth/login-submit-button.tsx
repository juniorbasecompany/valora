"use client";

import { useFormStatus } from "react-dom";

type LoginSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

export function LoginSubmitButton({
  idleLabel,
  pendingLabel
}: LoginSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-300"
      disabled={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
