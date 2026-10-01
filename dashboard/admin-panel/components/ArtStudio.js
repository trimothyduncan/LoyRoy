"use client";

import { useState } from "react";

const TIERS = ["bronze", "silver", "gold", "platinum", "vip"];
const SLOTS = ["logo", "strip", "icon"];
const TIER_BG = {
  bronze: "rgb(120, 72, 20)",
  silver: "rgb(110, 110, 120)",
  gold: "rgb(139, 105, 20)",
  platinum: "rgb(40, 40, 48)",
  vip: "rgb(20, 20, 20)",
};

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PassPreview({ tier, art }) {
  // Merchant-side mockup of the storeCard: tier color + chosen art + sample
  // fields. Mirrors walletService layout closely enough to judge artwork.
  return (
    <div
      className="overflow-hidden rounded-2xl text-white shadow-xl"
      style={{ background: TIER_BG[tier], maxWidth: 340 }}
    >
      <div className="flex items-center justify-between px-4 pt-3">
        {art.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art.logo} alt="logo preview" className="h-8 object-contain" />
        ) : (
          <span className="text-sm font-semibold">LoyRoy</span>
        )}
        <span className="text-xs uppercase tracking-wide opacity-80">{tier}</span>
      </div>
      {art.strip ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art.strip} alt="strip preview" className="mt-2 h-20 w-full object-cover" />
      ) : (
        <div className="mt-2 flex h-20 items-center justify-center bg-white/10 text-xs opacity-70">
          strip art goes here
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-[10px] uppercase opacity-70">Points</p>
          <p className="text-xl font-bold">1,250</p>
          <p className="mt-1 text-[10px] uppercase opacity-70">Member</p>
          <p className="text-sm">Sample Member</p>
        </div>
        {art.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art.icon} alt="icon preview" className="h-12 w-12 rounded-lg object-contain" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15 text-[10px]">
            QR
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArtStudio({ initialAssets, initialRows }) {
  const [assets, setAssets] = useState(initialAssets);
  const [rows, setRows] = useState(initialRows);
  const [tier, setTier] = useState("gold");
  const [picks, setPicks] = useState({});
  const [msg, setMsg] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");

  const urlFor = (storagePath) => assets.find((a) => a.path === storagePath)?.publicUrl || "";

  const rowFor = (t, slot) => rows.find((r) => r.tier === t && r.slot === slot);

  const effectiveUrl = (slot) => {
    const pick = picks[`${tier}:${slot}`];
    if (pick !== undefined) return urlFor(pick);
    const row = rowFor(tier, slot);
    return row ? urlFor(row.storagePath) : "";
  };

  function upsertRow(t, slot, storagePath, status) {
    const now = new Date().toISOString();
    setRows((prev) => {
      const rest = prev.filter((r) => !(r.tier === t && r.slot === slot));
      return [...rest, { tier: t, slot, storagePath, status, updatedAt: now }];
    });
  }

  async function saveDraft(slot) {
    const storagePath = picks[`${tier}:${slot}`];
    if (!storagePath) {
      setMsg("Pick a file for this slot first.");
      return;
    }
    setMsg("Saving draft…");
    try {
      const res = await fetch("/api/loyroy/admin/pass-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, slot, storagePath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Failed (${res.status})`);
      upsertRow(tier, slot, storagePath, "draft");
      setMsg(`Draft saved for ${tier} ${slot}. Preview away — members see nothing yet.`);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
  }

  async function publish() {
    setMsg(`Publishing ${tier}…`);
    try {
      const res = await fetch("/api/loyroy/admin/publish-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Failed (${res.status})`);
      for (const p of data.published || []) {
        const row = rowFor(tier, p.slot);
        if (row) upsertRow(tier, p.slot, row.storagePath, "published");
      }
      const slots = (data.published || []).map((p) => p.slot).join(", ");
      setMsg(`Live! ${tier} now serves: ${slots}. Note: re-deploys reset server files — keep master art here in the studio.`);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg("Uploading…");
    try {
      const dataBase64 = await toBase64(file);
      const res = await fetch("/api/loyroy/admin/upload-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Upload failed (${res.status})`);
      setAssets((prev) => [
        { name: file.name, path: data.path, publicUrl: data.publicUrl, bytes: file.size, createdAt: new Date().toISOString() },
        ...prev,
      ]);
      setUploadMsg(`Uploaded ${file.name} — pick it below.`);
      e.target.value = "";
    } catch (err) {
      setUploadMsg(`Error: ${err.message}`);
    }
  }

  const previewArt = {
    logo: effectiveUrl("logo"),
    strip: effectiveUrl("strip"),
    icon: effectiveUrl("icon"),
  };

  return (
    <>
      <div className="v-card mt-4 p-4">
        <h2 className="font-medium text-white">1 · Upload art</h2>
        <input className="v-input mt-2" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} />
        {uploadMsg && <p className="v-muted mt-2 text-sm">{uploadMsg}</p>}
      </div>

      <div className="v-card mt-4 p-4">
        <h2 className="font-medium text-white">2 · Pick art per tier</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={t === tier ? "v-btn" : "v-btn-ghost"}
            >
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {SLOTS.map((slot) => {
            const row = rowFor(tier, slot);
            return (
              <div key={slot} className="rounded-xl border border-white/10 p-3">
                <p className="text-sm font-medium capitalize text-white">{slot}</p>
                <p className="v-muted mt-0.5 text-xs">
                  {row ? `${row.status}: ${row.storagePath.split("/").pop()}` : "no art staged"}
                </p>
                <select
                  className="v-input mt-2 text-sm"
                  value={picks[`${tier}:${slot}`] ?? row?.storagePath ?? ""}
                  onChange={(e) => setPicks({ ...picks, [`${tier}:${slot}`]: e.target.value })}
                >
                  <option value="">— choose a file —</option>
                  {assets.map((a) => (
                    <option key={a.path} value={a.path}>{a.name}</option>
                  ))}
                </select>
                <button className="v-btn-ghost mt-2 w-full text-sm" onClick={() => saveDraft(slot)}>
                  Save draft
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="v-card p-4">
          <h2 className="font-medium text-white">3 · Preview <span className="capitalize">{tier}</span></h2>
          <p className="v-muted mt-0.5 text-xs">Exactly what members would see (sample data).</p>
          <div className="mt-3 flex justify-center">
            <PassPreview tier={tier} art={previewArt} />
          </div>
        </div>
        <div className="v-card p-4">
          <h2 className="font-medium text-white">4 · Publish</h2>
          <p className="v-muted mt-0.5 text-xs">
            Applies every saved draft for <span className="capitalize">{tier}</span> to live passes.
            Already-installed passes refresh on next push or open.
          </p>
          <button className="v-btn mt-3 w-full" onClick={publish}>
            Publish {tier} art
          </button>
          {msg && <p className="v-muted mt-3 text-sm">{msg}</p>}
        </div>
      </div>
    </>
  );
}
