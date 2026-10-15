import { LightningElement, api, track, wire } from 'lwc';
import getUsersBasicsByIds from '@salesforce/apex/LAB_VisitAI_Controller.getUsersBasicsByIds';
import getContactsBasicsByIds from '@salesforce/apex/LAB_VisitAI_Controller.getContactsBasicsByIds';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import VISIT_OBJECT from '@salesforce/schema/Visit';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import DURATION_FIELD from '@salesforce/schema/Visit.LAB_Duration__c';
import CHANNEL_FIELD from '@salesforce/schema/Visit.LAB_Channel__c';
import PURPOSE_FIELD from '@salesforce/schema/Visit.LAB_purpose_type__c';
import CONTACT_TITLE_FIELD from '@salesforce/schema/Contact.Title';

export default class LabAiVisitRecordModal extends LightningElement {
    @api isOpen = false;
    @api modalType;
    @api modalTitle;

    _modalRecord = {};
    @track localRecord = {};

    @api
    set modalRecord(value) {
        this._modalRecord = value || {};
        // Trabajamos siempre sobre una copia local
        this.localRecord = { ...(value || {}) };
    }
    get modalRecord() {
        return this._modalRecord;
    }

    /* ============================================================
       MODAL TYPE GETTERS
    ============================================================ */
    get isVisit() { return this.modalType === 'visit'; }
    get isClient() { return this.modalType === 'client'; }
    get isInternal()  { return this.modalType === 'internal'; }
    get isTask()  { return this.modalType === 'task'; }

    get isClientModeExisting() {
        return this.localRecord?.clientMode === 'existing';
    }

    get isClientModeNew() {
        return this.localRecord?.clientMode === 'new';
    }

    get startDatetimeInputValue() {
        return this.toInputDatetime(this.localRecord.startDatetime);
    }

    get durationValue() {
        const val = this.localRecord.durationMinutes;
        if (val === null || val === undefined) return '';
        return typeof val === 'number' ? String(val) : val;
    }

    /* ============================================================
       PICKLIST OPTIONS (VISIT)
    ============================================================ */
    recordTypeId;
    durationOptions = [];
    channelOptions = [];
    purposeOptions = [];
    contactDefaultRecordTypeId;
    contactTitleOptions = [];

    @wire(getObjectInfo, { objectApiName: VISIT_OBJECT })
    handleVisitObjectInfo({ data }) {
        if (data) {
            this.recordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    handleContactObjectInfo({ data }) {
        if (data) {
            this.contactDefaultRecordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$recordTypeId', fieldApiName: DURATION_FIELD })
    handleDurationPicklist({ data }) {
        if (data && data.values) {
            this.durationOptions = data.values;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$recordTypeId', fieldApiName: CHANNEL_FIELD })
    handleChannelPicklist({ data }) {
        if (data && data.values) {
            this.channelOptions = data.values;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$recordTypeId', fieldApiName: PURPOSE_FIELD })
    handlePurposePicklist({ data }) {
        if (data && data.values) {
            this.purposeOptions = data.values;
        }
    }

    get contactRecordTypeForPicklist() {
        return this.localRecord?.contactRecordTypeId || this.contactDefaultRecordTypeId || null;
    }

    @wire(getPicklistValues, { recordTypeId: '$contactRecordTypeForPicklist', fieldApiName: CONTACT_TITLE_FIELD })
    handleContactTitlePicklist({ data }) {
        if (data && data.values) {
            this.contactTitleOptions = data.values;
        }
    }

    /* ============================================================
       OPTIONS
    ============================================================ */
    get clientParticipantModeOptions() {
        return [
            { label: 'Existing Contact', value: 'existing' },
            { label: 'New Contact', value: 'new' }
        ];
    }

    /* ============================================================
       CONTACT FILTER PARA lightning-record-picker
    ============================================================ */
    get contactFilter() {
        const acctId = this.localRecord?.accountId;

        return acctId
            ? {
                  criteria: [
                      {
                          fieldPath: 'AccountId',
                          operator: 'eq',
                          value: acctId
                      }
                  ]
              }
            : { criteria: [] };
    }

    /* ============================================================
       API PARA EL PADRE (SCROLL)
    ============================================================ */
    @api
    getModalContainer() {
        return this.template.querySelector('.slds-modal__container');
    }

    /* ============================================================
       HELPERS
    ============================================================ */
    async loadUserBasics(userId) {
        if (!userId) return;

        try {
            const res = await getUsersBasicsByIds({ userIds: [userId] });
            const info = res && res.length ? res[0] : null;

            if (info) {
                this.localRecord = {
                    ...this.localRecord,
                    userId,
                    userName: info.name || '',
                    userEmail: info.email || '',
                    userPhone: info.phone || '',
                    email: info.email || '',
                    phone: info.phone || ''
                };
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('loadUserBasics error', err);
        }
    }

    /* ============================================================
       INPUT HANDLERS GENERALES
    ============================================================ */
    handleField(event) {
        const field = event.target.dataset.field;
        let value = event.detail && event.detail.value !== undefined
            ? event.detail.value
            : event.target.value;

        if (field === 'startDatetime') {
            value = this.fromInputDatetime(value);
        } else if (field === 'durationMinutes') {
            value = value === '' || value === null || value === undefined
                ? null
                : Number(value);
        }

        this.localRecord = { ...this.localRecord, [field]: value };
    }

    handleModeChange(event) {
        this.localRecord = {
            ...this.localRecord,
            clientMode: event.detail.value
        };
    }

    /* ============================================================
       CONTACT PICKER CHANGE
       (lightning-record-picker → event.detail.recordId)
    ============================================================ */
    handleContactChange(event) {
        try {
            const contactId = event.detail?.recordId || null;

            // Si limpian selección
            if (!contactId) {
                this.localRecord = {
                    ...this.localRecord,
                    contactId: null,
                    contactName: '',
                    contactEmail: '',
                    contactPhone: '',
                    contactFirstName: '',
                    contactLastName: '',
                    role: '',
                    email: '',
                    phone: ''
                };
                return;
            }

            // Guardar inmediatamente el Id para tener el picker en sync
            this.localRecord = {
                ...this.localRecord,
                contactId
            };

            // Enriquecer desde Apex
            getContactsBasicsByIds({ contactIds: [contactId] })
                .then(res => {
                    const info = res && res.length ? res[0] : null;
                    if (!info) return;

                    this.localRecord = {
                        ...this.localRecord,
                        contactId,
                        contactName: info.name || '',
                        contactEmail: info.email || '',
                        contactPhone: info.phone || '',
                        role: info.role || '',
                        newContactTitleRole: info.role || '',
                        contactFirstName: info.firstName || '',
                        contactLastName: info.lastName || '',
                        email: info.email || '',
                        phone: info.phone || ''
                    };
                })
                .catch(err => {
                    // eslint-disable-next-line no-console
                    console.error('getContactsBasicsByIds error', err);
                });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('handleContactChange error', err);
        }
    }

    /* ============================================================
       USER PICKER CHANGE (Internal)
       (lightning-record-picker → event.detail.recordId)
    ============================================================ */
    async handleUserChange(event) {
        try {
            const userId = event.detail?.recordId || null;

            // Si limpian selección
            if (!userId) {
                this.localRecord = {
                    ...this.localRecord,
                    userId: null,
                    userName: '',
                    userEmail: '',
                    userPhone: '',
                    email: '',
                    phone: ''
                };
                return;
            }

            // Guardar Id y luego enriquecer con Apex
            this.localRecord = {
                ...this.localRecord,
                userId
            };

            await this.loadUserBasics(userId);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('handleUserChange error', err);
        }
    }

    /* ============================================================
       MODAL EVENTS
    ============================================================ */
    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    handleSave() {
        this.dispatchEvent(
            new CustomEvent('save', {
                detail: { record: this.localRecord }
            })
        );
    }

    /* ============================================================
       DATETIME NORMALIZATION
    ============================================================ */
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

    fromInputDatetime(value) {
        if (!value) return '';
        const normalized = value.replace('T', ' ').replace('.000Z', '').trim();
        const parts = normalized.split(' ');
        if (parts.length >= 2) {
            const datePart = parts[0];
            const timePart = parts[1].split(':').slice(0, 2).join(':');
            if (datePart && timePart) {
                return `${datePart} ${timePart.length === 5 ? timePart + ':00' : timePart}`;
            }
        }
        return normalized;
    }
}