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
        this.state = useState({
            title: this.props.title || "New Message",
            subject: this.props.initialSubject || "",
            recipient: this.props.initialRecipient || "",
            cc: this.props.initialCc || "",
            bcc: this.props.initialBcc || "",
            senderServerId: this.props.initialServerId ? String(this.props.initialServerId) : "",
            senderAccounts: [],
            signatures: [],
            selectedSignatureId: "",
            lastAppliedSignature: "",
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

            this.selectDefaultSignature(!this.hasInitialContent)
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
            return
        }
        const defaultSignature = signatures.find((signature) => signature.is_default) || signatures[0]
        this.state.selectedSignatureId = String(defaultSignature.id)
        if (applyToContent) {
            this.applySignatureBody(defaultSignature.body || '')
        }
    }

    applySignatureBody(signatureBody) {
        const normalizedBody = signatureBody || ''
        if (this.state.lastAppliedSignature) {
            const previousSignatureBlock = `\n\n${this.state.lastAppliedSignature}`
            if ((this.state.content || '').endsWith(previousSignatureBlock)) {
                this.state.content = this.state.content.slice(0, -previousSignatureBlock.length)
            }
        }
        if (!normalizedBody) {
            this.state.lastAppliedSignature = ''
            return
        }
        const prefix = this.state.content ? '\n\n' : ''
        this.state.content = `${this.state.content || ''}${prefix}${normalizedBody}`
        this.state.lastAppliedSignature = normalizedBody
    }

    onSenderAccountChange() {
        this.selectDefaultSignature(!this.hasInitialContent)
    }

    onSignatureChange(ev) {
        this.state.selectedSignatureId = ev.currentTarget.value || ''
        const signature = this.availableSignatures.find((item) => String(item.id) === this.state.selectedSignatureId)
        if (signature && !this.hasInitialContent) {
            this.applySignatureBody(signature.body || '')
        }
    }

    openSignatureManager() {
        this.action.doAction('odoo_mail_client.action_mail_signatures')
    }

    async imageReader(file) {
        const fileReader = new FileReader();
        fileReader.onload = (event) => {
            const imageDataUrl = event.target.result; // Data URL of the image
            if (imageDataUrl) {
                this.state.images.push({name: file.name, image_uri: imageDataUrl.split(",")[1]})
            }
        };
        fileReader.readAsDataURL(file);

    }
    contentHandler(file) {
    switch (file.type) {
        case "image/jpeg":
        case "image/png":
        case "image/gif":
        case "image/svg+xml":
        case "image/webp":
            return this.imageReader(file);
        case "application/pdf":
            return this.imageReader(file);
        case "text/csv":
            return this.csvReader(file);
        default:
            console.warn(`Unsupported file type: ${file.type}`);
    }
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
                    content,
                    images,
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
        const TextArea = this.root.el.querySelector("#content");

        if (mailBody.classList.contains('maximized')) {
            mailBody.style.height = '532px';
            mailBody.style.right = '5%';
            mailBody.style.width = '30%';
            mailBody.style.position = 'fixed';
            TextArea.style.height = '300px';
        } else {
            mailBody.style.height = '900px';
            mailBody.style.right = '5%';
            mailBody.style.width = '100%';
            mailBody.style.position = 'absolute';

        }
        mailBody.classList.toggle('maximized');
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
