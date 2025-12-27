"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CARD_STATUS,
  KEY_STATUS,
  VERIFICATION_STATUS,
  type CardStatus,
  type KeyStatus,
  type VerificationStatus,
} from "@/lib/constants";

type Props = {
  assignmentId: string;
  driverId: string | null;
  keyStatus: KeyStatus | null;
  cardStatus: CardStatus | null;
  verificationStatus: VerificationStatus | null;
  currentKeyHolderId: string | null;
  variant?: "table" | "card";
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function AssignmentQuickActions({
  assignmentId,
  driverId,
  keyStatus,
  cardStatus,
  verificationStatus,
  currentKeyHolderId,
  variant = "table",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "key" | "card" | "verify">(null);
  const [error, setError] = useState<string | null>(null);

  const keyLabel = useMemo(() => {
    if (keyStatus === KEY_STATUS.WITH_DRIVER) return "Key: With Driver";
    if (keyStatus === KEY_STATUS.STATION) return "Key: Station";
    return "Key: —";
  }, [keyStatus]);

  const cardLabel = useMemo(() => {
    if (cardStatus === CARD_STATUS.GIVEN) return "Card: Given";
    if (cardStatus === CARD_STATUS.NOT_GIVEN) return "Card: Not Given";
    if (cardStatus === CARD_STATUS.SKIPPED) return "Card: Skipped";
    return "Card: —";
  }, [cardStatus]);

  const verifyLabel = useMemo(() => {
    if (verificationStatus === VERIFICATION_STATUS.VERIFIED) return "Verify: Verified";
    if (verificationStatus === VERIFICATION_STATUS.PENDING) return "Verify: Pending";
    if (verificationStatus === VERIFICATION_STATUS.FLAGGED) return "Verify: Flagged";
    return "Verify: —";
  }, [verificationStatus]);

  const retrievalBarrier =
    keyStatus === KEY_STATUS.WITH_DRIVER &&
    !!driverId &&
    !!currentKeyHolderId &&
    driverId !== currentKeyHolderId;

  async function patch(patch: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/dispatch/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Update failed");
      return;
    }

    // Refresh server components (re-fetch sorted list + updated statuses)
    router.refresh();
  }

  async function toggleKey() {
    setBusy("key");
    try {
      if (keyStatus === KEY_STATUS.WITH_DRIVER) {
        await patch({ key_status: KEY_STATUS.STATION });
      } else {
        await patch({
          key_status: KEY_STATUS.WITH_DRIVER,
          // Default to assigned driver as holder (server will also enforce)
          current_key_holder_id: driverId,
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function toggleCard() {
    setBusy("card");
    try {
      if (cardStatus === CARD_STATUS.GIVEN) {
        await patch({ card_status: CARD_STATUS.NOT_GIVEN });
      } else {
        await patch({ card_status: CARD_STATUS.GIVEN });
      }
    } finally {
      setBusy(null);
    }
  }

  async function toggleVerify() {
    setBusy("verify");
    try {
      if (verificationStatus === VERIFICATION_STATUS.VERIFIED) {
        await patch({ verification_status: VERIFICATION_STATUS.PENDING });
      } else {
        await patch({ verification_status: VERIFICATION_STATUS.VERIFIED });
      }
    } finally {
      setBusy(null);
    }
  }

  const btnBase =
    "rounded-lg border text-xs font-semibold px-3 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed";

  const wrapClass =
    variant === "card" ? "mt-3 space-y-2" : "flex flex-col gap-2";

  return (
    <div className={wrapClass}>
      {retrievalBarrier && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-200">
          <div className="font-bold">Retrieval Barrier</div>
          <div>
            Key holder mismatch. Assigned driver ≠ current key holder.
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleKey}
        disabled={busy !== null}
        className={classNames(
          btnBase,
          keyStatus === KEY_STATUS.WITH_DRIVER
            ? "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/20"
            : "border-slate-600/40 bg-white/5 text-slate-200 hover:bg-white/10"
        )}
        aria-label={keyLabel}
        title={keyLabel}
      >
        {busy === "key" ? "Saving…" : keyLabel}
      </button>

      <button
        type="button"
        onClick={toggleCard}
        disabled={busy !== null}
        className={classNames(
          btnBase,
          cardStatus === CARD_STATUS.GIVEN
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20"
            : "border-slate-600/40 bg-white/5 text-slate-200 hover:bg-white/10"
        )}
        aria-label={cardLabel}
        title={cardLabel}
      >
        {busy === "card" ? "Saving…" : cardLabel}
      </button>

      <button
        type="button"
        onClick={toggleVerify}
        disabled={busy !== null}
        className={classNames(
          btnBase,
          verificationStatus === VERIFICATION_STATUS.VERIFIED
            ? "border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/20"
            : "border-slate-600/40 bg-white/5 text-slate-200 hover:bg-white/10"
        )}
        aria-label={verifyLabel}
        title={verifyLabel}
      >
        {busy === "verify" ? "Saving…" : verifyLabel}
      </button>

      {error && (
        <div className="text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

