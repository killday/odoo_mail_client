/** @odoo-module **/
import { registry } from '@web/core/registry';
import { Component, useRef, useState, onWillStart, onMounted } from '@odoo/owl'
import { useService } from "@web/core/utils/hooks";
import { MailBody } from './MailBody'
import { SentMail } from './SentMail'
import { MessageView } from './MessageView'
import { ComposeMail } from './ComposeMail'
import { ImportDialog } from './AttachmentMail'
import { session } from '@web/session'
/**
 * odooMail component for handling mail-related functionalities.
 * @extends Component
 */
class odooMail extends Component {
    static props = ["*"];

    setup() {
        this.mailState = useState({
            loadLogo: "",
            loadMail: [],
            accounts: [],
            selectedAccountId: null,
            selectedCount: 0,
            getCount: {
                all_count: 0,
                sent_count: 0,
                outbox_count: 0,
                starred_count: 0,
                archived_count: 0,
            },
            outBox: "",
            mode: "tree",
            formData: {},
            mailType: "all",
            sortBy: "date",
            sortOrder: "desc"
        })
        this.dialogService = useService("dialog")
        this.root = useRef('root');
        this.action = useService('action')
        this.orm = useService('orm')
        this.selectedMails = []
        onMounted(() => {
            this.allMailView()
        })
        onWillStart(async () => {
            try {
                this.mailState.loadLogo = await this.orm.call('mail.icon', 'load_logo', [])
            } catch (error) {
                this.mailState.loadLogo = ''
            }
            this.mailState.accounts = await this.orm.searchRead(
                'fetchmail.server',
                [],
                ['name', 'user'],
                { order: 'name asc' }
            )
            this.getCount()
        })
    }

    get mailReadFields() {
        return ['subject', 'sender', 'to', 'cc', 'bcc', 'body', 'date_time', 'attachments', 'is_read', 'is_starred', 'is_archived', 'type', 'incoming_server_id']
    }

    get sortOrder() {
        // Map UI sort field names to ORM field names
        const fieldMap = {
            'sender': 'sender',
            'subject': 'subject',
            'account': 'incoming_server_id',
            'date': 'date_time'
        }
        const field = fieldMap[this.mailState.sortBy] || 'date_time'
        const order = this.mailState.sortOrder || 'desc'
        return `${field} ${order}`
    }

    get accountFilterDomain() {
        if (!this.mailState.selectedAccountId) {
            return []
        }
        return [['incoming_server_id', '=', this.mailState.selectedAccountId]]
    }

    filterByAccount(accountId) {
        this.mailState.selectedAccountId = accountId || null
        this.reloadCurrentFolder()
    }

    onAccountFilterClick(ev) {
        const rawId = ev.currentTarget.dataset.accountId
        const accountId = rawId ? parseInt(rawId, 10) : null
        this.filterByAccount(Number.isNaN(accountId) ? null : accountId)
    }

    onHeaderClick(ev) {
        const sortField = ev.currentTarget.dataset.sort
        if (!sortField) return

        // Map UI sort names to ORM field names
        const sortFieldMap = {
            'sender': 'sender',
            'subject': 'subject',
            'account': 'incoming_server_id',
            'date': 'date_time'
        }
        
        const ormField = sortFieldMap[sortField]
        
        if (this.mailState.sortBy === sortField) {
            // Toggle sort order
            this.mailState.sortOrder = this.mailState.sortOrder === 'asc' ? 'desc' : 'asc'
        } else {
            // New sort column
            this.mailState.sortBy = sortField
            this.mailState.sortOrder = 'desc'
        }
        
        this.reloadCurrentFolder()
    }

    filterMailsBySelectedAccount(mails) {
        if (!this.mailState.selectedAccountId) {
            return mails
        }
        return (mails || []).filter((mail) =>
            mail.incoming_server_id && mail.incoming_server_id[0] === this.mailState.selectedAccountId
        )
    }

    async safeModelCall(model, method, args = [], kwargs = {}) {
        try {
            return await this.orm.call(model, method, args, kwargs)
        } catch (error) {
            return null
        }
    }

    get mailboxBaseDomain() {
        return ['|', '|', '|',
            ['associated_users', 'in', [session.uid]],
            ['associated_users', '=', false],
            ['create_uid', '=', session.uid],
            ['sender', '=', session.partner_id],
        ]
    }

    async computeCountsFallback() {
        const baseDomain = this.mailboxBaseDomain
        let allCount = await this.orm.searchCount('email.record', [...baseDomain, ['type', '=', 'incoming'], ['is_read', '=', false], ['is_archived', '=', false]])
        let sentCount = await this.orm.searchCount('email.record', [...baseDomain, ['type', '=', 'outgoing'], ['is_archived', '=', false]])
        let outboxCount = await this.orm.searchCount('email.record', [...baseDomain, ['type', '=', 'draft'], ['is_archived', '=', false]])
        let starredCount = await this.orm.searchCount('email.record', [...baseDomain, ['is_starred', '=', true], ['is_archived', '=', false]])
        let archivedCount = await this.orm.searchCount('email.record', [...baseDomain, ['is_archived', '=', true]])

        if (!allCount) {
            allCount = await this.orm.searchCount('email.record', [['type', '=', 'incoming'], ['is_read', '=', false], ['is_archived', '=', false]])
            sentCount = await this.orm.searchCount('email.record', [['type', '=', 'outgoing'], ['is_archived', '=', false]])
            outboxCount = await this.orm.searchCount('email.record', [['type', '=', 'draft'], ['is_archived', '=', false]])
            starredCount = await this.orm.searchCount('email.record', [['is_starred', '=', true], ['is_archived', '=', false]])
            archivedCount = await this.orm.searchCount('email.record', [['is_archived', '=', true]])
        }

        return {
            all_count: allCount,
            sent_count: sentCount,
            outbox_count: outboxCount,
            starred_count: starredCount,
            archived_count: archivedCount,
        }
    }

    setActiveSidebarItem(activeClass) {
        const classNames = ['all_mail', 'archieved-mail', 'sent-mail', 'outbox', 'sent'];
        for (const className of classNames) {
            const el = this.root.el.querySelector(`.${className}`);
            if (el) {
                el.classList.toggle('active', className === activeClass);
            }
        }
    }

    /**
     * Method to get the count of different mail categories.
     */
    async getCount() {
        const counts = await this.safeModelCall('email.record', 'get_mail_count', [])
        this.mailState.getCount = counts || await this.computeCountsFallback()
    }
    /**
     * Method to compose a new mail.
     */
    async composeMail() {
        this.dialogService.add(ComposeMail, {
            loadMail: (mail) => {
                this.mailState.loadMail.unshift(mail)
                this.getCount()
            }
        })
    }
    /**
     * Method triggered on click of the "Select All" checkbox.
     * @param {Object} ev - Event object.
     */
    onClickSelectAll(ev) {
        const checked = ev.target.checked
        this.env.bus.trigger("SELECT:ALL", { checked })
    }
    /**
     * Getter method to get props for MailBody component.
     * @returns {Object} - Props for MailBody component.
     */
    get mailProps() {
        return {
            onSelectMail: this.onSelectMail.bind(this),
            starMail: this.starMail.bind(this),
            openMail: this.openMail.bind(this),
            markRead: this.markRead.bind(this),
            mailType: this.mailType,
        }
    }

    get messageProps() {
        return {
            mail: this.mailState.formData,
            onBack: this.resetView.bind(this),
            onReloadList: this.reloadCurrentFolder.bind(this),
            currentFolder: this.mailState.mailType,
        }
    }
    /**
     * Method to reset the mail view.
     */
    resetView() {
        this.mailState.formData = {}
        this.mailState.mode = "tree"
        this.selectedMails = []
        this.mailState.selectedCount = 0
    }
    /**
     * Method to open a specific mail.
     * @param {Object} mail - Mail object.
     */
    openMail(mail) {
        this.mailState.formData = mail
        this.mailState.mode = "form"
    }

    markRead(mailId) {
        const row = this.mailState.loadMail.find((item) => item.id === mailId)
        if (row && !row.is_read) {
            row.is_read = true
            if (this.mailState.getCount.all_count > 0) {
                this.mailState.getCount.all_count--
            }
        }
    }
    /**
     * Method to star or unstar a mail.
     * @param {Number} mail - Mail ID.
     * @param {Boolean} type - Type of action (star or unstar).
     */
    starMail(mail, type) {
        if (!this.mailState.getCount) {
            return;
        }
        if (type) {
            this.mailState.getCount.starred_count++
        } else if (this.mailState.getCount.starred_count > 0) {
            this.mailState.getCount.starred_count--
        }
    }
    /**
     * Method triggered on selecting or deselecting a mail.
     * @param {Number} mailId - Mail ID.
     * @param {Boolean} check - Checked or not.
     */
    onSelectMail(mailId, check) {
        if (check) {
            if (!this.selectedMails.includes(mailId)) {
                this.selectedMails.push(mailId)
            }
        }
        else {
            this.selectedMails = this.selectedMails.filter(item => item !== mailId)
        }
        this.mailState.selectedCount = this.selectedMails.length
    }

    get hasSelection() {
        return this.mailState.selectedCount > 0
    }

    async markSelectedRead() {
        if (!this.selectedMails.length) {
            return
        }
        const updated = await this.safeModelCall('email.record', 'action_mark_read', [this.selectedMails])
        if (updated === null) {
            await this.orm.write('email.record', this.selectedMails, { is_read: true })
        }
        for (const mail of this.mailState.loadMail) {
            if (this.selectedMails.includes(mail.id)) {
                mail.is_read = true
            }
        }
        this.getCount()
    }

    async markSelectedUnread() {
        if (!this.selectedMails.length) {
            return
        }
        const updated = await this.safeModelCall('email.record', 'action_mark_unread', [this.selectedMails])
        if (updated === null) {
            await this.orm.write('email.record', this.selectedMails, { is_read: false })
        }
        for (const mail of this.mailState.loadMail) {
            if (this.selectedMails.includes(mail.id)) {
                mail.is_read = false
            }
        }
        this.getCount()
    }

    async reloadCurrentFolder() {
        if (this.mailState.mailType === 'starred') {
            await this.starredMail()
            return
        }
        if (this.mailState.mailType === 'archive') {
            await this.archivedMail()
            return
        }
        if (this.mailState.mailType === 'outbox') {
            await this.outboxMailView()
            return
        }
        if (this.mailState.mailType === 'sent') {
            await this.sentMail()
            return
        }
        await this.allMailView()
    }
    /**
     * Getter method to get the mail type.
     * @returns {String} - Current mail type.
     */
    get mailType() {
        return this.mailState.mailType
    }
    /**
     * Method to archive selected mails.
     * @param {Object} event - Event object.
     */
    async archiveMail(event) {
        if (this.selectedMails.length) {
            this.mailState.loadMail = this.mailState.loadMail.filter(item => !this.selectedMails.includes(item.id))
            const archived = await this.safeModelCall('email.record', 'archive_mail', [this.selectedMails])
            if (archived === null) {
                await this.orm.write('email.record', this.selectedMails, { is_archived: true })
            }
            this.getCount()
            this.selectedMails = []
            this.mailState.selectedCount = 0
        }
    }

    async unarchiveSelected(event) {
        if (this.selectedMails.length) {
            this.mailState.loadMail = this.mailState.loadMail.filter(item => !this.selectedMails.includes(item.id))
            await this.orm.write('email.record', this.selectedMails, { is_archived: false })
            this.getCount()
            this.selectedMails = []
            this.mailState.selectedCount = 0
        }
    }
    /**
     * Method to refresh the page.
     * @param {Object} event - Event object.
     */
    refreshPage(event) {
        window.location.reload()
    }
    /**
     * Method to delete selected mails.
     * @param {Object} event - Event object.
     */
    async deleteMail(event) {
        if (this.selectedMails.length) {
            this.mailState.loadMail = this.mailState.loadMail.filter(item => !this.selectedMails.includes(item.id))
            const deleted = await this.safeModelCall('email.record', 'delete_mail', [this.selectedMails])
            if (deleted === null) {
                await this.orm.unlink('email.record', this.selectedMails)
            }
            this.getCount()
            this.selectedMails = []
            this.mailState.selectedCount = 0
        }
    }
    /**
     * Method to view all mails.
     */
    async allMailView() {
        this.setActiveSidebarItem('all_mail');
        this.mailState.mailType = 'all'
        this.resetView()
        this.mailState.loadMail = await this.orm.searchRead(
            'email.record',
            [...this.mailboxBaseDomain, ...this.accountFilterDomain, ['type', '=', 'incoming'], ['is_archived', '=', false]],
            this.mailReadFields,
            { order: this.sortOrder }
        )
        if (!this.mailState.loadMail.length) {
            this.mailState.loadMail = await this.orm.searchRead(
                'email.record',
                [...this.accountFilterDomain, ['type', '=', 'incoming'], ['is_archived', '=', false]],
                this.mailReadFields,
                { order: this.sortOrder }
            )
        }
    }
    /**
     * Method to view starred mails.
     */
    async starredMail() {
        this.setActiveSidebarItem('sent-mail');
        this.mailState.mailType = "starred"
        this.resetView()
        const starred = await this.safeModelCall('email.record', 'get_starred_mail', [])
        if (starred !== null) {
            this.mailState.loadMail = this.filterMailsBySelectedAccount(starred)
            return
        }
        this.mailState.loadMail = await this.orm.searchRead(
            'email.record',
            [...this.mailboxBaseDomain, ...this.accountFilterDomain, ['is_starred', '=', true], ['is_archived', '=', false]],
            this.mailReadFields,
            { order: this.sortOrder }
        )
        if (!this.mailState.loadMail.length) {
            this.mailState.loadMail = await this.orm.searchRead(
                'email.record',
                [...this.accountFilterDomain, ['is_starred', '=', true], ['is_archived', '=', false]],
                this.mailReadFields,
                { order: this.sortOrder }
            )
        }
    }
    /**
     * Method to view archived mails.
     */
    async archivedMail() {
        this.setActiveSidebarItem('archieved-mail');
        this.mailState.mailType = 'archive'
        this.resetView()
        const archived = await this.safeModelCall('email.record', 'get_archived_mail', [])
        if (archived !== null) {
            this.mailState.loadMail = this.filterMailsBySelectedAccount(archived)
            return
        }
        this.mailState.loadMail = await this.orm.searchRead(
            'email.record',
            [...this.mailboxBaseDomain, ...this.accountFilterDomain, ['is_archived', '=', true]],
            this.mailReadFields,
            { order: this.sortOrder }
        )
        if (!this.mailState.loadMail.length) {
            this.mailState.loadMail = await this.orm.searchRead(
                'email.record',
                [...this.accountFilterDomain, ['is_archived', '=', true]],
                this.mailReadFields,
                { order: this.sortOrder }
            )
        }
    }
    /**
     * Method to view outbox mails.
     */
    async outboxMailView() {
        this.setActiveSidebarItem('outbox');
        this.mailState.mailType = "outbox"
        this.resetView()
        this.mailState.loadMail = await this.orm.searchRead(
            'email.record',
            [...this.mailboxBaseDomain, ...this.accountFilterDomain, ['type', '=', 'draft'], ['is_archived', '=', false]],
            this.mailReadFields,
            { order: this.sortOrder }
        )
        if (!this.mailState.loadMail.length) {
            this.mailState.loadMail = await this.orm.searchRead(
                'email.record',
                [...this.accountFilterDomain, ['type', '=', 'draft'], ['is_archived', '=', false]],
                this.mailReadFields,
                { order: this.sortOrder }
            )
        }
    }
    /**
     * Method to view sent mails.
     */
    async sentMail() {
        this.setActiveSidebarItem('sent');
        this.mailState.mailType = 'sent'
        this.resetView()
        this.mailState.loadMail = await this.orm.searchRead(
            'email.record',
            [...this.mailboxBaseDomain, ...this.accountFilterDomain, ['type', '=', 'outgoing'], ['is_archived', '=', false]],
            this.mailReadFields,
            { order: this.sortOrder }
        )
        if (!this.mailState.loadMail.length) {
            this.mailState.loadMail = await this.orm.searchRead(
                'email.record',
                [...this.accountFilterDomain, ['type', '=', 'outgoing'], ['is_archived', '=', false]],
                this.mailReadFields,
                { order: this.sortOrder }
            )
        }
    }
    /**
     * Method to redirect to the calendar view.
     */
    redirectCalender() {
        this.action.doAction({
            name: "Calender",
            type: 'ir.actions.act_window',
            res_model: 'calendar.event',
            view_mode: 'calendar,tree',
            view_type: 'calendar',
            views: [[false, 'calendar'], [false, 'tree']],
            target: 'current',
        });
    }
    /**
     * Method to redirect to the contacts view.
     */
    redirectContacts() {
        this.action.doAction({
            name: "Contacts",
            type: 'ir.actions.act_window',
            res_model: 'res.partner',
            view_mode: 'kanban,form,tree,activity',
            view_type: 'kanban',
            views: [[false, 'kanban'], [false, 'form'], [false, 'tree'], [false, 'activity']],
            target: 'current',
        });
    }
    /**
     * Method to search mails based on user input.
     */
    searchMail() {
        var value = this.root.el.querySelector(".header-search-input").value.toLowerCase()
        var inboxItems = this.root.el.querySelectorAll(".inbox-message-item");
        inboxItems.forEach(item => {
            var itemText = item.textContent.toLowerCase();
            item.style.display = itemText.includes(value) ? "" : "none";
        })
    }
}
odooMail.template = 'OdooMail'
odooMail.components = {
    MailBody, SentMail, ComposeMail, MessageView, ImportDialog
}
registry.category('actions').add('odoo_mail', odooMail);
registry.category('actions').add('odoo_mail_client', odooMail);
