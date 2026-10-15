import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import analyzeVisit from '@salesforce/apex/LAB_VisitAI_Controller.analyzeVisit';
import applyVisitResult from '@salesforce/apex/LAB_VisitAI_Controller.applyVisitResult';
import applyVisitScheduling from '@salesforce/apex/LAB_VisitAI_Controller.applyVisitScheduling';
import applyClientParticipants from '@salesforce/apex/LAB_VisitAI_Controller.applyClientParticipants';
import applyInternalParticipants from '@salesforce/apex/LAB_VisitAI_Controller.applyInternalParticipants';
import applyTasks from '@salesforce/apex/LAB_VisitAI_Controller.applyTasks';
import createInitialVisit from '@salesforce/apex/LAB_VisitAI_Controller.createInitialVisit';
import getAccountInfo from '@salesforce/apex/LAB_VisitAI_Controller.getAccountInfo';
import getOpenVisitsByAccount from '@salesforce/apex/LAB_VisitAI_Controller.getOpenVisitsByAccount';
import getVisitAccount from '@salesforce/apex/LAB_VisitAI_Controller.getVisitAccount';
import getVisitState from '@salesforce/apex/LAB_VisitAI_Controller.getVisitState';
import savePartialState from '@salesforce/apex/LAB_VisitAI_Controller.savePartialState';
import getVisitClientParticipants from '@salesforce/apex/LAB_VisitAI_Controller.getVisitClientParticipants';
import getVisitInfo from '@salesforce/apex/LAB_VisitAI_Controller.getVisitInfo';
import getDesktopContactRecordTypeInfo from '@salesforce/apex/LAB_VisitAI_Controller.getDesktopContactRecordTypeInfo';
import getContactsBasicsByIds from '@salesforce/apex/LAB_VisitAI_Controller.getContactsBasicsByIds';
import searchEmailRecipients from '@salesforce/apex/LAB_VisitAI_Controller.searchEmailRecipients';
import getVisitInternalParticipants from '@salesforce/apex/LAB_VisitAI_Controller.getVisitInternalParticipants';
import getCurrentUserInfo from '@salesforce/apex/LAB_VisitAI_Controller.getCurrentUserInfo';
import getUsersBasicsByIds from '@salesforce/apex/LAB_VisitAI_Controller.getUsersBasicsByIds';
import searchUsers from '@salesforce/apex/LAB_VisitAI_Controller.searchUsers';
import getVisitTasks from '@salesforce/apex/LAB_VisitAI_Controller.getVisitTasks';
import sendSummaryEmail from '@salesforce/apex/LAB_VisitSummaryEmailService.sendSummaryEmail';
import {
    taskSignature,
    clientSignature,
    internalSignature,
    visitSignature,
    currentVisitSignature,
    splitName,
    makeUniqueId,
    generateDraftId,
    dedupeInternalParticipants,
    stripVariationSelectors,
    normalizeLanguageCode,
    resolveEmailLanguage,
    buildVisitSummarySubject,
    buildVisitSummaryBody
} from 'c/labAiVisitAssistantUtils';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import {
    getRecord,
    getFieldValue,
    notifyRecordUpdateAvailable
} from 'lightning/uiRecordApi';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import { RefreshEvent } from 'lightning/refresh';
import LOCALE from '@salesforce/i18n/locale';
import TIME_ZONE from '@salesforce/i18n/timeZone';

import VISIT_OBJECT from '@salesforce/schema/Visit';
import DURATION_FIELD from '@salesforce/schema/Visit.LAB_Duration__c';
import CHANNEL_FIELD from '@salesforce/schema/Visit.LAB_Channel__c';
import PURPOSE_FIELD from '@salesforce/schema/Visit.LAB_purpose_type__c';
import EMAIL_VISIT_NAME_FIELD from '@salesforce/schema/Visit.LAB_Name__c';
import EMAIL_ACCOUNT_NAME_FIELD from '@salesforce/schema/Visit.Account.Name';
import EMAIL_SUMMARY_FIELD from '@salesforce/schema/Visit.LAB_Summary__c';
import EMAIL_STATUS_FIELD from '@salesforce/schema/Visit.LAB_Status_type__c';
import EMAIL_START_FIELD from '@salesforce/schema/Visit.PlannedVisitStartTime';
import EMAIL_OWNER_FIELD from '@salesforce/schema/Visit.OwnerId';
import EMAIL_OWNER_EMAIL_FIELD from '@salesforce/schema/User.Email';
import EMAIL_OWNER_NAME_FIELD from '@salesforce/schema/User.Name';
import CONTACT_TITLE_FIELD from '@salesforce/schema/Contact.Title';

const EMAIL_VISIT_FIELDS = [
    EMAIL_VISIT_NAME_FIELD,
    EMAIL_ACCOUNT_NAME_FIELD,
    EMAIL_SUMMARY_FIELD,
    EMAIL_STATUS_FIELD,
    EMAIL_START_FIELD,
    EMAIL_OWNER_FIELD
];
const EMAIL_OWNER_FIELDS = [
    EMAIL_OWNER_EMAIL_FIELD,
    EMAIL_OWNER_NAME_FIELD
];
const EMAIL_RECIPIENT_TYPES = {
    CONTACT: 'CONTACT',
    LEAD: 'LEAD',
    USER: 'USER',
    MANUAL: 'MANUAL'
};
const EMAIL_RECIPIENT_TYPE_LABELS = {
    [EMAIL_RECIPIENT_TYPES.CONTACT]: 'Contact',
    [EMAIL_RECIPIENT_TYPES.LEAD]: 'Lead',
    [EMAIL_RECIPIENT_TYPES.USER]: 'User',
    [EMAIL_RECIPIENT_TYPES.MANUAL]: 'Email'
};
const EMAIL_RECIPIENT_TYPE_ICONS = {
    [EMAIL_RECIPIENT_TYPES.CONTACT]: 'standard:contact',
    [EMAIL_RECIPIENT_TYPES.LEAD]: 'standard:lead',
    [EMAIL_RECIPIENT_TYPES.USER]: 'standard:user',
    [EMAIL_RECIPIENT_TYPES.MANUAL]: 'utility:email'
};

export default class LabAiVisitAssistant extends NavigationMixin(LightningElement) {

    // ============================================================
    // PUBLIC PROPS
    // ============================================================
    @api recordId;
    @api objectApiName;

    // ============================================================
    // ASSISTANT GENERAL STATE
    // ============================================================
    @track showLauncher = true;
    @track showInput = false;
    @track showPreview = false;

    @track isLoading = false;
    @track moveVisitToFinalized = false;
    @track hasLoadedPrevious = false;
    hasInitialized = false;

    // ============================================================
    // TRANSCRIPT & SUMMARY
    // ============================================================
    @track transcript = '';
    @track feedbackRichText = '';
    @track analysisLanguage = '';
    @track isEditingSummary = false;

    // ============================================================
    // CONTEXT
    // ============================================================
    @track mode = 'VISIT';
    @track activeVisitId;
    @track accountId;
    @track accountName;
    @track visitName;
    @track visitStatusType = '06'; // Default to 'visit finalized'
    @track contactRecordTypeId;
    @track contactRecordTypeName;
    visitRecordTypeId;

    durationValueSet = new Set();
    durationLabelToValue = new Map();
    channelValueSet = new Set();
    channelLabelToValue = new Map();
    purposeValueSet = new Set();
    purposeLabelToValue = new Map();
    contactTitleOptions = [];
    contactTitleValueSet = new Set();
    contactTitleLabelToValue = new Map();

    @track openVisits = [];
    @track visitSelectionMode = 'new'; // "new" | "existing"
    @track selectedExistingVisitId = '';
    @track aiDetectedVisitId = '';

    hasBaselineFromExisting = false;

    @track currentVisitDraft = {
        visitId: '',
        name: '',
        startDatetime: '',
        durationMinutes: null,
        channelCode: '',
        purposeTypeCode: '',
        isValid: false,
        isModified: false
    };
    @track aiCurrentVisitSuggestion = null;

    // Picklists for current visit details

    // ============================================================
    // DRAFTS FOR AI JSON ELEMENTS
    // ============================================================
    @track clientParticipantDrafts = [];
    @track internalParticipantDrafts = [];
    @track visitDrafts = [];
    @track taskDrafts = [];

    rawAiJson = null;
    existingClientParticipants = [];
    existingInternalParticipants = [];
    existingTasks = [];
    currentUserInfo = null;

    // ============================================================
    // EMAIL LAUNCHER (FINALIZED VISIT)
    // ============================================================
    emailVisitLoaded = false;
    emailOwnerLoaded = false;
    emailOwnerId = null;
    emailManagerEmail = '';
    emailOwnerEmail = '';
    emailManagerName = '';
    emailManagerId = null;
    emailOwnerName = '';
    emailVisitInfo = null;
    emailVisitError = '';
    emailOwnerError = '';
    emailNavigating = false;
    emailPreviewOpen = false;
    emailPreviewScrollPending = false;
    emailPreview = {
        subject: '',
        bodyHtml: ''
    };
    emailRecipients = [];
    emailRecipientSearchTerm = '';
    emailRecipientSearchResults = [];
    emailRecipientSearchOpen = false;
    emailRecipientSearchLoading = false;
    emailRecipientSearchToken = 0;
    emailRecipientDropdownStyle = '';
    emailRecipientDropdownRaf = null;
    emailBodyFormats = ['bold', 'italic', 'underline', 'strike', 'list', 'indent', 'link', 'align', 'clean'];

    // ============================================================
    // MODAL
    // ============================================================
    @track isModalOpen = false;
    @track modalTitle = '';
    @track modalRecord = {};
    @track modalType = '';      // "visit" | "client" | "task" | "internal"
    scrollBeforeModal = 0;
    scrollTimeout = null;

    // ============================================================
    // BASELINE (para detectar MODIFIED)
    // ============================================================
    baseline = {
        feedback: '',
        tasks: {},
        clients: {},
        internal: {},
        visits: {},
        currentVisit: ''
    };

    // ============================================================
    // PENDING DELETES (VISIT RELATION RECORDS)
    // ============================================================
    pendingDeletes = {
        visitContactIds: new Set(),
        visitManagementTeamIds: new Set(),
        taskIds: new Set()
    };

    captureBaseline() {
        this.baseline.feedback = this.feedbackRichText || '';
        this.baseline.tasks = {};
        this.baseline.clients = {};
        this.baseline.internal = {};
        this.baseline.visits = {};
        this.baseline.currentVisit = currentVisitSignature(this.currentVisitDraft);
        (this.taskDrafts || []).forEach(t => {
            this.baseline.tasks[t.id] = taskSignature(t);
        });
        (this.clientParticipantDrafts || []).forEach(cp => {
            this.baseline.clients[cp.id] = clientSignature(cp);
        });
        (this.internalParticipantDrafts || []).forEach(bp => {
            this.baseline.internal[bp.id] = internalSignature(bp);
        });
        (this.visitDrafts || []).forEach(v => {
            this.baseline.visits[v.id] = visitSignature(v);
        });
    }

    updateBaselineForSections(sectionKeys = []) {
        const sections = new Set(sectionKeys || []);

        if (sections.has('feedback')) {
            this.baseline.feedback = this.feedbackRichText || '';
        }
        if (sections.has('tasks')) {
            this.baseline.tasks = {};
            (this.taskDrafts || []).forEach(t => {
                this.baseline.tasks[t.id] = taskSignature(t);
            });
        }
        if (sections.has('clients')) {
            this.baseline.clients = {};
            (this.clientParticipantDrafts || []).forEach(cp => {
                this.baseline.clients[cp.id] = clientSignature(cp);
            });
        }
        if (sections.has('internal')) {
            this.baseline.internal = {};
            (this.internalParticipantDrafts || []).forEach(bp => {
                this.baseline.internal[bp.id] = internalSignature(bp);
            });
        }
        if (sections.has('visits')) {
            this.baseline.visits = {};
            (this.visitDrafts || []).forEach(v => {
                this.baseline.visits[v.id] = visitSignature(v);
            });
        }
        if (sections.has('current_visit')) {
            this.baseline.currentVisit = currentVisitSignature(this.currentVisitDraft);
        }
    }

    // ============================================================
    // PENDING DELETE HELPERS
    // ============================================================
    resetPendingDeletes() {
        this.pendingDeletes = {
            visitContactIds: new Set(),
            visitManagementTeamIds: new Set(),
            taskIds: new Set()
        };
    }

    loadPendingDeletesFromJson(json) {
        this.resetPendingDeletes();
        if (!json || !json.deleted) return;

        const deleted = json.deleted || {};
        this.pendingDeletes.visitContactIds = new Set(deleted.visit_contact_ids || []);
        this.pendingDeletes.visitManagementTeamIds = new Set(deleted.visit_management_team_ids || []);
        this.pendingDeletes.taskIds = new Set(deleted.task_ids || []);
    }

    applyPendingDeletesToDrafts() {
        const visitContactIds = this.pendingDeletes.visitContactIds || new Set();
        const visitManagementTeamIds = this.pendingDeletes.visitManagementTeamIds || new Set();
        const taskIds = this.pendingDeletes.taskIds || new Set();

        this.clientParticipantDrafts = (this.clientParticipantDrafts || []).map(cp => ({
            ...cp,
            pendingDelete: !!(cp.visitContactId && visitContactIds.has(cp.visitContactId))
        }));
        this.existingClientParticipants = (this.existingClientParticipants || []).map(cp => ({
            ...cp,
            pendingDelete: !!(cp.visitContactId && visitContactIds.has(cp.visitContactId))
        }));

        this.internalParticipantDrafts = (this.internalParticipantDrafts || []).map(bp => ({
            ...bp,
            pendingDelete: !!(bp.visitManagementTeamId && visitManagementTeamIds.has(bp.visitManagementTeamId))
        }));
        this.existingInternalParticipants = (this.existingInternalParticipants || []).map(bp => ({
            ...bp,
            pendingDelete: !!(bp.visitManagementTeamId && visitManagementTeamIds.has(bp.visitManagementTeamId))
        }));

        this.taskDrafts = (this.taskDrafts || []).map(t => ({
            ...t,
            pendingDelete: !!(t.taskId && taskIds.has(t.taskId))
        }));
        this.existingTasks = (this.existingTasks || []).map(t => ({
            ...t,
            pendingDelete: !!(t.taskId && taskIds.has(t.taskId))
        }));
    }

    toggleClientPendingDelete(cp, shouldDelete) {
        if (!cp || !cp.visitContactId) return;
        if (shouldDelete) {
            this.pendingDeletes.visitContactIds.add(cp.visitContactId);
        } else {
            this.pendingDeletes.visitContactIds.delete(cp.visitContactId);
        }
        this.applyPendingDeletesToDrafts();
    }

    toggleInternalPendingDelete(bp, shouldDelete) {
        if (!bp || !bp.visitManagementTeamId) return;
        if (shouldDelete) {
            this.pendingDeletes.visitManagementTeamIds.add(bp.visitManagementTeamId);
        } else {
            this.pendingDeletes.visitManagementTeamIds.delete(bp.visitManagementTeamId);
        }
        this.applyPendingDeletesToDrafts();
    }

    toggleTaskPendingDelete(task, shouldDelete) {
        if (!task || !task.taskId) return;
        if (shouldDelete) {
            this.pendingDeletes.taskIds.add(task.taskId);
        } else {
            this.pendingDeletes.taskIds.delete(task.taskId);
        }
        this.applyPendingDeletesToDrafts();
    }

    removePendingDeleteDrafts() {
        this.clientParticipantDrafts =
            (this.clientParticipantDrafts || []).filter(cp => !cp.pendingDelete);
        this.existingClientParticipants =
            (this.existingClientParticipants || []).filter(cp => !cp.pendingDelete);

        this.internalParticipantDrafts =
            (this.internalParticipantDrafts || []).filter(bp => !bp.pendingDelete);
        this.existingInternalParticipants =
            (this.existingInternalParticipants || []).filter(bp => !bp.pendingDelete);

        this.taskDrafts =
            (this.taskDrafts || []).filter(t => !t.pendingDelete);
        this.existingTasks =
            (this.existingTasks || []).filter(t => !t.pendingDelete);

        this.resetPendingDeletes();
    }

    removePendingDeleteDraftsForSections(sectionKeys = []) {
        const sections = new Set(sectionKeys || []);

        if (sections.has('clients')) {
            this.clientParticipantDrafts =
                (this.clientParticipantDrafts || []).filter(cp => !cp.pendingDelete);
            this.existingClientParticipants =
                (this.existingClientParticipants || []).filter(cp => !cp.pendingDelete);
            this.pendingDeletes.visitContactIds = new Set();
        }

        if (sections.has('internal')) {
            this.internalParticipantDrafts =
                (this.internalParticipantDrafts || []).filter(bp => !bp.pendingDelete);
            this.existingInternalParticipants =
                (this.existingInternalParticipants || []).filter(bp => !bp.pendingDelete);
            this.pendingDeletes.visitManagementTeamIds = new Set();
        }

        if (sections.has('tasks')) {
            this.taskDrafts =
                (this.taskDrafts || []).filter(t => !t.pendingDelete);
            this.existingTasks =
                (this.existingTasks || []).filter(t => !t.pendingDelete);
            this.pendingDeletes.taskIds = new Set();
        }

        this.applyPendingDeletesToDrafts();
    }

    getPendingDeletes() {
        return {
            visit_contact_ids: Array.from(this.pendingDeletes.visitContactIds || []),
            visit_management_team_ids: Array.from(this.pendingDeletes.visitManagementTeamIds || []),
            task_ids: Array.from(this.pendingDeletes.taskIds || [])
        };
    }

    get isAccountMode() {
        return this.mode === 'ACCOUNT';
    }

    get isVisitMode() {
        return this.mode === 'VISIT';
    }

    get requiresVisitCreation() {
        return this.isAccountMode && !this.activeVisitId;
    }

    get applyAllLabel() {
        return this.isAccountMode
            ? 'Apply All Changes in Salesforce and open the Visit'
            : 'Apply All Changes in Salesforce';
    }

    get saveAndContinueLabel() {
        return this.isAccountMode
            ? 'Save and Continue Later (open the Visit)'
            : 'Save and Continue Later';
    }

    get showEmailLauncher() {
        return this.isVisitMode && !!this.activeVisitId && this.isVisitFinalized && this.emailVisitLoaded;
    }

    get emailActionDisabled() {
        if (!this.activeVisitId) return true;
        if (!this.isVisitFinalized) return true;
        if (this.emailNavigating) return true;
        if (!this.emailVisitLoaded || !this.emailOwnerLoaded) return true;
        return false;
    }

    get emailActionTooltip() {
        if (!this.isVisitFinalized) {
            return 'This action is only available for finalized visits.';
        }
        if (this.emailVisitError) {
            return this.emailVisitError;
        }
        if (this.emailOwnerError) {
            return this.emailOwnerError;
        }
        if (!this.emailVisitLoaded || !this.emailOwnerLoaded) {
            return 'Loading email defaults...';
        }
        return null;
    }

    get emailPreviewSendDisabled() {
        const validRecipients = (this.emailRecipients || []).filter(r => r.isValid && r.email);
        return this.emailNavigating || validRecipients.length === 0;
    }

    get emailPreviewFromLabel() {
        if (!this.currentUserInfo) return '';
        const name = (this.currentUserInfo.name || '').trim();
        const email = (this.currentUserInfo.email || '').trim();
        if (name && email) return `${name} <${email}>`;
        return name || email;
    }

    get emailPreviewHasRecipients() {
        return (this.emailRecipients || []).length > 0;
    }
    get showRecipientSearchDropdown() {
        return this.emailRecipientSearchOpen && (
            this.emailRecipientSearchLoading ||
            this.showRecipientSearchResults ||
            this.showManualRecipientOption ||
            this.showRecipientNoResults
        );
    }

    get showRecipientSearchResults() {
        return (this.emailRecipientSearchResults || []).length > 0;
    }

    get showRecipientNoResults() {
        const term = (this.emailRecipientSearchTerm || '').trim();
        return term.length >= 2
            && !this.emailRecipientSearchLoading
            && !this.showRecipientSearchResults
            && !this.showManualRecipientOption;
    }

    get manualRecipientOptionLabel() {
        const emails = this.getNewManualEmailsFromSearchTerm();
        if (!emails.length) return '';
        if (emails.length === 1) return `"${emails[0]}"`;
        return `${emails.length} emails`;
    }

    get showManualRecipientOption() {
        return !!this.manualRecipientOptionLabel;
    }

    @wire(getRecord, { recordId: '$activeVisitId', fields: EMAIL_VISIT_FIELDS })
    wiredEmailVisit({ data, error }) {
        if (!this.activeVisitId) {
            this.resetEmailState();
            return;
        }

        if (error) {
            this.emailVisitError = this.normalizeError(error);
            this.emailVisitLoaded = true;
            this.emailOwnerLoaded = true;
            return;
        }
        if (!data) return;

        this.emailVisitError = '';
        const status = getFieldValue(data, EMAIL_STATUS_FIELD);
        const name = getFieldValue(data, EMAIL_VISIT_NAME_FIELD) || 'Visit';
        const accountName = getFieldValue(data, EMAIL_ACCOUNT_NAME_FIELD) || '';
        const summary = getFieldValue(data, EMAIL_SUMMARY_FIELD) || '';
        const start = getFieldValue(data, EMAIL_START_FIELD) || '';
        const ownerId = getFieldValue(data, EMAIL_OWNER_FIELD);

        this.emailVisitInfo = {
            status,
            name,
            accountName,
            summary,
            start
        };
        this.emailVisitLoaded = true;

        if (status && status !== this.visitStatusType) {
            this.visitStatusType = status;
        }

        if (ownerId !== this.emailOwnerId) {
            this.emailOwnerLoaded = false;
            this.emailOwnerError = '';
            this.emailOwnerEmail = '';
            this.emailOwnerName = '';
        }
        this.emailOwnerId = ownerId;

        if (!this.emailOwnerId || !this.emailOwnerId.startsWith('005')) {
            this.emailOwnerLoaded = true;
        }
    }

    @wire(getRecord, { recordId: '$emailOwnerId', fields: EMAIL_OWNER_FIELDS })
    wiredEmailOwner({ data, error }) {
        if (!this.emailOwnerId || !this.emailOwnerId.startsWith('005')) return;
        if (error) {
            this.emailOwnerError = this.normalizeError(error);
            this.emailOwnerLoaded = true;
            return;
        }
        if (!data) return;

        this.emailOwnerError = '';
        this.emailOwnerEmail = getFieldValue(data, EMAIL_OWNER_EMAIL_FIELD) || '';
        this.emailOwnerName = getFieldValue(data, EMAIL_OWNER_NAME_FIELD) || '';
        this.emailOwnerLoaded = true;

        if (this.emailPreviewOpen && (this.emailRecipients || []).length === 0) {
            this.addDefaultEmailRecipients();
        }
    }

    @wire(getObjectInfo, { objectApiName: VISIT_OBJECT })
    handleVisitObjectInfo({ data }) {
        if (data) {
            this.visitRecordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$visitRecordTypeId', fieldApiName: DURATION_FIELD })
    handleDurationPicklist({ data }) {
        if (data && data.values) {
            this.durationValueSet = new Set(data.values.map(v => v.value));
            this.durationLabelToValue = new Map(data.values.map(v => [v.label, v.value]));
            this.normalizeVisitPicklists();
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$visitRecordTypeId', fieldApiName: CHANNEL_FIELD })
    handleChannelPicklist({ data }) {
        if (data && data.values) {
            this.channelValueSet = new Set(data.values.map(v => v.value));
            this.channelLabelToValue = new Map(data.values.map(v => [v.label, v.value]));
            this.normalizeVisitPicklists();
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$visitRecordTypeId', fieldApiName: PURPOSE_FIELD })
    handlePurposePicklist({ data }) {
        if (data && data.values) {
            this.purposeValueSet = new Set(data.values.map(v => v.value));
            this.purposeLabelToValue = new Map(data.values.map(v => [v.label, v.value]));
            this.normalizeVisitPicklists();
        }
    }

    @wire(getPicklistValues, { recordTypeId: '$contactRecordTypeId', fieldApiName: CONTACT_TITLE_FIELD })
    handleContactTitlePicklist({ data }) {
        if (data && data.values) {
            this.contactTitleOptions = data.values;
            this.contactTitleValueSet = new Set(data.values.map(v => v.value));
            this.contactTitleLabelToValue = new Map(
                data.values.map(v => [v.label, v.value])
            );
            if (this.clientParticipantDrafts && this.clientParticipantDrafts.length) {
                this.clientParticipantDrafts = this.clientParticipantDrafts.map(cp => ({
                    ...cp,
                    newContactTitleRole: this.normalizeContactTitleRole(cp.newContactTitleRole)
                }));
            }
        }
    }

    // ============================================================
    // INIT
    // ============================================================
    async connectedCallback() {
        this.mode = this.objectApiName === 'Account' ? 'ACCOUNT' : 'VISIT';
        if (this.isAccountMode) {
            this.accountId = this.recordId;
        } else {
            this.activeVisitId = this.recordId;
        }

        // Prefetch minimal data to decide availability (e.g., finalized status)
        try {
            if (this.isAccountMode) {
                const accInfo = await getAccountInfo({ accountId: this.accountId });
                if (accInfo) {
                    this.accountName = accInfo.accountName;
                }
                this.openVisits = await getOpenVisitsByAccount({ accountId: this.accountId });

                this.initializeCurrentVisitDraft();
            } else if (this.activeVisitId) {
                const visitInfo = await getVisitInfo({ visitId: this.activeVisitId });
                if (visitInfo) {
                    this.visitName = this.visitName || visitInfo.visitName;
                    this.accountName = this.accountName || visitInfo.accountName;
                    if (!this.accountId) {
                        this.accountId = visitInfo.accountId;
                    }
                    this.visitStatusType = visitInfo.visitStatusType;
                    this.applyVisitInfoToCurrentDraft(visitInfo);
                }
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error preloading visit info', e);
        }
    }

    async loadInitialData() {
        try {
            this.hasLoadedPrevious = false;
            this.resetPendingDeletes();
            this.aiCurrentVisitSuggestion = null;

            if (!this.activeVisitId) {
                if (!this.currentVisitDraft) {
                    this.initializeCurrentVisitDraft();
                }
                this.transcript = '';
                this.feedbackRichText = '';
                this.rawAiJson = null;
                this.clientParticipantDrafts = [];
                this.internalParticipantDrafts = [];
                this.visitDrafts = [];
                this.taskDrafts = [];
                this.existingClientParticipants = [];
                this.existingInternalParticipants = [];
                this.existingTasks = [];
                this.currentUserInfo = await getCurrentUserInfo();
                this.syncEmailManagerFromCurrentUser();

                const rtInfo = await getDesktopContactRecordTypeInfo();
                if (rtInfo) {
                    this.contactRecordTypeId = rtInfo.recordTypeId;
                    this.contactRecordTypeName = rtInfo.name;
                }

                this.captureBaseline();
                this.evaluateAllValidations();
                return;
            }

            const state = await getVisitState({ visitId: this.activeVisitId });
            this.transcript = state.transcript || '';

            const existingClientParticipants = await getVisitClientParticipants({
                visitId: this.activeVisitId
            });
            this.existingClientParticipants =
                this.buildExistingClientParticipantDrafts(existingClientParticipants);
            this.clientParticipantDrafts = [...this.existingClientParticipants];

            const existingInternalParticipants = await getVisitInternalParticipants({
                visitId: this.activeVisitId
            });
            this.existingInternalParticipants =
                this.buildExistingInternalParticipantDrafts(existingInternalParticipants);
            this.internalParticipantDrafts = [...this.existingInternalParticipants];

            const existingTasks = await getVisitTasks({
                visitId: this.activeVisitId
            });
            this.existingTasks = this.buildExistingTaskDrafts(existingTasks);
            this.taskDrafts = [...this.existingTasks];

            this.currentUserInfo = await getCurrentUserInfo();
            this.syncEmailManagerFromCurrentUser();

            const visitInfo = await getVisitInfo({ visitId: this.activeVisitId });
            if (visitInfo) {
                this.visitName = visitInfo.visitName;
                this.accountName = visitInfo.accountName;
                this.visitStatusType = visitInfo.visitStatusType;
                if (!this.accountId) {
                    this.accountId = visitInfo.accountId;
                }
                this.applyVisitInfoToCurrentDraft(visitInfo);
                if (this.isAccountMode) {
                    this.visitSelectionMode = 'existing';
                    this.selectedExistingVisitId = this.activeVisitId;
                }
            }

            const rtInfo = await getDesktopContactRecordTypeInfo();
            if (rtInfo) {
                this.contactRecordTypeId = rtInfo.recordTypeId;
                this.contactRecordTypeName = rtInfo.name;
            }

            // Baseline inicial contra Salesforce antes de aplicar AI/restaurar
            this.captureBaseline();

            if (state.analysisJson && state.transcript) {
                try {
                    this.rawAiJson = JSON.parse(state.analysisJson);
                    this.feedbackRichText = this.rawAiJson.feedback_richtext || '';
                    this.loadPendingDeletesFromJson(this.rawAiJson);
                    await this.buildDraftsFromAiJson(this.rawAiJson);
                    this.applyPendingDeletesToDrafts();
                    this.hasLoadedPrevious = true;

                    // Restore persisted baseline if present (keeps "modified" after refresh)
                    if (this.rawAiJson._baseline) {
                        this.baseline = {
                            feedback: this.rawAiJson._baseline.feedback || '',
                            tasks: this.rawAiJson._baseline.tasks || {},
                            clients: this.rawAiJson._baseline.clients || {},
                            internal: this.rawAiJson._baseline.internal || {},
                            visits: this.rawAiJson._baseline.visits || {},
                            currentVisit: this.rawAiJson._baseline.currentVisit || ''
                        };

                    }

                    // Restore explicit modified flags (for Save & Continue scenarios)
                    this.applyModifiedFlags(this.rawAiJson._modified);
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Error parsing previous analysis JSON', e);
                }
            }

            if (!this.accountId) {
                this.accountId = await getVisitAccount({ visitId: this.activeVisitId });
            }

            // No recalc baseline here: keep server snapshot or restored baseline so edits stay marked
            this.evaluateAllValidations();
            if (this.rawAiJson && this.rawAiJson._modified) {
                this.applyModifiedFlags(this.rawAiJson._modified);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            this.dispatchToast(
                'Error',
                this.buildErrorMessage('Could not load assistant data.', e),
                'error'
            );
        }
    }

    // ============================================================
    // LAUNCHER (ASTRO BUTTON)
    // ============================================================
    async handleOpenAssistant() {
        this.showLauncher = false;

        if (!this.hasInitialized) {
            try {
                this.isLoading = true;
                if (this.isAccountMode && !this.currentVisitDraft) {
                    this.initializeCurrentVisitDraft();
                }
                await this.loadInitialData();
                this.hasInitialized = true;
            } finally {
                this.isLoading = false;
            }
        }

        if (this.hasLoadedPrevious) {
            this.showInput = false;
            this.showPreview = true;
            this.dispatchToast(
                'Previous Analysis Loaded',
                'A saved analysis has been restored.',
                'info'
            );
        } else {
            this.showInput = true;
            this.showPreview = false;
        }
    }

    async handleSendSummaryEmail() {
        if (this.emailActionDisabled || !this.activeVisitId) return;

        const status = (this.emailVisitInfo && this.emailVisitInfo.status) || this.visitStatusType;
        if (status !== '06') {
            this.dispatchToast(
                'Not available',
                'This action is only available for finalized visits.',
                'error'
            );
            return;
        }

        this.emailNavigating = true;
        try {
            const name = (this.emailVisitInfo && this.emailVisitInfo.name) || this.visitName || 'Visit';
            const accountName = (this.emailVisitInfo && this.emailVisitInfo.accountName) || this.accountName || '';
            const summary = (this.emailVisitInfo && this.emailVisitInfo.summary) || this.feedbackRichText || '';
            const cleanedSummary = summary;
            const startValue = (this.emailVisitInfo && this.emailVisitInfo.start) || '';
            const startLabel = this.formatVisitDateForEmail(startValue);
            const visitUrl = this.buildVisitRecordUrl();
            const { participants, nextSteps } = await this.loadEmailContextForSend();

            const emailLanguage = resolveEmailLanguage({
                language: this.analysisLanguage,
                transcript: this.transcript,
                summary: cleanedSummary
            });

            const subject = stripVariationSelectors(buildVisitSummarySubject({
                name,
                accountName,
                language: emailLanguage
            }));

            const htmlBody = buildVisitSummaryBody({
                name,
                accountName,
                summary: cleanedSummary,
                startLabel,
                visitUrl,
                participants,
                nextSteps,
                language: emailLanguage
            });

            this.emailPreview = {
                subject,
                bodyHtml: this.extractEmailBodyContent(htmlBody)
            };
            this.emailRecipients = [];
            this.addDefaultEmailRecipients();
            this.emailRecipientSearchTerm = '';
            this.emailRecipientSearchResults = [];
            this.emailRecipientSearchOpen = false;
            this.emailRecipientSearchLoading = false;
            this.emailPreviewOpen = true;
            this.emailPreviewScrollPending = true;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error preparing email preview', e);
            this.dispatchToast(
                'Error',
                this.normalizeError(e),
                'error'
            );
        } finally {
            this.emailNavigating = false;
            this.scrollToTop();
        }
    }

    handleRecipientSearchInput(event) {
        const value = event && (event.detail && event.detail.value !== undefined)
            ? event.detail.value
            : (event && event.target ? event.target.value : '');
        this.emailRecipientSearchTerm = value;
        const term = (value || '').trim();
        if (!term) {
            this.clearRecipientSearch();
            return;
        }

        this.emailRecipientSearchOpen = true;
        this.queueRecipientDropdownPositionUpdate();
        if (term.length < 2) {
            this.emailRecipientSearchResults = [];
            this.emailRecipientSearchLoading = false;
            return;
        }

        this.searchRecipients(term);
    }

    handleRecipientSearchKeydown(event) {
        if (!event) return;
        if (event.key === 'Enter' || event.key === ';' || event.key === ',') {
            event.preventDefault();
        }
        if (event.key === 'Escape') {
            this.emailRecipientSearchOpen = false;
        }
    }

    handleRecipientSearchKeyup(event) {
        if (!event) return;
        const value = (event.detail && event.detail.value !== undefined)
            ? event.detail.value
            : (event.target ? event.target.value : '');
        if (value !== this.emailRecipientSearchTerm) {
            this.handleRecipientSearchInput(event);
        }
        if (event.key === 'Enter' || event.key === ';' || event.key === ',') {
            const added = this.addManualRecipientsFromSearchTerm();
            if (!added && this.emailRecipientSearchTerm.trim()) {
                this.dispatchToast(
                    'Invalid recipient',
                    'Enter a valid email or select a record from the list.',
                    'error'
                );
            }
        }
    }

    handleRecipientSearchFocus() {
        const term = (this.emailRecipientSearchTerm || '').trim();
        if (term.length >= 2 || this.showRecipientSearchResults) {
            this.emailRecipientSearchOpen = true;
            this.queueRecipientDropdownPositionUpdate();
        }
    }

    handleRecipientSearchSelect(event) {
        const dataset = event && event.currentTarget ? event.currentTarget.dataset : {};
        const recordId = dataset.id || null;
        const type = dataset.type || '';
        const name = dataset.name || dataset.displayName || dataset.email || '';
        const email = dataset.email || '';

        this.addRecipients([this.buildRecipient({
            email,
            name,
            type,
            recordId,
            source: 'search'
        })]);
        this.clearRecipientSearch();
    }

    handleRecipientManualAddClick() {
        const added = this.addManualRecipientsFromSearchTerm();
        if (!added) {
            this.dispatchToast(
                'Invalid recipient',
                'Enter a valid email to add.',
                'error'
            );
        }
    }

    handleRecipientRemove(event) {
        const key = event && event.detail && event.detail.name
            ? event.detail.name
            : (event && event.currentTarget && event.currentTarget.dataset
                ? event.currentTarget.dataset.key
                : null);
        if (!key) return;
        this.emailRecipients = (this.emailRecipients || []).filter(r => r.key !== key);
    }

    handleRecipientsChange(event) {
        const recipients = event && event.detail && Array.isArray(event.detail.recipients)
            ? event.detail.recipients
            : [];
        this.emailRecipients = recipients;
    }

    handleEmailPreviewSubjectChange(event) {
        const value = event && (event.detail && event.detail.value !== undefined)
            ? event.detail.value
            : (event && event.target ? event.target.value : '');
        this.emailPreview = {
            ...this.emailPreview,
            subject: value
        };
    }

    handleEmailPreviewBodyChange(event) {
        const value = event && (event.detail && event.detail.value !== undefined)
            ? event.detail.value
            : (event && event.target ? event.target.value : '');
        this.emailPreview = {
            ...this.emailPreview,
            bodyHtml: value
        };
    }

    handleEmailPreviewCancel() {
        this.emailPreviewOpen = false;
        this.emailPreviewScrollPending = false;
    }

    async handleEmailPreviewSend() {
        const payload = this.buildSendRecipientPayload();
        const toAddresses = payload.toAddresses || [];
        if (!toAddresses.length) {
            this.dispatchToast(
                'Missing recipient',
                'Please provide at least one email address.',
                'error'
            );
            return;
        }
        const subject = stripVariationSelectors(this.emailPreview.subject || '');
        const rawBody = this.emailPreview.bodyHtml || '';
        const normalizedBody = this.normalizeEmailBodyForSend(rawBody);
        const htmlBody = this.buildEmailHtmlDocument(normalizedBody);
        const emailMessageHtmlBody = this.buildEmailHtmlDocument(rawBody);
        const emailMessageTextBody = this.formatHtmlBodyAsPlainText(rawBody);
        const targetObjectId = payload.targetObjectId;

        this.emailNavigating = true;
        let didSend = false;
        try {
            // eslint-disable-next-line no-console
            console.log('[AI Visit Assistant] Send Summary Email', {
                visitId: this.activeVisitId,
                toAddresses
            });
            const result = await sendSummaryEmail({
                toAddresses,
                subject,
                htmlBody,
                relatedRecordId: this.activeVisitId,
                emailMessageHtmlBody,
                emailMessageTextBody,
                targetObjectId
            });
            didSend = true;
            this.emailPreviewOpen = false;
            this.emailPreviewScrollPending = false;
            const warnings = [];
            if (result && result.emailMessageCreated === false) {
                const detail = result.emailMessageError
                    ? `EmailMessage not created: ${result.emailMessageError}`
                    : 'EmailMessage not created.';
                warnings.push(detail);
            }
            if (payload.invalidRecipients && payload.invalidRecipients.length) {
                warnings.push('Some recipients were invalid and were skipped.');
            }

            if (warnings.length) {
                this.dispatchToast(
                    'Email sent',
                    warnings.join(' '),
                    'warning'
                );
            } else {
                this.dispatchToast(
                    'Success',
                    'Summary email sent.',
                    'success'
                );
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error sending summary email', e);
            this.dispatchToast(
                'Error',
                this.normalizeError(e),
                'error'
            );
        } finally {
            this.emailNavigating = false;
            await this.refreshRecordPage(this.activeVisitId);
            if (didSend) {
                this.navigateToCurrentRecordPage();
            }
        }
    }

    extractEmailBodyContent(htmlDoc) {
        const raw = String(htmlDoc || '');
        if (!raw) return '';
        const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(raw);
        return match ? match[1] : raw;
    }

    buildEmailHtmlDocument(bodyHtml) {
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${bodyHtml || ''}</body></html>`;
    }

    normalizeEmailBodyForSend(bodyHtml) {
        const text = String(bodyHtml || '');
        return Array.from(text)
            .map(ch => {
                const code = ch.codePointAt(0);
                return code <= 0x7F ? ch : `&#${code};`;
            })
            .join('');
    }

    decodeHtmlEntities(value) {
        if (typeof document === 'undefined') {
            return String(value || '');
        }
        const textarea = document.createElement('textarea');
        textarea.innerHTML = String(value || '');
        return textarea.value;
    }

    formatHtmlBodyAsPlainText(bodyHtml) {
        if (!bodyHtml) return '';
        let text = String(bodyHtml);
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/p\s*>/gi, '\n\n');
        text = text.replace(/<p[^>]*>/gi, '');
        text = text.replace(/<li[^>]*>/gi, '\n\t');
        text = text.replace(/<\/li\s*>/gi, '');
        text = text.replace(/<\/ul\s*>/gi, '\n');
        text = text.replace(/<\/ol\s*>/gi, '\n');
        text = text.replace(/<ul[^>]*>/gi, '');
        text = text.replace(/<ol[^>]*>/gi, '');
        text = text.replace(/<[^>]+>/g, '');
        text = this.decodeHtmlEntities(text);
        text = text.replace(/\n{3,}/g, '\n\n');
        return text.trim();
    }

    parseEmailAddresses(raw) {
        return String(raw || '')
            .split(/[,;]+/)
            .flatMap(part => part.trim().split(/\s+/))
            .map(part => part.trim())
            .filter(Boolean);
    }

    extractEmailsFromSearchTerm() {
        const raw = (this.emailRecipientSearchTerm || '').trim();
        if (!raw) return [];
        return this.parseEmailAddresses(raw);
    }

    getNewManualEmailsFromSearchTerm() {
        const parsed = this.extractEmailsFromSearchTerm();
        if (!parsed.length) return [];
        const existing = new Set(
            (this.emailRecipients || [])
                .map(r => r.normalizedEmail)
                .filter(Boolean)
        );
        return parsed.filter(email => !existing.has(email.toLowerCase()));
    }

    addManualRecipientsFromSearchTerm() {
        const emails = this.getNewManualEmailsFromSearchTerm();
        if (!emails.length) return 0;
        const recipients = emails.map(email => this.buildRecipient({
            email,
            type: EMAIL_RECIPIENT_TYPES.MANUAL,
            source: 'manual'
        }));
        this.addRecipients(recipients);
        this.clearRecipientSearch();
        return recipients.length;
    }

    addRecipients(recipients) {
        const incoming = Array.isArray(recipients) ? recipients : [recipients];
        if (!incoming.length) return;
        const existing = new Set(
            (this.emailRecipients || [])
                .map(r => r.normalizedEmail)
                .filter(Boolean)
        );
        const deduped = [...(this.emailRecipients || [])];
        let duplicates = 0;

        incoming.forEach(recipient => {
            if (!recipient) return;
            if (recipient.normalizedEmail && existing.has(recipient.normalizedEmail)) {
                duplicates += 1;
                return;
            }
            if (recipient.normalizedEmail) existing.add(recipient.normalizedEmail);
            deduped.push(recipient);
        });

        this.emailRecipients = deduped;

        if (duplicates > 0) {
            this.dispatchToast(
                'Recipient already added',
                'Duplicate recipients were ignored.',
                'info'
            );
        }
    }

    clearRecipientSearch() {
        this.emailRecipientSearchTerm = '';
        this.emailRecipientSearchResults = [];
        this.emailRecipientSearchOpen = false;
        this.emailRecipientSearchLoading = false;
        this.emailRecipientDropdownStyle = '';
        this.cancelRecipientDropdownPositionUpdate();
    }

    async searchRecipients(term) {
        const token = ++this.emailRecipientSearchToken;
        this.emailRecipientSearchLoading = true;
        try {
            const results = await searchEmailRecipients({
                searchTerm: term,
                accountId: this.accountId
            });
            if (token !== this.emailRecipientSearchToken) return;
            this.emailRecipientSearchResults = (results || []).map(r => this.normalizeRecipientSearchResult(r));
            this.queueRecipientDropdownPositionUpdate();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error searching recipients', e);
            if (token === this.emailRecipientSearchToken) {
                this.emailRecipientSearchResults = [];
            }
        } finally {
            if (token === this.emailRecipientSearchToken) {
                this.emailRecipientSearchLoading = false;
            }
        }
    }

    queueRecipientDropdownPositionUpdate() {
        if (this.emailRecipientDropdownRaf) {
            cancelAnimationFrame(this.emailRecipientDropdownRaf);
        }
        this.emailRecipientDropdownRaf = requestAnimationFrame(() => {
            this.emailRecipientDropdownRaf = null;
            this.updateRecipientDropdownPosition();
        });
    }

    cancelRecipientDropdownPositionUpdate() {
        if (this.emailRecipientDropdownRaf) {
            cancelAnimationFrame(this.emailRecipientDropdownRaf);
            this.emailRecipientDropdownRaf = null;
        }
    }

    updateRecipientDropdownPosition() {
        if (!this.showRecipientSearchDropdown) return;
        const anchorEl = this.template.querySelector('.email-recipient__search');
        if (!anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const modalEl = this.template.querySelector('.slds-modal');
        const container = this.template.querySelector('.email-preview-modal__container');
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width;
        const desiredMaxWidth = 520;
        let left = rect.left;
        let top = rect.bottom + 4;
        let maxWidth = viewportWidth;

        const tryAdjustForTransformed = (element) => {
            if (!element) return false;
            const rectTarget = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const isTransformed = style && style.transform && style.transform !== 'none';
            if (!isTransformed) return false;
            left = rect.left - rectTarget.left;
            top = rect.bottom - rectTarget.top + 4;
            maxWidth = rectTarget.width;
            return true;
        };

        if (!tryAdjustForTransformed(modalEl)) {
            tryAdjustForTransformed(container);
        }

        let width = Math.min(rect.width, desiredMaxWidth);
        const padding = 8;
        if (width > maxWidth - padding * 2) {
            width = Math.max(160, maxWidth - padding * 2);
        }
        if (left + width > maxWidth - padding) {
            left = Math.max(padding, maxWidth - width - padding);
        }
        if (left < padding) {
            left = padding;
        }

        this.emailRecipientDropdownStyle = `position: fixed; left: ${left}px; top: ${top}px; width: ${width}px; right: auto;`;
    }

    normalizeRecipientSearchResult(result) {
        const type = result && result.type ? result.type : '';
        const id = result && result.id ? result.id : '';
        const name = result && result.name ? result.name : '';
        const email = result && result.email ? result.email : '';
        const title = result && result.title ? result.title : '';
        const displayName = name || email || id || 'Unknown';
        const displayDetail = [email, title].filter(Boolean).join(' • ');
        return {
            key: `${type}_${id}`,
            id,
            type,
            name,
            email,
            title,
            displayName,
            displayDetail,
            typeLabel: EMAIL_RECIPIENT_TYPE_LABELS[type] || type,
            iconName: EMAIL_RECIPIENT_TYPE_ICONS[type] || 'standard:record'
        };
    }

    buildRecipientsFromEmails(addresses) {
        return (addresses || []).map(email => this.buildRecipient({
            email,
            type: EMAIL_RECIPIENT_TYPES.MANUAL,
            source: 'manual'
        }));
    }

    addDefaultEmailRecipients() {
        this.syncEmailManagerFromCurrentUser();
        const recipients = [];
        if (this.emailManagerEmail) {
            recipients.push(this.buildRecipient({
                email: this.emailManagerEmail,
                name: this.emailManagerName || 'Manager',
                type: EMAIL_RECIPIENT_TYPES.USER,
                recordId: this.emailManagerId,
                source: 'default'
            }));
        }

        if (recipients.length) {
            this.addRecipients(recipients);
        }
    }

    syncEmailManagerFromCurrentUser() {
        if (!this.currentUserInfo) return;
        this.emailManagerEmail = this.currentUserInfo.managerEmail || '';
        this.emailManagerName = this.currentUserInfo.managerName || '';
        this.emailManagerId = this.currentUserInfo.managerId || null;
    }

    buildRecipient({ email, name, type, recordId, source }) {
        const cleanedEmail = (email || '').trim();
        const normalizedEmail = cleanedEmail.toLowerCase();
        const effectiveType = type || EMAIL_RECIPIENT_TYPES.MANUAL;
        const typeLabel = EMAIL_RECIPIENT_TYPE_LABELS[effectiveType] || effectiveType || 'Recipient';
        const iconName = EMAIL_RECIPIENT_TYPE_ICONS[effectiveType] || 'standard:record';
        let isValid = true;
        let validationMessage = '';

        if (!cleanedEmail) {
            isValid = false;
            validationMessage = 'No email found for selected record.';
        } else if (!this.isValidEmail(cleanedEmail)) {
            isValid = false;
            validationMessage = 'Invalid email address.';
        }

        const label = name
            ? `${name} <${cleanedEmail || 'no email'}>`
            : (cleanedEmail || '(no email)');

        const displayName = name || cleanedEmail || '';
        const tooltip = cleanedEmail || label;
        return {
            key: generateDraftId('email_recipient'),
            email: cleanedEmail,
            normalizedEmail,
            name: name || '',
            displayName,
            type: effectiveType,
            typeLabel,
            iconName,
            iconLabel: typeLabel,
            tooltip,
            recordId: recordId || null,
            source: source || 'manual',
            isValid,
            validationMessage,
            label,
            pillClass: isValid
                ? 'email-recipient__pill'
                : 'email-recipient__pill email-recipient__pill--invalid'
        };
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    }

    buildSendRecipientPayload() {
        const validRecipients = (this.emailRecipients || []).filter(r => r.isValid && r.email);
        const invalidRecipients = (this.emailRecipients || []).filter(r => !r.isValid);
        const toAddresses = validRecipients.map(r => r.email);
        const targetRecipient = validRecipients.find(r =>
            r.recordId && r.type !== EMAIL_RECIPIENT_TYPES.MANUAL
        );
        return {
            toAddresses,
            targetObjectId: targetRecipient ? targetRecipient.recordId : null,
            invalidRecipients
        };
    }

    // ============================================================
    // VISIT DETECTION / SELECTION (ACCOUNT MODE)
    // ============================================================
    async handleVisitSelectionModeChange(event) {
        const value = event.detail.value;
        const skipMerge = !!(event.detail && event.detail.skipMerge);
        if (value === this.visitSelectionMode) return;
        this.visitSelectionMode = value;

        if (value === 'new') {
            this.resetSelectionForNewVisit();
            if (this.rawAiJson) {
                await this.buildDraftsFromAiJson(this.rawAiJson);
                this.captureBaseline();
                this.evaluateAllValidations();
            }
            return;
        }

        if (value === 'existing' && this.selectedExistingVisitId && !skipMerge) {
            try {
                this.isLoading = true;
                await this.selectExistingVisitForMerge(this.selectedExistingVisitId);
                if (this.rawAiJson) {
                    await this.buildDraftsFromAiJson(this.rawAiJson);
                    this.evaluateAllValidations();
                }
            } finally {
                this.isLoading = false;
            }
        }
    }

    async handleExistingVisitChange(event) {
        const visitId = event.detail.value;
        this.selectedExistingVisitId = visitId;
        if (!visitId) return;

        this.visitSelectionMode = 'existing';

        try {
            this.isLoading = true;
            await this.selectExistingVisitForMerge(visitId);
            if (this.rawAiJson) {
                await this.buildDraftsFromAiJson(this.rawAiJson);
                this.evaluateAllValidations();
            }
        } finally {
            this.isLoading = false;
        }
    }

    resetSelectionForNewVisit() {
        this.visitSelectionMode = 'new';
        this.activeVisitId = null;
        this.selectedExistingVisitId = '';
        this.aiDetectedVisitId = '';
        this.visitName = '';
        this.visitStatusType = null;
        this.hasBaselineFromExisting = false;

        this.existingClientParticipants = [];
        this.existingInternalParticipants = [];
        this.existingTasks = [];
        this.clientParticipantDrafts = [];
        this.internalParticipantDrafts = [];
        this.visitDrafts = [];
        this.taskDrafts = [];
        this.aiCurrentVisitSuggestion = null;

        this.initializeCurrentVisitDraft();
    }

    async selectExistingVisitForMerge(visitId) {
        if (!visitId) return;
        this.activeVisitId = visitId;
        await this.loadExistingVisitDataForMerge(visitId);
    }

    async loadExistingVisitDataForMerge(visitId) {
        if (!visitId) return;

        const existingClientParticipants = await getVisitClientParticipants({
            visitId
        });
        this.existingClientParticipants =
            this.buildExistingClientParticipantDrafts(existingClientParticipants);
        this.clientParticipantDrafts = [...this.existingClientParticipants];

        const existingInternalParticipants = await getVisitInternalParticipants({
            visitId
        });
        this.existingInternalParticipants =
            this.buildExistingInternalParticipantDrafts(existingInternalParticipants);
        this.internalParticipantDrafts = [...this.existingInternalParticipants];

        const existingTasks = await getVisitTasks({
            visitId
        });
        this.existingTasks = this.buildExistingTaskDrafts(existingTasks);
        this.taskDrafts = [...this.existingTasks];
        this.visitDrafts = [];

        this.currentUserInfo = await getCurrentUserInfo();
        this.syncEmailManagerFromCurrentUser();

        const visitInfo = await getVisitInfo({ visitId });
        if (visitInfo) {
            this.visitName = visitInfo.visitName;
            this.accountName = visitInfo.accountName;
            if (!this.accountId) {
                this.accountId = visitInfo.accountId;
            }
            this.visitStatusType = visitInfo.visitStatusType;
            this.initializeCurrentVisitDraft();
            this.applyVisitInfoToCurrentDraft(visitInfo);
        }

        const rtInfo = await getDesktopContactRecordTypeInfo();
        if (rtInfo) {
            this.contactRecordTypeId = rtInfo.recordTypeId;
            this.contactRecordTypeName = rtInfo.name;
        }

        this.captureBaseline();
        this.hasBaselineFromExisting = true;
    }

    async refreshOpenVisits() {
        if (!this.isAccountMode || !this.accountId) return;
        try {
            this.openVisits = await getOpenVisitsByAccount({ accountId: this.accountId });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error refreshing open visits', e);
        }
    }

    async applyAiVisitDetection(json) {
        if (!this.isAccountMode || !json) return;

        await this.refreshOpenVisits();

        const detectedVisitId = (json.visit && json.visit.visit_id) ? String(json.visit.visit_id) : '';
        const isOpenMatch = detectedVisitId && (this.openVisits || []).some(v => v.visitId === detectedVisitId);

        if (isOpenMatch) {
            this.aiDetectedVisitId = detectedVisitId;
            this.visitSelectionMode = 'existing';
            this.selectedExistingVisitId = detectedVisitId;
            try {
                await this.selectExistingVisitForMerge(detectedVisitId);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Error loading detected visit', e);
                this.aiDetectedVisitId = '';
                this.resetSelectionForNewVisit();
            }
        } else {
            this.aiDetectedVisitId = '';
            this.resetSelectionForNewVisit();
        }
    }

    // ============================================================
    // TRANSCRIPT HANDLING
    // ============================================================
    handleTranscriptChange(e) {
        this.transcript = e.target.value;
    }

    handleBackToInput() {
        this.showInput = true;
        this.showPreview = false;
        this.scrollToTop();
    }

    // ============================================================
    // CURRENT VISIT DETAILS
    // ============================================================
    initializeCurrentVisitDraft() {
        const draft = {
            visitId: this.activeVisitId || '',
            name: '',
            startDatetime: '',
            durationMinutes: null,
            channelCode: '',
            purposeTypeCode: '',
            isValid: false,
            isModified: false
        };
        this.currentVisitDraft = this.requiresVisitCreation
            ? this.normalizeCurrentVisitDefaults(draft)
            : draft;
    }

    applyVisitInfoToCurrentDraft(info) {
        if (!info) return;
        this.currentVisitDraft = {
            ...this.currentVisitDraft,
            visitId: info.visitId || this.activeVisitId || this.currentVisitDraft.visitId || '',
            name: info.visitName || this.currentVisitDraft.name || '',
            startDatetime: info.startDatetime || this.currentVisitDraft.startDatetime || '',
            durationMinutes: info.durationMinutes ? Number(info.durationMinutes) : this.currentVisitDraft.durationMinutes,
            channelCode: info.channelCode || this.currentVisitDraft.channelCode || '',
            purposeTypeCode: info.purposeTypeCode || this.currentVisitDraft.purposeTypeCode || ''
        };
        this.currentVisitDraft = this.normalizeVisitDraft(this.currentVisitDraft);
        if (this.currentVisitDraft.name) {
            this.visitName = this.currentVisitDraft.name;
        }
    }

    applyAiSuggestionToCurrentVisit(overwrite = false) {
        if (!this.aiCurrentVisitSuggestion) return;
        const s = this.aiCurrentVisitSuggestion;
        const next = { ...this.currentVisitDraft };

        if (overwrite || !next.name) next.name = s.visit_name || next.name;
        if (overwrite || !next.startDatetime) next.startDatetime = s.start_datetime || next.startDatetime;
        if (overwrite || next.durationMinutes === null) {
            next.durationMinutes = s.duration_minutes !== null && s.duration_minutes !== undefined
                ? Number(s.duration_minutes)
                : next.durationMinutes;
        }
        if (overwrite || !next.channelCode) next.channelCode = s.channel_code || next.channelCode;
        if (overwrite || !next.purposeTypeCode) next.purposeTypeCode = s.purpose_type_code || next.purposeTypeCode;

        this.currentVisitDraft = this.normalizeVisitDraft(next);
        if (next.name) {
            this.visitName = next.name;
        }
        this.evaluateAllValidations();
    }

    handleAutofillCurrentVisit() {
        this.applyAiSuggestionToCurrentVisit(false);
    }

    handleCurrentVisitFieldChange(event) {
        const field = (event.detail && event.detail.field) || (event.target && event.target.dataset && event.target.dataset.field);
        if (!field) return;
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

        this.currentVisitDraft = { ...this.currentVisitDraft, [field]: value };
        if (field === 'name') {
            this.visitName = value;
        }
        this.evaluateAllValidations();
    }

    get currentVisitHasMissingRequired() {
        return (this.currentVisitDraft?.missingFields || []).length > 0;
    }

    // Datetime helpers (same normalization used in modal)
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

    // ============================================================
    // START ANALYSIS
    // ============================================================
    async handleAnalyzeClick() {
        if (!this.transcript || !this.transcript.trim()) {
            this.dispatchToast(
                'Error',
                'Please enter a transcript before proceeding.',
                'error'
            );
            return;
        }

        try {
            this.isLoading = true;
            this.hasBaselineFromExisting = false;

            const aiJsonText = await analyzeVisit({
                visitId: this.activeVisitId || null,
                accountId: this.accountId || (this.isAccountMode ? this.recordId : null),
                transcript: this.transcript
            });

            // eslint-disable-next-line no-console
            this.rawAiJson = JSON.parse(aiJsonText);
            this.feedbackRichText = this.rawAiJson.feedback_richtext || '';
            this.resetPendingDeletes();
            // eslint-disable-next-line no-console

            await this.applyAiVisitDetection(this.rawAiJson);
            await this.buildDraftsFromAiJson(this.rawAiJson);

            this.showInput = false;
            this.showPreview = true;
            this.hasLoadedPrevious = true;

            // baseline tras analizar nueva salida AI (pero antes de cambios del usuario)
            if (!this.hasBaselineFromExisting) {
                this.captureBaseline();
            }
            this.evaluateAllValidations();

        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            this.dispatchToast(
                'Error',
                this.buildErrorMessage('AI could not process the transcript.', e),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    // ============================================================
    // BUILD DRAFTS FROM AI JSON
    // ============================================================
    async buildDraftsFromAiJson(json) {
        const rawLanguage = json && (json.language || json.idioma);
        this.analysisLanguage = normalizeLanguageCode(rawLanguage);
        // eslint-disable-next-line no-console
        // CLIENT PARTICIPANTS: merge existing (visit contacts) + AI suggestions
        const baseExisting = [...this.existingClientParticipants];
        const usedClientIds = new Set();
        const aiClientParticipants = (json.client_participants || []).map((cp, index) => {
            const id = makeUniqueId('cp', cp.reference_id, usedClientIds, index);

            const matchedContactId = cp.matched_contact_id || cp.contact_id || '';
            const visitContactId = cp.visit_contact_id || '';
            const isExistingInVisit =
                !!visitContactId ||
                (!!matchedContactId && baseExisting.some(
                    ex => ex.contactId && ex.contactId === matchedContactId
                ));
            const hasMatched = !!matchedContactId && !isExistingInVisit;

            const showNewContactCard =
                !hasMatched &&
                (cp.needs_new_contact === true ||
                    (cp.new_contact && cp.new_contact.last_name));

            return {
                id,
                fullName: cp.full_name || '',
                role: cp.role || '',
                email: cp.email || '',
                phone: cp.phone || '',

                isExisting: isExistingInVisit,
                hasMatchedContact: hasMatched,

                contactId: matchedContactId,
                visitContactId,
                contactName: cp.full_name || '',
                contactFirstName: '',
                contactLastName: '',
                contactEmail: '',
                contactPhone: '',

                clientMode: hasMatched
                    ? 'existing'
                    : (showNewContactCard ? 'new' : 'existing'),

                newContactFirstName: cp.new_contact?.first_name || '',
                newContactLastName: cp.new_contact?.last_name || '',
                newContactEmail: cp.new_contact?.email || '',
                newContactPhone: cp.new_contact?.phone || '',
                newContactTitleRole: this.normalizeContactTitleRole(cp.new_contact?.title_role),

                showNewContactCard,
                showExistingCard: isExistingInVisit,
                isValid: true,
                cardClass: 'record-card'
            };
        });

        const mergedClientParticipants = [];
        const usedExisting = new Set();

        aiClientParticipants.forEach(cp => {
            const idxById = baseExisting.findIndex(ex => ex.id === cp.id);

            const idxByVisitContactId = baseExisting.findIndex(ex =>
                ex.visitContactId && cp.visitContactId && ex.visitContactId === cp.visitContactId
            );

            const idxByContact = baseExisting.findIndex(ex =>
                ex.contactId && cp.contactId && ex.contactId === cp.contactId
            );

            const idx =
                idxById >= 0
                    ? idxById
                    : (idxByVisitContactId >= 0 ? idxByVisitContactId : idxByContact);

            if (idx >= 0) {
                usedExisting.add(idx);
                const ex = baseExisting[idx];
                const merged = {
                    ...ex,
                    ...cp,
                    // IMPORTANT: do not overwrite real IDs with empty strings from JSON
                    contactId: cp.contactId || ex.contactId || '',
                    visitContactId: cp.visitContactId || ex.visitContactId || '',
                    isExisting: (ex.isExisting || cp.isExisting || !!(ex.visitContactId || cp.visitContactId)),
                    showExistingCard: cp.showExistingCard !== undefined ? cp.showExistingCard : ex.showExistingCard,
                    _source: cp._source || ex._source
                };

                // Preserve existing Salesforce contact details if persisted JSON is incomplete
                merged.fullName = merged.fullName || ex.fullName || '';
                merged.role = merged.role || ex.role || '';
                merged.email = merged.email || ex.email || '';
                merged.phone = merged.phone || ex.phone || '';

                merged.contactName = merged.contactName || ex.contactName || merged.fullName || '';
                merged.contactFirstName = merged.contactFirstName || ex.contactFirstName || '';
                merged.contactLastName = merged.contactLastName || ex.contactLastName || '';
                merged.contactEmail = merged.contactEmail || ex.contactEmail || merged.email || '';
                merged.contactPhone = merged.contactPhone || ex.contactPhone || merged.phone || '';
                merged.contactTitleRole = merged.contactTitleRole || ex.contactTitleRole || merged.role || '';

                mergedClientParticipants.push(merged);
            } else {
                mergedClientParticipants.push(cp);
            }
        });

        // Add remaining existing not overridden by saved AI JSON
        baseExisting.forEach((ex, idx) => {
            if (!usedExisting.has(idx)) {
                mergedClientParticipants.push(ex);
            }
        });

        this.clientParticipantDrafts = mergedClientParticipants;
        await this.enrichMatchedContacts();

        // INTERNAL PARTICIPANTS
        let internalDrafts = [...this.existingInternalParticipants];
        const usedInternalIds = new Set();
        const aiInternal = json.internal_participants || [];

        const mergedInternal = [];
        const usedExistingInternal = new Set();
        const existingByUserId = {};
        this.existingInternalParticipants.forEach(ex => {
            if (ex.userId && ex.visitManagementTeamId) {
                existingByUserId[ex.userId] = ex.visitManagementTeamId;
            }
        });

        aiInternal.forEach((bp, idx) => {
            const userId = bp.matched_user_id || '';
            const visitManagementTeamId = bp.visit_management_team_id || '';
            const existsInVisit = !!visitManagementTeamId;
            const id = makeUniqueId('internal', bp.reference_id || (userId && ('internal_' + userId)), usedInternalIds, idx);

            const idxById = internalDrafts.findIndex(x => x.id === id);

            const idxByVmt = internalDrafts.findIndex(x =>
                visitManagementTeamId &&
                x.visitManagementTeamId &&
                x.visitManagementTeamId === visitManagementTeamId
            );

            const idxByUser = internalDrafts.findIndex(x => userId && x.userId === userId);

            const idxExisting =
                idxById >= 0
                    ? idxById
                    : (idxByVmt >= 0 ? idxByVmt : idxByUser);

            const draftPayload = {
                id,
                visitManagementTeamId,
                userId,
                userName: bp.full_name || '',
                email: bp.email || '',
                phone: bp.phone || '',
                subtitle: bp.role || '',
                isExisting: existsInVisit || !!visitManagementTeamId,
                isValid: !!userId,
                isCurrentUser: this.currentUserInfo && userId && userId === this.currentUserInfo.userId,
                cardClass: userId
                    ? 'record-card record-card--valid'
                    : 'record-card record-card--invalid',
                _source: 'json'
            };

            if (idxExisting >= 0) {
                usedExistingInternal.add(idxExisting);
                const ex = internalDrafts[idxExisting];
                const merged = {
                    ...ex,
                    ...draftPayload,
                    // IMPORTANT: do not overwrite real IDs with empty strings from JSON
                    userId: draftPayload.userId || ex.userId || '',
                    visitManagementTeamId: draftPayload.visitManagementTeamId || ex.visitManagementTeamId || '',
                    isExisting: (ex.isExisting || draftPayload.isExisting || !!(ex.visitManagementTeamId || draftPayload.visitManagementTeamId)),
                    _source: draftPayload._source || ex._source
                };

                // Preserve existing user details if persisted JSON is incomplete
                merged.userName = merged.userName || ex.userName || '';
                merged.subtitle = merged.subtitle || ex.subtitle || '';
                merged.email = merged.email || ex.email || '';
                merged.phone = merged.phone || ex.phone || '';

                mergedInternal.push(merged);
            } else {
                mergedInternal.push(draftPayload);
            }
        });

        internalDrafts.forEach((bp, idx) => {
            if (!usedExistingInternal.has(idx)) {
                mergedInternal.push(bp);
            }
        });

        // NORMALIZATION: never force isExisting=false; derive from visitManagementTeamId
        const normalizedInternal = mergedInternal.map(bp => {
            const existingVisitMtId = bp.userId ? existingByUserId[bp.userId] : null;
            const visitManagementTeamId = bp.visitManagementTeamId || existingVisitMtId || '';
            const isExisting = !!visitManagementTeamId;
            const isValid = !!bp.userId;

            return {
                ...bp,
                visitManagementTeamId,
                isExisting,
                isValid,
                cardClass: isExisting
                    ? 'record-card record-card--existing'
                    : (isValid
                        ? 'record-card record-card--valid'
                        : 'record-card record-card--invalid')
            };
        });

        // Enriquecer con el usuario actual si coincide por nombre pero viene sin matched_user_id
        if (this.currentUserInfo) {
            const currentName = (this.currentUserInfo.name || '').toLowerCase();
            const draftByName = normalizedInternal.find(
                x =>
                    !x.userId && (
                        (x.userName && x.userName.toLowerCase() === currentName) ||
                        (x.userName && x.userName.toLowerCase().includes('current user')) ||
                        (x.email && this.currentUserInfo.email && x.email.toLowerCase() === this.currentUserInfo.email.toLowerCase())
                    )
            );
            if (draftByName) {
                draftByName.userId = this.currentUserInfo.userId;
                draftByName.email = draftByName.email || this.currentUserInfo.email || '';
                draftByName.phone = draftByName.phone || this.currentUserInfo.phone || '';
                draftByName.subtitle = draftByName.subtitle || this.currentUserInfo.title || '';
                draftByName.userName = this.currentUserInfo.name || draftByName.userName;
                draftByName.isCurrentUser = true;
                draftByName.isValid = !!draftByName.userId;
                draftByName.isExisting = !!draftByName.visitManagementTeamId;
                draftByName.cardClass = draftByName.isExisting
                    ? 'record-card record-card--existing'
                    : (draftByName.userId
                        ? 'record-card record-card--valid'
                        : 'record-card record-card--invalid');
            }
        }

        // Fallback: añadir usuario actual si no está en la visita ni en la lista
        if (this.currentUserInfo) {
            const inDrafts = normalizedInternal.some(
                x =>
                    (x.userId && x.userId === this.currentUserInfo.userId) ||
                    (x.userName && x.userName.toLowerCase() === (this.currentUserInfo.name || '').toLowerCase()) ||
                    (x.email && this.currentUserInfo.email && x.email.toLowerCase() === this.currentUserInfo.email.toLowerCase())
            );
            if (!inDrafts) {
                normalizedInternal.push({
                    id: 'internal_current',
                    userId: this.currentUserInfo.userId,
                    userName: this.currentUserInfo.name || '',
                    email: this.currentUserInfo.email || '',
                    phone: this.currentUserInfo.phone || '',
                    subtitle: this.currentUserInfo.title || '',
                    visitManagementTeamId: '',
                    isExisting: false,
                    isValid: !!this.currentUserInfo.userId,
                    isCurrentUser: true,
                    cardClass: this.currentUserInfo.userId
                        ? 'record-card record-card--valid'
                        : 'record-card record-card--invalid'
                });
            }
        }

        this.internalParticipantDrafts = normalizedInternal;
        await this.resolveInternalParticipantsFromSearch();

        // FUTURE VISITS
        this.visitDrafts = [];
        let visitsFromJson =
            (json.future_visits && json.future_visits.length && json.future_visits)
            || [];

        let usedVisitAsFollowUp = false;
        if (!visitsFromJson.length && json.visit) {
            const payloadVisitId = json.visit.visit_id;
            const refId = json.visit.reference_id;
            const isCurrentRef = refId === 'current_visit' || refId === 'actual_visit';
            if (payloadVisitId && this.activeVisitId && payloadVisitId !== this.activeVisitId) {
                usedVisitAsFollowUp = true;
            } else if (refId && !isCurrentRef) {
                usedVisitAsFollowUp = true;
            }
            if (usedVisitAsFollowUp) {
                visitsFromJson = [json.visit];
            }
        }

        // CURRENT VISIT DETAILS (from AI)
        this.aiCurrentVisitSuggestion = usedVisitAsFollowUp ? null : (json.visit || null);
        if (this.aiCurrentVisitSuggestion) {
            this.applyAiSuggestionToCurrentVisit(false);
            // eslint-disable-next-line no-console
        }

        const filteredVisits = (visitsFromJson || []).filter(v =>
            (v && (
                v.visit_id ||
                v.visit_name ||
                v.start_datetime ||
                v.duration_minutes ||
                v.channel_code ||
                v.purpose_type_code
                // v.comments
            ))
        );

        const usedVisitIds = new Set();
        this.visitDrafts = filteredVisits.map((vis, index) => {
            const id = makeUniqueId('visit', vis.reference_id, usedVisitIds, index);
            const visitId = vis.visit_id || '';
            const isExistingVisit = !!visitId;
            const draft = {
                id,
                reference_id: vis.reference_id,
                visitId,
                name: vis.visit_name || '',
                startDatetime: vis.start_datetime || '',
                durationMinutes: vis.duration_minutes !== undefined ? vis.duration_minutes : null,
                channelCode: vis.channel_code || '',
                purposeTypeCode: vis.purpose_type_code || '',
                // comments: vis.comments || '',
                isExisting: isExistingVisit,
                isValid: true,
                cardClass: isExistingVisit
                    ? 'record-card record-card--existing'
                    : 'record-card'
            };
            return this.normalizeVisitDraft(draft);
        });

        // TASKS (merge AI JSON + existentes)
        const baseExistingTasks = [...this.existingTasks];
        const usedTaskIds = new Set();
        const aiTasks = (json.tasks || []).map((t, index) => {
            const id = makeUniqueId('task', t.reference_id, usedTaskIds, index);
            const taskId = t.task_id || '';
            const isExistingTask = !!taskId;

            return {
                id,
                taskId,
                subject: t.subject || '',
                dueDate: t.due_date || '',
                description: t.description || '',
                isExisting: isExistingTask,
                isValid: !!(t.subject && t.subject.trim().length > 0),
                cardClass: isExistingTask
                    ? 'record-card record-card--existing'
                    : 'record-card',
                _source: 'json'
            };
        });

        const mergedTasks = [];
        const usedExistingTasks = new Set();
        const keyForTask = t => (t.taskId ? `task_${t.taskId}` : `id_${t.id}`);

        aiTasks.forEach(t => {
            const idxById = baseExistingTasks.findIndex(x => keyForTask(x) === keyForTask(t));
            if (idxById >= 0) {
                usedExistingTasks.add(idxById);
                const ex = baseExistingTasks[idxById];
                mergedTasks.push({
                    ...ex,
                    ...t,
                    // IMPORTANT: do not overwrite real taskId with empty strings from JSON
                    taskId: t.taskId || ex.taskId || '',
                    isExisting: !!(t.taskId || ex.taskId),
                    _source: t._source || ex._source
                });
            } else {
                mergedTasks.push(t);
            }
        });

        baseExistingTasks.forEach((t, idx) => {
            if (!usedExistingTasks.has(idx)) {
                mergedTasks.push(t);
            }
        });

        const dedupedTasks = [];
        const seenTask = new Map();
        mergedTasks.forEach(t => {
            const key = keyForTask(t);
            if (!seenTask.has(key)) {
                seenTask.set(key, t);
                dedupedTasks.push(t);
                return;
            }
            const existing = seenTask.get(key);
            if (t._source === 'json' && existing._source !== 'json') {
                const idx = dedupedTasks.findIndex(x => keyForTask(x) === key);
                if (idx >= 0) dedupedTasks[idx] = t;
                seenTask.set(key, t);
            }
        });

        this.taskDrafts = dedupedTasks.map(t => {
            const clone = { ...t };
            delete clone._source;
            return clone;
        });

        this.evaluateAllValidations();
    }

    buildExistingClientParticipantDrafts(rawList) {
        return (rawList || []).map((cp, index) => {
            return {
                id: cp.visitContactId ? 'existing_cp_' + cp.visitContactId : 'existing_cp_' + index,
                fullName: cp.name || '',
                role: cp.title || '',
                email: cp.email || '',
                phone: cp.phone || '',

                isExisting: true,
                hasMatchedContact: false,

                visitContactId: cp.visitContactId || '',
                contactId: cp.contactId || '',
                contactName: cp.name || '',
                contactFirstName: cp.firstName || '',
                contactLastName: cp.lastName || '',
                contactEmail: cp.email || '',
                contactPhone: cp.phone || '',

                clientMode: 'existing',
                newContactFirstName: '',
                newContactLastName: '',
                newContactEmail: '',
                newContactTitleRole: '',

                showNewContactCard: false,
                showExistingCard: true,
                isValid: true,
                cardClass: 'record-card record-card--existing'
            };
        });
    }

    buildExistingInternalParticipantDrafts(rawList) {
        return (rawList || []).map((bp, index) => ({
            id: bp.visitManagementTeamId ? 'existing_bp_' + bp.visitManagementTeamId : 'existing_bp_' + index,
            visitManagementTeamId: bp.visitManagementTeamId || '',
            userId: bp.userId || '',
            userName: bp.name || '',
            email: bp.email || '',
            phone: bp.phone || '',
            subtitle: bp.title || '',
            isExisting: true,
            isValid: true,
            cardClass: 'record-card record-card--existing',
            disableEdit: true,
            disableEditTooltip: 'Is not allowed change the user. Please, delete the visit management team.',
            originalSignature: internalSignature({
                userId: bp.userId || '',
                visitManagementTeamId: bp.visitManagementTeamId || '',
                userName: bp.name || '',
                subtitle: bp.title || '',
                email: bp.email || '',
                phone: bp.phone || ''
            }),
            _source: 'existing'
        }));
    }

    buildExistingTaskDrafts(rawList) {
        return (rawList || []).map((t, index) => ({
            id: t.taskId ? 'existing_task_' + t.taskId : 'existing_task_' + index,
            taskId: t.taskId || '',
            subject: t.subject || '',
            dueDate: t.dueDate || '',
            description: t.description || '',
            isExisting: true,
            isValid: !!(t.subject && t.subject.trim().length > 0),
            cardClass: 'record-card record-card--existing',
            _source: 'existing'
        }));
    }

    async resolveInternalParticipantsFromSearch() {
        const candidates = (this.internalParticipantDrafts || []).filter(bp =>
            !bp.isExisting &&
            !bp.userId &&
            ((bp.userName && bp.userName.trim()) || (bp.email && bp.email.trim()))
        );

        if (!candidates.length) return;

        const searchTerms = Array.from(new Set(
            candidates
                .map(bp =>
                    (bp.email && bp.email.trim()) ||
                    (bp.userName && bp.userName.trim())
                )
                .filter(term => !!term)
        ));

        const searchResults = {};
        for (const term of searchTerms) {
            try {
                const res = await searchUsers({ searchTerm: term });
                searchResults[term] = res || [];
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('searchUsers error', term, err);
            }
        }

        const existingById = {};
        this.existingInternalParticipants.forEach(bp => {
            if (bp.userId) {
                existingById[bp.userId] = true;
            }
        });

        const updatedDrafts = this.internalParticipantDrafts.map(bp => {
            const isExisting = !!bp.visitManagementTeamId || bp.isExisting === true;
            if (isExisting || bp.userId) return { ...bp, isExisting };

            const term =
                (bp.email && bp.email.trim()) ||
                (bp.userName && bp.userName.trim());
            const matches = term ? (searchResults[term] || []) : [];

            let candidate = null;

            if (bp.email) {
                candidate = matches.find(
                    u => u.email && u.email.toLowerCase() === bp.email.toLowerCase()
                );
            }

            if (!candidate && bp.userName) {
                const nameLower = bp.userName.toLowerCase();
                candidate = matches.find(
                    u => u.name && u.name.toLowerCase() === nameLower
                );
            }

            if (!candidate && matches.length === 1) {
                candidate = matches[0];
            }

            if (!candidate) return bp;

            const userId = candidate.id || '';
            const isExistingFromUser = !!(userId && existingById[userId]);

            return {
                ...bp,
                userId,
                userName: candidate.name || bp.userName || '',
                email: candidate.email || bp.email || '',
                phone: candidate.phone || bp.phone || '',
                subtitle: candidate.title || bp.subtitle || '',
                isExisting: isExistingFromUser ? true : bp.isExisting,
                isValid: !!userId,
                cardClass: isExistingFromUser
                    ? 'record-card record-card--existing'
                    : 'record-card record-card--valid'
            };
        });

        this.internalParticipantDrafts = dedupeInternalParticipants(updatedDrafts);
        this.internalParticipantDrafts = this.internalParticipantDrafts.map(bp => ({
            ...bp,
            disableEdit: bp.isExisting && !!bp.visitManagementTeamId,
            disableEditTooltip: (bp.isExisting && !!bp.visitManagementTeamId)
                ? 'Is not allowed change the user. Please, delete the visit management team.'
                : null,
            originalSignature: bp.isExisting
                ? (bp.originalSignature || internalSignature({
                    userId: bp.userId || '',
                    visitManagementTeamId: bp.visitManagementTeamId || '',
                    userName: bp.userName || '',
                    subtitle: bp.subtitle || '',
                    email: bp.email || '',
                    phone: bp.phone || ''
                }))
                : null
        }));
    }

    // ============================================================
    // SUMMARY CHILD COMPONENT INTEGRATION
    // ============================================================
    handleEditSummary() {
        this.isEditingSummary = true;
    }

    handleCancelEditSummary() {
        this.isEditingSummary = false;
    }

    handleSummaryChangeWrapper(event) {
        this.feedbackRichText = event.detail.value;
    }

    handleSaveSummaryWrapper(event) {
        if (event?.detail?.value !== undefined) {
            this.feedbackRichText = event.detail.value;
        }
        this.isEditingSummary = false;
    }

    // ============================================================
    // CRUD FOR CARDS (ADD / EDIT / DELETE)
    // ============================================================
    handleAddClientParticipant() {
        const id = generateDraftId('cp');
        this.modalType = 'client';
        this.modalTitle = 'Add Client Participant';
        this.modalRecord = this.applyModalContext({
            id,
            fullName: '',
            role: '',
            email: '',
            phone: '',
            isExisting: false,
            hasMatchedContact: false,
            contactId: '',
            visitContactId: '',
            contactName: '',
            contactFirstName: '',
            contactLastName: '',
            contactEmail: '',
            contactPhone: '',
            clientMode: 'existing',
            newContactFirstName: '',
            newContactLastName: '',
            newContactEmail: '',
            newContactPhone: '',
            newContactTitleRole: '',
            showNewContactCard: false,
            isValid: false,
            cardClass: 'record-card record-card--invalid'
        });
        this.isModalOpen = true;
        this.scrollToModal();
    }

    handleEditClientFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        const cp = this.clientParticipantDrafts.find(x => x.id === id);
        if (!cp) return;

        this.modalType = 'client';
        this.modalTitle = 'Edit Client Participant';
        this.modalRecord = this.applyModalContext(JSON.parse(JSON.stringify(cp)));
        this.isModalOpen = true;
        this.scrollToModal();
    }

    handleDeleteClientFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        const cp = this.clientParticipantDrafts.find(x => x.id === id);
        if (!cp) return;

        // IMPORTANT: base deletion on relation id, not on isExisting flag (which can be corrupted by merges)
        if (cp.visitContactId) {
            this.toggleClientPendingDelete(cp, true);
        } else {
            this.clientParticipantDrafts =
                this.clientParticipantDrafts.filter(x => x.id !== id);
            this.existingClientParticipants =
                this.existingClientParticipants.filter(x => x.id !== id);
        }

        this.evaluateAllValidations();
    }

    handleRestoreClientFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        const cp = this.clientParticipantDrafts.find(x => x.id === id);
        if (!cp || !cp.visitContactId) return;

        this.toggleClientPendingDelete(cp, false);
        this.evaluateAllValidations();
    }

    async handleEditInternalFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        const bp = this.internalParticipantDrafts.find(x => x.id === id);
        if (!bp) return;

        this.modalType = 'internal';
        this.modalTitle = 'Edit Internal Participant';
        this.modalRecord = this.applyModalContext(JSON.parse(JSON.stringify(bp)));

        const userId = this.modalRecord.userId;
        if (userId) {
            try {
                const res = await getUsersBasicsByIds({ userIds: [userId] });
                const info = (res && res.length) ? res[0] : null;
                if (info) {
                    this.modalRecord = {
                        ...this.modalRecord,
                        userName: info.name || '',
                        userEmail: info.email || '',
                        userPhone: info.phone || '',
                        email: info.email || '',
                        phone: info.phone || '',
                        fullName: info.name || ''
                    };
                }
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('prefillUserBasics error', e);
            }
        }

        this.isModalOpen = true;
        this.scrollToModal();
    }

    handleDeleteInternalFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        const bp = this.internalParticipantDrafts.find(x => x.id === id);
        if (!bp) return;

        // IMPORTANT: base deletion on relation id, not on isExisting flag
        if (bp.visitManagementTeamId) {
            this.toggleInternalPendingDelete(bp, true);
        } else {
            this.internalParticipantDrafts =
                this.internalParticipantDrafts.filter(x => x.id !== id);
        }

        this.evaluateAllValidations();
    }

    handleRestoreInternalFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        const bp = this.internalParticipantDrafts.find(x => x.id === id);
        if (!bp || !bp.visitManagementTeamId) return;

        this.toggleInternalPendingDelete(bp, false);
        this.evaluateAllValidations();
    }

    handleEditVisitFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        const visit = this.visitDrafts.find(v => v.id === id);
        if (!visit) return;

        this.modalType = 'visit';
        this.modalTitle = 'Edit Scheduled Visit';
        this.modalRecord = this.applyModalContext(JSON.parse(JSON.stringify(visit)));
        this.isModalOpen = true;
        this.scrollToModal();
    }

    handleDeleteVisitFromChild(event) {
        const id = event?.detail?.id;
        if (!id) return;

        this.visitDrafts =
            this.visitDrafts.filter(v => v.id !== id);
        this.evaluateAllValidations();
    }

    handleEditTaskFromChild(event) {
        const id = event?.detail?.id;
        const rawIndex = event?.detail?.index;
        const index = Number(rawIndex);
        const hasIndex = Number.isInteger(index) && index >= 0;

        const task = hasIndex
            ? this.taskDrafts[index]
            : this.taskDrafts.find(t => t.id === id);
        if (!task) return;

        this.modalType = 'task';
        this.modalTitle = 'Edit Suggested Task';
        this.modalRecord = this.applyModalContext(JSON.parse(JSON.stringify(task)));
        this.isModalOpen = true;
        this.scrollToModal();
    }

    handleDeleteTaskFromChild(event) {
        const id = event?.detail?.id;
        const rawIndex = event?.detail?.index;
        const index = Number(rawIndex);
        const hasIndex = Number.isInteger(index) && index >= 0;

        const task = hasIndex
            ? this.taskDrafts[index]
            : this.taskDrafts.find(t => t.id === id);

        if (!task) return;

        // IMPORTANT: base deletion on relation id (taskId), not on isExisting flag
        if (task.taskId) {
            this.toggleTaskPendingDelete(task, true);
        } else {
            if (hasIndex) {
                this.taskDrafts = this.taskDrafts.filter((_, i) => i !== index);
            } else if (id) {
                this.taskDrafts = this.taskDrafts.filter(t => t.id !== id);
            }
        }

        this.evaluateAllValidations();
    }

    handleRestoreTaskFromChild(event) {
        const id = event?.detail?.id;
        const rawIndex = event?.detail?.index;
        const index = Number(rawIndex);
        const hasIndex = Number.isInteger(index) && index >= 0;

        const task = hasIndex
            ? this.taskDrafts[index]
            : this.taskDrafts.find(t => t.id === id);

        if (!task || !task.taskId) return;

        this.toggleTaskPendingDelete(task, false);
        this.evaluateAllValidations();
    }

    handleAddInternalParticipant() {
        const id = generateDraftId('internal');
        this.modalType = 'internal';
        this.modalTitle = 'Add Internal Participant';
        this.modalRecord = this.applyModalContext({
            id,
            visitManagementTeamId: '',
            userId: '',
            userName: '',
            email: '',
            phone: '',
            isExisting: false,
            isValid: false,
            cardClass: 'record-card record-card--invalid'
        });
        this.isModalOpen = true;
        this.scrollToModal();
    }

    handleAddVisit() {
        const id = generateDraftId('visit');
        this.modalType = 'visit';
        this.modalTitle = 'Add Visit';
        this.modalRecord = this.applyModalContext({
            id,
            visitId: '',
            name: '',
            startDatetime: '',
            durationMinutes: null,
            channelCode: '',
            purposeTypeCode: '',
            // comments: '',
            isExisting: false,
            isValid: false,
            cardClass: 'record-card record-card--invalid'
        });
        this.isModalOpen = true;
        this.scrollToModal();
    }

    handleAddTask() {
        const id = generateDraftId('task');
        this.modalType = 'task';
        this.modalTitle = 'Add Task';
        this.modalRecord = this.applyModalContext({
            id,
            taskId: '',
            subject: '',
            dueDate: '',
            description: '',
            isExisting: false,
            isValid: false,
            cardClass: 'record-card record-card--invalid'
        });
        this.isModalOpen = true;
        this.scrollToModal();
    }

    // ============================================================
    // MODAL CLOSE / SAVE
    // ============================================================
    handleModalCancel() {
        this.isModalOpen = false;
        this.modalRecord = {};
        this.modalType = '';
        this.restoreScroll();
    }

    handleModalSave(event) {
        const rec =
            event?.detail?.record
                ? JSON.parse(JSON.stringify(event.detail.record))
                : JSON.parse(JSON.stringify(this.modalRecord));

        if (this.modalType === 'client') {
            this.upsertClientParticipant(rec);
        } else if (this.modalType === 'internal') {
            this.upsertInternalParticipant(rec);
        } else if (this.modalType === 'visit') {
            this.upsertVisitDraft(rec);
        } else if (this.modalType === 'task') {
            this.upsertTaskDraft(rec);
        }

        this.evaluateAllValidations();

        this.isModalOpen = false;
        this.modalRecord = {};
        this.modalType = '';
        this.restoreScroll();
    }

    // ============================================================
    // UPSERTS
    // ============================================================
    upsertClientParticipant(rec) {
        const wasExisting = rec.isExisting || !!rec.visitContactId;
        rec.isExisting = wasExisting; // IMPORTANT: do not lose existing if visitContactId exists
        rec.hasMatchedContact =
            !rec.isExisting && rec.clientMode === 'existing' && !!rec.contactId;
        rec.showNewContactCard = rec.clientMode === 'new';

        if (!rec.contactFirstName || !rec.contactLastName) {
            const parts = splitName(rec.contactName || '');
            rec.contactFirstName = rec.contactFirstName || parts.firstName;
            rec.contactLastName  = rec.contactLastName  || parts.lastName;
        }

        rec.email    = rec.newContactEmail || rec.email || rec.contactEmail || '';
        rec.phone    = rec.newContactPhone || rec.phone || rec.contactPhone || '';
        rec.role     = rec.newContactTitleRole || rec.role || '';

        // Si cambió a "new", ocultar subcard existente pero marcar como existente para update
        if (rec.clientMode === 'new') {
            rec.isExisting = wasExisting;
            rec.hasMatchedContact = false;
            rec.visitContactId = rec.visitContactId || '';
            rec.contactId = '';
            rec.contactFirstName = rec.newContactFirstName || '';
            rec.contactLastName = rec.newContactLastName || '';
            rec.contactName = `${rec.contactFirstName} ${rec.contactLastName}`.trim();
            rec.contactEmail = rec.newContactEmail ?? '';
            rec.contactPhone = rec.newContactPhone ?? '';
            rec.showExistingCard = false;
        } else {
            rec.showExistingCard = rec.isExisting;
        }

        // Recompute display name after mode adjustments; clear if no names
        const mergedName = `${rec.contactFirstName || ''} ${rec.contactLastName || ''}`.trim();
        const contactName = mergedName || (rec.contactName || '').trim();
        rec.contactName = contactName;
        rec.fullName = contactName;

        const exists = this.clientParticipantDrafts.some(cp => cp.id === rec.id);
        if (exists) {
            this.clientParticipantDrafts = this.clientParticipantDrafts.map(cp =>
                cp.id === rec.id ? rec : cp
            );
        } else {
            this.clientParticipantDrafts = [...this.clientParticipantDrafts, rec];
        }

        if (rec.isExisting) {
            const existsInBase = this.existingClientParticipants.some(cp => cp.id === rec.id);
            if (existsInBase) {
                this.existingClientParticipants = this.existingClientParticipants.map(cp =>
                    cp.id === rec.id ? rec : cp
                );
            } else {
                this.existingClientParticipants = [
                    ...this.existingClientParticipants,
                    rec
                ];
            }
        }
    }

    upsertInternalParticipant(rec) {
        rec.email = rec.email ?? rec.userEmail ?? '';
        rec.phone = rec.phone ?? rec.userPhone ?? '';
        rec.userName = rec.userName ?? rec.fullName ?? '';
        rec.subtitle = rec.subtitle ?? rec.role ?? '';
        rec.visitManagementTeamId = rec.visitManagementTeamId || '';
        rec.isExisting = !!rec.visitManagementTeamId;
        rec.isValid = !!rec.userId;
        rec.disableEdit = !!rec.visitManagementTeamId;
        rec.disableEditTooltip = rec.disableEdit
            ? 'Is not allowed change the user. Please, delete the visit management team.'
            : null;
        if (!rec.userId) {
            rec.userName = '';
            rec.subtitle = '';
            rec.email = '';
            rec.phone = '';
        }
        rec.cardClass = rec.isExisting
            ? 'record-card record-card--existing'
            : rec.isValid
                ? 'record-card record-card--valid'
                : 'record-card record-card--invalid';

        const exists = this.internalParticipantDrafts.some(bp => bp.id === rec.id);
        if (exists) {
            this.internalParticipantDrafts = this.internalParticipantDrafts.map(bp => {
                if (bp.id !== rec.id) return bp;
                const merged = {
                    ...bp,
                    ...rec
                };
                merged.visitManagementTeamId = rec.visitManagementTeamId || bp.visitManagementTeamId || '';
                merged.isExisting = !!merged.visitManagementTeamId;
                merged.disableEdit = merged.isExisting && !!merged.visitManagementTeamId;
                merged.disableEditTooltip = merged.disableEdit
                    ? 'Is not allowed change the user. Please, delete the visit management team.'
                    : null;
                merged.cardClass = merged.isExisting
                    ? 'record-card record-card--existing'
                    : merged.isValid
                        ? 'record-card record-card--valid'
                        : 'record-card record-card--invalid';
                return merged;
            });
        } else {
            this.internalParticipantDrafts = [...this.internalParticipantDrafts, rec];
        }
    }

    upsertVisitDraft(rec) {
        const exists = this.visitDrafts.some(v => v.id === rec.id);
        if (exists) {
            this.visitDrafts = this.visitDrafts.map(v =>
                v.id === rec.id
                    ? {
                        ...v,
                        ...rec,
                        visitId: rec.visitId || v.visitId || '',
                        isExisting: v.isExisting || rec.isExisting || !!(rec.visitId || v.visitId)
                    }
                    : v
            );
        } else {
            this.visitDrafts = [...this.visitDrafts, { ...rec, visitId: rec.visitId || '' }];
        }
    }

    upsertTaskDraft(rec) {
        const exists = this.taskDrafts.some(t => t.id === rec.id);
        if (exists) {
            this.taskDrafts = this.taskDrafts.map(t =>
                t.id === rec.id
                    ? {
                        ...t,
                        ...rec,
                        taskId: rec.taskId || t.taskId || '',
                        isExisting: t.isExisting || rec.isExisting || !!(rec.taskId || t.taskId)
                    }
                    : t
            );
        } else {
            this.taskDrafts = [...this.taskDrafts, { ...rec, taskId: rec.taskId || '' }];
        }
    }

    // ============================================================
    // MODAL CONTEXT HELPER
    // ============================================================
    applyModalContext(rec) {
        return {
            ...rec,
            visitName: this.visitName,
            accountId: this.accountId,
            accountName: this.accountName,
            visitStatusType: this.visitStatusType,
            contactRecordTypeId: this.contactRecordTypeId,
            contactRecordTypeName: this.contactRecordTypeName
        };
    }

    // ============================================================
    // FINAL BUTTONS
    // ============================================================
    handleMoveToFinalizedChange(event) {
        this.moveVisitToFinalized = event.target.checked;
    }

    formatLocalDatetime(value) {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    normalizeCurrentVisitDefaults(draft) {
        if (!draft) return draft;
        const next = { ...draft };
        const hasStart = !!(next.startDatetime && String(next.startDatetime).trim());
        let durationMinutes = next.durationMinutes;
        const durationMissing = durationMinutes === null || durationMinutes === undefined || durationMinutes === '';

        if (durationMissing) {
            durationMinutes = 60;
            next.durationMinutes = 60;
        }

        const durationNumber = Number(durationMinutes);
        if (!Number.isFinite(durationNumber)) {
            durationMinutes = 60;
            next.durationMinutes = 60;
        } else if (next.durationMinutes !== durationNumber) {
            next.durationMinutes = durationNumber;
        }

        if (!hasStart) {
            const startDate = new Date(Date.now() - Number(durationMinutes) * 60000);
            next.startDatetime = this.formatLocalDatetime(startDate);
        }

        return next;
    }

    async ensureActiveVisitId() {
        if (this.activeVisitId) return this.activeVisitId;
        if (!this.isAccountMode) return null;

        if (this.visitSelectionMode === 'existing') {
            this.dispatchToast(
                'Visit required',
                'Select an existing visit or switch to New visit before applying changes.',
                'error'
            );
            return null;
        }

        if (this.requiresVisitCreation && this.currentVisitDraft) {
            this.currentVisitDraft = this.normalizeCurrentVisitDefaults(this.currentVisitDraft);
        }

        this.evaluateAllValidations();
        if (this.currentVisitHasMissingRequired) {
            this.dispatchToast(
                'Visit details required',
                'Please complete the Visit Details before creating the visit.',
                'error'
            );
            return null;
        }

        try {
            const info = await createInitialVisit({
                accountId: this.accountId,
                visitName: this.currentVisitDraft.name,
                startDatetime: this.currentVisitDraft.startDatetime,
                durationMinutes: this.currentVisitDraft.durationMinutes,
                channelCode: this.currentVisitDraft.channelCode,
                purposeTypeCode: this.currentVisitDraft.purposeTypeCode
            });

            if (info && info.visitId) {
                this.activeVisitId = info.visitId;
                this.visitName = info.visitName;
                this.accountName = info.accountName || this.accountName;
                this.accountId = info.accountId || this.accountId;
                this.visitStatusType = info.visitStatusType;
                this.applyVisitInfoToCurrentDraft(info);
                this.visitSelectionMode = 'existing';
                this.selectedExistingVisitId = info.visitId;
            }

            // Refresh open visits list
            if (this.accountId) {
                this.openVisits = await getOpenVisitsByAccount({ accountId: this.accountId });
            }

            return this.activeVisitId;
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('createInitialVisit error', e);
            this.dispatchToast(
                'Error',
                this.buildErrorMessage('Could not create the initial visit.', e),
                'error'
            );
            return null;
        }
    }

    async applySection(apexMethod, sectionsToValidate = [], sectionsToClearDeletes = [], successMessage, sectionsToBaseline) {
        if (this.hasInvalidSections(sectionsToValidate)) {
            this.dispatchToast(
                'Review Required',
                'Some records in this section contain errors (red border).',
                'error'
            );
            return;
        }

        try {
            this.isLoading = true;

            const ensuredVisitId = await this.ensureActiveVisitId();
            if (!ensuredVisitId) return;

            const jsonToApply = this.buildFinalJson();
            const applyResult = await apexMethod({
                visitId: ensuredVisitId,
                jsonResult: JSON.stringify(jsonToApply)
            });

            this.applyServerResult(applyResult);
            this.removePendingDeleteDraftsForSections(sectionsToClearDeletes);

            const baselineTargets = sectionsToBaseline || sectionsToValidate;
            this.updateBaselineForSections(baselineTargets);
            this.evaluateAllValidations();

            const jsonToPersist = this.buildFinalJsonWithBaseline();
            this.rawAiJson = jsonToPersist;

            await savePartialState({
                visitId: ensuredVisitId,
                transcript: this.transcript,
                analysisJson: JSON.stringify(jsonToPersist),
                feedbackRichText: this.feedbackRichText
            });

            const refreshIds = [];
            if (this.activeVisitId) refreshIds.push(this.activeVisitId);
            if (this.isAccountMode && this.accountId) refreshIds.push(this.accountId);
            if (refreshIds.length) await this.refreshRecordPage(refreshIds);
            if (successMessage) {
                this.dispatchToast('Success', successMessage, 'success');
            }

            if (this.isAccountMode && ensuredVisitId) {
                this.navigateToVisitRecord(ensuredVisitId);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            const detail = this.normalizeError(e);
            this.dispatchToast(
                'Changes could not be applied.',
                detail,
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    async handleApplyClick() {
        if (this.hasInvalidRecords) {
            this.dispatchToast(
                'Review Required',
                'Some records contain errors (red border).',
                'error'
            );
            return;
        }

        try {
            this.isLoading = true;

            const ensuredVisitId = await this.ensureActiveVisitId();
            if (!ensuredVisitId) return;

            // 1) Enviar lo que hay ahora
            const jsonToApply = this.buildFinalJson();

            const applyResult = await applyVisitResult({
                visitId: ensuredVisitId,
                jsonResult: JSON.stringify(jsonToApply)
            });

            // 2) Aplicar IDs devueltos a los drafts (taskId, visitContactId, etc.)
            this.applyServerResult(applyResult);

            // 2.5) Quitar tarjetas marcadas para borrar (ya eliminadas en Salesforce)
            this.removePendingDeleteDrafts();

            // 3) Capturar baseline post-apply (estado alineado con Salesforce)
            this.captureBaseline();
            this.evaluateAllValidations();

            // 4) CRÍTICO: persistir JSON ya con IDs + baseline (evita duplicados y mantiene modificados)
            const jsonToPersist = this.buildFinalJsonWithBaseline();
            this.rawAiJson = jsonToPersist;

            await savePartialState({
                visitId: ensuredVisitId,
                transcript: this.transcript,
                analysisJson: JSON.stringify(jsonToPersist),
                feedbackRichText: this.feedbackRichText,
                isFinalized: this.moveVisitToFinalized
            });

            if (this.moveVisitToFinalized) {
                this.visitStatusType = '06';
                this.resetAssistantView();
            } else {
                // baseline ya actualizado
            }

            const refreshIds = [];
            if (this.activeVisitId) refreshIds.push(this.activeVisitId);
            if (this.isAccountMode && this.accountId) refreshIds.push(this.accountId);
            if (refreshIds.length) await this.refreshRecordPage(refreshIds);
            this.dispatchToast('Success', 'Changes applied to Salesforce.', 'success');

            if (this.isAccountMode && ensuredVisitId) {
                this.navigateToVisitRecord(ensuredVisitId);
            }

        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            const detailRaw = this.normalizeError(e);
            const isTooManyQueries = detailRaw && detailRaw.toLowerCase().includes('too many soql');
            const detail = isTooManyQueries
                ? 'Too many records to process at once. Please apply changes by section using the dedicated buttons (Client Participants, Internal Participants, New Visit, Suggested Tasks) or reduce the number of pending records and try again.'
                : detailRaw;
            this.dispatchToast(
                'Changes could not be applied.',
                detail,
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    async handleApplyClients() {
        await this.applySection(
            applyClientParticipants,
            ['clients'],
            ['clients'],
            'Client participants applied to Salesforce.'
        );
    }

    async handleApplyInternal() {
        await this.applySection(
            applyInternalParticipants,
            ['internal'],
            ['internal'],
            'Internal participants applied to Salesforce.'
        );
    }

    async handleApplyVisits() {
        await this.applySection(
            applyVisitScheduling,
            ['visits'],
            [],
            'Visits applied to Salesforce.',
            ['visits', 'feedback', 'current_visit']
        );
    }

    async handleApplyTasks() {
        await this.applySection(
            applyTasks,
            ['tasks'],
            ['tasks'],
            'Tasks applied to Salesforce.'
        );
    }

    normalizeError(err) {
        if (!err) return 'An unexpected error occurred.';
        const messages = [];

        if (err.body && typeof err.body.message === 'string' && err.body.message) {
            messages.push(err.body.message);
        }

        if (Array.isArray(err.body)) {
            messages.push(...err.body.map(e => e && e.message).filter(Boolean));
        }

        if (err.body && Array.isArray(err.body.pageErrors) && err.body.pageErrors.length) {
            messages.push(...err.body.pageErrors.map(pe => pe && pe.message).filter(Boolean));
        }

        if (err.body && err.body.output) {
            const output = err.body.output;
            if (Array.isArray(output.errors) && output.errors.length) {
                messages.push(...output.errors.map(e => e && e.message).filter(Boolean));
            }
            if (output.fieldErrors) {
                Object.keys(output.fieldErrors).forEach(field => {
                    const fieldErrors = output.fieldErrors[field] || [];
                    fieldErrors.forEach(fe => {
                        const msg = fe && fe.message ? `${field}: ${fe.message}` : '';
                        if (msg) messages.push(msg);
                    });
                });
            }
        }

        if (err.message) messages.push(err.message);
        if (err.statusText && err.statusText !== 'Server Error') messages.push(err.statusText);

        const unique = messages.filter((msg, index) => messages.indexOf(msg) === index);
        return unique.length ? unique.join('; ') : 'An unexpected error occurred.';
    }

    buildErrorMessage(baseMessage, err) {
        const detail = this.normalizeError(err);
        const base = baseMessage || '';
        if (!detail || detail === base) return base || detail;
        if (!base) return detail;
        if (base.includes(detail)) return base;
        return `${base} Details: ${detail}`;
    }

    applyServerResult(result) {
        if (!result) return;

        if (Array.isArray(result.visitResults) && result.visitResults.length) {
            const byRef = {};
            result.visitResults.forEach(vr => {
                if (vr && vr.clientReferenceId) {
                    byRef[vr.clientReferenceId] = vr.visitId;
                }
            });
            this.visitDrafts = this.visitDrafts.map(v => {
                const newId = byRef[v.id];
                if (!newId) return v;
                return {
                    ...v,
                    visitId: newId,
                    isExisting: true,
                    cardClass: 'record-card record-card--existing'
                };
            });
        } else if (result.followUpVisitId && this.visitDrafts.length) {
            this.visitDrafts = this.visitDrafts.map((v, index) =>
                index === 0
                    ? {
                        ...v,
                        visitId: result.followUpVisitId,
                        isExisting: true,
                        cardClass: 'record-card record-card--existing'
                    }
                    : v
            );
        }

        if (Array.isArray(result.clientParticipants)) {
            const byRef = {};
            result.clientParticipants.forEach(cp => {
                if (cp && cp.clientReferenceId) {
                    byRef[cp.clientReferenceId] = cp;
                }
            });

            this.clientParticipantDrafts = this.clientParticipantDrafts.map(cp => {
                const res = byRef[cp.id];
                if (!res) return cp;
                const becameExisting = !!res.visitContactId;
                return {
                    ...cp,
                    contactId: res.contactId || cp.contactId,
                    visitContactId: res.visitContactId || cp.visitContactId,
                    isExisting: true,
                    clientMode: becameExisting ? 'existing' : cp.clientMode,
                    hasMatchedContact: becameExisting ? false : cp.hasMatchedContact,
                    showNewContactCard: becameExisting ? false : cp.showNewContactCard,
                    showExistingCard: becameExisting ? true : cp.showExistingCard,
                    newContactFirstName: becameExisting ? '' : cp.newContactFirstName,
                    newContactLastName: becameExisting ? '' : cp.newContactLastName,
                    newContactEmail: becameExisting ? '' : cp.newContactEmail,
                    newContactPhone: becameExisting ? '' : cp.newContactPhone,
                    newContactTitleRole: becameExisting ? '' : cp.newContactTitleRole,
                    cardClass: becameExisting
                        ? 'record-card record-card--existing'
                        : cp.cardClass
                };
            });
            this.existingClientParticipants = this.clientParticipantDrafts.filter(cp => !!cp.visitContactId || cp.isExisting);
        }

        if (Array.isArray(result.internalParticipants)) {
            const byRef = {};
            result.internalParticipants.forEach(bp => {
                if (bp && bp.clientReferenceId) {
                    byRef[bp.clientReferenceId] = bp;
                }
            });
            this.internalParticipantDrafts = this.internalParticipantDrafts.map(bp => {
                const res = byRef[bp.id];
                if (!res) return bp;
                const visitManagementTeamId = res.visitManagementTeamId || bp.visitManagementTeamId;
                const isExisting = !!visitManagementTeamId;
                const disableEdit = isExisting && !!visitManagementTeamId;
                return {
                    ...bp,
                    visitManagementTeamId,
                    isExisting,
                    disableEdit,
                    disableEditTooltip: disableEdit
                        ? 'Is not allowed change the user. Please, delete the visit management team.'
                        : null,
                    cardClass: isExisting
                        ? 'record-card record-card--existing'
                        : bp.cardClass
                };
            });
            this.existingInternalParticipants = this.internalParticipantDrafts.filter(bp => !!bp.visitManagementTeamId || bp.isExisting);
        }

        if (Array.isArray(result.tasks)) {
            const byRef = {};
            result.tasks.forEach(t => {
                if (t && t.clientReferenceId) {
                    byRef[t.clientReferenceId] = t;
                }
            });
            this.taskDrafts = this.taskDrafts.map(t => {
                const res = byRef[t.id];
                if (!res) return t;
                const taskId = res.taskId || t.taskId;
                const isExisting = !!taskId;
                return {
                    ...t,
                    taskId,
                    isExisting,
                    cardClass: isExisting
                        ? 'record-card record-card--existing'
                        : t.cardClass
                };
            });
        }

        this.existingTasks = this.taskDrafts.filter(t => !!t.taskId || t.isExisting);
        this.evaluateAllValidations();
    }

    async handleSaveForLater() {
        try {
            this.isLoading = true;

            const ensuredVisitId = await this.ensureActiveVisitId();
            if (!ensuredVisitId) return;

            const jsonToSave = this.buildFinalJsonWithBaseline();

            await savePartialState({
                visitId: ensuredVisitId,
                transcript: this.transcript,
                analysisJson: JSON.stringify(jsonToSave),
                feedbackRichText: this.feedbackRichText
            });

            this.dispatchToast(
                'Saved',
                'Analysis saved to continue later.',
                'success'
            );

            const refreshIds = [];
            if (this.activeVisitId) refreshIds.push(this.activeVisitId);
            if (this.isAccountMode && this.accountId) refreshIds.push(this.accountId);
            if (refreshIds.length) await this.refreshRecordPage(refreshIds);

            if (this.isAccountMode && ensuredVisitId) {
                this.navigateToVisitRecord(ensuredVisitId);
            }

        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            this.dispatchToast(
                'Error',
                this.buildErrorMessage('Progress could not be saved.', e),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    handleOpenExistingVisit(event) {
        const visitId = event && event.detail ? event.detail.visitId : '';
        if (!visitId) {
            this.dispatchToast(
                'Visit required',
                'Select an existing visit to open.',
                'error'
            );
            return;
        }
        if (this.isAccountMode) {
            this.visitSelectionMode = 'existing';
            this.selectedExistingVisitId = visitId;
        }
        this.navigateToVisitRecord(visitId);
    }

    async handleSaveAndOpenExistingVisit(event) {
        const visitId = (event && event.detail && event.detail.visitId)
            || this.selectedExistingVisitId
            || this.aiDetectedVisitId
            || '';
        if (!visitId) {
            this.dispatchToast(
                'Visit required',
                'Select an existing visit to save and open.',
                'error'
            );
            return;
        }

        try {
            this.isLoading = true;
            if (this.activeVisitId !== visitId) {
                await this.selectExistingVisitForMerge(visitId);
                if (this.rawAiJson) {
                    await this.buildDraftsFromAiJson(this.rawAiJson);
                }
            }

            const jsonToSave = this.buildFinalJsonWithBaseline();
            await savePartialState({
                visitId,
                transcript: this.transcript,
                analysisJson: JSON.stringify(jsonToSave),
                feedbackRichText: this.feedbackRichText
            });

            this.dispatchToast(
                'Saved',
                'Analysis saved to continue later.',
                'success'
            );
            this.navigateToVisitRecord(visitId);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            this.dispatchToast(
                'Could not save.',
                this.normalizeError(e),
                'error'
            );
        } finally {
            this.isLoading = false;
        }
    }

    async handleCreateVisitAndContinue() {
        await this.handleSaveForLater();
    }

    resetAssistantView() {
        this.showLauncher = true;
        this.showInput = false;
        this.showPreview = false;
        this.moveVisitToFinalized = false;
        this.hasInitialized = false;
        this.hasLoadedPrevious = false;
        this.analysisLanguage = '';
        this.resetPendingDeletes();
        if (this.isAccountMode) {
            this.activeVisitId = null;
            this.selectedExistingVisitId = '';
            this.aiDetectedVisitId = '';
            this.visitSelectionMode = 'new';
            this.hasBaselineFromExisting = false;
            this.initializeCurrentVisitDraft();
        }
        this.scrollToTop();
    }

    // ============================================================
    // VALIDATIONS & CARD CLASSES
    // ============================================================
    evaluateAllValidations() {
        // CURRENT VISIT DETAILS
        if (this.currentVisitDraft) {
            const missing = [];
            const name = this.currentVisitDraft.name || '';
            const start = this.currentVisitDraft.startDatetime || '';
            const duration = this.currentVisitDraft.durationMinutes;
            const channel = this.currentVisitDraft.channelCode || '';
            const purpose = this.currentVisitDraft.purposeTypeCode || '';

            if (!name.trim()) missing.push('Name');
            if (!start.trim()) missing.push('Start Date');
            if (duration === null || duration === undefined) missing.push('Duration');
            if (!channel.trim()) missing.push('Visit Type');
            if (!purpose.trim()) missing.push('Visit Purpose');

            const isValid = missing.length === 0;
            const baseSigCurrent = this.baseline.currentVisit;
            const nowSigCurrent = currentVisitSignature(this.currentVisitDraft);
            const isModified = baseSigCurrent !== undefined && baseSigCurrent !== nowSigCurrent;

            this.currentVisitDraft = {
                ...this.currentVisitDraft,
                isValid,
                isModified,
                missingFields: missing,
                showMissing: this.requiresVisitCreation && !isValid
            };
        }

        // VISITS
        this.visitDrafts = this.visitDrafts.map(v => {
            const valid =
                v.name?.trim() &&
                v.startDatetime?.trim() &&
                v.purposeTypeCode?.trim();

            const isExisting = !!v.visitId;
            const baseSigVisit = this.baseline.visits[v.id];
            const nowSigVisit = visitSignature(v);
            const isModified = isExisting && baseSigVisit !== undefined && baseSigVisit !== nowSigVisit;
            const showExistingPill = isExisting && !!valid && !isModified;
            const showModifiedPill = isExisting && !!valid && isModified;

            return {
                ...v,
                isExisting,
                isValid: !!valid,
                isModified,
                showExistingPill,
                showModifiedPill,
                cardClass: isExisting
                    ? (!valid
                        ? 'record-card record-card--invalid'
                        : (isModified
                            ? 'record-card record-card--modified'
                            : 'record-card record-card--existing'))
                    : (valid
                        ? 'record-card record-card--valid'
                        : 'record-card record-card--invalid')
            };
        });

        // CLIENT PARTICIPANTS
        this.clientParticipantDrafts = this.clientParticipantDrafts.map(cp => {
            const isExisting = !!cp.visitContactId || cp.isExisting === true;
            const showExistingCard = cp.showExistingCard !== undefined
                ? cp.showExistingCard
                : isExisting;

            if (cp.pendingDelete) {
                return {
                    ...cp,
                    isExisting,
                    isValid: true,
                    isModified: false,
                    showModified: false,
                    showExistingCard,
                    cardClass: 'record-card record-card--deleted'
                };
            }

            const baseSigClient = this.baseline.clients[cp.id];
            const nowSigClient = clientSignature(cp);
            const isModified = isExisting && baseSigClient !== undefined && baseSigClient !== nowSigClient;

            if (isExisting) {
                let valid = true;
                if (cp.clientMode === 'existing') {
                    // IMPORTANT: allow existing relation even if contactId is missing (visitContactId is sufficient)
                    valid = !!(cp.contactId || cp.visitContactId);
                } else if (cp.clientMode === 'new') {
                    valid = !!(cp.newContactLastName && cp.newContactLastName.trim());
                }
                const showModified = isModified && valid;
                return {
                    ...cp,
                    isExisting,
                    isValid: !!valid,
                    isModified,
                    showModified,
                    showExistingCard,
                    cardClass: valid
                        ? (isModified ? 'record-card record-card--modified' : 'record-card record-card--existing')
                        : 'record-card record-card--invalid'
                };
            }

            let valid = !!(cp.fullName && cp.fullName.trim());

            if (cp.clientMode === 'existing') {
                if (!cp.contactId) valid = false;
            } else if (cp.clientMode === 'new') {
                if (!cp.newContactLastName || !cp.newContactLastName.trim()) {
                    valid = false;
                }
            }

            return {
                ...cp,
                isExisting,
                isValid: valid,
                isModified: false,
                showModified: false,
                showExistingCard,
                showReadyToProcess: valid && !isModified,
                cardClass: valid
                    ? 'record-card record-card--valid'
                    : 'record-card record-card--invalid'
            };
        });

        // INTERNAL PARTICIPANTS
        this.internalParticipantDrafts = this.internalParticipantDrafts.map(bp => {
            const isExisting = !!bp.visitManagementTeamId || bp.isExisting === true;

            if (bp.pendingDelete) {
                return {
                    ...bp,
                    isExisting,
                    isValid: true,
                    isModified: false,
                    showModified: false,
                    cardClass: 'record-card record-card--deleted'
                };
            }

            const baseSigInternal = this.baseline.internal[bp.id];
            const nowSigInternal = internalSignature(bp);
            const isModified = isExisting && baseSigInternal !== undefined && baseSigInternal !== nowSigInternal;

            if (isExisting) {
                const valid = !!bp.userId;
                const showModified = isModified && valid;
                return {
                    ...bp,
                    isExisting,
                    isValid: valid,
                    isModified,
                    showModified,
                    cardClass: valid
                        ? (isModified ? 'record-card record-card--modified' : 'record-card record-card--existing')
                        : 'record-card record-card--invalid'
                };
            }

            const valid = !!bp.userId;

            return {
                ...bp,
                isExisting,
                isValid: valid,
                isModified: false,
                showModified: false,
                cardClass: valid
                    ? 'record-card record-card--valid'
                    : 'record-card record-card--invalid'
            };
        });

        // TASKS (con MODIFIED + flags para el hijo)
        this.taskDrafts = this.taskDrafts.map(t => {
            if (t.pendingDelete) {
                return {
                    ...t,
                    isExisting: true,
                    isValid: true,
                    isModified: false,
                    status: 'delete',
                    showAlreadyCreated: false,
                    showModified: false,
                    showReadyToCreate: false,
                    showInvalid: false,
                    cardClass: 'record-card record-card--deleted'
                };
            }

            const valid = !!(t.subject && t.subject.trim());
            const isExisting = !!t.taskId;

            const baseSig = this.baseline.tasks[t.id];
            const nowSig = taskSignature(t);
            const isModified = isExisting && baseSig !== undefined && baseSig !== nowSig;

            const status = isExisting
                ? (isModified ? 'modified' : 'existing')
                : (valid ? 'create' : 'invalid');

            return {
                ...t,
                isExisting,
                isValid: valid,
                isModified,
                status,

                // flags para que el hijo no muestre doble badge
                showAlreadyCreated: status === 'existing',
                showModified: status === 'modified',
                showReadyToCreate: status === 'create',
                showInvalid: status === 'invalid',

                cardClass: isExisting
                    ? (isModified ? 'record-card record-card--modified' : 'record-card record-card--existing')
                    : valid
                        ? 'record-card record-card--valid'
                        : 'record-card record-card--invalid'
            };
        });
    }

    get hasInvalidRecords() {
        const hasInvalidCurrent = this.requiresVisitCreation && this.currentVisitDraft && !this.currentVisitDraft.isValid;
        const hasInvalidVisits = this.visitDrafts.some(v => !v.isValid);
        const hasInvalidTasks = this.taskDrafts.some(t => !t.isValid);
        const hasInvalidClients = this.clientParticipantDrafts.some(
            cp => !cp.isValid
        );
        const hasInvalidInternal = this.internalParticipantDrafts.some(
            bp => !bp.isValid
        );

        return hasInvalidCurrent || hasInvalidVisits || hasInvalidTasks || hasInvalidClients || hasInvalidInternal;
    }

    hasInvalidSections(sectionKeys = []) {
        const sections = new Set(sectionKeys || []);
        if (sections.has('current_visit') && this.currentVisitDraft && !this.currentVisitDraft.isValid) return true;
        if (sections.has('visits') && this.visitDrafts.some(v => !v.isValid)) return true;
        if (sections.has('tasks') && this.taskDrafts.some(t => !t.isValid)) return true;
        if (sections.has('clients') && this.clientParticipantDrafts.some(cp => !cp.isValid)) return true;
        if (sections.has('internal') && this.internalParticipantDrafts.some(bp => !bp.isValid)) return true;
        return false;
    }

    get isVisitFinalized() {
        return !!this.activeVisitId && this.visitStatusType === '06';
    }

    get finalizedTooltip() {
        return this.isVisitFinalized
            ? 'This visit is finalized. The AI Visit Assistant is no longer available for finalized visits.'
            : null;
    }

    // ============================================================
    // JSON BUILD (FINAL DTO)
    // ============================================================
    buildFinalJson() {
        // Ensure UI flags and pending delete sets stay in sync before serializing
        this.applyPendingDeletesToDrafts();

        const pendingDeleted = this.getPendingDeletes();
        const activeClients = (this.clientParticipantDrafts || []).filter(cp => !cp.pendingDelete);
        const activeInternal = (this.internalParticipantDrafts || []).filter(bp => !bp.pendingDelete);
        const activeTasks = (this.taskDrafts || []).filter(t => !t.pendingDelete);

        const currentVisit = this.currentVisitDraft || {};
        const currentVisitPayload = {
            requires_creation: this.isAccountMode && !this.activeVisitId,
            visit_id: this.activeVisitId || currentVisit.visitId || '',
            reference_id: 'current_visit',
            visit_name: currentVisit.name || '',
            start_datetime: currentVisit.startDatetime || '',
            duration_minutes: currentVisit.durationMinutes !== null && currentVisit.durationMinutes !== undefined
                ? Number(currentVisit.durationMinutes)
                : null,
            channel_code: currentVisit.channelCode || '',
            purpose_type_code: currentVisit.purposeTypeCode || ''
            // comments: ''
        };

        const visitPayloads = this.visitDrafts.map(v => ({
            requires_creation: false,
            visit_id: v.visitId || '',
            reference_id: v.reference_id || v.id,
            visit_name: v.name,
            start_datetime: v.startDatetime,
            duration_minutes: v.durationMinutes
                ? Number(v.durationMinutes)
                : null,
            channel_code: v.channelCode,
            purpose_type_code: v.purposeTypeCode
            // comments: v.comments
        }));

        return {
            feedback_richtext: this.feedbackRichText || '',
            language: normalizeLanguageCode(this.analysisLanguage) || '',

            visit: currentVisitPayload,
            future_visits: visitPayloads.map(v => ({
                visit_id: v.visit_id,
                reference_id: v.reference_id,
                visit_name: v.visit_name,
                start_datetime: v.start_datetime,
                duration_minutes: v.duration_minutes,
                channel_code: v.channel_code,
                purpose_type_code: v.purpose_type_code
                // comments: v.comments
            })),

            client_participants: activeClients.map(cp => {
                const needsNewContact = cp.clientMode === 'new';
                const isExisting = !!cp.visitContactId || cp.isExisting === true;
                const matchedContactId = needsNewContact ? '' : (cp.contactId || '');

                return {
                    full_name: cp.fullName,
                    role: cp.role,
                    email: cp.email,
                    phone: cp.phone,
                    contact_id: cp.contactId || '',
                    visit_contact_id: cp.visitContactId || '',
                    reference_id: cp.id,

                    exists_in_crm: isExisting,
                    matched_contact_id: matchedContactId,
                    needs_new_contact: needsNewContact,

                    new_contact: needsNewContact
                        ? {
                            first_name: cp.newContactFirstName || '',
                            last_name: cp.newContactLastName || '',
                            email: cp.newContactEmail || '',
                            phone: cp.newContactPhone || '',
                            title_role: cp.newContactTitleRole || '',
                            record_type: 'Desktop Contact',
                            record_type_id: this.contactRecordTypeId || ''
                        }
                        : {
                            first_name: '',
                            last_name: '',
                            email: '',
                            phone: '',
                            title_role: '',
                            record_type: '',
                            record_type_id: ''
                        }
                };
            }),

            internal_participants: activeInternal.map(bp => ({
                full_name: bp.userName || '',
                email: bp.email || '',
                phone: bp.phone || '',
                role: bp.subtitle || '',
                matched_user_id: bp.userId || '',
                visit_management_team_id: bp.visitManagementTeamId || '',
                exists_in_visit: (!!bp.visitManagementTeamId || bp.isExisting === true),
                reference_id: bp.id
            })),

            tasks: activeTasks.map(t => ({
                task_id: t.taskId || '',
                reference_id: t.id,
                subject: t.subject || '',
                due_date: t.dueDate || '',
                description: t.description || ''
            })),

            deleted: pendingDeleted
        };
    }

    buildFinalJsonWithBaseline() {
        const payload = this.buildFinalJson();
        payload._baseline = {
            feedback: this.baseline.feedback || '',
            tasks: this.baseline.tasks || {},
            clients: this.baseline.clients || {},
            internal: this.baseline.internal || {},
            visits: this.baseline.visits || {},
            currentVisit: this.baseline.currentVisit || ''
        };
        payload._modified = {
            tasks: (this.taskDrafts || []).filter(t => t.isModified).map(t => t.id),
            clients: (this.clientParticipantDrafts || []).filter(cp => cp.isModified).map(cp => cp.id),
            internal_participants: (this.internalParticipantDrafts || []).filter(bp => bp.isModified).map(bp => bp.id),
            visits: (this.visitDrafts || []).filter(v => v.isModified).map(v => v.id),
            current_visit: !!(this.currentVisitDraft && this.currentVisitDraft.isModified)
        };
        return payload;
    }

    // ============================================================
    // UTILITIES
    // ============================================================
    dispatchToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

    parseSalesforceDateTime(value) {
        if (!value) return null;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }
        if (typeof value !== 'string') return null;

        let s = value.trim();
        if (!s) return null;

        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
            s = s.replace(' ', 'T');
        }

        if (/[+\-]\d{4}$/.test(s)) {
            s = s.replace(/([+\-]\d{2})(\d{2})$/, '$1:$2');
        }

        const hasTZ = /[zZ]|[+\-]\d{2}:\d{2}$/.test(s);

        if (!hasTZ) {
            s = `${s}Z`;
        }

        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    formatVisitDateForEmail(value) {
        const dateObj = this.parseSalesforceDateTime(value);
        if (!dateObj) {
            return typeof value === 'string'
                ? value.replace('T', ' ').replace(/\\.000Z$/, '').replace(/Z$/, '')
                : '';
        }

        const parts = new Intl.DateTimeFormat(LOCALE || 'es-ES', {
            timeZone: TIME_ZONE || undefined,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(dateObj);

        const get = type => parts.find(p => p.type === type)?.value || '';
        return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
    }

    formatDateOnly(value) {
        const dateObj = this.parseSalesforceDateTime(value);
        if (!dateObj) return typeof value === 'string' ? value : '';

        const parts = new Intl.DateTimeFormat(LOCALE || 'es-ES', {
            timeZone: TIME_ZONE || undefined,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(dateObj);

        const get = type => parts.find(p => p.type === type)?.value || '';
        return `${get('day')}/${get('month')}/${get('year')}`;
    }

    buildEmailParticipants() {
        return this.buildEmailParticipantsFromDrafts(
            this.clientParticipantDrafts || [],
            this.internalParticipantDrafts || []
        );
    }

    buildEmailParticipantsFromDrafts(clientDrafts, internalDrafts) {
        const items = [];
        const seen = new Set();

        (clientDrafts || []).forEach(cp => {
            if (cp.pendingDelete) return;
            const name = (cp.fullName || cp.contactName || '').trim();
            if (!name) return;
            const role = (cp.role || '').trim();
            const label = `${name}${role ? ` - ${role}` : ''} (Client)`;
            const key = label.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            items.push(label);
        });

        (internalDrafts || []).forEach(bp => {
            if (bp.pendingDelete) return;
            const name = (bp.userName || bp.fullName || '').trim();
            if (!name) return;
            const role = (bp.subtitle || '').trim();
            const label = `${name}${role ? ` - ${role}` : ''} (Internal)`;
            const key = label.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            items.push(label);
        });

        return items;
    }

    buildEmailNextSteps() {
        return this.buildEmailNextStepsFromDrafts(
            this.taskDrafts || [],
            this.visitDrafts || []
        );
    }

    buildEmailNextStepsFromDrafts(taskDrafts, visitDrafts) {
        const items = [];

        (taskDrafts || []).forEach(t => {
            if (t.pendingDelete) return;
            const subject = (t.subject || '').trim();
            if (!subject) return;
            const due = t.dueDate ? this.formatDateOnly(t.dueDate) : '';
            items.push(due ? `${subject} (${due})` : subject);
        });

        (visitDrafts || []).forEach(v => {
            if (v.pendingDelete) return;
            const name = (v.name || '').trim();
            if (!name) return;
            const start = v.startDatetime ? this.formatVisitDateForEmail(v.startDatetime) : '';
            const label = start ? `Visita: ${name} - ${start}` : `Visita: ${name}`;
            items.push(label);
        });

        return items;
    }

    normalizeContactTitleRole(value) {
        const raw = (value || '').trim();
        if (!raw) return '';
        if (this.contactTitleValueSet && this.contactTitleValueSet.has(raw)) return raw;
        if (this.contactTitleLabelToValue && this.contactTitleLabelToValue.has(raw)) {
            return this.contactTitleLabelToValue.get(raw);
        }
        return '';
    }

    normalizePicklistValue(value, valueSet, labelToValue) {
        const raw = (value || '').toString().trim();
        if (!raw) return '';
        if (!valueSet || valueSet.size === 0) return raw;
        if (valueSet.has(raw)) return raw;
        if (labelToValue && labelToValue.has(raw)) return labelToValue.get(raw);
        return '';
    }

    normalizeDurationMinutes(value) {
        if (value === null || value === undefined || value === '') return null;
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num)) return null;
        if (!this.durationValueSet || this.durationValueSet.size === 0) return num;
        const asString = String(Math.trunc(num));
        return this.durationValueSet.has(asString) ? Math.trunc(num) : null;
    }

    normalizeVisitDraft(draft) {
        if (!draft) return draft;
        const next = { ...draft };
        next.durationMinutes = this.normalizeDurationMinutes(next.durationMinutes);
        next.channelCode = this.normalizePicklistValue(next.channelCode, this.channelValueSet, this.channelLabelToValue);
        next.purposeTypeCode = this.normalizePicklistValue(next.purposeTypeCode, this.purposeValueSet, this.purposeLabelToValue);
        return next;
    }

    normalizeVisitPicklists() {
        if (this.currentVisitDraft) {
            this.currentVisitDraft = this.normalizeVisitDraft(this.currentVisitDraft);
        }
        if (this.visitDrafts && this.visitDrafts.length) {
            this.visitDrafts = this.visitDrafts.map(v => this.normalizeVisitDraft(v));
        }
    }

    async loadEmailContextForSend() {
        if (!this.currentUserInfo) {
            try {
                this.currentUserInfo = await getCurrentUserInfo();
                this.syncEmailManagerFromCurrentUser();
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Error loading current user info for email preview', e);
            }
        }

        const currentParticipants = this.buildEmailParticipants();
        const currentNextSteps = this.buildEmailNextSteps();
        const needsParticipants = currentParticipants.length === 0;
        const needsNextSteps = currentNextSteps.length === 0;

        if (!needsParticipants && !needsNextSteps) {
            return { participants: currentParticipants, nextSteps: currentNextSteps };
        }

        const visitId = this.activeVisitId;
        if (!visitId) {
            return { participants: currentParticipants, nextSteps: currentNextSteps };
        }

        const clientPromise = needsParticipants
            ? getVisitClientParticipants({ visitId })
            : Promise.resolve([]);
        const internalPromise = needsParticipants
            ? getVisitInternalParticipants({ visitId })
            : Promise.resolve([]);
        const tasksPromise = needsNextSteps
            ? getVisitTasks({ visitId })
            : Promise.resolve([]);

        try {
            const [clientRes, internalRes, tasksRes] = await Promise.all([
                clientPromise,
                internalPromise,
                tasksPromise
            ]);

            const participants = needsParticipants
                ? this.buildEmailParticipantsFromDrafts(
                    this.buildExistingClientParticipantDrafts(clientRes || []),
                    this.buildExistingInternalParticipantDrafts(internalRes || [])
                )
                : currentParticipants;

            const nextSteps = needsNextSteps
                ? this.buildEmailNextStepsFromDrafts(
                    this.buildExistingTaskDrafts(tasksRes || []),
                    []
                )
                : currentNextSteps;

            return { participants, nextSteps };
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error loading email context', e);
            return { participants: currentParticipants, nextSteps: currentNextSteps };
        }
    }

    buildVisitRecordUrl() {
        if (!this.activeVisitId) return '';
        try {
            if (typeof window !== 'undefined' && window.location && window.location.origin) {
                return `${window.location.origin}/lightning/r/Visit/${this.activeVisitId}/view`;
            }
        } catch (e) {
            // ignore
        }
        return '';
    }

    navigateToCurrentRecordPage() {
        const recordId = this.recordId || this.activeVisitId;
        const objectApiName = this.objectApiName || 'Visit';
        if (!recordId) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId,
                objectApiName,
                actionName: 'view'
            }
        });
    }

    async refreshRecordPage(recordIds = []) {
        const ids = Array.isArray(recordIds) ? recordIds : [recordIds];
        const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
        if (!uniqueIds.length) return;
        try {
            await notifyRecordUpdateAvailable(uniqueIds.map(recordId => ({ recordId })));
            this.dispatchEvent(new RefreshEvent());
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error refreshing record page', e);
        }
    }

    resetEmailState() {
        this.emailVisitLoaded = false;
        this.emailOwnerLoaded = false;
        this.emailOwnerId = null;
        this.emailManagerEmail = '';
        this.emailOwnerEmail = '';
        this.emailManagerName = '';
        this.emailManagerId = null;
        this.emailOwnerName = '';
        this.emailVisitInfo = null;
        this.emailVisitError = '';
        this.emailOwnerError = '';
        this.emailNavigating = false;
        this.emailPreviewOpen = false;
        this.emailPreview = {
            subject: '',
            bodyHtml: ''
        };
        this.emailRecipients = [];
        this.emailRecipientSearchTerm = '';
        this.emailRecipientSearchResults = [];
        this.emailRecipientSearchOpen = false;
        this.emailRecipientSearchLoading = false;
        this.emailRecipientSearchToken = 0;
        this.emailRecipientDropdownStyle = '';
        this.cancelRecipientDropdownPositionUpdate();
    }

    navigateToVisitRecord(visitId) {
        if (!visitId) return;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: visitId,
                objectApiName: 'Visit',
                actionName: 'view'
            }
        });
    }

    scrollToModal() {
        this.scrollBeforeModal = window.scrollY;

        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            const modalCmp = this.template.querySelector('c-lab-ai-visit-record-modal');
            if (!modalCmp) return;

            const modalContainer = modalCmp.getModalContainer();
            if (!modalContainer) return;

            modalContainer.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

        }, 50);
    }

    restoreScroll() {
        window.scrollTo({
            top: this.scrollBeforeModal,
            behavior: 'smooth'
        });
    }

    scrollToTop() {
        try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            // no-op
        }
    }

    async enrichMatchedContacts() {
        const ids = Array.from(
            new Set(
                this.clientParticipantDrafts
                    .filter(cp =>
                        cp.hasMatchedContact &&
                        (!cp.contactEmail || !cp.contactPhone || !cp.contactFirstName || !cp.contactLastName || !cp.role)
                    )
                    .map(cp => cp.contactId)
                    .filter(id => !!id)
            )
        );

        if (!ids.length) return;

        try {
            const basics = await getContactsBasicsByIds({ contactIds: ids });
            const byId = {};
            (basics || []).forEach(c => { byId[c.id] = c; });

            this.clientParticipantDrafts = this.clientParticipantDrafts.map(cp => {
                if (cp.hasMatchedContact && byId[cp.contactId]) {
                    const info = byId[cp.contactId];
                    const full = cp.fullName || `${info.firstName || ''} ${info.lastName || ''}`.trim();
                    return {
                        ...cp,
                        fullName: full,
                        contactFirstName: info.firstName || cp.contactFirstName,
                        contactLastName: info.lastName || cp.contactLastName,
                        contactEmail: info.email || cp.contactEmail,
                        contactPhone: info.phone || cp.contactPhone,
                        role: info.role || cp.role
                    };
                }
                return cp;
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error enriching matched contacts', e);
        }
    }

    applyModifiedFlags(mod) {
        if (!mod) return;
        const setFromArray = arr => new Set(arr || []);

        const mClients = setFromArray(mod.clients);
        const mInternal = setFromArray(mod.internal_participants);
        const mVisits = setFromArray(mod.visits);
        const mTasks = setFromArray(mod.tasks);
        const currentVisitModified = !!mod.current_visit;

        if (mClients.size) {
            this.clientParticipantDrafts = this.clientParticipantDrafts.map(cp => {
                if (cp.pendingDelete) return cp;
                const isExisting = !!cp.visitContactId || cp.isExisting === true;
                if (mClients.has(cp.id) && isExisting) {
                    return {
                        ...cp,
                        isExisting,
                        isModified: true,
                        showModified: true,
                        cardClass: cp.isValid
                            ? 'record-card record-card--modified'
                            : 'record-card record-card--invalid'
                    };
                }
                return { ...cp, isExisting };
            });
        }

        if (mInternal.size) {
            this.internalParticipantDrafts = this.internalParticipantDrafts.map(bp => {
                if (bp.pendingDelete) return bp;
                const isExisting = !!bp.visitManagementTeamId || bp.isExisting === true;
                if (mInternal.has(bp.id) && isExisting) {
                    return {
                        ...bp,
                        isExisting,
                        isModified: true,
                        showModified: true,
                        cardClass: bp.isValid
                            ? 'record-card record-card--modified'
                            : 'record-card record-card--invalid'
                    };
                }
                return { ...bp, isExisting };
            });
        }

        if (mVisits.size) {
            this.visitDrafts = this.visitDrafts.map(v => {
                if (mVisits.has(v.id) && v.isExisting) {
                    return {
                        ...v,
                        isModified: true,
                        cardClass: v.isValid
                            ? 'record-card record-card--modified'
                            : 'record-card record-card--invalid'
                    };
                }
                return v;
            });
        }

        if (mTasks.size) {
            this.taskDrafts = this.taskDrafts.map(t => {
                if (t.pendingDelete) return t;
                const isExisting = !!t.taskId || t.isExisting;
                if (mTasks.has(t.id) && isExisting) {
                    return {
                        ...t,
                        isExisting,
                        isModified: true,
                        showModified: true,
                        cardClass: t.isValid
                            ? 'record-card record-card--modified'
                            : 'record-card record-card--invalid'
                    };
                }
                return { ...t, isExisting };
            });
        }

        if (currentVisitModified && this.currentVisitDraft) {
            this.currentVisitDraft = {
                ...this.currentVisitDraft,
                isModified: true
            };
        }
    }

}