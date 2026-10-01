"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}

export function AdjustPointsForm({ memberId, onDone }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    try {
      const data = await post("/api/loyroy/update-points", {
        memberId,
        pointsDelta: Number(delta),
        reason,
      });
      setMsg(`New balance: ${data.newBalance}`);
      onDone?.();
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        Points Δ
        <input
          className="v-input ml-2 w-24"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="+50 / -20"
          required
        />
      </label>
      <label className="text-sm">
        Reason
        <input
          className="v-input ml-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="visit bonus"
        />
      </label>
      <button className="v-btn" type="submit">
        Apply
      </button>
      {msg && <span className="v-muted text-sm">{msg}</span>}
    </form>
  );
}

export function PushButton({ memberId }) {
  const [msg, setMsg] = useState("");
  return (
    <span>
      <button
        className="v-btn-ghost text-sm"
        onClick={async () => {
          setMsg("");
          try {
            await post("/api/loyroy/push-update", { memberId });
            setMsg("Push sent");
          } catch (err) {
            setMsg(`Error: ${err.message}`);
          }
        }}
      >
        Send Wallet push
      </button>
      {msg && <span className="v-muted ml-2 text-sm">{msg}</span>}
    </span>
  );
}

export function DeleteButton({ memberId, memberName }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState("");

  async function remove() {
    setMsg("");
    try {
      const res = await fetch(`/api/loyroy/member/${encodeURIComponent(memberId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Delete failed (${res.status})`);
      router.replace("/members");
    } catch (err) {
      setMsg(`Error: ${err.message}`);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button className="v-btn-danger" onClick={() => setConfirming(true)}>
        Delete member
      </button>
    );
  }
  return (
    <span className="text-sm">
      Delete {memberName}? Their pass stops updating.
      <button className="v-btn-danger-solid ml-2" onClick={remove}>
        Confirm delete
      </button>
      <button className="v-btn-ghost ml-2" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {msg && <span className="v-muted ml-2">{msg}</span>}
    </span>
  );
}
