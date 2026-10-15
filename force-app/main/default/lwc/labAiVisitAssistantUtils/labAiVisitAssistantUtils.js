export const normalizeText = (s) =>
    (s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const taskSignature = (t) =>
    JSON.stringify({
        subject: normalizeText(t.subject),
        dueDate: normalizeText(t.dueDate),
        description: normalizeText(t.description)
    });

export const clientSignature = (cp) =>
    JSON.stringify({
        contactId: cp.contactId || '',
        visitContactId: cp.visitContactId || '',
        fullName: normalizeText(cp.fullName),
        role: normalizeText(cp.role),
        email: normalizeText(cp.email),
        phone: normalizeText(cp.phone)
    });

export const internalSignature = (bp) =>
    JSON.stringify({
        userId: bp.userId || '',
        visitManagementTeamId: bp.visitManagementTeamId || '',
        userName: normalizeText(bp.userName),
        subtitle: normalizeText(bp.subtitle),
        email: normalizeText(bp.email),
        phone: normalizeText(bp.phone)
    });

export const visitSignature = (v) =>
    JSON.stringify({
        visitId: v.visitId || '',
        name: normalizeText(v.name),
        startDatetime: normalizeText(v.startDatetime),
        durationMinutes: v.durationMinutes === null ? null : Number(v.durationMinutes),
        channelCode: normalizeText(v.channelCode),
        purposeTypeCode: normalizeText(v.purposeTypeCode),
        // comments: normalizeText(v.comments)
    });

export const currentVisitSignature = (v) =>
    JSON.stringify({
        name: normalizeText(v.name),
        startDatetime: normalizeText(v.startDatetime),
        durationMinutes: v.durationMinutes === null ? null : Number(v.durationMinutes),
        channelCode: normalizeText(v.channelCode),
        purposeTypeCode: normalizeText(v.purposeTypeCode)
    });

export const splitName = (name) => {
    const cleaned = (name || '').trim();
    if (!cleaned) return { firstName: '', lastName: '' };
    const parts = cleaned.split(' ');
    if (parts.length === 1) {
        return { firstName: '', lastName: parts[0] };
    }
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
};

export const generateDraftId = (prefix) => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
};

export const makeUniqueId = (prefix, desiredId, usedSet = new Set(), fallbackIndex = 0) => {
    let candidate = (desiredId || '').trim();
    if (!candidate) {
        candidate = `${prefix}_${fallbackIndex}`;
    }

    let guard = 0;
    while (usedSet.has(candidate) && guard < 5) {
        guard += 1;
        candidate = `${prefix}_${fallbackIndex}_${guard}`;
    }

    if (usedSet.has(candidate)) {
        candidate = generateDraftId(prefix);
    }

    usedSet.add(candidate);
    return candidate;
};

export const dedupeInternalParticipants = (drafts) => {
    const seen = {};
    const result = [];

    (drafts || []).forEach(bp => {
        if (bp.userId) {
            if (seen[bp.userId]) {
                const current = seen[bp.userId];
                const preferNew = bp.isExisting && !current.isExisting;
                if (preferNew) {
                    const idx = result.indexOf(current);
                    if (idx >= 0) {
                        result[idx] = bp;
                    }
                    seen[bp.userId] = bp;
                }
                return;
            }
            seen[bp.userId] = bp;
            result.push(bp);
        } else {
            result.push(bp);
        }
    });

    return result;
};

export const escapeHtml = (value) =>
    (value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const stripVariationSelectors = (value) =>
    String(value || '').replace(/[\uFE0E\uFE0F]/g, '');

const LANGUAGE_CODES = {
    ES: 'ES',
    EN: 'EN'
};

export const normalizeLanguageCode = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw === 'ES' || raw === 'ES-ES' || raw === 'ES_ES' || raw === 'SPANISH') return LANGUAGE_CODES.ES;
    if (raw === 'EN' || raw === 'EN-US' || raw === 'EN_US' || raw === 'EN-GB' || raw === 'EN_GB' || raw === 'ENGLISH') {
        return LANGUAGE_CODES.EN;
    }
    return '';
};

const stripHtmlTags = (value) => String(value || '').replace(/<[^>]*>/g, ' ');

const normalizeForLanguageDetection = (value) => {
    const base = stripHtmlTags(value).toLowerCase();
    if (!base.normalize) return base;
    return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const SPANISH_STOPWORDS = new Set([
    'el', 'la', 'los', 'las', 'de', 'que', 'y', 'a', 'en', 'un', 'una', 'para', 'por',
    'con', 'del', 'al', 'se', 'es', 'son', 'fue', 'fueron', 'esta', 'estas', 'este', 'estos',
    'como', 'tambien', 'porque', 'pero', 'si', 'no', 'hay', 'hemos', 'estamos', 'sobre', 'entre'
]);

const ENGLISH_STOPWORDS = new Set([
    'the', 'and', 'of', 'to', 'in', 'for', 'with', 'on', 'we', 'you', 'is', 'are', 'was', 'were',
    'have', 'has', 'this', 'that', 'these', 'those', 'from', 'as', 'at', 'by', 'be', 'been', 'it',
    'its', 'they', 'their', 'our', 'your', 'will', 'would', 'can', 'could', 'should'
]);

export const inferDominantLanguage = (value) => {
    const normalized = normalizeForLanguageDetection(value);
    const tokens = normalized.match(/[a-z]+/g) || [];
    if (!tokens.length) return '';

    let es = 0;
    let en = 0;
    tokens.forEach(token => {
        if (SPANISH_STOPWORDS.has(token)) es += 1;
        if (ENGLISH_STOPWORDS.has(token)) en += 1;
    });

    const minHits = 2;
    if (es < minHits && en < minHits) return '';
    return es >= en ? LANGUAGE_CODES.ES : LANGUAGE_CODES.EN;
};

export const resolveEmailLanguage = ({ language, transcript, summary } = {}) => {
    const normalized = normalizeLanguageCode(language);
    if (normalized) return normalized;
    const combined = [transcript, summary].filter(Boolean).join(' ');
    const inferred = inferDominantLanguage(combined);
    return inferred || LANGUAGE_CODES.ES;
};

const summaryLooksLikeHtml = (value) => /<\/?[a-z][\s\S]*>/i.test(value || '');

const sanitizeSummaryHtml = (value) => {
    let safe = String(value || '');
    if (!safe) return '';

    safe = safe.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    safe = safe.replace(/<!--[\s\S]*?-->/g, '');
    safe = safe.replace(/<(?!\/?(?:p|ul|ol|li|b|strong|i|em|u|br)\b)[^>]*>/gi, '');
    safe = safe.replace(/<(p|ul|ol|li|b|strong|i|em|u)\b[^>]*>/gi, '<$1>');
    safe = safe.replace(/<br\b[^>]*>/gi, '<br/>');

    return safe;
};

export const normalizeSummaryForEmailHtml = (value) => {
    if (!value) return '';
    const raw = String(value);
    const looksLikeHtml = summaryLooksLikeHtml(raw);
    const base = looksLikeHtml
        ? sanitizeSummaryHtml(raw)
        : escapeHtml(raw);
    if (!base) return '';

    const withLineBreaks = looksLikeHtml
        ? base
        : base.replace(/\r\n|\n/g, '<br/>');

    return `<div style="font-family: Arial, 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji', sans-serif;">${withLineBreaks}</div>`;
};

export const buildVisitSummarySubject = ({ name, accountName, language }) => {
    const resolvedLanguage = normalizeLanguageCode(language) || LANGUAGE_CODES.ES;
    const subjectName = name || (resolvedLanguage === LANGUAGE_CODES.EN ? 'Visit' : 'Visita');
    const prefix = resolvedLanguage === LANGUAGE_CODES.EN ? 'Visit summary' : 'Resumen visita';
    return accountName
        ? `${prefix}: ${subjectName} - ${accountName}`
        : `${prefix}: ${subjectName}`;
};

const EMAIL_COPY = {
    [LANGUAGE_CODES.ES]: {
        greeting: '<p>Hola,</p>',
        closing: '<p>Gracias.</p>',
        summaryLabel: 'Resumen',
        dateLabel: 'Fecha',
        participantsLabel: 'Participantes',
        nextStepsLabel: 'Próximos pasos',
        openVisitLabel: 'Abrir visita en Salesforce',
        noSummaryLabel: 'No hay resumen disponible.',
        headerWithAccount: (name, account) =>
            `<p>Comparto el resumen de la visita <b>${name}</b> con <b>${account}</b>.</p>`,
        headerWithoutAccount: (name) =>
            `<p>Comparto el resumen de la visita <b>${name}</b>.</p>`
    },
    [LANGUAGE_CODES.EN]: {
        greeting: '<p>Hello,</p>',
        closing: '<p>Thank you.</p>',
        summaryLabel: 'Summary',
        dateLabel: 'Date',
        participantsLabel: 'Participants',
        nextStepsLabel: 'Next steps',
        openVisitLabel: 'Open visit in Salesforce',
        noSummaryLabel: 'No summary available.',
        headerWithAccount: (name, account) =>
            `<p>Sharing the summary of the visit <b>${name}</b> with <b>${account}</b>.</p>`,
        headerWithoutAccount: (name) =>
            `<p>Sharing the summary of the visit <b>${name}</b>.</p>`
    }
};

const getEmailCopy = (language) => EMAIL_COPY[language] || EMAIL_COPY[LANGUAGE_CODES.ES];

export const buildVisitSummaryBody = ({
    name,
    accountName,
    summary,
    startLabel,
    visitUrl,
    participants = [],
    nextSteps = [],
    language
}) => {
    const resolvedLanguage = normalizeLanguageCode(language) || LANGUAGE_CODES.ES;
    const copy = getEmailCopy(resolvedLanguage);
    const safeName = escapeHtml(name);
    const safeAccount = escapeHtml(accountName);
    const safeStart = escapeHtml(startLabel);
    const safeUrl = escapeHtml(visitUrl);
    const header = safeAccount
        ? copy.headerWithAccount(safeName, safeAccount)
        : copy.headerWithoutAccount(safeName);

    const startLine = safeStart
        ? `<p><b>${copy.dateLabel}:</b> ${safeStart}</p>`
        : '';

    const normalizedSummary = normalizeSummaryForEmailHtml(summary);
    const summaryBlock = normalizedSummary
        ? normalizedSummary
        : `<p><i>${copy.noSummaryLabel}</i></p>`;

    const linkLine = safeUrl
        ? `<p><a href="${safeUrl}">${copy.openVisitLabel}</a></p>`
        : '';

    const participantItems = (participants || [])
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
    const participantsBlock = participantItems
        ? `<p><b>${copy.participantsLabel}:</b></p><ul>${participantItems}</ul>`
        : '';

    const nextStepItems = (nextSteps || [])
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
    const nextStepsBlock = nextStepItems
        ? `<p><b>${copy.nextStepsLabel}:</b></p><ul>${nextStepItems}</ul>`
        : '';

    const bodyContent = [
        copy.greeting,
        header,
        startLine,
        participantsBlock,
        `<p><b>${copy.summaryLabel}:</b></p>`,
        summaryBlock,
        nextStepsBlock,
        linkLine,
        copy.closing
    ].filter(Boolean).join('');

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${bodyContent}</body></html>`;
};