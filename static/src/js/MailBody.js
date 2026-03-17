/* @odoo-module*/
import { Component, useRef, useState } from '@odoo/owl'
import { useService } from "@web/core/utils/hooks";

/**
 * MailBody component for displaying mail details.
 * @extends Component
 */
export class MailBody extends  Component {
    setup() {
        this.ref = useRef('root')
    this.html_content = (this.props.mail.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        this.orm = useService('orm')
        this.state = useState({
      starred: !!this.props.mail.is_starred,
        })
        this.env.bus.addEventListener("SELECT:ALL", (event) => {
            const { checked } = event.detail
            this.ref.el.querySelector(".mail_check_box").checked = checked
            this.props.onSelectMail(this.props.mail.id, checked)
        })
    }

    async safeModelCall(method, args = [], kwargs = {}) {
      try {
        return await this.orm.call('email.record', method, args, kwargs)
      } catch (error) {
        return null
      }
    }
    /**
     * Method triggered on click of the mail selection checkbox.
     * @param {Object} ev - Event object.
     */
    onClickSelect(ev) {
        const checked = ev.target.checked
        this.props.onSelectMail(this.props.mail.id, checked)
    }
     /**
     * Method to archive the mail.
     * @param {Object} event - Event object.
     */
     async archiveMail(event){
      var mail = this.props.mail.id
      const archived = await this.safeModelCall('archive_mail', [mail])
      if (archived === null) {
        await this.orm.write('email.record', [mail], { is_archived: true })
      }
      window.location.reload();
    }
    /**
     * Method to unarchive the mail.
     * @param {Object} event - Event object.
     */
     async unArchive(event){
      var mail = this.props.mail.id
      const unarchived = await this.safeModelCall('unarchive_mail', [mail])
      if (unarchived === null) {
        await this.orm.write('email.record', [mail], { is_archived: false })
      }
       window.location.reload();
      }
      /**
     * Method to resend the mail.
     * @param {Object} event - Event object.
     */
    async resendMail(){
      var mail = this.props.mail.id
      const retried = await this.safeModelCall('retry_mail', [mail])
      if (retried === null) {
        await this.safeModelCall('send_email', [[mail]])
      }
    }
    /**
     * Method to delete the mail.
     * @param {Object} event - Event object.
     */
    async deleteMail(event){
       var mail = this.props.mail.id
       const deleted = await this.safeModelCall('delete_checked_mail', [mail])
       if (deleted === null) {
          await this.orm.unlink('email.record', [mail])
       }
       window.location.reload();
    }
    /**
     * Method to star or unstar the mail.
     * @param {Object} event - Event object.
     */
    async starMail(event){
        var mail = this.props.mail.id
      this.state.starred = !this.state.starred
        this.props.starMail(mail, this.state.starred)
      const starred = await this.safeModelCall('star_mail', [mail])
      if (starred === null) {
            await this.orm.write('email.record', [mail], { is_starred: this.state.starred })
      }
    }
    /**
     * Method to open the mail.
     * @param {Object} event - Event object.
     */
   async openMail(event){
     var mail = this.props.mail
     this.props.openMail(mail)
   }
}
MailBody.template = 'MailBody'
