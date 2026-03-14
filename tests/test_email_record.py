from odoo.tests.common import TransactionCase  # type: ignore


class TestEmailRecordHelpers(TransactionCase):
    def test_normalize_message_id(self):
        email_record = self.env['email.record']
        self.assertFalse(email_record._normalize_message_id(False))
        self.assertEqual(email_record._normalize_message_id('abc@example.com'), '<abc@example.com>')
        self.assertEqual(email_record._normalize_message_id('<abc@example.com>'), '<abc@example.com>')

    def test_extract_reference_ids(self):
        email_record = self.env['email.record']
        refs = email_record._extract_reference_ids('<a@x> <b@y> random')
        self.assertEqual(refs, ['<a@x>', '<b@y>'])

    def test_sender_account_access_owner(self):
        email_model = self.env['email.record']
        server = self.env['fetchmail.server'].new({'user': self.env.user.login})
        record = email_model.create({'subject': 'Test access'})
        self.assertTrue(record._check_sender_server_access(server))

    def test_message_new_deduplicates_on_external_message_id(self):
        email_model = self.env['email.record']
        existing = email_model.create({
            'subject': 'Existing',
            'external_message_id': '<dup@example.com>',
            'message_id': '<dup@example.com>',
            'type': 'incoming',
        })

        result_id = email_model.message_new({
            'message_id': '<dup@example.com>',
            'subject': 'Duplicate Attempt',
            'from': 'Sender <sender@example.com>',
            'to': 'Receiver <receiver@example.com>',
            'body': '<p>body</p>',
        })

        self.assertEqual(result_id, existing.id)

    def test_message_new_sets_parent_from_in_reply_to(self):
        email_model = self.env['email.record']
        parent = email_model.create({
            'subject': 'Parent',
            'external_message_id': '<parent@example.com>',
            'message_id': '<parent@example.com>',
            'type': 'incoming',
        })

        child_id = email_model.message_new({
            'message_id': '<child@example.com>',
            'in_reply_to': '<parent@example.com>',
            'references': '<other@example.com> <parent@example.com>',
            'subject': 'Child',
            'from': 'Sender <sender@example.com>',
            'to': 'Receiver <receiver@example.com>',
            'body': '<p>reply</p>',
        })

        child = email_model.browse(child_id)
        self.assertEqual(child.parent_message_id.id, parent.id)
