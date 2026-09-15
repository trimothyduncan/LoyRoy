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
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="text-xl font-semibold">Members</h1>
      <form className="mt-3 flex gap-2" action="/members" method="get">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search name or email"
          className="w-full rounded border border-zinc-300 px-3 py-2"
        />
        <button className="rounded bg-zinc-900 px-4 py-2 text-white" type="submit">
          Search
        </button>
      </form>
      {error ? (
        <p className="mt-4 text-sm text-red-600">Backend error: {error}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-zinc-500">{data.count} member(s)</p>
          <ul className="mt-2 divide-y divide-zinc-200 border-y border-zinc-200">
            {data.members.map((m) => (
              <li key={m.memberId} className="flex items-center justify-between py-2">
                <div>
                  <Link className="font-medium hover:underline" href={`/members/${m.memberId}`}>
                    {m.name}
                  </Link>
                  <span className="ml-2 text-sm text-zinc-500">
                    {m.tier} · {m.pointsBalance} pts
                  </span>
                </div>
                <span className="text-sm text-zinc-400">{m.email || ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
