import { backendJson } from "@/lib/backend";
import ArtStudio from "@/components/ArtStudio";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  let initialAssets = [];
  let initialRows = [];
  let loadError = "";
  try {
    const [a, r] = await Promise.all([
      backendJson("/admin/assets"),
      backendJson("/admin/pass-art"),
    ]);
    initialAssets = a.assets || [];
    initialRows = r.art || [];
  } catch (err) {
    loadError = err.message;
  }

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="v-title">Art Studio</h1>
      <p className="v-muted mt-1 text-sm">
        Dress each tier in three steps: <strong>upload</strong> art, <strong>preview</strong> it on a sample pass,
        then <strong>publish</strong>. Nothing reaches members until you publish.
      </p>
      {loadError ? (
        <p className="mt-4 text-sm text-red-400">Backend error: {loadError}</p>
      ) : (
        <ArtStudio initialAssets={initialAssets} initialRows={initialRows} />
      )}
    </main>
  );
}
