import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import VISIT_OBJECT from '@salesforce/schema/Visit';
import DURATION_FIELD from '@salesforce/schema/Visit.LAB_Duration__c';
import CHANNEL_FIELD from '@salesforce/schema/Visit.LAB_Channel__c';
import PURPOSE_FIELD from '@salesforce/schema/Visit.LAB_purpose_type__c';

export default class LabAiVisitFutureVisits extends LightningElement {
    @api visits = [];

    recordTypeId;
    durationOptions = [];
    channelOptions = [];
    purposeOptions = [];

    @wire(getObjectInfo, { objectApiName: VISIT_OBJECT })
    handleVisitInfo({ data }) {
        if (data) {
            this.recordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$recordTypeId', fieldApiName: DURATION_FIELD })
    handleDuration({ data }) {
        if (data && data.values) {
            this.durationOptions = data.values;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$recordTypeId', fieldApiName: CHANNEL_FIELD })
    handleChannel({ data }) {
        if (data && data.values) {
            this.channelOptions = data.values;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$recordTypeId', fieldApiName: PURPOSE_FIELD })
    handlePurpose({ data }) {
        if (data && data.values) {
            this.purposeOptions = data.values;
        }
    }

    get hasVisits() {
        return this.visits && this.visits.length > 0;
    }

    get displayVisits() {
        return (this.visits || []).map(v => ({
            ...v,
            displayDuration: this.labelFor(this.durationOptions, v.durationMinutes),
            displayChannel: this.labelFor(this.channelOptions, v.channelCode),
            displayPurpose: this.labelFor(this.purposeOptions, v.purposeTypeCode)
        }));
    }

    labelFor(options, value) {
        if (!options || !options.length) return value;
        const stringValue = value === undefined || value === null ? value : String(value);
        const found = options.find(opt => opt.value === stringValue || opt.value === value);
        return found ? found.label : value;
    }

    handleAddClick() {
        this.dispatchEvent(
            new CustomEvent('addvisit', {
                bubbles: true,
                composed: true
            })
        );
    }

    handleEditClick(event) {
        const id = event.currentTarget.dataset.id;

        this.dispatchEvent(
            new CustomEvent('editvisit', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleDeleteClick(event) {
        const id = event.currentTarget.dataset.id;

        this.dispatchEvent(
            new CustomEvent('deletevisit', {
                detail: { id },
                bubbles: true,
                composed: true
            })
        );
    }

    handleApplyClick() {
        this.dispatchEvent(
            new CustomEvent('applyvisits', {
                bubbles: true,
                composed: true
            })
        );
    }
}