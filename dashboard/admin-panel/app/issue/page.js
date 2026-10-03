"use client";

import { useState } from "react";

const TIERS = ["bronze", "silver", "gold", "platinum", "vip"];

export default function IssuePage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", tier: "bronze", provider: "apple" });
  const [msg, setMsg] = useState("");
  const [saveUrl, setSaveUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSaveUrl("");
    setMsg("Generating…");
    try {
      const res = await fetch("/api/loyroy/create-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerProfile: {
            name: form.name,
            ...(form.email ? { email: form.email } : {}),
            ...(form.phone ? { phone: form.phone } : {}),
          },
          tier: form.tier,
          provider: form.provider,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || `Failed (${res.status})`);
      }
      if (form.provider === "google") {
        const data = await res.json();
        setSaveUrl(data.saveUrl);
        setMsg(`Google pass ready (${data.objectId}). Open the save link on an Android device.`);
        return;
      }
      const blob = await res.blob();
      const serial = res.headers.get("x-pass-serial") || "pass";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${serial}.pkpass`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Pass downloaded (${serial}). AirDrop or email it to an iPhone to install.`);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const field = (k, label, props = {}) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        className="v-input"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        {...props}
      />
    </label>
  );

  return (
    <main className="mx-auto max-w-md p-4 md:p-6">
      <h1 className="v-title">Issue a pass</h1>
      <form onSubmit={submit} className="v-card mt-4 flex flex-col gap-3 p-4">
        {field("name", "Name", { required: true })}
        {field("email", "Email", { type: "email" })}
        {field("phone", "Phone")}
        <label className="flex flex-col gap-1 text-sm">
          Tier
          <select
            className="v-input"
            value={form.tier}
            onChange={(e) => setForm({ ...form, tier: e.target.value })}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Wallet
          <select
            className="v-input"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
          >
            <option value="apple">Apple Wallet (.pkpass download)</option>
            <option value="google">Google Wallet (save link)</option>
          </select>
        </label>
        <button className="v-btn" type="submit" disabled={submitting}>
          {submitting ? "Generating…" : form.provider === "google" ? "Generate Google save link" : "Generate & download .pkpass"}
        </button>
      </form>
      {msg && <p className="v-muted mt-3 text-sm">{msg}</p>}
      {saveUrl && (
        <p className="mt-3 text-sm">
          <a className="underline" href={saveUrl} target="_blank" rel="noreferrer">
            Open Google Wallet save link
          </a>
        </p>
      )}
    </main>
  );
}
