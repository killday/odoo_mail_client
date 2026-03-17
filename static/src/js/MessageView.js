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
        try {
            const action = await this.orm.call('email.record', 'reply_popup', [[this.props.mail.id]])
            if (action) {
                await this.action.doAction(action)
            }
        } catch (error) {
            // keep message view usable even if backend method is unavailable
        }
    }

    async forwardMail(){
        if (!this.props.mail.id) {
            return
        }
        try {
            const action = await this.orm.call('email.record', 'forward_popup', [[this.props.mail.id]])
            if (action) {
                await this.action.doAction(action)
            }
        } catch (error) {
            // keep message view usable even if backend method is unavailable
        }
    }

}
MessageView.template = 'MessageView'
