/** @odoo-module **/
import { Component } from '@odoo/owl';
import { useService } from "@web/core/utils/hooks";
import { useState, onMounted, markup, useRef} from "@odoo/owl";


/**
 * MessageView component for displaying a message.
 * @extends Component
 */
export class MessageView extends  Component {
    setup(){
        this.root = useRef("root-mail")
        this.action = useService("action");
        this.notification = useService("notification");
        this.html_content = markup(this.props.mail.body || "")
        this.orm = useService("orm");
        this.state = useState({
            attachments: [],
            data: [],

        })
        onMounted(() => {
            this.fetch_data()
        });
    }
    async fetch_data(){
        const attachmentIds = this.props.mail.attachments || []
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
        const recipients = this.props.mail.type === 'outgoing' ? toIds : (senderId ? [senderId] : [])
        const subject = this.props.mail.subject || '(No subject)'
        const body = this.props.mail.body || ''
        await this.action.doAction({
            type: 'ir.actions.act_window',
            name: 'Compose Reply',
            res_model: 'email.record',
            view_mode: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: {
                default_subject: `Re: ${subject}`,
                default_to: recipients,
                default_body: `<p><br><br></p>${body}`,
            },
        })
    }

    async forwardMail(){
        if (!this.props.mail.id) {
            return
        }
        const subject = this.props.mail.subject || '(No subject)'
        const body = this.props.mail.body || ''
        const attachmentIds = Array.isArray(this.props.mail.attachments) ? this.props.mail.attachments : []
        await this.action.doAction({
            type: 'ir.actions.act_window',
            name: 'Compose Forward',
            res_model: 'email.record',
            view_mode: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: {
                default_subject: `Fwd: ${subject}`,
                default_attachments: attachmentIds,
                default_body: `<p><br><br></p>${body}`,
            },
        })
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
