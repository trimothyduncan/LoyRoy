// BFF proxy: browser → /api/loyroy/* → Express backend (service key attached
// server-side, never exposed to the browser).
//
// TODO(auth): verify the caller's Firebase ID token (firebase-admin + service
// account) before forwarding. Until that lands, this proxy relies on the
// Firebase login wall in the UI plus same-origin deployment. Do not expose
// this dashboard publicly without it.
import { backendBase, serviceKey } from "@/lib/backend";

async function proxy(request, slug) {
  let base;
  let key;
  try {
    base = backendBase();
    key = serviceKey();
  } catch (err) {
    return Response.json({ error: { code: "CONFIG_ERROR", message: err.message } }, { status: 500 });
  }
  const url = new URL(request.url);
  const target = `${base}/${slug.join("/")}${url.search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Authorization", `Bearer ${key}`);

  let res;
  try {
    res = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
    });
  } catch (err) {
    return Response.json(
      { error: { code: "BACKEND_UNREACHABLE", message: String(err.message || err).slice(0, 300) } },
      { status: 502 }
    );
  }
  const outHeaders = new Headers();
  for (const h of ["content-type", "content-disposition", "x-member-id", "x-pass-serial"]) {
    const v = res.headers.get(h);
    if (v) outHeaders.set(h, v);
  }
  return new Response(await res.arrayBuffer(), { status: res.status, headers: outHeaders });
}

export async function GET(request, { params }) {
  const { slug } = await params;
  return proxy(request, slug);
}

export async function POST(request, { params }) {
  const { slug } = await params;
  return proxy(request, slug);
}
