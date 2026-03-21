from odoo import api, fields, models


class MailSignature(models.Model):
    _name = 'mail.signature'
    _description = 'Mail Signature'
    _order = 'is_default desc, name asc'

    name = fields.Char(required=True)
    body = fields.Html(required=True, sanitize=True)
    preview_html = fields.Html(compute='_compute_preview_html')
    server_id = fields.Many2one('fetchmail.server', string='Account')
    user_id = fields.Many2one(
        'res.users',
        default=lambda self: self.env.user,
        required=True,
        index=True,
    )
    is_default = fields.Boolean(string='Default', default=False)
    active = fields.Boolean(default=True)

    @api.depends('body')
    def _compute_preview_html(self):
        for rec in self:
            body = rec.body or ''
            rec.preview_html = body or '<p><i>No content yet.</i></p>'

    def _unset_other_defaults(self):
        for rec in self:
            if not rec.is_default:
                continue
            domain = [
                ('id', '!=', rec.id),
                ('user_id', '=', rec.user_id.id),
                ('is_default', '=', True),
            ]
            if rec.server_id:
                domain.append(('server_id', '=', rec.server_id.id))
            else:
                domain.append(('server_id', '=', False))
            self.search(domain).write({'is_default': False})

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._unset_other_defaults()
        return records

    def write(self, vals):
        res = super().write(vals)
        if 'is_default' in vals or 'server_id' in vals or 'user_id' in vals:
            self._unset_other_defaults()
        return res
