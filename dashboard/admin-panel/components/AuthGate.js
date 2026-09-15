"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase";

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState(() =>
    firebaseConfigured() ? { loading: true, user: null } : { loading: false, user: null }
  );

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => setState({ loading: false, user }));
  }, []);

  useEffect(() => {
    if (!state.loading && !state.user && pathname !== "/login" && firebaseConfigured()) {
      router.replace("/login");
    }
  }, [state, pathname, router]);

  if (!firebaseConfigured()) {
    if (pathname === "/login") return children;
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Firebase Auth not configured</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Set <code>NEXT_PUBLIC_FIREBASE_API_KEY</code>, <code>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN</code> and{" "}
          <code>NEXT_PUBLIC_FIREBASE_PROJECT_ID</code> (see <code>.env.example</code>), enable Email/Password
          sign-in in the Firebase console, then reload.
        </p>
      </main>
    );
  }
  if (state.loading) return <main className="p-8 text-sm text-zinc-500">Loading…</main>;
  if (!state.user && pathname !== "/login") return null;
  return children;
}
