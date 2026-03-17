from odoo import api, models


class IrAttachment(models.Model):
    _inherit = 'ir.attachment'

    @api.model
    def get_fields(self, attachment_ids):
        data_list = []
        for attachment_id in attachment_ids:
            attachment = self.browse(attachment_id)
            if attachment.exists():
                data_list.append({
                    'attachment': attachment.id,
                    'datas': attachment.datas,
                    'mimetype': attachment.mimetype,
                    'name': attachment.name,
                })
        return data_list
