"use client";

import { useState } from "react";

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AssetsPage() {
  const [msg, setMsg] = useState("");
  const [url, setUrl] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("Uploading…");
    setUrl("");
    try {
      const dataBase64 = await toBase64(file);
      const res = await fetch("/api/loyroy/admin/upload-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Upload failed (${res.status})`);
      setUrl(data.publicUrl);
      setMsg(`Uploaded to ${data.path}`);
    } catch (err) {
      setMsg(`Error: ${err.message}`);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-semibold">Pass assets</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Upload icon/logo/strip art (PNG, JPEG, or WebP, ≤5MB). Files land in Supabase Storage via the backend.
      </p>
      <input className="mt-3" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} />
      {msg && <p className="mt-3 text-sm text-zinc-600">{msg}</p>}
      {url && (
        <p className="mt-2 text-sm">
          Public URL: <a className="underline" href={url}>{url}</a>
        </p>
      )}
    </main>
  );
}
