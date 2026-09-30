# Tool and MCP Registry

## Required capability groups

### Filesystem
- read
- write
- search
- execute commands

### Git/GitHub
- repository inspection
- branch
- commit
- diff
- pull request where appropriate

### Supabase
- project inspection
- SQL/database inspection
- migrations
- auth
- storage
- functions/configuration where supported

### Render
- service inspection
- deployment inspection
- logs
- environment configuration
- deploy/redeploy where supported

### Apple
Use current official Apple tooling/documentation for Wallet requirements.

### Google
Use current official Google Wallet tooling/documentation for Wallet requirements.

## Discovery procedure
If a required capability is missing:
1. inspect available MCP/plugin/tool registry;
2. identify a tool that explicitly provides the capability;
3. inspect its permissions/schema;
4. use the narrowest capability necessary;
5. document the tool in this file.

Do not claim a tool can modify infrastructure unless its schema/permissions confirm it.

## Principle
Tools provide capability. Markdown files provide policy and procedure.
