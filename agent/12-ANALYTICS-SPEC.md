# Analytics and CRM Specification

## Event model
Every significant product event should be recorded with:
- organization_id
- event_type
- timestamp
- actor/user when applicable
- customer_id when applicable
- pass_id when applicable
- source
- non-sensitive metadata

## Metrics
Potential metrics:
- total customers
- active customers
- total passes
- Apple installations
- Google installations
- installation rate
- visits
- redemptions
- activity over time
- customer retention indicators

Do not invent metrics whose definitions are ambiguous. Document metric definitions.

## Privacy
Do not place secrets or unnecessary sensitive data in analytics metadata.
