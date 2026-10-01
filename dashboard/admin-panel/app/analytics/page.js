import { backendJson } from "@/lib/backend";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TIER_COLORS = {
  bronze: "#b45309",
  silver: "#6b7280",
  gold: "#ca8a04",
  platinum: "#334155",
  vip: "#09090b",
};

function Stat({ label, value }) {
  return (
    <div className="rounded border border-zinc-200 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Card({ title, hint, children }) {
  return (
    <section className="rounded border border-zinc-200 p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function GroupedBars({ daily }) {
  const W = 620;
  const H = 160;
  const max = Math.max(1, ...daily.flatMap((d) => [d.issued, d.redeemed]));
  const bw = W / daily.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Points issued vs redeemed per day">
      {daily.map((d, i) => {
        const w = Math.max(1, bw / 2 - 1);
        const hi = (d.issued / max) * (H - 20);
        const hr = (d.redeemed / max) * (H - 20);
        return (
          <g key={d.date}>
            <rect x={i * bw + 1} y={H - 18 - hi} width={w} height={hi} fill="#059669">
              <title>{`${d.date}: +${d.issued} issued`}</title>
            </rect>
            <rect x={i * bw + 1 + w} y={H - 18 - hr} width={w} height={hr} fill="#dc2626">
              <title>{`${d.date}: -${d.redeemed} redeemed`}</title>
            </rect>
          </g>
        );
      })}
      <text x="4" y={H - 4} fontSize="9" fill="#71717a">{daily[0]?.date}</text>
      <text x={W - 62} y={H - 4} fontSize="9" fill="#71717a">{daily[daily.length - 1]?.date}</text>
    </svg>
  );
}

function Area({ daily }) {
  const W = 620;
  const H = 120;
  const max = Math.max(1, ...daily.map((d) => d.signups));
  const pts = daily.map((d, i) => `${(i / (daily.length - 1)) * W},${H - 14 - (d.signups / max) * (H - 28)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Signups per day">
      <polygon points={`0,${H - 14} ${pts.join(" ")} ${W},${H - 14}`} fill="#d4d4d8" />
      <polyline points={pts.join(" ")} fill="none" stroke="#18181b" strokeWidth="2" />
      <text x="4" y={H - 2} fontSize="9" fill="#71717a">{daily[0]?.date}</text>
      <text x={W - 62} y={H - 2} fontSize="9" fill="#71717a">{daily[daily.length - 1]?.date}</text>
    </svg>
  );
}

function Donut({ slices }) {
  const total = slices.reduce((a, s) => a + s.members, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-32 w-32" role="img" aria-label="Members by tier">
        {slices.map((s) => {
          const frac = s.members / total;
          const el = (
            <circle
              key={s.tier}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={TIER_COLORS[s.tier] || "#a1a1aa"}
              strokeWidth="18"
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-acc * C}
              transform="rotate(-90 60 60)"
            >
              <title>{`${s.tier}: ${s.members}`}</title>
            </circle>
          );
          acc += frac;
          return el;
        })}
        <text x="60" y="64" textAnchor="middle" fontSize="16" fontWeight="bold">{total}</text>
      </svg>
      <ul className="text-sm">
        {slices.map((s) => (
          <li key={s.tier} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: TIER_COLORS[s.tier] || "#a1a1aa" }} />
            <span className="capitalize">{s.tier}</span>
            <span className="text-zinc-500">{s.members} · avg {s.avgBalance} pts</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HBars({ rows, valueKey, label }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.name} className="text-sm">
          <div className="flex justify-between">
            <span>{r.name}</span>
            <span className="text-zinc-500">{label(r)}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-zinc-100">
            <div className="h-2 rounded bg-zinc-900" style={{ width: `${(r[valueKey] / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {rows.length === 0 && <li className="text-sm text-zinc-500">No data yet.</li>}
    </ul>
  );
}

export default async function AnalyticsPage() {
  let data = null;
  let error = "";
  try {
    data = await backendJson("/analytics/summary");
  } catch (err) {
    error = err.message;
  }

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="text-xl font-semibold">Analytics</h1>
      <p className="mt-1 text-sm text-zinc-500">Last 30 days unless noted. Merchant totals are all-time.</p>
      {error || !data ? (
        <p className="mt-4 text-sm text-red-600">Backend error: {error || "empty response"}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Members" value={data.totals.members} />
            <Stat label="Installed passes" value={data.totals.installedPasses} />
            <Stat label="Points issued" value={data.totals.pointsIssued} />
            <Stat label="Points redeemed" value={data.totals.pointsRedeemed} />
            <Stat label="Redemptions" value={data.totals.redemptions} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Points flow" hint="Green issued · red redeemed, per day">
              <GroupedBars daily={data.daily} />
            </Card>
            <Card title="Member growth" hint="Signups per day">
              <Area daily={data.daily} />
            </Card>
            <Card title="Tier mix" hint="Members and average balance per tier">
              <Donut slices={data.tierMix} />
            </Card>
            <Card title="Top rewards" hint="Most redeemed, last 30 days of activity">
              <HBars rows={data.topRewards} valueKey="count" label={(r) => `${r.count} × · ${r.points} pts`} />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Retention" hint="Members by days since last visit — the growing right side is churn risk">
              <HBars
                rows={[
                  { name: "Active (<30d)", count: data.atRisk.active },
                  { name: "Cooling (30–60d)", count: data.atRisk.quiet30 },
                  { name: "At risk (60–90d)", count: data.atRisk.quiet60 },
                  { name: "Dormant (90d+)", count: data.atRisk.dormant90 },
                ]}
                valueKey="count"
                label={(r) => `${r.count}`}
              />
            </Card>
            <Card title="Win-back targets" hint="Highest balances idle 30+ days — best promo candidates">
              {data.winback.length === 0 ? (
                <p className="text-sm text-zinc-500">Nobody idle. Nice retention.</p>
              ) : (
                <ul className="divide-y divide-zinc-200 text-sm">
                  {data.winback.map((w) => (
                    <li key={w.memberId} className="flex items-center justify-between py-1.5">
                      <Link className="font-medium hover:underline" href={`/members/${w.memberId}`}>
                        {w.name}
                      </Link>
                      <span className="text-zinc-500">{w.pointsBalance} pts · quiet {w.daysQuiet}d</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
