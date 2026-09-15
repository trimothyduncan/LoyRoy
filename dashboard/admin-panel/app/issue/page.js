"use client";

import { useState } from "react";

const TIERS = ["bronze", "silver", "gold", "platinum", "vip"];

export default function IssuePage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", tier: "bronze" });
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
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
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || `Failed (${res.status})`);
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
    }
  }

  const field = (k, label, props = {}) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        className="rounded border border-zinc-300 px-3 py-2"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        {...props}
      />
    </label>
  );

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Issue a pass</h1>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        {field("name", "Name", { required: true })}
        {field("email", "Email", { type: "email" })}
        {field("phone", "Phone")}
        <label className="flex flex-col gap-1 text-sm">
          Tier
          <select
            className="rounded border border-zinc-300 px-3 py-2"
            value={form.tier}
            onChange={(e) => setForm({ ...form, tier: e.target.value })}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <button className="rounded bg-zinc-900 px-3 py-2 text-white" type="submit">
          Generate & download .pkpass
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-zinc-600">{msg}</p>}
    </main>
  );
}
