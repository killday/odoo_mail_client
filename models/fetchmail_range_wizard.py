from odoo import _, fields, models


class FetchmailRangeWizard(models.TransientModel):
    _name = 'fetchmail.range.wizard'
    _description = 'Fetch Emails by Period'

    fetchmail_server_id = fields.Many2one('fetchmail.server', string='Incoming Mail Server', required=True)
    period = fields.Selection(
        [
            ('1', '1 month back'),
            ('3', '3 months back'),
            ('6', '6 months back'),
        ],
        string='Fetch Period',
        required=True,
        default='1',
    )

    def action_fetch(self):
        self.ensure_one()
        result = self.fetchmail_server_id.fetch_mail_by_month_window(int(self.period), raise_exception=True)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Fetch Emails'),
                'type': 'success',
                'sticky': False,
                'message': _(
                    'Fetch completed since %(since)s: %(count)s email(s) checked, %(failed)s failed.',
                    since=result['since'],
                    count=result['count'],
                    failed=result['failed'],
                ),
                'next': {'type': 'ir.actions.act_window_close'},
            },
        }
