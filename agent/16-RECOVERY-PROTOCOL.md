# Incident and Recovery Protocol

## Trigger
Use this protocol when:
- same error appears twice after fixes;
- deployment repeatedly fails;
- environment variables appear inconsistent;
- service state conflicts with repository expectations.

## Procedure
1. Freeze speculative changes.
2. Capture exact error.
3. Record timestamp/environment/service.
4. Identify first failing component.
5. Inspect actual configuration.
6. Inspect deployment/log history.
7. Compare expected vs actual.
8. Identify dependencies.
9. Form a falsifiable hypothesis.
10. Run the smallest diagnostic.
11. Apply the smallest evidence-supported change.
12. Verify.
13. Document.

## Three-attempt escalation
After three failed attempts, create:
`diagnostics/incident-YYYY-MM-DD.md`

Include:
- symptom
- exact error
- affected environment
- service
- attempted fixes
- files changed
- evidence
- hypothesis history
- current state
- proposed next test

## Rollback
If a change worsens the state:
- stop;
- revert the change where safe;
- preserve diagnostic evidence;
- do not stack additional speculative changes.
