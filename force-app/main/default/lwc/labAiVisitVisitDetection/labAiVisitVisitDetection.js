import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import VISIT_OBJECT from '@salesforce/schema/Visit';
import DURATION_FIELD from '@salesforce/schema/Visit.LAB_Duration__c';
import CHANNEL_FIELD from '@salesforce/schema/Visit.LAB_Channel__c';
import PURPOSE_FIELD from '@salesforce/schema/Visit.LAB_purpose_type__c';

export default class LabAiVisitVisitDetection extends LightningElement {
    @api isAccountMode = false;
    @api mode = 'new';
    @api openVisits = [];
    @api selectedExistingVisitId = '';
    @api aiDetectedVisitId = '';
    @api currentVisitDraft = {};
    durationOptions = [];
    channelOptions = [];
    purposeOptions = [];
    recordTypeInfos = {};
    defaultRecordTypeId;

    get showSelection() {
        return this.isAccountMode;
    }

    get hasOpenVisits() {
        return (this.openVisits || []).length > 0;
    }

    get openVisitOptions() {
        return (this.openVisits || []).map(v => {
            const dateLabel = v.startDatetime ? ` - ${v.startDatetime}` : '';
            const analysisLabel = v.hasSavedAnalysis ? ' - Saved analysis' : '';
            return {
                label: `${v.visitName || 'Visit'}${dateLabel}${analysisLabel}`,
                value: v.visitId
            };
        });
    }

    get showExistingPicker() {
        return this.isAccountMode && this.mode === 'existing';
    }

    get headerTitle() {
        if (!this.isAccountMode) {
            return 'Visit Details';
        }
        return this.mode === 'existing' ? 'Visit detected' : 'New visit';
    }

    get detailsHint() {
        if (this.isAccountMode && this.mode === 'new') {
            return 'Complete these fields before applying changes. Required fields are marked.';
        }
        return 'Review the visit details before applying changes.';
    }

    get detectedVisitLabel() {
        const options = this.openVisitOptions || [];
        const match = options.find(opt => opt.value === this.selectedExistingVisitId);
        return match ? match.label : '';
    }

    get selectionNote() {
        if (!this.isAccountMode) return '';
        if (this.mode === 'existing') {
            if (this.detectedVisitLabel && this.aiDetectedVisitId === this.selectedExistingVisitId) {
                return `Detected visit from transcript: ${this.detectedVisitLabel}. Click "Open visit" to navigate, or "Save context and open visit" to save and open.`;
            }
            if (this.detectedVisitLabel) {
                return `Selected visit: ${this.detectedVisitLabel}. Click "Open visit" to navigate, or "Save context and open visit" to save and open.`;
            }
            return 'Select the open visit that matches this transcript, then click "Open visit" or "Save context and open visit".';
        }
        return 'No open visit detected. A new visit will be created when you apply changes.';
    }

    get showMissingWarning() {
        return !!(this.currentVisitDraft && this.currentVisitDraft.showMissing);
    }

    get currentVisitMissingFieldsLabel() {
        return (this.currentVisitDraft && this.currentVisitDraft.missingFields || []).join(', ');
    }

    get currentVisitStartInputValue() {
        return this.toInputDatetime(this.currentVisitDraft && this.currentVisitDraft.startDatetime);
    }

    get currentVisitDurationValue() {
        const val = this.currentVisitDraft && this.currentVisitDraft.durationMinutes;
        if (val === null || val === undefined) return '';
        return typeof val === 'number' ? String(val) : val;
    }

    get newModeVariant() {
        return this.mode === 'new' ? 'brand' : 'neutral';
    }

    get existingModeVariant() {
        return this.mode === 'existing' ? 'brand' : 'neutral';
    }

    get disableOpenExisting() {
        return !this.hasOpenVisits;
    }

    get showExistingActions() {
        return this.isAccountMode && this.mode === 'existing';
    }

    get hasSelectedExistingVisit() {
        return !!(this.selectedExistingVisitId || this.aiDetectedVisitId);
    }

    get disableOpenVisit() {
        return !this.hasSelectedExistingVisit;
    }

    get showCreateAction() {
        return this.isAccountMode && this.mode === 'new';
    }

    get disableCreateAction() {
        return !!(this.currentVisitDraft && this.currentVisitDraft.isValid === false);
    }

    @wire(getObjectInfo, { objectApiName: VISIT_OBJECT })
    handleVisitObjectInfo({ data, error }) {
        if (data) {
            this.recordTypeInfos = data.recordTypeInfos || {};
            this.defaultRecordTypeId = data.defaultRecordTypeId;
        } else if (error) {
            // Intentionally silent; handled by UI state.
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$picklistRecordTypeId', fieldApiName: DURATION_FIELD })
    handleDurationPicklist({ data, error }) {
        if (data && data.values) {
            this.durationOptions = data.values;
        } else if (error) {
            // Intentionally silent; handled by UI state.
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$picklistRecordTypeId', fieldApiName: CHANNEL_FIELD })
    handleChannelPicklist({ data, error }) {
        if (data && data.values) {
            this.channelOptions = data.values;
        } else if (error) {
            // Intentionally silent; handled by UI state.
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$picklistRecordTypeId', fieldApiName: PURPOSE_FIELD })
    handlePurposePicklist({ data, error }) {
        if (data && data.values) {
            this.purposeOptions = data.values;
        } else if (error) {
            // Intentionally silent; handled by UI state.
        }
    }

    get picklistRecordTypeId() {
        const accountVisitId = this.getRecordTypeIdByDeveloperName('AccountVisit');
        return accountVisitId || this.defaultRecordTypeId;
    }

    renderedCallback() {
        const rtId = this.picklistRecordTypeId;
        if (this._lastPicklistRtId !== rtId) {
            this._lastPicklistRtId = rtId;
        }
    }

    getRecordTypeIdByDeveloperName(devName) {
        const infos = this.recordTypeInfos || {};
        return Object.keys(infos)
            .map(key => infos[key])
            .find(info => info && info.developerName === devName)?.recordTypeId;
    }

    dispatchModeChange(value, skipMerge = false) {
        this.dispatchEvent(new CustomEvent('modechange', {
            detail: { value, skipMerge },
            bubbles: true,
            composed: true
        }));
    }

    handleSelectNew() {
        if (this.mode === 'new') return;
        this.dispatchModeChange('new');
    }

    handleSelectExisting() {
        if (!this.hasOpenVisits) return;
        if (this.mode !== 'existing') {
            this.dispatchModeChange('existing', true);
        }
    }

    handleOpenVisit() {
        const visitId = this.selectedExistingVisitId || this.aiDetectedVisitId || '';
        if (!visitId) return;
        this.dispatchEvent(new CustomEvent('openvisit', {
            detail: { visitId },
            bubbles: true,
            composed: true
        }));
    }

    handleSaveAndOpen() {
        const visitId = this.selectedExistingVisitId || this.aiDetectedVisitId || '';
        if (!visitId) return;
        this.dispatchEvent(new CustomEvent('saveandopen', {
            detail: { visitId },
            bubbles: true,
            composed: true
        }));
    }

    handleExistingChange(event) {
        this.dispatchEvent(new CustomEvent('existingchange', {
            detail: { value: event.detail.value },
            bubbles: true,
            composed: true
        }));
    }

    handleFieldChange(event) {
        const field = event.target.dataset.field;
        const value = event.detail && event.detail.value !== undefined
            ? event.detail.value
            : event.target.value;

        this.dispatchEvent(new CustomEvent('currentvisitchange', {
            detail: { field, value },
            bubbles: true,
            composed: true
        }));
    }

    toInputDatetime(value) {
        if (!value) return '';

        const clean = value.replace('T', ' ').replace('.000Z', '').trim();
        const match = clean.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        if (match) {
            return `${match[1]}T${match[2]}`;
        }
        if (clean.includes('T')) {
            return clean.split('.')[0];
        }
        return clean;
    }

    handleCreateAndContinue() {
        this.dispatchEvent(new CustomEvent('createandcontinue', {
            bubbles: true,
            composed: true
        }));
    }

}