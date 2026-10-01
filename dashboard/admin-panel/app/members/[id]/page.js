import Link from "next/link";
import { notFound } from "next/navigation";
import { backendJson } from "@/lib/backend";
import { AdjustPointsForm, PushButton, DeleteButton } from "@/components/memberActions";

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
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <Link className="v-muted text-sm hover:underline" href="/members">
        ← Members
      </Link>
      <h1 className="v-title mt-1">{member.name}</h1>
      <div className="v-card mt-3 max-w-md p-4">
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="v-muted">Tier</dt>
          <dd>{member.tier}</dd>
          <dt className="v-muted">Points</dt>
          <dd>{member.pointsBalance}</dd>
          <dt className="v-muted">Pass serial</dt>
          <dd>{member.passSerialNumber || "—"}</dd>
          <dt className="v-muted">Last visit</dt>
          <dd>{member.lastVisit || "—"}</dd>
        </dl>
      </div>

      <section className="v-card mt-4 p-4">
        <h2 className="font-medium text-white">Adjust points</h2>
        <div className="mt-2">
          <AdjustPointsForm memberId={member.memberId} />
        </div>
        <div className="mt-2">
          <PushButton memberId={member.memberId} />
        </div>
        <div className="v-hr mt-4 pt-3">
          <DeleteButton memberId={member.memberId} memberName={member.name} />
        </div>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="v-card p-4">
          <h2 className="font-medium text-white">Points history</h2>
          <ul className="v-divide mt-1 text-sm">
            {(member.history?.points || []).map((p) => (
              <li key={p.id} className="py-1">
                {p.delta > 0 ? "+" : ""}{p.delta} → {p.balance_after} <span className="v-muted">({p.reason})</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="v-card p-4">
          <h2 className="font-medium text-white">Visits</h2>
          <ul className="v-divide mt-1 text-sm">
            {(member.history?.visits || []).map((v) => (
              <li key={v.id} className="py-1">
                {new Date(v.visited_at).toLocaleString()} {v.note && <span className="v-muted">({v.note})</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="v-card p-4">
          <h2 className="font-medium text-white">Redemptions</h2>
          <ul className="v-divide mt-1 text-sm">
            {(member.history?.redemptions || []).map((r) => (
              <li key={r.id} className="py-1">
                −{r.points_spent} pts <span className="v-muted">({new Date(r.created_at).toLocaleString()})</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
