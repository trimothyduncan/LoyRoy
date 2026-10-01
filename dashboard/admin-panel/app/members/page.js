import Link from "next/link";
import { backendJson } from "@/lib/backend";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }) {
  const { search = "" } = await searchParams;
  let data = { members: [], count: 0 };
  let error = "";
  try {
    data = await backendJson(`/members?search=${encodeURIComponent(search)}&limit=25`);
  } catch (err) {
    error = err.message;
  }

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <h1 className="v-title">Members</h1>
      <form className="mt-3 flex gap-2" action="/members" method="get">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search name or email"
          className="v-input"
        />
        <button className="v-btn shrink-0" type="submit">
          Search
        </button>
      </form>
      {error ? (
        <p className="mt-4 text-sm text-red-400">Backend error: {error}</p>
      ) : (
        <div className="v-card mt-4 p-4">
          <p className="v-muted text-sm">{data.count} member(s)</p>
          <ul className="v-divide mt-2">
            {data.members.map((m) => (
              <li key={m.memberId} className="flex items-center justify-between py-2">
                <div>
                  <Link className="v-link font-medium" href={`/members/${m.memberId}`}>
                    {m.name}
                  </Link>
                  <span className="v-muted ml-2 text-sm">
                    {m.tier} · {m.pointsBalance} pts
                  </span>
                </div>
                <span className="v-muted text-sm">{m.email || ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
