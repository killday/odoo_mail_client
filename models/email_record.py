from odoo import api, fields, models, _, tools, exceptions
import re
import logging
import base64

_logger = logging.getLogger(__name__)

class Email(models.Model):
    _name = 'email.record'
    _rec_name = 'subject'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Email Record'

    subject = fields.Char('Subject')
    to = fields.Many2many('res.partner', 'rel_to_email', string="To")
    cc = fields.Many2many('res.partner', 'rel_cc_email', string="Cc")
    bcc = fields.Many2many('res.partner', 'rel_bcc_email', string="Bcc")
    sender = fields.Many2one('res.partner', string="From", readonly=True, ondelete="restrict", compute='_get_sender', store=True)
    body = fields.Html(string="Body")
    priority = fields.Selection([('0', 'Low'), ('1', 'Medium'), ('2', 'High'), ('3', 'Very High')], string='Priority',
                                default='0', tracking=True)
    type = fields.Selection([('draft', 'Draft'), ('outgoing', 'Outgoing'), ('incoming', 'Incoming')], string='Type',
                            default='draft', readonly=True)
    date_time = fields.Datetime(string='Date', default=lambda self: fields.Datetime.now(), readonly=True)
    tags = fields.Many2many('email.tags', 'rel_email_tags', string="Tags")
    attachments = fields.Many2many('ir.attachment', 'email_record_attachment_relation', 'res_id', 'attachment_id',
                                   string='Attachments')
    attachment_icon = fields.Boolean(compute="_attachment_icon_compute")
    parent_exists = fields.Boolean('Check Parent')

    # Email will only be visible/accessible to the users added in this field:
    associated_users = fields.Many2many('res.users', 'email_user_relation', default=lambda self: self.env.user,
                                        string='Associated Users', readonly=True)
    message_id = fields.Char('Message ID')
    external_message_id = fields.Char('External Message ID', index=True, readonly=True)
    in_reply_to = fields.Char('In-Reply-To', readonly=True)
    references_header = fields.Text('References', readonly=True)
    parent_message_id = fields.Many2one('email.record', string='Parent Message', readonly=True, index=True)
    child_message_ids = fields.One2many('email.record', 'parent_message_id', string='Replies', readonly=True)
    is_read = fields.Boolean('Read', default=False, tracking=True)
    is_starred = fields.Boolean('Starred', default=False, tracking=True)
    is_archived = fields.Boolean('Archived', default=False, tracking=True)
    incoming_server_id = fields.Many2one(
        'fetchmail.server',
        string='Incoming Server',
        readonly=True,
        ondelete='set null',
    )

    _sql_constraints = [
        (
            'email_record_external_message_server_uniq',
            'unique(external_message_id, incoming_server_id)',
            'This incoming message already exists for this account.',
        ),
    ]

    @api.depends('type', 'incoming_server_id')
    def _get_sender(self):
        for rec in self:
            sender_partner = rec.sender
            if rec.type and rec.type != 'incoming':
                sender_partner = rec.env.user.partner_id
                server = rec.incoming_server_id
                if server:
                    server_email = rec._extract_email_from_server(server)
                    if server_email:
                        partner = rec.env['res.partner'].sudo().search([
                            ('email', '=ilike', server_email)
                        ], limit=1)
                        if partner:
                            sender_partner = partner
            rec.sender = sender_partner

    def action_mark_read(self):
        self.write({'is_read': True})
        return True

    def action_mark_unread(self):
        self.write({'is_read': False})
        return True

    def action_toggle_starred(self):
        for rec in self:
            rec.is_starred = not rec.is_starred
        return True

    def action_toggle_archived(self):
        for rec in self:
            rec.is_archived = not rec.is_archived
        return True

    def _mail_interface_domain(self):
        return [
            '|', '|', '|',
            ('associated_users', 'in', [self.env.user.id]),
            ('associated_users', '=', False),
            ('create_uid', '=', self.env.user.id),
            ('sender', '=', self.env.user.partner_id.id),
        ]

    def _mail_interface_fields(self):
        return [
            'subject',
            'sender',
            'to',
            'body',
            'date_time',
            'attachments',
            'is_read',
            'is_starred',
            'is_archived',
            'type',
        ]

    @api.model
    def get_mail_count(self):
        base_domain = self._mail_interface_domain()
        return {
            'all_count': self.search_count(base_domain + [('type', '=', 'incoming'), ('is_read', '=', False), ('is_archived', '=', False)]),
            'sent_count': self.search_count(base_domain + [('type', '=', 'outgoing'), ('is_archived', '=', False)]),
            'outbox_count': self.search_count(base_domain + [('type', '=', 'draft'), ('is_archived', '=', False)]),
            'starred_count': self.search_count(base_domain + [('is_starred', '=', True), ('is_archived', '=', False)]),
            'archived_count': self.search_count(base_domain + [('is_archived', '=', True)]),
        }

    @api.model
    def get_starred_mail(self):
        return self.search(
            self._mail_interface_domain() + [('is_starred', '=', True), ('is_archived', '=', False)],
            order='date_time desc',
        ).read(self._mail_interface_fields())

    @api.model
    def get_archived_mail(self):
        return self.search(
            self._mail_interface_domain() + [('is_archived', '=', True)],
            order='date_time desc',
        ).read(self._mail_interface_fields())

    @api.model
    def delete_mail(self, ids):
        records = self.search(self._mail_interface_domain() + [('id', 'in', ids)])
        records.unlink()
        return True

    @api.model
    def delete_checked_mail(self, mail_id):
        return self.delete_mail([mail_id])

    @api.model
    def archive_mail(self, ids):
        domain = self._mail_interface_domain()
        if isinstance(ids, int):
            ids = [ids]
        records = self.search(domain + [('id', 'in', ids)])
        records.write({'is_archived': True})
        return True

    @api.model
    def unarchive_mail(self, mail_id):
        records = self.search(self._mail_interface_domain() + [('id', '=', mail_id)])
        records.write({'is_archived': False})
        return True

    @api.model
    def star_mail(self, mail_id):
        record = self.search(self._mail_interface_domain() + [('id', '=', mail_id)], limit=1)
        if record:
            record.write({'is_starred': not record.is_starred})
            return record.is_starred
        return False

    @api.model
    def sent_mail(self, **kwargs):
        recipient = (kwargs.get('recipient') or '').strip()
        if not recipient:
            raise exceptions.UserError(_('Recipient is required before sending.'))

        image_payloads = kwargs.get('images') or []
        attachment_ids = []
        for image_data in image_payloads:
            content = image_data.get('image_uri')
            if not content:
                continue
            attachment = self.env['ir.attachment'].sudo().create({
                'name': image_data.get('name') or 'attachment',
                'datas': content,
                'res_model': 'email.record',
            })
            attachment_ids.append(attachment.id)

        to_contact_ids = self.get_contact_ids(self.get_emails(recipient))
        values = {
            'subject': kwargs.get('subject') or '(No subject)',
            'to': [(6, 0, to_contact_ids)],
            'body': tools.html_sanitize((kwargs.get('content') or '').replace('\n', '<br/>')),
            'attachments': [(6, 0, attachment_ids)],
            'associated_users': [(6, 0, [self.env.user.id])],
            'parent_exists': False,
        }
        email = self.create(values)
        email.send_email()
        return email.read(self._mail_interface_fields())

    @api.model
    def retry_mail(self, mail_id):
        email = self.search(self._mail_interface_domain() + [('id', '=', mail_id)], limit=1)
        if email and email.type == 'draft':
            email.send_email()
        return True

    @api.model
    def default_get(self, fields):
        res = super(Email, self).default_get(fields)
        if not self.env['email.record'].browse(self.env.context.get('active_ids')):
            res['body'] = "<p><br/></p>" + self.env.user.signature
        res['parent_exists'] = True if self.env['email.record'].browse(self.env.context.get('active_ids')) else False

        if 'incoming_server_id' in fields and not res.get('incoming_server_id'):
            default_server = self._get_default_server_for_current_user()
            if default_server:
                res['incoming_server_id'] = default_server.id

        return res

    @api.depends('attachments')
    def _attachment_icon_compute(self):
        for rec in self:
            if rec.attachments:
                rec.attachment_icon = True
            else:
                rec.attachment_icon = False

    @api.model
    def create(self, val):
        if not val.get('date_time'):
            val['date_time'] = fields.Datetime.now()
        res = super(Email, self).create(val)
        return res

    def get_partner_emails(self, partners):
        return str([partner.email for partner in partners]).replace('[', '').replace(']', '').replace("'", "")

    def validate_partner_emails(self, partners):
        for rec in partners:
            if rec.email:
                match = re.match(r'[^@]+@[^@]+\.[^@]+', rec.email)
                if match is None:
                    raise exceptions.UserError(_("%s has an invalid email address") % rec.name)
            else:
                raise exceptions.UserError(_('%s does not have any email address.') % rec.name)
        return True

    def _extract_email_from_server(self, server):
        for candidate in (server.user, server.name):
            candidate = (candidate or '').strip().lower()
            if '@' in candidate:
                return candidate
        return False

    def _normalize_message_id(self, message_id):
        message_id = (message_id or '').strip()
        if not message_id:
            return False
        if not message_id.startswith('<'):
            message_id = '<%s>' % message_id
        return message_id

    def _extract_reference_ids(self, references_header):
        return re.findall(r'<[^>]+>', references_header or '')

    def _find_parent_message(self, context_server_id, in_reply_to, references_header):
        candidates = []
        normalized_reply_to = self._normalize_message_id(in_reply_to)
        if normalized_reply_to:
            candidates.append(normalized_reply_to)
        for ref in reversed(self._extract_reference_ids(references_header)):
            normalized_ref = self._normalize_message_id(ref)
            if normalized_ref and normalized_ref not in candidates:
                candidates.append(normalized_ref)

        if not candidates:
            return False

        domain = [('external_message_id', 'in', candidates)]
        if context_server_id:
            domain = ['|', ('incoming_server_id', '=', context_server_id), ('incoming_server_id', '=', False)] + domain

        return self.search(domain, order='id desc', limit=1)

    def _get_default_server_for_current_user(self):
        server = self.env['fetchmail.server'].sudo().search([
            ('create_uid', '=', self.env.user.id)
        ], order='id asc', limit=1)
        if not server:
            server = self.env['fetchmail.server'].sudo().search([], order='id asc', limit=1)
        return server

    def _resolve_sender_account(self):
        self.ensure_one()
        server = self.incoming_server_id or self._get_default_server_for_current_user()
        sender_email = False
        sender_partner = False

        if server:
            sender_email = self._extract_email_from_server(server)
            if sender_email:
                sender_partner = self.env['res.partner'].sudo().search([
                    ('email', '=ilike', sender_email)
                ], limit=1)

        return server, sender_email, sender_partner

    def _check_sender_server_access(self, sender_server):
        self.ensure_one()
        if not sender_server or self.env.user.has_group('base.group_system'):
            return True

        user = self.env.user
        user_logins = {
            (user.login or '').strip().lower(),
            (user.email or '').strip().lower(),
            (user.partner_id.email or '').strip().lower(),
        }
        server_user = (sender_server.user or '').strip().lower()

        allowed = (
            sender_server.create_uid.id == user.id
            or (server_user and server_user in user_logins)
        )
        if not allowed:
            raise exceptions.UserError(
                _('You can only send using mail accounts assigned to your user.')
            )
        return True

    def _send_via_smtp(self, sender_server, sender_email, recipients, cc_list, bcc_list, subject, body, attachments):
        """Send email via direct SMTP using server's configured settings."""
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from email.mime.base import MIMEBase
        from email import encoders
        
        if not sender_server or not sender_server.smtp_host:
            return False
        
        try:
            # Build message
            msg = MIMEMultipart('alternative')
            msg['From'] = sender_email
            msg['To'] = ', '.join(recipients) if isinstance(recipients, list) else recipients
            msg['Cc'] = ', '.join(cc_list) if cc_list else ''
            msg['Bcc'] = ', '.join(bcc_list) if bcc_list else ''
            msg['Subject'] = subject or '(No subject)'
            
            # Add body
            msg.attach(MIMEText(body or '', 'html'))
            
            # Add attachments
            if attachments:
                for attachment in attachments:
                    try:
                        part = MIMEBase('application', 'octet-stream')
                        part.set_payload(base64.b64decode(attachment.datas) if attachment.datas else b'')
                        encoders.encode_base64(part)
                        part.add_header('Content-Disposition', 'attachment', filename=attachment.name)
                        msg.attach(part)
                    except Exception as e:
                        _logger.warning('Failed to attach file %s: %s', attachment.name, str(e))
            
            # Connect and send
            if sender_server.smtp_encryption == 'ssl':
                smtp = smtplib.SMTP_SSL(sender_server.smtp_host, sender_server.smtp_port, timeout=20)
            else:
                smtp = smtplib.SMTP(sender_server.smtp_host, sender_server.smtp_port, timeout=20)
                if sender_server.smtp_encryption == 'starttls':
                    smtp.starttls()
            
            if sender_server.smtp_user and sender_server.smtp_password:
                smtp.login(sender_server.smtp_user, sender_server.smtp_password)
            
            all_recipients = list(recipients) if isinstance(recipients, list) else [recipients]
            if cc_list:
                all_recipients.extend(cc_list if isinstance(cc_list, list) else [cc_list])
            if bcc_list:
                all_recipients.extend(bcc_list if isinstance(bcc_list, list) else [bcc_list])
            
            smtp.sendmail(sender_email, all_recipients, msg.as_string())
            smtp.quit()
            _logger.info('Email sent from %s via SMTP to %s', sender_email, all_recipients)
            return True
        except Exception as e:
            _logger.error('SMTP send failed for %s: %s', sender_email, str(e), exc_info=True)
            return False

    def send_email(self):
        self.ensure_one()
        self.validate_partner_emails(self.to)
        self.validate_partner_emails(self.cc)
        self.validate_partner_emails(self.bcc)

        sender_server, sender_email, _sender_partner = self._resolve_sender_account()
        self._check_sender_server_access(sender_server)
        
        if not self.subject:
            self.subject = '(No subject)'

        recipients = [p.email for p in self.to if p.email]
        cc_list = [p.email for p in self.cc if p.email]
        bcc_list = [p.email for p in self.bcc if p.email]

        if not recipients:
            raise exceptions.UserError(_('Please add at least one recipient in To before sending.'))

        template = self.env.ref("odoo_mail_client.send_email_template").sudo()
        email_values = {
            'attachment_ids': [(6, 0, self.attachments.ids)],
            'email_to': ','.join(recipients),
            'email_cc': ','.join(cc_list),
            'email_bcc': ','.join(bcc_list),
            'auto_delete': False,
        }
        if sender_email:
            email_values['email_from'] = sender_email
            email_values['reply_to'] = sender_email

        mail_id = template.send_mail(
            res_id=self.id,
            force_send=False,
            email_values=email_values,
        )
        if mail_id:
            self.message_post(body=_('Email queued for delivery.'))

        if sender_server and not self.incoming_server_id:
            self.incoming_server_id = sender_server.id
        self.type = 'outgoing'
        self.is_read = True
        self.date_time = fields.Datetime.now()
        self.parent_exists = False
        self.log_message_history(message="Email", key=self.env.context.get('key'))

    @api.model
    def reply_popup(self, mail_id=None):
        record = self
        if mail_id:
            record = self.browse(mail_id).exists()
        if not record:
            return False
        record.ensure_one()
        safe_subject = record.subject or '(No subject)'
        sender_name = record.sender.display_name if record.sender else 'Unknown Sender'
        sender_email = record.sender.email if record.sender and record.sender.email else ''
        body_text = tools.html_sanitize(record.body)
        display_date_time = fields.Datetime.to_string(record.date_time or fields.Datetime.now())
        arr = record.to if record.type == 'outgoing' else record.sender
        compose_view = self.env.ref('odoo_mail_client.email_form_view', raise_if_not_found=False)
        view_id = compose_view.id if compose_view else False
        return {
            'type': 'ir.actions.act_window',
            'name': 'Compose Reply',
            'view_mode': 'form',
            'views': [[view_id, 'form']] if view_id else [[False, 'form']],
            'target': 'new',
            'view_id': view_id,
            'res_model': 'email.record',
            'context': {
                'default_subject': 'Re: %s' % safe_subject,
                'default_to': [rec.id for rec in arr] if arr else [],
                'default_incoming_server_id': record.incoming_server_id.id if record.incoming_server_id else False,
                'default_body': tools.html_sanitize('<p><br><br></p>' + str(self.env.user.signature) + '<br><br>' + 'On ' + str(display_date_time) +
                                ' ' + str(sender_name) + ' &lt;' + str(sender_email) + '&gt; wrote:<br/>' +
                                '<hr style="height:0.01em; background-color:black;">' + str(body_text))
            }
        }

    @api.model
    def forward_popup(self, mail_id=None):
        record = self
        if mail_id:
            record = self.browse(mail_id).exists()
        if not record:
            return False
        record.ensure_one()
        safe_subject = record.subject or '(No subject)'
        sender_name = record.sender.display_name if record.sender else 'Unknown Sender'
        sender_email = record.sender.email if record.sender and record.sender.email else ''
        body_text = tools.html_sanitize(record.body)
        display_date_time = fields.Datetime.to_string(record.date_time or fields.Datetime.now())
        compose_view = self.env.ref('odoo_mail_client.email_form_view', raise_if_not_found=False)
        view_id = compose_view.id if compose_view else False
        return {
            'type': 'ir.actions.act_window',
            'name': 'Compose Forward',
            'view_mode': 'form',
            'views': [[view_id, 'form']] if view_id else [[False, 'form']],
            'target': 'new',
            'view_id': view_id,
            'res_model': 'email.record',
            'context': {
                'default_subject': 'Fwd: %s' % safe_subject,
                'default_attachments': [rec.id for rec in record.attachments] if record.attachments else [],
                'default_incoming_server_id': record.incoming_server_id.id if record.incoming_server_id else False,
                'default_body': tools.html_sanitize('<p><br><br></p>' + str(self.env.user.signature) + '<br/><br/>' + '---------- Forwarded message ----------' +
                                '<br>From: <strong>' + str(sender_name) + '</strong> &lt;' + str(sender_email) + '&gt;' +
                                '<br>Date: ' + str(display_date_time) +
                                '<br>Subject: ' + str(safe_subject) +
                                '<br>To: ' + str([rec.name + ' &lt;' + rec.email + '&gt;' for rec in record.to])
                                    .replace('[', '').replace(']', '').replace("'", "") +
                                '<br>Cc: ' + str([rec.name + ' &lt;' + rec.email + '&gt;' for rec in record.cc])
                                    .replace('[', '').replace(']', '').replace("'", "") +
                                '<hr style="height:0.01em; background-color:black;"><br>' + str(body_text))
            }
        }

    def get_emails(self, contacts):
        recipients = []
        if not contacts:
            return recipients

        contact_list = contacts.split(",")
        for rec in contact_list:
            rec_copy = rec
            if "<" and ">" in rec:
                recipients.append(
                    {'name': rec_copy.split('<')[0].strip(), 'email': rec[rec.index('<') + len('<'):rec.index('>')]})
            else:
                recipients.append({'name': rec_copy.split('@')[0].strip(), 'email': rec})

        return recipients

    def get_contact_ids(self, contact_list):
        new_contacts_created = []
        users = self.env['res.users'].search([])
        for contact in contact_list:
            existing_record = None
            for user in users:
                if user.partner_id.email == contact['email']:
                    existing_record = user.partner_id
            if not existing_record:
                existing_record = self.env['res.partner'].search([('email', '=ilike', contact['email'])], order='id desc',
                                                             limit=1)
            if len(existing_record) > 0:
                new_contacts_created.append(int(existing_record.id))
            else:
                new_record = self.env['res.partner'].create(
                    {'name': str(contact['name']).replace('"', '').replace("'", ""), 'email': contact['email']})
                if new_record.id:
                    new_contacts_created.append(int(new_record.id))

        return new_contacts_created

    def filter_associated_users(self, contact_ids):
        associated_user_contacts = []
        if contact_ids:
            for contact_id in contact_ids:
                all_users = self.env['res.users'].search([])
                for user in all_users:
                    if user.partner_id.id == contact_id:
                        incoming_server = self.env['fetchmail.server'].sudo().search([('user', '=ilike', user.email)])
                        if incoming_server: #only those users will be added in the associated user whose emails are configured and matched with one of the incoming email servers
                            associated_user_contacts.append(user.id)
        return associated_user_contacts

    def message_new(self, msg, custom_values=None):
        normalized_message_id = self._normalize_message_id(msg.get('message_id'))

        to_contact_ids = self.get_contact_ids(self.get_emails(msg.get('to')))
        cc_contact_ids = self.get_contact_ids(self.get_emails(msg.get('cc')))
        bcc_contact_ids = self.get_contact_ids(self.get_emails(msg.get('bcc')))
        from_contact_ids = self.get_contact_ids(self.get_emails(msg.get('from')))
        associated_users = []
        associated_users.extend(self.filter_associated_users(to_contact_ids))
        associated_users.extend(self.filter_associated_users(cc_contact_ids))
        # associated_users.extend(self.filter_associated_users(sender_contact_ids))

        context_server_id = (
            self.env.context.get('default_fetchmail_server_id')
            or self.env.context.get('fetchmail_server_id')
            or self.env.context.get('mail_fetchmail_server_id')
        )

        if normalized_message_id:
            duplicate_domain = [('external_message_id', '=', normalized_message_id)]
            if context_server_id:
                duplicate_domain.append(('incoming_server_id', '=', context_server_id))
            duplicate = self.search(duplicate_domain, limit=1)
            if duplicate:
                update_vals = {}
                if associated_users:
                    update_vals['associated_users'] = [(6, 0, list(set(duplicate.associated_users.ids + associated_users)))]
                if update_vals:
                    duplicate.write(update_vals)
                return duplicate.id

        if not associated_users and context_server_id:
            server = self.env['fetchmail.server'].sudo().browse(context_server_id)
            if server and server.exists():
                if server.user:
                    fallback_users = self.env['res.users'].sudo().search([
                        '|', '|',
                        ('login', '=ilike', server.user),
                        ('email', '=ilike', server.user),
                        ('partner_id.email', '=ilike', server.user),
                    ])
                    associated_users.extend(fallback_users.ids)
                if not associated_users and server.create_uid:
                    associated_users.append(server.create_uid.id)

        associated_users = list(set(associated_users))
        received_on_server = self.env.context.get('default_received_on_server')
        if isinstance(received_on_server, str):
            received_on_server = fields.Datetime.to_datetime(received_on_server)

        header_date = fields.Datetime.to_datetime(msg.get('date')) if msg.get('date') else False
        in_reply_to = self._normalize_message_id(msg.get('in_reply_to'))
        references_header = msg.get('references') or ''
        parent_message = self._find_parent_message(context_server_id, in_reply_to, references_header)

        vals = {
            "to": [(6, 0, to_contact_ids)],
            "cc": [(6, 0, cc_contact_ids)],
            "bcc": [(6, 0, bcc_contact_ids)],
            "sender": from_contact_ids[0] if from_contact_ids else False,
            'subject': msg.get('subject'),
            "type": 'incoming',
            "is_read": False,
            "parent_exists": False,
            "date_time": received_on_server or header_date or fields.Datetime.now(),
            'body': tools.html_sanitize(msg.get('body')),
            'associated_users': [(6, 0, associated_users)],
            'message_id': normalized_message_id,
            'external_message_id': normalized_message_id,
            'in_reply_to': in_reply_to,
            'references_header': references_header,
            'parent_message_id': parent_message.id if parent_message else False,
            'incoming_server_id': context_server_id,
        }
        res = super(Email, self).message_new(msg, custom_values=vals)
        return res

    def unlink(self):
        incoming_records = self.filtered(
            lambda r: r.type == 'incoming'
            and r.incoming_server_id
            and r.incoming_server_id.delete_from_server_on_local_delete
            and r.message_id
        )

        for rec in incoming_records:
            rec.incoming_server_id.sudo()._delete_message_by_message_id(rec.message_id)

        return super(Email, self).unlink()

    def _message_post_after_hook(self, message, msg_vals):
        fetched_attachments = self.env['ir.attachment'].search(
            [('res_model', '=', 'email.record'), ('res_id', '=', msg_vals.get('res_id'))])
        if fetched_attachments:
            self.attachments = fetched_attachments
        return super(Email, self)._message_post_after_hook(message, msg_vals)

    def log_message_history(self, message=None, key=None):
        parent_record_id = self.env['email.record'].browse(self.env.context.get('active_ids'))
        record_url = '/web#id=' + str(self._origin.id) + '&model=email.record&view_type=form'
        self.message_post(body=message + " " + key)
        parent_record_id.message_post(
            body=message + ' ' + key + ", <a href='%s'>view record</a>" % record_url) if parent_record_id else None

