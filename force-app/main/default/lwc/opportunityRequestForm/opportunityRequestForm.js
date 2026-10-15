import { LightningElement, api, wire, track } from 'lwc';
import getPicklistValues from '@salesforce/apex/OpportunityRequestFormController.getPicklistValues';

export default class OpportunityRequestForm extends LightningElement {
    @api type;
    
    _value = {};

    @api
    get value() {
        return this._value;
    }
    set value(val) {
        this._value = val ? { ...val } : {};
    }

    get minCloseDate() {
        const today = new Date();

        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }


    @track stageOptions = [];
    @track opportunityTypeOptions = [];
    @track disclosureOptions = [];
    @track accountNameOptions = []; 
    
    // Carga de Etapas (StageName)
    @wire(getPicklistValues, { objectApiName: 'Opportunity', fieldApiName: 'StageName' })
    wiredStages({ error, data }) {
        if (data) {
            this.stageOptions = data;
        } else if (error) {
            console.error('Error loading stages', error);
        }
    }

    // Carga de Tipos de Oportunidad (Type)
    @wire(getPicklistValues, { objectApiName: 'Opportunity', fieldApiName: 'Type' })
    wiredOppTypes({ error, data }) {
        if (data) {
            this.opportunityTypeOptions = data;
        } else if (error) {
             console.error('Error loading opportunity types', error);
        }
    }

    handleAccountChange(event) {
    const accountId = event.detail.recordId;
    this._value = { ...this._value, accountId: accountId };
    
    this.dispatchEvent(new CustomEvent('valuechange', {
        detail: { value: this._value }
    }));
    }

    handleInputChange(event) {
        event.stopPropagation();
        const field = event.target.name;
        // Checkboxes use 'checked', others use 'value' in detail usually.
        // For lightning-input type='checkbox', use event.target.checked.
        // For other inputs and comboboxes, use event.detail.value.
        const val = (event.target.type === 'checkbox' || event.target.type === 'toggle') 
            ? event.target.checked 
            : event.detail.value;
        
        this._value = { ...this._value, [field]: val };
        
        this.dispatchEvent(new CustomEvent('valuechange', {
            bubbles: true,
            composed: true,
            detail: {
                value: this._value
            }
        }));
    }
}