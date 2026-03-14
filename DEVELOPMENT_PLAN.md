# Odoo Mail Client Development Plan

## 1. Objective

Build a simple, reliable, and production-ready email client module for Odoo 18 CE that supports:
- incoming mail fetch from IMAP accounts
- compose and send outbound emails
- inbox/sent/draft workflows
- safe access control for multi-user teams
- clear operational visibility (errors, sync state, retries)

Target module scope: `odoo_mail_client`.

## 2. Product Principles

- Keep user flow simple first, then add power features.
- Prefer Odoo-native mechanisms (`mail.thread`, templates, server records, record rules) over custom protocol logic unless required.
- Make failure states explicit and recoverable.
- Avoid hidden behavior; always provide visible status for sync and delivery.
- Optimize for maintainability and upgrade safety in Odoo 18 CE.

## 3. Current Baseline Summary

From the initial code assessment:
- The module structure has load-time and namespace consistency issues.
- Core email flows exist (fetch, send, reply, forward), but robustness and compatibility need improvement.
- Security and access model need hardening.
- UX baseline exists (Inbox/Sent/Draft), but missing common mailbox controls.

## 4. Delivery Strategy

Use a phased plan with strict quality gates:

- Phase 0: Stabilization and compatibility fixes
- Phase 1: Minimum Viable Email Client
- Phase 2: Production hardening and operations
- Phase 3: Productivity and automation features

Each phase ends with:
- functional verification checklist
- regression checks
- release notes and migration notes

## 5. Phase 0 - Stabilization and Compatibility (Week 1)

### 5.1 Goals

- Ensure clean install and upgrade on Odoo 18 CE.
- Eliminate runtime blockers and broken references.
- Normalize module namespace and imports.

### 5.2 Tasks

1. Fix module loading structure
- Correct root `__init__.py` imports to only import actual Python packages.
- Ensure all model extension files that must execute are imported in `models/__init__.py`.

2. Normalize external ID namespace
- Replace legacy `rt_mail_plugin.*` references with `odoo_mail_client.*` consistently in Python and XML.
- Validate all `env.ref` and XML IDs resolve.

3. Harden sender and incoming parsing
- Ensure sender is always assigned for incoming records when possible.
- Add defensive fallback when From/To headers are missing or malformed.

4. Remove unsafe template mutations
- Stop writing shared template attachment values globally in send flow.
- Pass per-send values in `email_values` safely.

5. Basic code hygiene
- Resolve warning-level regex/string issues.
- Clean dead code paths and clearly mark extension points.

### 5.3 Acceptance Criteria

- Module installs without traceback on fresh database.
- Module upgrades from previous state without XML ID errors.
- Send/reply/forward actions execute for valid emails.
- Incoming message creation never crashes on missing headers.

## 6. Phase 1 - Minimum Viable Email Client (Weeks 2-3)

### 6.1 Goals

Deliver complete user mailbox basics expected from daily email usage.

### 6.2 Functional Scope

1. Mailbox states
- Add fields and actions for `read/unread`, `starred`, `archived`.
- Add quick filters and menu entries for these states.
- Default unread emphasis in list view.

2. Compose enhancements
- Add `bcc` support in model, view, and send pipeline.
- Improve recipient validation with clear user messages.
- Ensure subject fallback and empty-body handling are deterministic.

3. Draft quality
- Improve draft behavior so partial compose is preserved and recoverable.
- Define explicit transitions: draft -> outgoing/sent.

4. Attachment reliability
- Ensure attachment content encoding is correct in both template and SMTP paths.
- Add safe file size validation and error messaging.

5. Basic threading view
- Use message headers (`Message-Id`, `References`, `In-Reply-To`) to group records.
- Expose parent/child relation in form and optional list grouping.

### 6.3 UI/UX Changes

- Add list badges/filters for unread and starred.
- Add archive/unarchive server actions.
- Add top-level search filters for sender, tags, account, unread, starred.

### 6.4 Acceptance Criteria

- Users can process typical daily workflow only from this app:
  - fetch incoming
  - read/unread toggle
  - star and archive
  - compose and send with To/Cc/Bcc and attachments
  - reply and forward
- No cross-user data leakage under record rules.

## 7. Phase 2 - Production Hardening and Operations (Weeks 4-5)

### 7.1 Goals

Improve reliability, visibility, and supportability for real deployments.

### 7.2 Functional Scope

1. Sync reliability
- Deduplicate imports by `message_id` + account context.
- Persist and use incremental sync checkpoints where possible.
- Keep existing date-range fetch wizard and add better result telemetry.

2. Delivery reliability
- Add retry policy for failed sends (max retries + delay).
- Persist normalized failure reasons and categories.
- Add manual retry action from list/form.

3. Account observability
- On each fetchmail server, store:
  - last fetch start/end
  - duration
  - fetched count
  - failed count
  - last error summary
- Add a compact dashboard/list view for account health.

4. Security hardening
- Rework ACLs:
  - avoid broad non-admin write/create on sensitive models
  - restrict account and scheduler management
- Scope record rules by groups where needed.
- Validate manager/admin exceptions explicitly.

5. Logging and diagnostics
- Standardize logger messages and include account/message identifiers.
- Add admin-oriented troubleshooting guide in README.

### 7.3 Acceptance Criteria

- Failed sends are retryable without manual SQL or developer intervention.
- Fetch errors are visible with concise root-cause hints.
- Non-admin users cannot alter critical scheduler/server config beyond intended permissions.

## 8. Phase 3 - Productivity and Automation (Weeks 6-8)

### 8.1 Goals

Add practical features that improve team throughput.

### 8.2 Feature Candidates

1. Rules engine (lightweight)
- Auto-tag by sender/domain/keywords.
- Auto-assign to users or teams.
- Optional auto-archive for system notifications.

2. Scheduled send
- Allow users to pick future send datetime.
- Respect timezone and queue processing.

3. Saved searches and smart folders
- Store user-defined filter presets.
- Common smart folders: Unread, Starred, Large Attachments, Needs Reply.

4. Templates and snippets
- Canned replies with variables.
- Per-account default signatures.

5. CRM/helpdesk bridging (optional)
- Create lead/ticket from email with one click.

### 8.3 Acceptance Criteria

- Automation can be configured by advanced users without custom code.
- Features remain optional and do not complicate baseline mailbox flow.

## 9. Data Model Plan

Planned additions (illustrative):
- `is_read` (Boolean, indexed)
- `is_starred` (Boolean, indexed)
- `is_archived` (Boolean, indexed)
- `bcc` (Many2many to `res.partner`)
- `parent_message_id` / thread linkage fields
- operational metadata fields on `fetchmail.server`

Migration approach:
- default values set in post-init/migration scripts as needed
- preserve backward compatibility for existing records

## 10. Technical Workstreams

1. Backend workstream
- model fields, compute methods, mail parsing, fetch/send logic
- duplicate protection and retries

2. Security workstream
- ACL and record rule redesign
- user role matrix and tests

3. Frontend/view workstream
- list/form/search updates
- action/menu ergonomics

4. QA workstream
- functional tests for fetch/send/reply/forward/states
- access tests for user groups

5. Documentation workstream
- admin setup guide
- user quickstart and troubleshooting

## 11. Testing Strategy

### 11.1 Automated Tests

- Unit tests for parser helpers and validation logic.
- Model tests for state transitions and write constraints.
- Integration tests for:
  - incoming processing (`message_new`)
  - send flow (template and SMTP fallback)
  - access control boundaries

### 11.2 Manual Test Matrix

1. Account setup
- valid and invalid credentials
- multiple accounts per database

2. Incoming mail
- plain text and HTML
- with/without attachments
- malformed headers

3. Outgoing mail
- To/Cc/Bcc combinations
- empty subject fallback
- large attachments

4. Security
- regular user vs manager vs admin
- visibility of shared and private emails

5. Upgrade/install
- fresh install
- module upgrade with existing data

## 12. Release Plan

### 12.1 Milestones

- M1: Phase 0 complete (stability baseline)
- M2: Phase 1 complete (MVP ready)
- M3: Phase 2 complete (production readiness)
- M4: Phase 3 complete (productivity layer)

### 12.2 Versioning Suggestion

- 18.0.1.x: stabilization + MVP
- 18.0.2.x: hardening + operations
- 18.0.3.x: productivity features

### 12.3 Deployment Steps

1. Backup DB and filestore.
2. Deploy module code.
3. Update apps list and upgrade module.
4. Run smoke test checklist.
5. Monitor logs for fetch/send exceptions for 24h.

## 13. Risk Register

1. Protocol edge cases in IMAP/SMTP providers
- Mitigation: robust parsing + explicit failure handling.

2. Access rule regressions
- Mitigation: role matrix tests and least-privilege defaults.

3. Duplicate imports
- Mitigation: dedup keys and idempotent processing checks.

4. Performance on large inboxes
- Mitigation: indexing, batched operations, reduced full-table scans.

5. Upgrade compatibility
- Mitigation: migration scripts and external ID consistency checks.

## 14. Definition of Done (Per Phase)

A phase is complete only when:
- all planned tasks are implemented
- acceptance criteria are verified
- tests pass for changed areas
- no critical or high severity open defects remain
- documentation is updated

## 15. Immediate Next Sprint Backlog (Actionable)

1. Correct package imports and module namespace references.
2. Import any missing model extension files.
3. Fix sender assignment and malformed-header safeguards.
4. Remove template global attachment mutation.
5. Implement `is_read`, `is_starred`, `is_archived` fields + filters/actions.
6. Add Bcc field through model/view/send pipeline.
7. Harden ACLs for `fetchmail.server` and scheduler access.
8. Add regression tests for send/fetch/access basics.

## 16. Success Metrics

Track after go-live:
- fetch success rate per account
- send success rate and retry recovery rate
- number of user-reported mailbox issues/week
- average sync duration and throughput
- percentage of emails correctly threaded

## 17. UI Improvement Program

### 17.1 UI Goals

- Reduce clicks for common mailbox actions.
- Improve scanability of inbox lists and conversations.
- Keep compose flow fast, clear, and error-resistant.
- Preserve Odoo-native behavior while providing modern email ergonomics.

### 17.2 Priority UI Backlog

1. Mailbox split-view layout (high)
- Add a split-view flow where users can scan list rows and read messages with minimal navigation.
- Keep compatibility with existing list/form actions for gradual rollout.

2. Row-level quick actions and status chips (high)
- One-click controls for read/unread, starred, archive, and attachment indicators.
- Visual priority for unread messages (font weight and status chip).

3. Search and filter ergonomics (high)
- Add quick filters: Unread, Starred, With Attachments, Today, This Week, From Me, By Account.
- Keep advanced filtering in search panel and preserve saved favorites.

4. Compose flow improvements (high)
- Add Bcc toggle and better recipient entry behavior.
- Show sender account clearly in compose.
- Add sticky footer with primary send action and clear validation feedback.

5. Conversation readability (medium)
- Improve reply/forward quoting readability.
- Collapse long quoted history by default when rendering thread content.

6. Empty states and onboarding hints (medium)
- Add actionable empty states for Inbox/Sent/Draft.
- Include direct actions: configure server, fetch now, compose first email.

7. Attachment experience polish (medium)
- Improve attachment block with file-type hints and size display.
- Show clearer upload/send failure feedback for invalid or large files.

8. Accessibility and keyboard efficiency (medium)
- Improve focus order, labels, and contrast in list/form controls.
- Add keyboard shortcuts for top mailbox actions where feasible.

### 17.3 UI Delivery Milestones

1. UI Sprint A (Week 1)
- Implement row-level quick actions and unread/starred chips.
- Add high-value quick filters in search.

2. UI Sprint B (Week 2)
- Implement compose flow enhancements (Bcc, sender clarity, validation UX).
- Add attachment and empty-state improvements.

3. UI Sprint C (Week 3)
- Improve conversation readability and optional split-view behavior.
- Add accessibility and keyboard pass.

### 17.4 UI Acceptance Criteria

- Common actions (open, mark unread, star, archive, reply) are achievable with fewer clicks than current baseline.
- Compose errors are shown inline and are understandable without technical details.
- Search/filter controls support daily triage without requiring advanced domain filters.
- UI remains responsive and usable on both laptop and standard desktop resolutions.

### 17.5 UI Validation Checklist

1. Inbox workflow
- Open and triage 20+ emails without leaving the mailbox context repeatedly.

2. Compose workflow
- Send with To/Cc/Bcc, attachments, and explicit sender account selection.

3. Discovery workflow
- Find target emails using quick filters and keyword search in under 3 interactions.

4. Accessibility workflow
- Navigate key actions using keyboard-only path for read/star/archive/reply.

---

This plan is designed to get to a stable MVP quickly, then layer reliability and productivity without sacrificing simplicity.