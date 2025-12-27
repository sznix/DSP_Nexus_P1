"use client";

import { useState } from "react";
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
  spotLabel: string | null;
  zoneName: string | null;
  vanLabel: string | null;
  driverName: string | null;
  driverId: string | null;
  pad: string | null;
  dispatchTime: string | null;
  cartLocation: string | null;
  keyStatus: KeyStatus | null;
  cardStatus: CardStatus | null;
  verificationStatus: VerificationStatus | null;
  currentKeyHolderId: string | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function SnakeWalkCard({
  assignmentId,
  spotLabel,
  zoneName,
  vanLabel,
  driverName,
  driverId,
  pad,
  dispatchTime,
  cartLocation,
  keyStatus,
  cardStatus,
  verificationStatus,
  currentKeyHolderId,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "key" | "card" | "verify" | "transfer" | "return">(null);
  const [error, setError] = useState<string | null>(null);

  // Retrieval barrier: key is with a driver but not the assigned driver
  const hasRetrievalBarrier =
    keyStatus === KEY_STATUS.WITH_DRIVER &&
    !!driverId &&
    !!currentKeyHolderId &&
    driverId !== currentKeyHolderId;

  async function patch(patchData: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/dispatch/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: patchData }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Update failed");
      return false;
    }

    router.refresh();
    return true;
  }

  async function toggleKey() {
    setBusy("key");
    try {
      if (keyStatus === KEY_STATUS.WITH_DRIVER) {
        await patch({ key_status: KEY_STATUS.STATION });
      } else {
        await patch({
          key_status: KEY_STATUS.WITH_DRIVER,
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

  async function transferKeysToDriver() {
    setBusy("transfer");
    try {
      await patch({
        key_status: KEY_STATUS.WITH_DRIVER,
        current_key_holder_id: driverId,
      });
    } finally {
      setBusy(null);
    }
  }

  async function returnKeysToStation() {
    setBusy("return");
    try {
      await patch({
        key_status: KEY_STATUS.STATION,
        current_key_holder_id: null,
      });
    } finally {
      setBusy(null);
    }
  }

  const keyLabel =
    keyStatus === KEY_STATUS.WITH_DRIVER
      ? "Key: With Driver"
      : keyStatus === KEY_STATUS.STATION
      ? "Key: Station"
      : "Key: —";

  const cardLabel =
    cardStatus === CARD_STATUS.GIVEN
      ? "Card: Given"
      : cardStatus === CARD_STATUS.NOT_GIVEN
      ? "Card: Not Given"
      : cardStatus === CARD_STATUS.SKIPPED
      ? "Card: Skipped"
      : "Card: —";

  const verifyLabel =
    verificationStatus === VERIFICATION_STATUS.VERIFIED
      ? "Verified"
      : verificationStatus === VERIFICATION_STATUS.PENDING
      ? "Pending"
      : verificationStatus === VERIFICATION_STATUS.FLAGGED
      ? "Flagged"
      : "—";

  const btnBase =
    "rounded-lg border text-sm font-semibold px-3 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 w-full text-center";

  const barrierBtnBase =
    "rounded-lg border text-sm font-semibold px-3 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex-1 text-center";

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
      {/* Header: Spot + Van */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-white">
            {spotLabel ?? "—"}
          </div>
          <div className="text-sm text-slate-400">{zoneName ?? "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-amber-300">
            {vanLabel ?? "No Van"}
          </div>
          <div
            className={classNames(
              "inline-block px-2 py-0.5 text-xs rounded-full border mt-1",
              verificationStatus === VERIFICATION_STATUS.VERIFIED
                ? "bg-green-500/20 text-green-300 border-green-500/30"
                : verificationStatus === VERIFICATION_STATUS.FLAGGED
                ? "bg-red-500/20 text-red-300 border-red-500/30"
                : "bg-slate-500/20 text-slate-300 border-slate-500/30"
            )}
          >
            {verifyLabel}
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-wide">Driver</span>
          <div className="text-white font-medium truncate">
            {driverName ?? "—"}
          </div>
        </div>
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-wide">Pad</span>
          <div className="text-white font-medium">{pad ?? "—"}</div>
        </div>
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-wide">Dispatch</span>
          <div className="text-white font-medium">{dispatchTime ?? "—"}</div>
        </div>
        <div>
          <span className="text-slate-500 text-xs uppercase tracking-wide">Cart</span>
          <div className="text-white font-medium">{cartLocation ?? "—"}</div>
        </div>
      </div>

      {/* Retrieval Barrier - shown above quick actions if active */}
      {hasRetrievalBarrier && (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/15 p-3">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-5 h-5 text-red-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-red-200 font-semibold text-sm">
              Retrieval Barrier
            </span>
          </div>
          <p className="text-red-200/80 text-xs mb-3">
            Keys are with another driver. Resolve before dispatch.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={transferKeysToDriver}
              disabled={busy !== null}
              className={classNames(
                barrierBtnBase,
                "border-amber-500/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
              )}
            >
              {busy === "transfer" ? "Saving…" : "Transfer to Driver"}
            </button>
            <button
              type="button"
              onClick={returnKeysToStation}
              disabled={busy !== null}
              className={classNames(
                barrierBtnBase,
                "border-slate-500/40 bg-slate-500/20 text-slate-200 hover:bg-slate-500/30"
              )}
            >
              {busy === "return" ? "Saving…" : "Return to Station"}
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={toggleKey}
          disabled={busy !== null}
          className={classNames(
            btnBase,
            keyStatus === KEY_STATUS.WITH_DRIVER
              ? "border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
              : "border-slate-600/40 bg-white/5 text-slate-200 hover:bg-white/10"
          )}
        >
          {busy === "key" ? "…" : keyLabel}
        </button>

        <button
          type="button"
          onClick={toggleCard}
          disabled={busy !== null}
          className={classNames(
            btnBase,
            cardStatus === CARD_STATUS.GIVEN
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              : "border-slate-600/40 bg-white/5 text-slate-200 hover:bg-white/10"
          )}
        >
          {busy === "card" ? "…" : cardLabel}
        </button>

        <button
          type="button"
          onClick={toggleVerify}
          disabled={busy !== null}
          className={classNames(
            btnBase,
            verificationStatus === VERIFICATION_STATUS.VERIFIED
              ? "border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
              : "border-slate-600/40 bg-white/5 text-slate-200 hover:bg-white/10"
          )}
        >
          {busy === "verify" ? "…" : "Verify"}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-300 text-center">{error}</div>
      )}
    </div>
  );
}
