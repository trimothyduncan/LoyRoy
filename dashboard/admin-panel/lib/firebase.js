// Client-side Firebase Auth. Env-driven; returns null when unconfigured so
// pages render a setup notice instead of crashing the build.
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export function firebaseConfigured() {
  return Boolean(config.apiKey && config.projectId);
}

export function getFirebaseAuth() {
  if (!firebaseConfigured()) return null;
  if (!getApps().length) initializeApp(config);
  return getAuth();
}
