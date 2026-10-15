import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import searchEmailRecipients from '@salesforce/apex/LAB_VisitAI_Controller.searchEmailRecipients';

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

export default class LabAiRecipientLookup extends LightningElement {
    @api accountId;
    @api disabled = false;

    @track recipients = [];
    @track searchTerm = '';
    @track searchResults = [];
    @track searchOpen = false;
    @track searchLoading = false;
    @track dropdownStyle = '';
    searchToken = 0;
    dropdownRaf = null;

    @api
    set value(recipients) {
        this.recipients = Array.isArray(recipients) ? recipients : [];
    }
    get value() {
        return this.recipients;
    }

    get hasRecipients() {
        return (this.recipients || []).length > 0;
    }

    get showRecipientSearchDropdown() {
        return this.searchOpen && (
            this.searchLoading ||
            this.showRecipientSearchResults ||
            this.showManualRecipientOption ||
            this.showRecipientNoResults
        );
    }

    get showRecipientSearchResults() {
        return (this.searchResults || []).length > 0;
    }

    get showRecipientNoResults() {
        const term = (this.searchTerm || '').trim();
        return !!term
            && !this.searchLoading
            && !this.showRecipientSearchResults
            && !this.showManualRecipientOption;
    }

    get manualRecipientOptionLabel() {
        const emails = this.getNewManualEmailsFromSearchTerm();
        if (emails.length !== 1) return '';
        return emails[0];
    }

    get showManualRecipientOption() {
        return !!this.manualRecipientOptionLabel;
    }

    handleSearchInput(event) {
        const value = event && (event.detail && event.detail.value !== undefined)
            ? event.detail.value
            : (event && event.target ? event.target.value : '');
        this.searchTerm = value;
        const term = (value || '').trim();
        if (!term) {
            this.clearSearch();
            return;
        }

        this.searchOpen = true;
        this.queueDropdownPositionUpdate();
        if (term.length < 2) {
            this.searchResults = [];
            this.searchLoading = false;
            return;
        }

        this.searchRecipients(term);
    }

    handleSearchKeydown(event) {
        if (!event) return;
        if (event.key === 'Enter' || event.key === ';' || event.key === ',') {
            event.preventDefault();
        }
        if (event.key === 'Escape') {
            this.searchOpen = false;
        }
    }

    handleSearchKeyup(event) {
        if (!event) return;
        const value = (event.detail && event.detail.value !== undefined)
            ? event.detail.value
            : (event.target ? event.target.value : '');
        if (value !== this.searchTerm) {
            this.handleSearchInput(event);
        }
        if (event.key === 'Enter' || event.key === ';' || event.key === ',') {
            this.addManualRecipientsFromSearchTerm();
        }
    }

    handleSearchFocus() {
        const term = (this.searchTerm || '').trim();
        if (term.length >= 2 || this.showRecipientSearchResults) {
            this.searchOpen = true;
            this.queueDropdownPositionUpdate();
        }
    }

    handleSearchSelect(event) {
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
        this.clearSearch();
    }

    handleManualAddClick() {
        this.addManualRecipientsFromSearchTerm();
    }

    handleRecipientRemove(event) {
        const key = event && event.currentTarget && event.currentTarget.dataset
            ? event.currentTarget.dataset.key
            : null;
        if (!key) return;
        this.recipients = (this.recipients || []).filter(r => r.key !== key);
        this.dispatchRecipientsChange();
    }

    parseEmailAddresses(raw) {
        return String(raw || '')
            .split(/[,;]+/)
            .flatMap(part => part.trim().split(/\s+/))
            .map(part => part.trim())
            .filter(Boolean);
    }

    extractEmailsFromSearchTerm() {
        const raw = (this.searchTerm || '').trim();
        if (!raw) return [];
        return this.parseEmailAddresses(raw);
    }

    getNewManualEmailsFromSearchTerm() {
        const parsed = this.extractEmailsFromSearchTerm();
        if (!parsed.length) return [];
        const existing = new Set(
            (this.recipients || [])
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
        this.clearSearch();
        return recipients.length;
    }

    addRecipients(recipients) {
        const incoming = Array.isArray(recipients) ? recipients : [recipients];
        if (!incoming.length) return;
        const existing = new Set(
            (this.recipients || [])
                .map(r => r.normalizedEmail)
                .filter(Boolean)
        );
        const deduped = [...(this.recipients || [])];
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

        this.recipients = deduped;
        this.dispatchRecipientsChange();

        if (duplicates > 0) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Recipient already added',
                    message: 'Duplicate recipients were ignored.',
                    variant: 'info'
                })
            );
        }
    }

    clearSearch() {
        this.searchTerm = '';
        this.searchResults = [];
        this.searchOpen = false;
        this.searchLoading = false;
        this.dropdownStyle = '';
        this.cancelDropdownPositionUpdate();
    }

    async searchRecipients(term) {
        const token = ++this.searchToken;
        this.searchLoading = true;
        try {
            const results = await searchEmailRecipients({
                searchTerm: term,
                accountId: this.accountId
            });
            if (token !== this.searchToken) return;
            this.searchResults = (results || []).map(r => this.normalizeRecipientSearchResult(r));
            this.queueDropdownPositionUpdate();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error searching recipients', e);
            if (token === this.searchToken) {
                this.searchResults = [];
            }
        } finally {
            if (token === this.searchToken) {
                this.searchLoading = false;
            }
        }
    }

    renderedCallback() {
        if (this.showRecipientSearchDropdown) {
            this.queueDropdownPositionUpdate();
        }
    }

    queueDropdownPositionUpdate() {
        if (this.dropdownRaf) {
            cancelAnimationFrame(this.dropdownRaf);
        }
        this.dropdownRaf = requestAnimationFrame(() => {
            this.dropdownRaf = null;
            this.updateDropdownPosition();
        });
    }

    cancelDropdownPositionUpdate() {
        if (this.dropdownRaf) {
            cancelAnimationFrame(this.dropdownRaf);
            this.dropdownRaf = null;
        }
    }

    updateDropdownPosition() {
        this.dropdownStyle = '';
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
        } else if (effectiveType === EMAIL_RECIPIENT_TYPES.MANUAL && !this.isValidEmail(cleanedEmail)) {
            isValid = false;
            validationMessage = 'Invalid email address.';
        }

        const label = name
            ? `${name} <${cleanedEmail || 'no email'}>`
            : (cleanedEmail || '(no email)');

        const displayName = name || cleanedEmail || '';
        const tooltip = cleanedEmail || label;
        return {
            key: `${effectiveType}_${recordId || normalizedEmail || Math.random().toString(36).slice(2, 8)}`,
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
        const value = String(email || '').trim();
        const at = value.indexOf('@');
        if (at <= 0) return false;
        const dot = value.lastIndexOf('.');
        return dot > at + 1 && dot < value.length - 1;
    }

    dispatchRecipientsChange() {
        this.dispatchEvent(new CustomEvent('recipientschange', {
            detail: {
                recipients: this.recipients
            }
        }));
    }
}