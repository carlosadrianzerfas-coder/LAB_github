import { LightningElement, api } from 'lwc';

export default class LabAiVisitTasks extends LightningElement {
    @api tasks = [];

    get hasTasks() {
        return this.tasks && this.tasks.length > 0;
    }

    handleAddClick() {
        this.dispatchEvent(
            new CustomEvent('addtask', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleEditClick(event) {
        const id = event?.currentTarget?.dataset?.id;
        const index = event?.currentTarget?.dataset?.index;
        if (!id && (index === undefined || index === null)) return;

        this.dispatchEvent(
            new CustomEvent('edittask', {
                detail: { id, index },
                bubbles: true,
                composed: true
            })
        );
    }

    handleDeleteClick(event) {
        const id = event?.currentTarget?.dataset?.id;
        const index = event?.currentTarget?.dataset?.index;
        if (!id && (index === undefined || index === null)) return;

        this.dispatchEvent(
            new CustomEvent('deletetask', {
                detail: { id, index },
                bubbles: true,
                composed: true
            })
        );
    }

    handleRestoreClick(event) {
        const id = event?.currentTarget?.dataset?.id;
        const index = event?.currentTarget?.dataset?.index;
        if (!id && (index === undefined || index === null)) return;

        this.dispatchEvent(
            new CustomEvent('restoretask', {
                detail: { id, index },
                bubbles: true,
                composed: true
            })
        );
    }

    handleApplyClick() {
        this.dispatchEvent(
            new CustomEvent('applytasks', {
                bubbles: true,
                composed: true
            })
        );
    }
}