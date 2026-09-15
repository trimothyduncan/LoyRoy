/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin Turbopack's workspace root to this app so builds work whether the
  // host runs them here or from the repo root (two lockfiles exist).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
