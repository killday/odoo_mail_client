from datetime import timedelta, timezone
import email as email_lib
from email.utils import parsedate_to_datetime
import logging
import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)


class FetchmailServer(models.Model):
    _inherit = 'fetchmail.server'

    delete_from_server_on_local_delete = fields.Boolean(
        string='Delete On Server When Deleted In Odoo',
        default=False,
        help='If enabled, deleting an imported incoming email in Odoo also deletes the matching message from this IMAP mailbox.',
    )
    # Outgoing SMTP Settings (like in modern mail clients)
    smtp_host = fields.Char(
        'SMTP Host',
        help='SMTP server hostname or IP address for sending emails from this account.',
    )
    smtp_port = fields.Integer(
        'SMTP Port',
        default=587,
        help='SMTP port (typically 587 for TLS, 465 for SSL, 25 for unencrypted).',
    )
    smtp_user = fields.Char(
        'SMTP User',
        help='Email username for SMTP authentication.',
    )
    smtp_password = fields.Char(
        'SMTP Password',
        help='Password for SMTP authentication.',
    )
    smtp_encryption = fields.Selection(
        [('none', 'None'), ('starttls', 'STARTTLS'), ('ssl', 'SSL/TLS')],
        string='SMTP Encryption',
        default='starttls',
        help='Type of encryption for SMTP connection.',
    )
    last_fetch_start = fields.Datetime('Last Fetch Start', copy=False, readonly=True)
    last_fetch_end = fields.Datetime('Last Fetch End', copy=False, readonly=True)
    last_fetch_duration_ms = fields.Integer('Last Fetch Duration (ms)', copy=False, readonly=True)
    last_fetch_count = fields.Integer('Last Fetch Checked Count', copy=False, readonly=True)
    last_fetch_failed_count = fields.Integer('Last Fetch Failed Count', copy=False, readonly=True)
    last_fetch_error = fields.Text('Last Fetch Error', copy=False, readonly=True)
    last_uid = fields.Integer('Last Synced UID', default=0, copy=False)
    uid_validity = fields.Char('UID Validity', copy=False, readonly=True)

    def _extract_uid_from_fetch_meta(self, fetch_meta):
        if isinstance(fetch_meta, bytes):
            fetch_meta = fetch_meta.decode(errors='ignore')
        match = re.search(r'UID\s+(\d+)', fetch_meta or '')
        return int(match.group(1)) if match else 0

    @api.model
    def action_fetch_now_for_user(self):
        """Fetch new messages now from all accessible incoming servers.

        Uses native fetchmail server fetch flow so all supported server types
        (IMAP/POP/provider-specific setups) follow Odoo's standard behavior.
        """
        servers = self.search([
            ('active', '=', True),
            ('object_id', '!=', False),
        ])
        fetched_servers = 0
        failed_servers = 0

        if not servers:
            return {
                'servers_total': 0,
                'servers_fetched': 0,
                'servers_failed': 0,
            }

        # Keep server visibility constrained by current user search, but execute
        # the fetch with elevated rights to avoid write-access failures on
        # fetch metadata fields (date/last_* counters).
        for server in self.sudo().browse(servers.ids):

            server_ctx = {
                'fetchmail_cron_running': True,
                'default_fetchmail_server_id': server.id,
                'fetchmail_server_id': server.id,
                'mail_fetchmail_server_id': server.id,
            }
            try:
                # Native method from fetchmail.server supports both IMAP and POP.
                server.with_context(**server_ctx).fetch_mail()
                fetched_servers += 1
            except TypeError:
                try:
                    server.with_context(**server_ctx).fetch_mail(raise_exception=False)
                    fetched_servers += 1
                except Exception:
                    failed_servers += 1
                    _logger.warning(
                        'Manual fetch failed on server %s (%s).',
                        server.name,
                        server.server_type,
                        exc_info=True,
                    )
            except Exception:
                failed_servers += 1
                _logger.warning(
                    'Manual fetch failed on server %s (%s).',
                    server.name,
                    server.server_type,
                    exc_info=True,
                )

        return {
            'servers_total': len(servers),
            'servers_fetched': fetched_servers,
            'servers_failed': failed_servers,
        }

    def action_open_fetch_range_wizard(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Fetch Emails'),
            'res_model': 'fetchmail.range.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_fetchmail_server_id': self.id,
            },
        }

    def _delete_message_by_message_id(self, message_id):
        self.ensure_one()
        if self.server_type != 'imap' or not message_id:
            return False

        message_id = (message_id or '').strip()
        if not message_id:
            return False
        if not message_id.startswith('<'):
            message_id = '<%s>' % message_id

        imap_server = None
        try:
            imap_server = self.connect()
            imap_server.select()
            _, data = imap_server.search(None, 'HEADER', 'Message-ID', message_id)
            numbers = data[0].split() if data and data[0] else []
            if not numbers:
                return False

            for num in numbers:
                imap_server.store(num, '+FLAGS', '(\\Deleted)')
            imap_server.expunge()
            return True
        except Exception:
            _logger.warning(
                'Failed to delete server message by Message-ID on server %s: %s',
                self.name,
                message_id,
                exc_info=True,
            )
            return False
        finally:
            if imap_server:
                try:
                    imap_server.close()
                    imap_server.logout()
                except Exception:
                    _logger.warning(
                        'Failed to properly finish imap connection after delete on server: %s.',
                        self.name,
                        exc_info=True,
                    )

    def fetch_mail_by_month_window(self, months, raise_exception=True):
        self.ensure_one()
        if self.server_type != 'imap':
            raise ValidationError(_('Date-range fetch is supported for IMAP servers only.'))
        if months not in (1, 3, 6):
            raise ValidationError(_('Invalid fetch period. Choose 1, 3, or 6 months.'))
        if not self.object_id:
            raise ValidationError(_('Please set "Actions to Perform on Incoming Mails" first.'))

        additional_context = {
            'fetchmail_cron_running': True,
            'default_fetchmail_server_id': self.id,
            'fetchmail_server_id': self.id,
            'mail_fetchmail_server_id': self.id,
        }
        cutoff_dt = fields.Datetime.now() - timedelta(days=30 * months)
        if cutoff_dt.tzinfo is None:
            cutoff_dt = cutoff_dt.replace(tzinfo=timezone.utc)
        since_date = cutoff_dt.strftime('%d-%b-%Y')
        mail_thread = self.env['mail.thread']

        count, failed = 0, 0
        max_seen_uid = int(self.last_uid or 0)
        fetch_started_at = fields.Datetime.now()
        fetch_error = False
        imap_server = None
        try:
            self.write({
                'last_fetch_start': fetch_started_at,
                'last_fetch_error': False,
            })
            imap_server = self.connect()
            imap_server.select()

            try:
                uid_validity_response = imap_server.response('UIDVALIDITY')
                uid_validity_raw = (
                    uid_validity_response[1][0]
                    if uid_validity_response and uid_validity_response[1]
                    else False
                )
                if uid_validity_raw:
                    self.uid_validity = (
                        uid_validity_raw.decode(errors='ignore')
                        if isinstance(uid_validity_raw, bytes)
                        else str(uid_validity_raw)
                    )
            except Exception:
                _logger.info('Could not determine UIDVALIDITY for server %s.', self.name, exc_info=True)

            use_uid_incremental = bool(self.last_uid)
            numbers = []

            if use_uid_incremental:
                try:
                    start_uid = int(self.last_uid) + 1
                    _, data = imap_server.uid('search', None, 'UID %d:*' % start_uid)
                    numbers = data[0].split() if data and data[0] else []
                except Exception:
                    _logger.info(
                        'UID incremental search failed on server %s; falling back to SINCE search.',
                        self.name,
                        exc_info=True,
                    )
                    use_uid_incremental = False

            if not use_uid_incremental:
                _, data = imap_server.search(None, 'SINCE', since_date)
                numbers = data[0].split() if data and data[0] else []

            for num in numbers:
                if use_uid_incremental:
                    _, payload = imap_server.uid('fetch', num, '(UID INTERNALDATE RFC822)')
                else:
                    _, payload = imap_server.fetch(num, '(UID INTERNALDATE RFC822)')
                if not payload or not payload[0]:
                    continue

                raw_msg = payload[0][1]

                server_received_dt = None
                try:
                    fetch_meta = payload[0][0]
                    parsed_uid = self._extract_uid_from_fetch_meta(fetch_meta)
                    if parsed_uid:
                        max_seen_uid = max(max_seen_uid, parsed_uid)
                    if isinstance(fetch_meta, bytes):
                        fetch_meta = fetch_meta.decode(errors='ignore')
                    marker = 'INTERNALDATE "'
                    idx = fetch_meta.find(marker)
                    if idx != -1:
                        end_idx = fetch_meta.find('"', idx + len(marker))
                        if end_idx != -1:
                            internal_date_raw = fetch_meta[idx + len(marker):end_idx]
                            parsed_internal_date = parsedate_to_datetime(internal_date_raw)
                            if parsed_internal_date.tzinfo is None:
                                parsed_internal_date = parsed_internal_date.replace(tzinfo=timezone.utc)
                            server_received_dt = parsed_internal_date.astimezone(timezone.utc).replace(tzinfo=None)
                except Exception:
                    _logger.warning(
                        'Could not parse INTERNALDATE on server %s; falling back to header date.',
                        self.name,
                        exc_info=True,
                    )

                parsed_headers = None
                try:
                    parsed_headers = (
                        email_lib.message_from_bytes(raw_msg)
                        if isinstance(raw_msg, bytes)
                        else email_lib.message_from_string(raw_msg)
                    )
                except Exception:
                    _logger.warning(
                        'Could not parse message headers on server %s; processing anyway.',
                        self.name,
                        exc_info=True,
                    )

                # Only process messages addressed to this server email when we
                # can infer a valid email identifier from server configuration.
                # Some setups use non-email IMAP usernames (e.g. 'killday').
                server_emails = []
                for candidate in (self.user, self.name):
                    candidate = (candidate or '').strip().lower()
                    if '@' in candidate and candidate not in server_emails:
                        server_emails.append(candidate)

                if server_emails and parsed_headers:
                    try:
                        recipient_text = ' '.join(
                            parsed_headers.get(h, '').lower()
                            for h in ('to', 'cc', 'delivered-to', 'x-original-to', 'envelope-to')
                        )
                        if not any(server_email in recipient_text for server_email in server_emails):
                            _logger.debug(
                                'Skipping message not addressed to server identifiers %s on server %s.',
                                server_emails,
                                self.name,
                            )
                            continue
                    except Exception:
                        _logger.warning(
                            'Could not parse headers for recipient check on server %s; processing anyway.',
                            self.name,
                            exc_info=True,
                        )

                # IMAP SINCE uses internal mailbox dates, which may be newer than
                # the actual Date header after migrations/copies. Enforce the
                # requested window against the message Date header as well.
                if parsed_headers and parsed_headers.get('date'):
                    try:
                        message_dt = parsedate_to_datetime(parsed_headers.get('date'))
                        if message_dt.tzinfo is None:
                            message_dt = message_dt.replace(tzinfo=timezone.utc)
                        if message_dt < cutoff_dt:
                            _logger.debug(
                                'Skipping message older than cutoff on server %s (message date: %s, cutoff: %s).',
                                self.name,
                                message_dt,
                                cutoff_dt,
                            )
                            continue
                    except Exception:
                        _logger.warning(
                            'Could not parse Date header for range filter on server %s; processing anyway.',
                            self.name,
                            exc_info=True,
                        )

                try:
                    mail_thread.with_context(
                        **additional_context,
                        default_received_on_server=server_received_dt,
                    ).message_process(
                        self.object_id.model,
                        raw_msg,
                        save_original=self.original,
                        strip_attachments=(not self.attach),
                    )
                except Exception:
                    failed += 1
                    _logger.info(
                        'Failed to process mail from %s server %s.',
                        self.server_type,
                        self.name,
                        exc_info=True,
                    )

                self.env.cr.commit()
                count += 1

            self.date = fields.Datetime.now()
            self.last_uid = max_seen_uid
            self.env.cr.commit()
            _logger.info(
                'Fetched %d email(s) from last %d month(s) on server %s; %d succeeded, %d failed.',
                count,
                months,
                self.name,
                (count - failed),
                failed,
            )

        except Exception as err:
            fetch_error = str(err)
            if raise_exception:
                raise ValidationError(
                    _("Couldn't fetch your emails. Check out the error message below for more info:\n%s", err)
                ) from err
            _logger.info(
                'General failure when trying to fetch mail from %s server %s.',
                self.server_type,
                self.name,
                exc_info=True,
            )
        finally:
            fetch_end_at = fields.Datetime.now()
            fetch_duration_ms = int((fetch_end_at - fetch_started_at).total_seconds() * 1000)
            self.write({
                'last_fetch_end': fetch_end_at,
                'last_fetch_duration_ms': max(fetch_duration_ms, 0),
                'last_fetch_count': count,
                'last_fetch_failed_count': failed,
                'last_fetch_error': fetch_error,
                'last_uid': max_seen_uid,
            })
            if imap_server:
                try:
                    imap_server.close()
                    imap_server.logout()
                except Exception:
                    _logger.warning('Failed to properly finish imap connection: %s.', self.name, exc_info=True)

        return {'count': count, 'failed': failed, 'since': since_date}
