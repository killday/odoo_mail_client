/* @odoo-module*/
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
            this.state.attachments = await this.orm.call("ir.attachment", "get_fields", [attachmentIds], {})
        }
    }
    onClickImage(value){
     this.action.doAction({
            type: "ir.actions.act_url",
            url: "/web/content/" + value+ "?download=true",
        });
    }

}
MessageView.template = 'MessageView'
