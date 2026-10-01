"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Redemption scanner: in-browser camera via html5-qrcode (native
// BarcodeDetector when the browser offers it — far more reliable on phones),
// plus plain keystroke input for HID hardware scanners.
// A successful scan opens the member profile, where points can be
// added and pushes sent without touching the Members search.

export default function ScannerPage() {
  const router = useRouter();
  const readerRef = useRef(null);
  const scannerRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manual, setManual] = useState("");
  const [rewardId, setRewardId] = useState("");
  const [result, setResult] = useState("");
  const [misses, setMisses] = useState(0);

  useEffect(() => {
    return () => {
      scannerRef.current?.clear().catch(() => {});
    };
  }, []);

  function memberIdFromPayload(text) {
    // Pass QR encodes LOYROY-<memberId>; hardware scanners may append newline.
    const t = text.trim();
    return t.startsWith("LOYROY-") ? t.slice("LOYROY-".length).trim() : t;
  }

  // Diagnostic state: the error callback fires on every missed frame, so only
  // surface a count + last reason instead of raw per-frame noise.
  const bumpMiss = () =>
    setMisses((m) => {
      const next = m + 1;
      if (next === 30) setResult("Camera is live but nothing is decoding yet — widen the frame and hold steady on the pass QR.");
      return next;
    });

  function openProfile(memberId) {
    if (!memberId) {
      setResult("Error: could not read a member code from that scan.");
      return;
    }
    router.push(`/members/${encodeURIComponent(memberId)}`);
  }

  async function redeemByMemberId(memberId) {
    // Optional inline redeem: with a reward ID set, redeem first, then offer
    // the profile. Without one, go straight to the profile.
    if (!rewardId.trim()) {
      openProfile(memberId);
      return;
    }
    setResult("Redeeming…");
    try {
      const res = await fetch("/api/loyroy/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, rewardId: rewardId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Redeem failed (${res.status})`);
      setResult(`Redeemed ✓ New balance: ${data.newBalance}`);
    } catch (err) {
      setResult(`Error: ${err.message}`);
    }
  }

  async function toggleCamera() {
    if (cameraOn) {
      await scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
      setCameraOn(false);
      return;
    }
    setResult("");
    setMisses(0);
    setStarting(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      // formatsToSupport / experimentalFeatures are read ONLY from the
      // constructor's second arg. Passing them to start() is silently ignored
      // and leaves the decoder on all 16 formats with BarcodeDetector-first.
      const scanner = new Html5Qrcode("qr-reader", {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          // No fixed qrbox: the sample region becomes the full viewfinder, so a
          // Wallet QR outside a 280px window still decodes.
          // disableFlip must stay true — the flip retry never resets the canvas
          // transform, so repeated misses leave the sampled region mirrored.
          disableFlip: true,
        },
        (decoded) => {
          scanner.clear().catch(() => {});
          scannerRef.current = null;
          setCameraOn(false);
          redeemByMemberId(memberIdFromPayload(decoded));
        },
        () => bumpMiss()
      );
      setCameraOn(true);
      setResult("Point at the pass QR — it opens the member on first read.");
    } catch (err) {
      setResult(`Camera error: ${err?.message || err}. Use manual entry below.`);
    } finally {
      setStarting(false);
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
    <main className="mx-auto max-w-md p-4 md:p-6">
      <h1 className="v-title">Redeem scanner</h1>
      <div className="v-card mt-4 flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-sm">
          Reward ID (optional — leave empty to just open the member)
          <input
            className="v-input"
            value={rewardId}
            onChange={(e) => setRewardId(e.target.value)}
            placeholder="reward uuid"
          />
        </label>
        <div>
          <button className="v-btn" onClick={toggleCamera} disabled={starting}>
            {starting ? "Starting camera…" : cameraOn ? "Stop camera" : "Scan with camera"}
          </button>
        </div>
        <div id="qr-reader" ref={readerRef} className="w-full" />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) redeemByMemberId(memberIdFromPayload(manual));
          }}
        >
          <input
            className="v-input"
            placeholder="…or type/scan code manually"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button className="v-btn-ghost shrink-0" type="submit">
            Go
          </button>
        </form>
        {result && <p className="text-sm">{result}</p>}
        {cameraOn && misses > 0 && (
          <p className="v-muted text-xs">
            Scanning — {misses} frame{misses === 1 ? "" : "s"} with no code in view yet.
          </p>
        )}
        {result.startsWith("Redeemed") && (
          <p className="v-muted text-sm">Tip: scan again without a reward ID to open the member profile.</p>
        )}
      </div>
    </main>
  );
}
