"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      router.replace("/members");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!firebaseConfigured()) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Firebase Auth not configured</h1>
        <p className="mt-2 text-sm text-zinc-600">See <code>.env.example</code> for the required variables.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-xl font-semibold">Staff sign in</h1>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <input
          className="rounded border border-zinc-300 px-3 py-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="rounded border border-zinc-300 px-3 py-2"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-zinc-900 px-3 py-2 text-white" type="submit">
          Sign in
        </button>
      </form>
      <button
        className="mt-4 text-sm text-zinc-500 underline"
        onClick={async () => {
          await signOut(getFirebaseAuth());
          router.refresh();
        }}
      >
        Sign out
      </button>
    </main>
  );
}
