import Link from "next/link";
import { notFound } from "next/navigation";
import { backendJson } from "@/lib/backend";
import { AdjustPointsForm, PushButton } from "@/components/memberActions";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({ params }) {
  const { id } = await params;
  let member;
  try {
    member = await backendJson(`/member/${encodeURIComponent(id)}`);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl p-4">
      <Link className="text-sm text-zinc-500 hover:underline" href="/members">
        ← Members
      </Link>
      <h1 className="mt-1 text-xl font-semibold">{member.name}</h1>
      <dl className="mt-3 grid max-w-md grid-cols-2 gap-1 text-sm">
        <dt className="text-zinc-500">Tier</dt>
        <dd>{member.tier}</dd>
        <dt className="text-zinc-500">Points</dt>
        <dd>{member.pointsBalance}</dd>
        <dt className="text-zinc-500">Pass serial</dt>
        <dd>{member.passSerialNumber || "—"}</dd>
        <dt className="text-zinc-500">Last visit</dt>
        <dd>{member.lastVisit || "—"}</dd>
      </dl>

      <section className="mt-5">
        <h2 className="font-medium">Adjust points</h2>
        <div className="mt-2">
          <AdjustPointsForm memberId={member.memberId} />
        </div>
        <div className="mt-2">
          <PushButton memberId={member.memberId} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 md:grid-cols-3">
        <div>
          <h2 className="font-medium">Points history</h2>
          <ul className="mt-1 text-sm">
            {(member.history?.points || []).map((p) => (
              <li key={p.id} className="border-b border-zinc-100 py-1">
                {p.delta > 0 ? "+" : ""}{p.delta} → {p.balance_after} <span className="text-zinc-500">({p.reason})</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-medium">Visits</h2>
          <ul className="mt-1 text-sm">
            {(member.history?.visits || []).map((v) => (
              <li key={v.id} className="border-b border-zinc-100 py-1">
                {new Date(v.visited_at).toLocaleString()} {v.note && <span className="text-zinc-500">({v.note})</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-medium">Redemptions</h2>
          <ul className="mt-1 text-sm">
            {(member.history?.redemptions || []).map((r) => (
              <li key={r.id} className="border-b border-zinc-100 py-1">
                −{r.points_spent} pts <span className="text-zinc-500">({new Date(r.created_at).toLocaleString()})</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
