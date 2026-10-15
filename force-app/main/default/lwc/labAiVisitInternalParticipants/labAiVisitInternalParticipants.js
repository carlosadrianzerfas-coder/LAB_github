import { LightningElement, api } from 'lwc';

export default class LabAiVisitInternalParticipants extends LightningElement {
    @api participants = [];

    get hasInternalParticipants() {
        return this.participants && this.participants.length > 0;
    }

    handleAddClick() {
        this.dispatchEvent(
            new CustomEvent('addinternal', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleEditClick(event) {
        const id = event.currentTarget.dataset.id;
        this.dispatchEvent(
            new CustomEvent('editinternal', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleDeleteClick(event) {
        const id = event.currentTarget.dataset.id;
        this.dispatchEvent(
            new CustomEvent('deleteinternal', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleRestoreClick(event) {
        const id = event.currentTarget.dataset.id;
        this.dispatchEvent(
            new CustomEvent('restoreinternal', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleApplyClick() {
        this.dispatchEvent(
            new CustomEvent('applyinternal', {
                bubbles: true,
                composed: true
            })
        );
    }
}