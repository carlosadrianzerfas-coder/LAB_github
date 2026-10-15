import { LightningElement, api } from 'lwc';

export default class LabAiVisitClientParticipants extends LightningElement {
    @api participants = [];
    @api accountName;

    get hasAnyClientParticipants() {
        return this.participants && this.participants.length > 0;
    }

    handleAddClick() {
        this.dispatchEvent(
            new CustomEvent('addclient', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleEditClick(event) {
        const id = event.currentTarget.dataset.id;
        this.dispatchEvent(
            new CustomEvent('editclient', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleDeleteClick(event) {
        const id = event.currentTarget.dataset.id;
        this.dispatchEvent(
            new CustomEvent('deleteclient', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleRestoreClick(event) {
        const id = event.currentTarget.dataset.id;
        this.dispatchEvent(
            new CustomEvent('restoreclient', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleApplyClick() {
        this.dispatchEvent(
            new CustomEvent('applyclients', {
                bubbles: true,
                composed: true
            })
        );
    }
}