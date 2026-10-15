import { LightningElement, api, track } from 'lwc';

export default class LabAiVisitSummary extends LightningElement {

    // Valor del resumen recibido desde el padre
    @api feedbackRichText = '';

    // Indica si está en modo edición (controlado por el padre)
    @api isEditing = false;

    @track localValue = '';

    // EDITAR
    handleEdit() {
        this.localValue = this.feedbackRichText;
        this.dispatchEvent(new CustomEvent('edit'));
    }

    // CANCELAR
    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    // GUARDAR
    handleSave() {
        this.dispatchEvent(
            new CustomEvent('save', {
                detail: { value: this.localValue }
            })
        );
    }

    // CAMBIO EN EL EDITOR
    handleChange(e) {
        this.localValue = e.target.value;
        this.dispatchEvent(
            new CustomEvent('change', {
                detail: { value: this.localValue }
            })
        );
    }
}