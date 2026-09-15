"use client";

import { useEffect, useRef, useState } from "react";

// Redemption scanner: in-browser camera via html5-qrcode (covers webcam +
// iPhone camera), plus plain keystroke input for HID hardware scanners.
// Scans resolve through the backend (/redeem + member lookup).

export default function ScannerPage() {
  const readerRef = useRef(null);
  const scannerRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [manual, setManual] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    return () => {
      scannerRef.current?.clear().catch(() => {});
    };
  }, []);

  async function redeemByMemberId(memberId) {
    setResult("Looking up member…");
    try {
      const lookup = await fetch(`/api/loyroy/member/${encodeURIComponent(memberId)}`);
      if (!lookup.ok) throw new Error("Member not found for this code");
      const member = await lookup.json();
      setResult(`${member.name} · ${member.tier} · ${member.pointsBalance} pts`);
      if (rewardId.trim()) {
        const res = await fetch("/api/loyroy/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId, rewardId: rewardId.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || `Redeem failed (${res.status})`);
        setResult(`Redeemed ✓ New balance: ${data.newBalance}`);
      }
    } catch (err) {
      setResult(`Error: ${err.message}`);
    }
  }

  function memberIdFromPayload(text) {
    // Pass QR encodes LOYROY-<memberId>; hardware scanners may append newline.
    const t = text.trim();
    return t.startsWith("LOYROY-") ? t.slice("LOYROY-".length).trim() : t;
  }

  async function toggleCamera() {
    if (cameraOn) {
      await scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
      setCameraOn(false);
      return;
    }
    setResult("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          scanner.clear().catch(() => {});
          scannerRef.current = null;
          setCameraOn(false);
          redeemByMemberId(memberIdFromPayload(decoded));
        },
        () => {}
      );
      setCameraOn(true);
    } catch (err) {
      setResult(`Camera error: ${err.message || err}. Use manual entry below.`);
    }
  }

  // HID wedge scanners type the payload + Enter: capture it anywhere on page.
  useEffect(() => {
    let buffer = "";
    let timer;
    function onKey(e) {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Enter" && buffer.length > 3) {
        const code = buffer;
        buffer = "";
        redeemByMemberId(memberIdFromPayload(code));
        return;
      }
      if (e.key.length === 1) {
        buffer += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => (buffer = ""), 100);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewardId]);

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Redeem scanner</h1>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        Reward ID (optional — leave empty for lookup only)
        <input
          className="rounded border border-zinc-300 px-3 py-2"
          value={rewardId}
          onChange={(e) => setRewardId(e.target.value)}
          placeholder="reward uuid"
        />
      </label>
      <div className="mt-3">
        <button className="rounded bg-zinc-900 px-4 py-2 text-white" onClick={toggleCamera}>
          {cameraOn ? "Stop camera" : "Scan with camera"}
        </button>
      </div>
      <div id="qr-reader" ref={readerRef} className="mt-3 w-full" />
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) redeemByMemberId(memberIdFromPayload(manual));
        }}
      >
        <input
          className="w-full rounded border border-zinc-300 px-3 py-2"
          placeholder="…or type/scan code manually"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button className="rounded border border-zinc-300 px-4 py-2" type="submit">
          Go
        </button>
      </form>
      {result && <p className="mt-3 text-sm">{result}</p>}
    </main>
  );
}
