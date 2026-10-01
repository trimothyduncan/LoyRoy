# Reset / Rebuild Strategy

Starting over does not mean deleting everything.

## Classify
For every existing subsystem choose:
- KEEP
- REFACTOR
- REPLACE
- DISCARD
- UNKNOWN

## Preserve
Potentially preserve:
- working UI
- useful domain logic
- tested wallet components
- migrations with valid data
- assets
- documentation

## Replace
Replace components when:
- architecture prevents required behavior;
- configuration is internally inconsistent;
- security boundary is wrong;
- repeated evidence shows the implementation cannot satisfy requirements.

## Destructive actions
Never:
- drop production tables casually;
- delete a Render service as a troubleshooting shortcut;
- destroy credentials without dependency analysis.

## Clean rebuild
If a clean rebuild is selected:
1. preserve the old repository/branch/tag;
2. create a new branch or repository;
3. extract reusable components deliberately;
4. establish environment schema first;
5. establish database and auth;
6. build provider abstractions;
7. implement wallet providers;
8. build dashboard;
9. test;
10. deploy staging;
11. migrate production only with an explicit plan.
