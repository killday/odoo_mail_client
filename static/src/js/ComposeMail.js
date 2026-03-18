/** @odoo-module **/
import {Component,useState,useRef,onWillStart} from '@odoo/owl'
import { useService } from "@web/core/utils/hooks";
import {ImportDialog} from "./AttachmentMail";
/**
 * ComposeMail component for handling mail composition.
 * @extends Component
 */
export class ComposeMail extends Component {
    setup() {
        this.orm = useService('orm')
        this.root = useRef('root');
        this.action = useService('action')
        this.dialog = useService('dialog')
        this.hasInitialContent = Boolean(this.props.initialContent)
        this.baseContent = this.props.initialContent || ""
        this.state = useState({
            title: this.props.title || "New Message",
            subject: this.props.initialSubject || "",
            recipient: this.props.initialRecipient || "",
            cc: this.props.initialCc || "",
            bcc: this.props.initialBcc || "",
            parentMessageId: this.props.initialParentMessageId || false,
            senderServerId: this.props.initialServerId ? String(this.props.initialServerId) : "",
            senderAccounts: [],
            signatures: [],
            selectedSignatureId: "",
            contentTouched: false,
            content: this.props.initialContent || "",
            images: [],
            originalHeight: null,
            minimized: false,
            attachedFiles: [],
        })
        this.contentState = useState({
            images: [],
        })

        onWillStart(async () => {
            try {
                this.state.senderAccounts = await this.orm.searchRead(
                    'fetchmail.server',
                    [],
                    ['name', 'user'],
                    { order: 'name asc' }
                )
            } catch (error) {
                this.state.senderAccounts = []
            }
            if (!this.state.senderServerId && this.state.senderAccounts.length) {
                this.state.senderServerId = String(this.state.senderAccounts[0].id)
            }

            try {
                this.state.signatures = await this.orm.searchRead(
                    'mail.signature',
                    [['active', '=', true]],
                    ['name', 'body', 'server_id', 'is_default'],
                    { order: 'is_default desc, name asc' }
                )
            } catch (error) {
                this.state.signatures = []
            }

            this.selectDefaultSignature(true)
        })

    }

    get availableSignatures() {
        const serverId = this.state.senderServerId ? parseInt(this.state.senderServerId, 10) : false
        if (!serverId) {
            return this.state.signatures.filter((signature) => !signature.server_id)
        }
        const accountSignatures = this.state.signatures.filter(
            (signature) => signature.server_id && signature.server_id[0] === serverId
        )
        if (accountSignatures.length) {
            return accountSignatures
        }
        return this.state.signatures.filter((signature) => !signature.server_id)
    }

    selectDefaultSignature(applyToContent = false) {
        const signatures = this.availableSignatures
        if (!signatures.length) {
            this.state.selectedSignatureId = ""
            if (applyToContent && !this.state.contentTouched) {
                this.state.content = this.hasInitialContent ? this.baseContent : ""
            }
            return
        }
        const defaultSignature = signatures.find((signature) => signature.is_default) || signatures[0]
        this.state.selectedSignatureId = String(defaultSignature.id)
        if (applyToContent) {
            this.applySignatureBody(defaultSignature.body || '')
        }
    }

    applySignatureBody(signatureBody) {
        if (this.state.contentTouched) {
            return
        }
        const normalizedBody = signatureBody || ''
        if (this.hasInitialContent) {
            // For reply/forward, keep quoted content and insert signature block above it.
            this.state.content = normalizedBody
                ? `${normalizedBody}\n\n${this.baseContent}`
                : this.baseContent
            return
        }
        // For new email, place signature at the bottom with space to type above.
        this.state.content = normalizedBody ? `\n\n${normalizedBody}` : ''
    }

    onSenderAccountChange() {
        this.selectDefaultSignature(true)
    }

    onSignatureChange(ev) {
        this.state.selectedSignatureId = ev.currentTarget.value || ''
        const signature = this.availableSignatures.find((item) => String(item.id) === this.state.selectedSignatureId)
        this.applySignatureBody(signature ? (signature.body || '') : '')
    }

    onContentInput() {
        this.state.contentTouched = true
    }

    openSignatureManager() {
        this.action.doAction('odoo_mail_client.action_mail_signatures')
    }

    async attachmentReader(file) {
        const fileReader = new FileReader();
        fileReader.onerror = () => {
            console.warn(`Failed to read attachment: ${file.name}`)
        }
        fileReader.onload = (event) => {
            const fileDataUrl = event.target.result;
            if (fileDataUrl) {
                const content = String(fileDataUrl).split(",")[1]
                if (!content) {
                    return
                }
                this.state.images.push({
                    name: file.name,
                    image_uri: content,
                    content,
                    mimetype: file.type || 'application/octet-stream',
                })
            }
        };
        fileReader.readAsDataURL(file);

    }
    contentHandler(file) {
        // Read any selected file as base64 so business documents and other binary
        // formats can be attached like a standard email client.
        return this.attachmentReader(file)
    }
    /**
     * Method to send the composed mail.
     */
    async sentMail() {
        const {
            subject,
            recipient,
            cc,
            bcc,
            senderServerId,
            parentMessageId,
            content,
            images,
        } = this.state
        let sendMail = []
        if (recipient) {
            try {
                sendMail = await this.orm.call('email.record', 'sent_mail', [], {
                    subject,
                    recipient,
                    cc,
                    bcc,
                    incoming_server_id: senderServerId ? parseInt(senderServerId, 10) : false,
                    parent_message_id: parentMessageId || false,
                    content,
                    images,
                    attachments: images,
                })
            } catch (error) {
                sendMail = []
            }
            if (Array.isArray(sendMail) && sendMail.length) {
                if (this.props.loadMail) {
                    this.props.loadMail(sendMail[0])
                }
            }
            this.props.close()
            if (this.props.reloadOnSend !== false) {
                window.location.reload()
            }
        }
    }
    /**
     * Method to maximize or restore the mail composition window.
     */
    maximizeMail() {
        const mailBody = this.root.el;
        mailBody.classList.toggle('maximized');

        if (!mailBody.classList.contains('maximized')) {
            // Reset inline dimensions so CSS viewport constraints apply after restore.
            mailBody.style.width = '';
            mailBody.style.height = '';
        }
    }
    /**
     * Method to close the mail composition window.
     */
    Close() {
        this.props.close()
    }
    /**
     * Method to minimize or restore the mail composition window.
     */
    minimizeMail() {
        const mailBody = this.root.el;
        if (!this.state.minimized) {
            this.state.originalHeight = mailBody.style.height;
            mailBody.style.height = '50px';
        } else {
            mailBody.style.height = this.state.originalHeight;
        }
        this.state.minimized = !this.state.minimized;
    }
    /**
     * Method to trigger the attachment action.
     */
   async attachmentAction() {
        this.dialog.add(ImportDialog, {
            addAttachment: this.addAttachment.bind(this)
        })
    }
    closeInput(index){
        this.state.attachedFiles.splice(index, 1)
    }
    addAttachment(attachment) {
        this.state.attachedFiles.push(attachment)
        this.contentHandler(attachment)
    }
}
ComposeMail.template = 'ComposeMail'
