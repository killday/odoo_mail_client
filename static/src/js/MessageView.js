/** @odoo-module **/
import { Component } from '@odoo/owl';
import { useService } from "@web/core/utils/hooks";
import { useState, onMounted, markup, useRef} from "@odoo/owl";
import { ComposeMail } from './ComposeMail'


/**
 * MessageView component for displaying a message.
 * @extends Component
 */
export class MessageView extends  Component {
    setup(){
        this.root = useRef("root-mail")
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.html_content = markup(this.props.mail.body || "")
        this.orm = useService("orm");
        this.state = useState({
            attachments: [],
            data: [],
            toEmails: '',
            receivedAt: '',
        })
        onMounted(() => {
            this.fetch_data()
        });
    }
    async fetch_data(){
        const attachmentIds = this.props.mail.attachments || []
        const toIds = Array.isArray(this.props.mail.to) ? this.props.mail.to : []

        this.state.toEmails = await this.getRecipientEmails(toIds)
        this.state.receivedAt = this.formatDateTime(this.props.mail.date_time)

        if (attachmentIds.length) {
            try {
                this.state.attachments = await this.orm.call("ir.attachment", "get_fields", [attachmentIds], {})
            } catch (error) {
                this.state.attachments = await this.orm.read("ir.attachment", attachmentIds, ["datas", "mimetype", "name"])
                this.state.attachments = this.state.attachments.map((item) => ({
                    attachment: item.id,
                    datas: item.datas,
                    mimetype: item.mimetype,
                    name: item.name,
                }))
            }
        }
    }

    formatDateTime(value) {
        if (!value) {
            return ''
        }
        const normalized = String(value).replace(' ', 'T')
        const parsed = new Date(normalized)
        if (Number.isNaN(parsed.getTime())) {
            return String(value)
        }
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(parsed)
    }
    onClickImage(value){
     this.action.doAction({
            type: "ir.actions.act_url",
            url: "/web/content/" + value+ "?download=true",
        });
    }

    async replyMail(){
        if (!this.props.mail.id) {
            return
        }
        const senderId = this.props.mail.sender && this.props.mail.sender[0] ? this.props.mail.sender[0] : false
        const toIds = Array.isArray(this.props.mail.to) ? this.props.mail.to : []
        const ccIds = Array.isArray(this.props.mail.cc) ? this.props.mail.cc : []
        const recipientIds = this.props.mail.type === 'outgoing' ? toIds : (senderId ? [senderId] : [])
        const recipients = await this.getRecipientEmails(recipientIds)
        const ccRecipients = await this.getRecipientEmails(ccIds)
        const subject = this.props.mail.subject || '(No subject)'
        const body = this.props.mail.body || ''
        this.dialog.add(ComposeMail, {
            title: 'Reply',
            initialSubject: `Re: ${subject}`,
            initialRecipient: recipients,
            initialCc: ccRecipients,
            initialParentMessageId: this.props.mail.id,
            initialServerId: this.props.mail.incoming_server_id && this.props.mail.incoming_server_id[0],
            initialContent: `\n\n${this.stripHtml(body)}`,
            reloadOnSend: true,
        })
    }

    async forwardMail(){
        if (!this.props.mail.id) {
            return
        }
        const subject = this.props.mail.subject || '(No subject)'
        const body = this.props.mail.body || ''
        const senderLabel = this.props.mail.sender && this.props.mail.sender[1] ? this.props.mail.sender[1] : ''
        const forwardBody = [
            '',
            '',
            '---------- Forwarded message ----------',
            `From: ${senderLabel}`,
            `Subject: ${subject}`,
            '',
            this.stripHtml(body),
        ].join('\n')
        this.dialog.add(ComposeMail, {
            title: 'Forward',
            initialSubject: `Fwd: ${subject}`,
            initialRecipient: '',
            initialServerId: this.props.mail.incoming_server_id && this.props.mail.incoming_server_id[0],
            initialContent: forwardBody,
            reloadOnSend: true,
        })
    }

    async getRecipientEmails(partnerIds) {
        if (!Array.isArray(partnerIds) || !partnerIds.length) {
            return ''
        }
        try {
            const partners = await this.orm.read('res.partner', partnerIds, ['email'])
            return partners
                .map((partner) => partner.email)
                .filter((email) => !!email)
                .join(', ')
        } catch (error) {
            return ''
        }
    }

    stripHtml(html) {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html || '', 'text/html')
        return (doc.body.textContent || '').trim()
    }

    async archiveMail(){
        if (!this.props.mail.id) {
            return
        }
        try {
            await this.orm.call('email.record', 'archive_mail', [[this.props.mail.id]])
        } catch (error) {
            await this.orm.write('email.record', [this.props.mail.id], { is_archived: true })
        }
        if (this.props.onBack) {
            this.props.onBack()
        }
        if (this.props.onReloadList) {
            await this.props.onReloadList()
        }
    }

    async unarchiveMail(){
        if (!this.props.mail.id) {
            return
        }
        try {
            await this.orm.call('email.record', 'unarchive_mail', [this.props.mail.id])
        } catch (error) {
            await this.orm.write('email.record', [this.props.mail.id], { is_archived: false })
        }
        if (this.props.onBack) {
            this.props.onBack()
        }
        if (this.props.onReloadList) {
            await this.props.onReloadList()
        }
    }

    async deleteMail(){
        if (!this.props.mail.id) {
            return
        }
        try {
            await this.orm.call('email.record', 'delete_checked_mail', [this.props.mail.id])
        } catch (error) {
            await this.orm.unlink('email.record', [this.props.mail.id])
        }
        if (this.props.onBack) {
            this.props.onBack()
        }
        if (this.props.onReloadList) {
            await this.props.onReloadList()
        }
    }

    async markUnreadMail(){
        if (!this.props.mail.id) {
            return
        }
        try {
            await this.orm.call('email.record', 'action_mark_unread', [[this.props.mail.id]])
        } catch (error) {
            await this.orm.write('email.record', [this.props.mail.id], { is_read: false })
        }
        if (this.props.onBack) {
            this.props.onBack()
        }
        if (this.props.onReloadList) {
            await this.props.onReloadList()
        }
    }

    backToList(){
        if (this.props.onBack) {
            this.props.onBack()
        }
    }

}
MessageView.template = 'MessageView'
