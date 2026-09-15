// Server-side backend client. SERVICE_API_KEY never leaves the server:
// browser code talks to /api/loyroy/* (Route Handlers below) instead.
import "server-only";

export function backendBase() {
  return (process.env.BACKEND_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function serviceKey() {
  const key = process.env.SERVICE_API_KEY;
  if (!key) throw new Error("SERVICE_API_KEY is not configured");
  return key;
}

export async function backendFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${backendBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${serviceKey()}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

export async function backendJson(path, opts) {
  return (await backendFetch(path, opts)).json();
}
