from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    def _default_mail_icon_id(self):
        return self.env['mail.icon'].sudo().search([], order='id desc', limit=1)

    mail_icon_id = fields.Many2one('mail.icon', default=_default_mail_icon_id, ondelete='cascade', string='Mail Icon')
    icon = fields.Binary(related='mail_icon_id.mail_icon', readonly=False)
    custom_mail_logo = fields.Boolean(
        string='Custom Mail Logo',
        config_parameter='odoo_mail_client.custom_mail_logo',
        help='Enable to customize Odoo Mail Client logo',
    )
