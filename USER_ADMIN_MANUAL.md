# Odoo Mail Client User and Admin Manual

## 1. Purpose

This manual explains how to use and administer the Odoo Mail Client module (`odoo_mail_client`) in Odoo 18.

It covers:
- day-to-day end-user tasks (read, compose, organize, and send email)
- administrator setup (incoming/outgoing accounts, permissions, branding, and monitoring)
- operating model (where data is stored and how account state works)
- troubleshooting and support procedures

## 2. Scope and Audience

This document is intended for:
- business users who manage email communication in the Email Management app
- administrators who configure servers, permissions, and module settings
- support staff troubleshooting delivery/fetch/sync issues

## 3. Module Overview

Module name: `odoo_mail_client`

Core capabilities:
- custom Email Management app (`ir.actions.client`)
- mailbox features: inbox, sent, drafts, unread, starred, archived
- compose with To/Cc/Bcc, attachments, reply, forward
- incoming mail account management (custom list/form for `fetchmail.server`)
- outgoing SMTP settings per incoming account
- fetch tools:
  - immediate fetch from the UI
  - date-range fetch wizard (1/3/6 months)
- sync metrics and account health views
- signatures and tags
- optional custom app logo

## 4. Quick Start (End User)

1. Open the Email Management app from the main Odoo app launcher.
2. Use the mailbox list in the left navigation to open Inbox, Sent, Draft, Starred, Unread, or Archived views.
3. Open an email to read full content.
4. Use action buttons for:
   - Mark Read / Mark Unread
   - Star / Unstar
   - Archive / Unarchive
   - Reply / Forward (when not a draft)
5. Use Compose to create and send new email messages.

## 5. End-User Guide

### 5.1 Mailbox Navigation

Mailbox views available:
- All Emails
- Received Emails (Inbox)
- Sent Emails
- Draft Emails
- Unread
- Starred
- Archived

Filtering and searching:
- keyword search supports subject/body/recipient/tag context
- filter by unread, starred, with attachments
- group by priority or incoming account

### 5.2 Reading Email

When opening a non-draft message, users can:
- mark read/unread
- star or unstar
- archive or unarchive
- reply or forward

Message metadata available:
- sender
- recipients (To/Cc/Bcc)
- date/time
- thread references and parent message (when present)
- priority and tags

### 5.3 Composing and Sending

Compose supports:
- To (required if no Cc)
- Cc
- Bcc
- subject (defaults to `(No subject)` if left blank)
- rich body content
- attachments
- account selection via `From Account` (incoming server context)

Send behavior:
- if `From Account` is selected, sending is attempted with that account context
- otherwise default sending behavior is used

Draft behavior:
- drafts remain editable
- once sent, message moves to outgoing state and becomes read-only for key fields

### 5.4 Organizing Messages

Organization options:
- tags (color-enabled)
- priority
- starred flag
- archived flag

Bulk actions in list and message interactions include archive, delete, and star toggles.

## 6. Administrator Guide

### 6.1 Installation and Upgrade

1. Place module in custom addons path.
2. Update app list in Odoo.
3. Install `odoo_mail_client`.
4. After code updates, run module upgrade.

Recommended post-upgrade checks:
- open Email Management app
- open Configuration -> Incoming Mail Servers
- open Configuration -> Account Health
- verify compose/send and fetch operations

### 6.2 Permissions and Security Model

Groups and rules include:
- Internal Users (`base.group_user`):
  - can access email records
  - read-only access to incoming servers unless ownership rule allows more
- Email Manager (`odoo_mail_client.group_email_manager`):
  - create/write/delete owned incoming server accounts
- System Administrator (`base.group_system`):
  - full access on email records and incoming server records

Record visibility (`email.record`) is based on associated users and security rules.

### 6.3 Incoming Server Configuration

Menu path:
- Email Management -> Configuration -> Incoming Mail Servers

This uses a custom list and custom form view for `fetchmail.server` scoped to this module action.

#### 6.3.1 Incoming Server List

List columns include:
- name
- server
- port
- user
- last fetch end
- active

#### 6.3.2 Incoming Server Form Workflow

Form states:
- `draft`: configuration editable
- `done`: configuration locked for core connection fields

Header actions:
- `Test & Confirm` (visible in draft): validates/connects and moves account to active operational state
- `Reset Configuration` (visible in done): returns account to draft reconfiguration state
- `Fetch Now` (visible in done): opens date-range fetch wizard

Important:
- `Reset Configuration` does not delete the record; it re-opens configuration flow by state change
- after reset, use `Test & Confirm` to finalize reconfiguration

#### 6.3.3 Fields in Incoming Section

Incoming fields:
- account name
- IMAP server hostname/IP
- port
- SSL/TLS
- username
- password
- delete-on-server-on-local-delete toggle

Action model (`object_id`) is hidden in this custom form and defaulted by action context to Email Record model.

### 6.4 Outgoing SMTP Settings

Outgoing fields are configured in the same form:
- SMTP host
- SMTP port
- SMTP user
- SMTP password
- SMTP encryption (`none`, `starttls`, `ssl`)

Use draft state for editing these values.

### 6.5 Fetch Wizard (Date-Range)

`Fetch Now` opens a wizard with periods:
- 1 month back
- 3 months back
- 6 months back

On completion, user receives a notification showing:
- since date
- checked count
- failed count

### 6.6 Sync Metrics and Monitoring

Sync metrics shown on server form:
- last UID
- UID validity
- last fetch start
- last fetch end
- last fetch duration (ms)
- last fetch checked count
- last fetch failed count
- last fetch error

Account Health view (Configuration -> Account Health) provides sortable/filtered overview with failure and latency indicators.

### 6.7 Signatures

Menu path:
- Email Management -> Configuration -> Signatures

Behavior:
- signatures are user-owned
- one default signature can be maintained per user and optionally per account
- activating a new default unsets previous default in same scope

### 6.8 Tags

Menu path:
- Email Management -> Configuration -> Tags

Tags are used for email categorization and can be color-coded.

### 6.9 Custom Mail Logo

System settings location:
- Settings -> Technical/General Settings area where custom mail logo setting appears

Options:
- toggle Custom Mail Logo
- upload logo image

The logo is stored in `mail.icon` and resized for consistent display.

## 7. Data Model and Storage

Main models:
- `email.record`: message records (incoming/outgoing/draft), metadata, relationships, and flags
- `fetchmail.server`: incoming account configuration and sync state (core model extended by module)
- `fetchmail.range.wizard`: transient wizard for date-range fetch
- `mail.signature`: user signatures
- `email.tags`: tag dictionary
- `mail.icon`: custom logo storage

Notable persistence details:
- incoming deduplication uses SQL uniqueness on (`external_message_id`, `incoming_server_id`)
- attachments are stored as `ir.attachment` and linked to `email.record`
- message threading references use `message_id`, `in_reply_to`, `references_header`, and `parent_message_id`
- account sync statistics are stored on `fetchmail.server`

## 8. Operational Procedures

### 8.1 New Account Onboarding

1. Create incoming server record from Incoming Mail Servers.
2. Enter incoming and outgoing settings in draft state.
3. Click `Test & Confirm`.
4. Use `Fetch Now` to validate import flow.
5. Verify messages appear in Inbox.

### 8.2 Account Credential Rotation

1. Open server record in done state.
2. Click `Reset Configuration`.
3. Update credentials and endpoints in draft state.
4. Click `Test & Confirm`.
5. Run `Fetch Now` and verify metrics update.

### 8.3 Routine Health Checks

Daily or scheduled checks:
- review Account Health for failures and slow sync
- review `Last Fetch Error` for failing accounts
- verify message flow in Inbox and Sent

## 9. Troubleshooting Guide

### 9.1 Test and Confirm Does Not Change State

Checks:
1. Confirm record is in draft when clicking `Test & Confirm`.
2. Validate server/port/user/password and SSL/TLS values.
3. Ensure network/firewall allows IMAP/SMTP ports.
4. Check Odoo logs for fetchmail connection/authentication exceptions.

### 9.2 Reset Configuration Appears to Do Nothing

Expected behavior:
- it changes state to draft and exposes editable fields
- it does not delete record or clear all values automatically

Next step:
- update fields and click `Test & Confirm` to return to done state

### 9.3 Module Upgrade ParseError on Button Methods

If upgrade fails with invalid button action:
- verify button method names in custom views match actual methods on target model
- prefer native fetchmail methods for compatibility with your Odoo build

### 9.4 No Emails Imported

Checks:
1. account is active and in done state
2. action model (`object_id`) resolves to Email Record
3. fetch operation result/notification shows checked counts
4. incoming message deduplication is not filtering already imported emails
5. user security rules allow visibility to relevant records

### 9.5 Access Errors

Common causes:
- missing group assignment
- restrictive record rules for server ownership
- insufficient ACL on supporting models

Resolution:
- verify user group membership (Internal User / Email Manager / Admin)
- confirm record ownership and rule domains

## 10. Backup, Audit, and Recovery Notes

- include `email.record`, `fetchmail.server`, `mail.signature`, `mail.icon`, and `ir.attachment` in DB backups
- if restoring from backup, revalidate account credentials and connectivity
- after major upgrades, run account health review and sample send/fetch test

## 11. Admin Checklist

Use this checklist after deployment or upgrade:

1. Module installed/upgraded without XML parse errors.
2. Email Management app opens normally.
3. Incoming Mail Servers list and form both open.
4. Test & Confirm works from draft state.
5. Reset Configuration works from done state.
6. Fetch wizard (1/3/6 months) executes and shows result notification.
7. Compose and send works with selected From Account.
8. Account Health displays metrics.
9. Security rules behave as expected for User/Manager/Admin.
10. Optional custom logo renders correctly.

## 12. File Map for Maintainers

Primary implementation files:
- `models/email_record.py`
- `models/fetchmail_server.py`
- `models/fetchmail_range_wizard.py`
- `models/res_config_settings.py`
- `models/mail_signature.py`
- `models/mail_icon.py`
- `views/menu_item.xml`
- `views/email_record.xml`
- `views/fetchmail_fetch_wizard.xml`
- `views/res_config_views.xml`
- `views/mail_signature_views.xml`
- `security/security.xml`
- `security/ir.model.access.csv`

---

If you want a PDF/Confluence-ready version, convert this manual into your preferred documentation format and include your environment-specific deployment details (domain, SMTP relay policy, backup policy, and support contacts).
