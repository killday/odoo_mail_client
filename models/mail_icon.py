import base64

from odoo import api, fields, models, tools
from odoo.modules.module import get_resource_path


class MailIcon(models.Model):
    _name = 'mail.icon'
    _description = 'Mail Icon'

    def _get_default_logo(self, original=False):
        img_path = get_resource_path('odoo_mail_client', 'static/src/img/logo.png')
        with tools.file_open(img_path, 'rb') as file_data:
            return base64.b64encode(file_data.read())

    mail_icon = fields.Binary(string='Mail Icon', default=_get_default_logo)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            self._handle_icon(vals)
        return super().create(vals_list)

    def write(self, values):
        self._handle_icon(values)
        return super().write(values)

    @api.model
    def _handle_icon(self, vals):
        if vals.get('mail_icon'):
            vals['mail_icon'] = base64.b64encode(
                tools.image_process(base64.b64decode(vals['mail_icon']), size=(150, 150), crop='center')
            )

    @api.model
    def load_logo(self):
        return self.sudo().search([], order='id desc', limit=1).mail_icon
