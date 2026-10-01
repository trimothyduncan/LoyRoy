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
        <div className="v-card p-6">
          <h1 className="v-title">Firebase Auth not configured</h1>
          <p className="v-muted mt-2 text-sm">See <code>.env.example</code> for the required variables.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <div className="v-card p-6">
        <h1 className="v-title">LoyRoy Admin</h1>
        <p className="v-muted mt-1 text-sm">Staff sign in</p>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <input
            className="v-input"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="v-input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="v-btn" type="submit">
            Sign in
          </button>
        </form>
        <button
          className="v-muted mt-4 text-sm underline"
          onClick={async () => {
            await signOut(getFirebaseAuth());
            router.refresh();
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
