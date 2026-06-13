"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  action: () => Promise<void>;
}

export default function RicaricaButton({ action }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="flex items-center gap-2 px-3 py-1.5 rounded border text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
      style={{ borderColor: "var(--color-grey-icon)", color: "var(--color-grey-mid)" }}
    >
      <span className={pending ? "animate-spin inline-block" : "inline-block"}>↻</span>
      {pending ? "Caricamento…" : "Ricarica dati"}
    </button>
  );
}
