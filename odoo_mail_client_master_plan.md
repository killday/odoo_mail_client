# Odoo Mail Client -- Master Development Plan

Target Version: **Odoo 18 CE**

This document consolidates all architectural improvements and
implementation strategies into a single production-grade plan for
building a scalable email client module inside Odoo.

Module Name: `odoo_mail_client`

Goals: - Multi-account email support per user - Reliable IMAP fetching -
Correct SMTP sending - Scalable mailbox architecture - Production
observability - Upgrade safety for future Odoo versions

------------------------------------------------------------------------

# 1. Core Design Principles

## Simplicity First

Deliver a reliable mailbox workflow before advanced automation.

## Explicit System Behavior

All critical states must be visible: - delivery status - sync state -
retries - errors

## Prefer Odoo Native Systems

Use Odoo core models when possible: - mail.message - mail.mail -
fetchmail.server - ir.mail_server

## Operational Transparency

All operations must be: - logged - recoverable - observable

------------------------------------------------------------------------

# 2. High Level Architecture

Incoming pipeline:

IMAP\
↓\
fetchmail.server\
↓\
UID incremental sync\
↓\
email parser\
↓\
Message-ID deduplication\
↓\
mail.message (global message store)\
↓\
mail.mailbox.entry (user mailbox entries)

Outgoing pipeline:

email.compose\
↓\
mail.mail\
↓\
Odoo mail queue\
↓\
ir.mail_server\
↓\
SMTP delivery

------------------------------------------------------------------------

# 3. Scalable Mailbox Architecture

The system separates **messages** from **mailbox entries**.

## Global Message Store

Model:

mail.message

Stores immutable message data:

-   subject
-   body
-   sender
-   recipients
-   attachments
-   message headers
-   threading information

## Mailbox Layer

Model:

mail.mailbox.entry

Stores user-specific state:

-   user_id
-   account_id
-   message_id
-   mailbox_type
-   is_read
-   is_starred
-   is_archived

Benefits:

-   scalable inbox
-   multi-user mailboxes
-   faster queries
-   simpler permissions

------------------------------------------------------------------------

# 4. Multi Account Support

Each user can own multiple accounts via:

fetchmail.server

Example:

support@company.com\
sales@company.com\
info@company.com

Messages store the account they belong to.

mail.message fields:

-   mail_account_id

mail.mailbox.entry fields:

-   account_id

Replying automatically uses the original account.

------------------------------------------------------------------------

# 5. Message Deduplication

To prevent duplicate messages across accounts:

Use the email header:

Message-ID

mail.message field:

external_message_id

Workflow:

If message exists → reuse message record\
If not → create message

Mailbox entries are then created per account.

Fallback when Message-ID missing:

SHA1 hash of:

subject + sender + body

------------------------------------------------------------------------

# 6. Fast IMAP Synchronization

Use **UID incremental synchronization**.

fetchmail.server fields:

-   last_uid
-   uid_validity
-   last_sync

Fetch algorithm:

1.  connect to IMAP
2.  read last_uid
3.  search UID last_uid+1:\*\
4.  fetch new messages
5.  update last_uid

Benefits:

-   handles large inboxes
-   reduces sync time dramatically

------------------------------------------------------------------------

# 7. Message Threading

Thread detection uses headers:

-   Message-ID
-   In-Reply-To
-   References

mail.message fields:

-   parent_message_id
-   external_message_id

References header must be parsed to reconstruct full conversation trees.

Thread creation logic:

1.  parse References list
2.  locate existing parent message
3.  attach message to thread

------------------------------------------------------------------------

# 8. Sending Architecture

Instead of custom SMTP code, rely on Odoo queue.

email.record → creates mail.mail

mail.mail fields:

-   subject
-   body_html
-   email_to
-   email_cc
-   email_bcc
-   email_from
-   mail_server_id

Benefits:

-   automatic retries
-   logging
-   queue management
-   attachment encoding handled by Odoo

------------------------------------------------------------------------

# 9. Permissions Model

Users may:

-   read emails from assigned accounts
-   send emails from assigned accounts

Admins may:

-   manage accounts
-   manage schedulers

Record rules primarily based on:

user_id and account_id

------------------------------------------------------------------------

# 10. UI Design

Mailbox features:

-   Inbox
-   Sent
-   Drafts
-   Starred
-   Archived

Quick filters:

Unread\
Starred\
Attachments\
Today\
This Week\
By Account

Compose features:

-   To / CC / BCC
-   account selector
-   attachment uploads
-   autosave drafts
-   signature per account

------------------------------------------------------------------------

# 11. Reliability Features

Delivery states:

draft\
queued\
sent\
failed

Retry support handled by mail.mail queue.

Fetch reliability:

-   UID checkpoints
-   duplicate prevention
-   header parsing fallback

------------------------------------------------------------------------

# 12. Observability

fetchmail.server stores metrics:

-   last_fetch_start
-   last_fetch_end
-   duration
-   fetched_count
-   failed_count
-   last_error

Admin dashboard displays account health.

------------------------------------------------------------------------

# 13. Testing Strategy

Automated tests:

-   parser helpers
-   threading logic
-   send pipeline
-   deduplication

Integration tests:

-   IMAP fetch
-   SMTP send
-   multi-account flows

Manual tests:

-   large attachments
-   malformed headers
-   reply chains

------------------------------------------------------------------------

# 14. Deployment Strategy

Steps:

1.  backup database and filestore
2.  deploy module code
3.  update apps list
4.  upgrade module

Command:

odoo-bin -u odoo_mail_client

Monitor logs for 24 hours after deployment.

------------------------------------------------------------------------

# 15. Performance Optimizations

Key improvements included:

UID incremental IMAP sync\
Message-ID deduplication\
Mailbox entry separation\
Database indexing on:

-   user_id
-   account_id
-   mailbox_type
-   is_read

These optimizations allow the system to handle:

10k--200k email inboxes efficiently.

------------------------------------------------------------------------

# 16. Future Extensions

Optional future features:

-   rules engine for auto tagging
-   scheduled email sending
-   saved searches
-   canned responses
-   CRM / Helpdesk integration
-   smart folders

------------------------------------------------------------------------

# 17. Final Module Structure

odoo_mail_client/

models/ - mailbox_entry.py - message_extension.py -
fetchmail_extension.py

services/ - imap_fetch_service.py - mail_send_service.py -
threading_service.py

views/ - mailbox_views.xml - compose_views.xml

security/ - ir.model.access.csv

data/ - cron_fetch.xml

------------------------------------------------------------------------

# 18. Development Timeline

Week 1\
Stabilization and architecture setup

Week 2--3\
Core mailbox features

Week 4\
Fetch reliability and threading

Week 5\
Security and multi-user model

Week 6\
UI polish and production readiness

------------------------------------------------------------------------

# 19. Final Result

The system provides:

✔ multi-account support\
✔ scalable mailbox architecture\
✔ high performance IMAP sync\
✔ reliable SMTP delivery\
✔ correct email threading\
✔ upgrade safety for Odoo
