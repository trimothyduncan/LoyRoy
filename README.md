# OpenCode Loyalty SaaS Agent Package

This package configures an OpenCode-based coding agent to audit, repair/refactor, or rebuild a multi-tenant loyalty-card SaaS using Apple Wallet and Google Wallet.

## Start here

1. Copy these files into the root of the repository you want the agent to operate on.
2. Keep the existing project under Git.
3. Create a checkpoint/tag before the first write-capable session.
4. Give the agent read-only infrastructure access for the initial audit where practical.
5. Start OpenCode in the repository root.
6. Tell the agent: `Run the first-run audit. Do not modify infrastructure or application code until the audit report and implementation decision are complete.`
7. Review `docs/AUDIT_REPORT.md`.
8. Then authorize the implementation phase.

## Important

The Markdown files do not grant access to Supabase, Render, GitHub, Apple, or Google. OpenCode/tool/MCP credentials provide access; these files define how that access must be used.

Never place real secrets in this package or Git.
