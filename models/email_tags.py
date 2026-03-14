from odoo import api, fields, models, _, tools


class EmailTags(models.Model):
    _name = 'email.tags'
    _description = "Email Tag"

    name = fields.Char(string='Name', required=True, translate=True)
    color = fields.Integer(string='Color Index')

    _sql_constraints = [
        ('name_uniq', 'unique (name)', "Tag name already exists !"),
    ]
