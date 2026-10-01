import { backendJson } from "@/lib/backend";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TIER_COLORS = {
  bronze: "#f59e0b",
  silver: "#9ca3af",
  gold: "#facc15",
  platinum: "#64748b",
  vip: "#e8ecf7",
};

const AXIS = "#93a1c0";

function Stat({ label, value }) {
  return (
    <div className="v-card px-4 py-3">
      <p className="v-muted text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Card({ title, hint, children }) {
  return (
    <section className="v-card p-4">
      <h2 className="font-semibold text-white">{title}</h2>
      {hint && <p className="v-muted mt-0.5 text-xs">{hint}</p>}
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
            <rect x={i * bw + 1} y={H - 18 - hi} width={w} height={hi} fill="#10b981" rx="1">
              <title>{`${d.date}: +${d.issued} issued`}</title>
            </rect>
            <rect x={i * bw + 1 + w} y={H - 18 - hr} width={w} height={hr} fill="#f87171" rx="1">
              <title>{`${d.date}: -${d.redeemed} redeemed`}</title>
            </rect>
          </g>
        );
      })}
      <text x="4" y={H - 4} fontSize="9" fill={AXIS}>{daily[0]?.date}</text>
      <text x={W - 62} y={H - 4} fontSize="9" fill={AXIS}>{daily[daily.length - 1]?.date}</text>
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
      <polygon points={`0,${H - 14} ${pts.join(" ")} ${W},${H - 14}`} fill="rgba(0,117,255,0.35)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#38bdf8" strokeWidth="2" />
      <text x="4" y={H - 2} fontSize="9" fill={AXIS}>{daily[0]?.date}</text>
      <text x={W - 62} y={H - 2} fontSize="9" fill={AXIS}>{daily[daily.length - 1]?.date}</text>
    </svg>
  );
}

function Donut({ slices }) {
  const total = slices.reduce((a, s) => a + s.members, 0) || 1;
  const R = 52;
  const C = 2 * Math.PI * R;
  const fracs = slices.map((s) => s.members / total);
  const starts = fracs.map((_, i) => fracs.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-32 w-32" role="img" aria-label="Members by tier">
        {slices.map((s, i) => (
          <circle
            key={s.tier}
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={TIER_COLORS[s.tier] || "#a1a1aa"}
            strokeWidth="18"
            strokeDasharray={`${fracs[i] * C} ${C}`}
            strokeDashoffset={-starts[i] * C}
            transform="rotate(-90 60 60)"
          >
            <title>{`${s.tier}: ${s.members}`}</title>
          </circle>
        ))}
        <text x="60" y="64" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#fff">{total}</text>
      </svg>
      <ul className="text-sm">
        {slices.map((s) => (
          <li key={s.tier} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: TIER_COLORS[s.tier] || "#a1a1aa" }} />
            <span className="capitalize text-slate-200">{s.tier}</span>
            <span className="v-muted">{s.members} · avg {s.avgBalance} pts</span>
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
            <span className="text-slate-200">{r.name}</span>
            <span className="v-muted">{label(r)}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-white/10">
            <div className="h-2 rounded bg-gradient-to-r from-sky-400 to-blue-600" style={{ width: `${(r[valueKey] / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {rows.length === 0 && <li className="v-muted text-sm">No data yet.</li>}
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
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="v-title">Analytics</h1>
      <p className="v-muted mt-1 text-sm">Last 30 days unless noted. Merchant totals are all-time.</p>
      {error || !data ? (
        <p className="mt-4 text-sm text-red-400">Backend error: {error || "empty response"}</p>
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
                <p className="v-muted text-sm">Nobody idle. Nice retention.</p>
              ) : (
                <ul className="v-divide text-sm">
                  {data.winback.map((w) => (
                    <li key={w.memberId} className="flex items-center justify-between py-1.5">
                      <Link className="v-link font-medium" href={`/members/${w.memberId}`}>
                        {w.name}
                      </Link>
                      <span className="v-muted">{w.pointsBalance} pts · quiet {w.daysQuiet}d</span>
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
