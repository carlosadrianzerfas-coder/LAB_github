public with sharing class LAB_VisitAI_Service {
    
    private static final String PROMPT_TEMPLATE_API_NAME = 'AI_Visit_Assistant_Template';
    private static final Boolean DEBUG_MODE = true;

    public enum ApplyMode { ALL, VISITS, CLIENTS, INTERNAL, TASKS }

    private static ApplyMode parseApplyMode(String raw) {
        if (String.isBlank(raw)) return ApplyMode.ALL;
        String norm = raw.trim().toUpperCase();
        if (norm == 'VISITS') return ApplyMode.VISITS;
        if (norm == 'CLIENTS') return ApplyMode.CLIENTS;
        if (norm == 'INTERNAL') return ApplyMode.INTERNAL;
        if (norm == 'TASKS') return ApplyMode.TASKS;
        return ApplyMode.ALL;
    }

    private static Boolean includesVisits(ApplyMode mode) {
        return mode == null || mode == ApplyMode.ALL || mode == ApplyMode.VISITS;
    }
    private static Boolean includesClients(ApplyMode mode) {
        return mode == null || mode == ApplyMode.ALL || mode == ApplyMode.CLIENTS;
    }
    private static Boolean includesInternal(ApplyMode mode) {
        return mode == null || mode == ApplyMode.ALL || mode == ApplyMode.INTERNAL;
    }
    private static Boolean includesTasks(ApplyMode mode) {
        return mode == null || mode == ApplyMode.ALL || mode == ApplyMode.TASKS;
    }

    public class ApplyResult {
        @AuraEnabled public Id followUpVisitId; // legacy: first visit id
        @AuraEnabled public String visitClientReferenceId; // legacy: first client reference
        @AuraEnabled public List<VisitResult> visitResults;
        @AuraEnabled public List<ClientParticipantResult> clientParticipants;
        @AuraEnabled public List<InternalParticipantResult> internalParticipants;
        @AuraEnabled public List<TaskResult> tasks;

        public ApplyResult() {
            visitResults       = new List<VisitResult>();
            clientParticipants = new List<ClientParticipantResult>();
            internalParticipants   = new List<InternalParticipantResult>();
            tasks              = new List<TaskResult>();
        }
    }

    public class ClientParticipantResult {
        @AuraEnabled public String clientReferenceId;
        @AuraEnabled public Id contactId;
        @AuraEnabled public Id visitContactId;
    }

    public class InternalParticipantResult {
        @AuraEnabled public String clientReferenceId;
        @AuraEnabled public Id visitManagementTeamId;
    }

    public class TaskResult {
        @AuraEnabled public String clientReferenceId;
        @AuraEnabled public Id taskId;
    }

    public class VisitResult {
        @AuraEnabled public String clientReferenceId;
        @AuraEnabled public Id visitId;
    }

    // ============================================================
    // 1) DIRECT CALL TO PROMPT TEMPLATE (WITHOUT FLOW)
    // ============================================================
    public static String callPromptTemplate(
        Id visitId,
        Id accountId,
        String transcript
    ) {
        if (String.isBlank(transcript)) {
            throw new AuraHandledException('The transcript cannot be empty.');
        }

        String contextMode;
        Id resolvedAccountId = accountId;

        if (visitId != null) {
            contextMode = 'VISIT';

            if (resolvedAccountId == null) {
                Visit v = [
                    SELECT AccountId
                    FROM Visit
                    WHERE Id = :visitId
                    LIMIT 1
                ];
                resolvedAccountId = v.AccountId;
            }
        } else {
            contextMode = 'ACCOUNT';
        }

        if (resolvedAccountId == null) {
            throw new AuraHandledException('Unable to determine the customer (Account).');
        }

        String visitContext   = buildVisitContext(visitId);
        String accountContext = buildAccountContext(resolvedAccountId);

        ConnectApi.EinsteinPromptTemplateGenerationsInput execInput =
            new ConnectApi.EinsteinPromptTemplateGenerationsInput();

        Map<String, ConnectApi.WrappedValue> inputParams =
            new Map<String, ConnectApi.WrappedValue>();

        Map<String, Object> transcriptPayload =
            LAB_VisitAI_TranscriptUtil.buildTranscriptPayload(transcript);
        ConnectApi.WrappedValue transcriptW = new ConnectApi.WrappedValue();
        transcriptW.value = JSON.serialize(transcriptPayload);
        inputParams.put('Input:Visit_Transcript', transcriptW);

        ConnectApi.WrappedValue contextModeW = new ConnectApi.WrappedValue();
        contextModeW.value = contextMode;
        inputParams.put('Input:Context_Mode', contextModeW);

        ConnectApi.WrappedValue visitCtxW = new ConnectApi.WrappedValue();
        visitCtxW.value = visitContext;
        inputParams.put('Input:Visit_Context', visitCtxW);

        ConnectApi.WrappedValue accountCtxW = new ConnectApi.WrappedValue();
        accountCtxW.value = accountContext;
        inputParams.put('Input:Account_Context', accountCtxW);

        execInput.inputParams = inputParams;
        execInput.isPreview   = false;

        execInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
        execInput.additionalConfig.numGenerations   = 1;
        execInput.additionalConfig.applicationName = 'PromptBuilderPreview';

        // Debug
        Long startTime;
        if (DEBUG_MODE) {
            System.debug('⚡[AI] ---- PROMPT TEMPLATE CALL START ----');
            System.debug('⚡[AI] Template Name: ' + PROMPT_TEMPLATE_API_NAME);
            System.debug('⚡[AI] Application Name: ' + execInput.additionalConfig.applicationName);
            System.debug('⚡[AI] Transcript:\n' + transcript);
            System.debug('⚡[AI] Visit Context:\n' + visitContext);
            System.debug('⚡[AI] Account Context:\n' + accountContext);
            System.debug('⚡[AI] Input Params:');
            for (String key : execInput.inputParams.keySet()) {
                System.debug('    • ' + key + ' = ' + execInput.inputParams.get(key).value);
            }
            System.debug('⚡[AI] AdditionalConfig:');
            System.debug('    • numGenerations = ' + execInput.additionalConfig.numGenerations);
            System.debug('    • applicationName = ' + execInput.additionalConfig.applicationName);
            startTime = System.currentTimeMillis();
        }

        ConnectApi.EinsteinPromptTemplateGenerationsRepresentation generations =
            ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
                PROMPT_TEMPLATE_API_NAME,
                execInput
            );

        if (DEBUG_MODE) {
            Long total = System.currentTimeMillis() - startTime;
            System.debug('⚡[AI] ---- PROMPT TEMPLATE RESPONSE ----');
            System.debug('⚡[AI] Execution time (ms): ' + total);

            if (generations != null && !generations.generations.isEmpty()) {
                System.debug('⚡[AI] Raw LLM Output:\n' + generations.generations[0].text);
            } else {
                System.debug('⚠️[AI] No generations returned.');
            }
        }

        if (generations == null || generations.generations.isEmpty()) {
            throw new AuraHandledException('The Prompt Template did not return a response.');
        }

        return generations.generations[0].text;
    }

    // ============================================================
    // 2) APPLY AI RESULTS (Optimized to reduce unnecessary DML)
    // ============================================================
    public static ApplyResult applyVisitResult(Id visitId, String jsonResult) {
        return applyVisitResult(visitId, jsonResult, ApplyMode.ALL);
    }

    public static ApplyResult applyVisitResult(Id visitId, String jsonResult, ApplyMode mode) {
        if (visitId == null) {
            throw new AuraHandledException('visitId is required.');
        }
        if (String.isBlank(jsonResult)) {
            throw new AuraHandledException('The JSON result is empty.');
        }
        if (mode == null) {
            mode = ApplyMode.ALL;
        }

        // ============================================================
        // Read untyped JSON once (deleted block + optional _modified)
        // ============================================================
        Map<String, Object> rawJson =
            (Map<String, Object>) JSON.deserializeUntyped(jsonResult);

        Map<String, Object> deletedBlock =
            rawJson != null && rawJson.containsKey('deleted')
                ? (Map<String, Object>) rawJson.get('deleted')
                : new Map<String, Object>();

        Set<Id> deletedVisitContactIds =
            toIdSet((List<Object>) deletedBlock.get('visit_contact_ids'));

        Set<Id> deletedVisitManagementTeamIds =
            toIdSet((List<Object>) deletedBlock.get('visit_management_team_ids'));

        Set<Id> deletedTaskIds =
            toIdSet((List<Object>) deletedBlock.get('task_ids'));

        // Optional: _modified block (may not be present during Apply, but we support it anyway)
        Map<String, Object> modifiedBlock =
            rawJson != null && rawJson.containsKey('_modified')
                ? (Map<String, Object>) rawJson.get('_modified')
                : null;

        Set<String> modifiedTasks = toStringSet(modifiedBlock != null ? (List<Object>) modifiedBlock.get('tasks') : null);
        Set<String> modifiedInternal = toStringSet(modifiedBlock != null ? (List<Object>) modifiedBlock.get('internal_participants')  : null);
        Set<String> modifiedVisits= toStringSet(modifiedBlock != null ? (List<Object>) modifiedBlock.get('visits') : null);

        // ============================================================
        // Execute deletes with stubs (0 SOQL) — ONLY on Apply
        // ============================================================
        if (includesClients(mode)) {
            deleteVisitContactsByIds(deletedVisitContactIds);
        }
        if (includesInternal(mode)) {
            deleteVisitManagementTeamsByIds(deletedVisitManagementTeamIds);
        }
        if (includesTasks(mode)) {
            deleteTasksByIds(deletedTaskIds);
        }

        // ============================================================
        // Deserialize typed DTO
        // ============================================================
        LAB_VisitAI_DTO.Root root;
        try {
            root = (LAB_VisitAI_DTO.Root) JSON.deserialize(jsonResult, LAB_VisitAI_DTO.Root.class);
        } catch (Exception e) {
            throw new AuraHandledException('Invalid JSON returned by AI: ' + e.getMessage());
        }

        ApplyResult result = new ApplyResult();

        // Load visit (we will update only if needed)
        
        Visit v = [
            SELECT Id,
                   LAB_Name__c,
                   AccountId,
                   LAB_Summary__c,
                   PlannedVisitStartTime,
                   LAB_Duration__c,
                   LAB_Channel__c,
                    LAB_purpose_type__c
            FROM Visit
            WHERE Id = :visitId
            LIMIT 1
        ];
        Id accountId = v.AccountId;
        Id followUpId;

        // ============================================================
        // VISITS – single DML (upsert) for current visit details + future visits
        // - We trust the client _modified list to decide which existing visits to update.
        // - New visits are always inserted.
        // ============================================================
        if (includesVisits(mode)) {
        List<Visit> visitsForUpsert = new List<Visit>();
        List<Integer> followUpIndexInUpsert = new List<Integer>();
        List<LAB_VisitAI_DTO.VisitDTO> followUpDtosForResult = new List<LAB_VisitAI_DTO.VisitDTO>();

        // 1) Current visit updates (summary + visit details)
        Boolean hasCurrentUpdate = false;
        Visit currentUpdate = new Visit(Id = visitId);

        if (!String.isBlank(root.feedback_richtext) && root.feedback_richtext != v.LAB_Summary__c) {
            currentUpdate.LAB_Summary__c = root.feedback_richtext;
            hasCurrentUpdate = true;
        }

        if (root.visit != null) {
            Boolean isCurrentPayload = true;
            Id payloadVisitId = safeId(root.visit.visit_id);
            if (payloadVisitId != null && payloadVisitId != visitId) {
                isCurrentPayload = false;
            }
            if (payloadVisitId == null && !String.isBlank(root.visit.reference_id) &&
                root.visit.reference_id != 'current_visit') {
                isCurrentPayload = false;
            }

            if (!isCurrentPayload) {
                // Avoid overwriting current visit with legacy follow-up payloads
            } else {
            // Name
            if (!String.isBlank(root.visit.visit_name) && root.visit.visit_name != v.LAB_Name__c) {
                currentUpdate.LAB_Name__c = root.visit.visit_name;
                hasCurrentUpdate = true;
            }

            // Start datetime
            if (!String.isBlank(root.visit.start_datetime)) {
                try {
                    Datetime desiredStart = Datetime.valueOf(root.visit.start_datetime);
                    if (String.valueOf(desiredStart) != String.valueOf(v.PlannedVisitStartTime)) {
                        currentUpdate.PlannedVisitStartTime = desiredStart;
                        hasCurrentUpdate = true;
                    }
                } catch (Exception ignore) {}
            }

            // Duration
            if (root.visit.duration_minutes != null) {
                String desiredDuration = String.valueOf(root.visit.duration_minutes);
                if (String.valueOf(v.LAB_Duration__c) != desiredDuration) {
                    currentUpdate.LAB_Duration__c = desiredDuration;
                    hasCurrentUpdate = true;
                }
            }

            // Channel / Purpose
            if (!String.isBlank(root.visit.channel_code) && root.visit.channel_code != v.LAB_Channel__c) {
                try { currentUpdate.LAB_Channel__c = root.visit.channel_code; } catch (Exception ignore) {}
                hasCurrentUpdate = true;
            }
            if (!String.isBlank(root.visit.purpose_type_code) && root.visit.purpose_type_code != v.LAB_purpose_type__c) {
                try { currentUpdate.LAB_purpose_type__c = root.visit.purpose_type_code; } catch (Exception ignore) {}
                hasCurrentUpdate = true;
            }
            }
        }

        if (hasCurrentUpdate) {
            visitsForUpsert.add(currentUpdate);
        }

        // 2) Follow-up visits (supports multiple)
        List<LAB_VisitAI_DTO.VisitDTO> visitsToProcess = new List<LAB_VisitAI_DTO.VisitDTO>();
        if (root.future_visits != null && !root.future_visits.isEmpty()) {
            visitsToProcess.addAll(root.future_visits);
        }
        if (visitsToProcess.isEmpty() && root.visit != null) {
            Id payloadVisitId = safeId(root.visit.visit_id);
            Boolean isLegacyFollowUp = (payloadVisitId == null || payloadVisitId != visitId) &&
                (String.isBlank(root.visit.reference_id) || root.visit.reference_id != 'current_visit');
            if (isLegacyFollowUp) {
                visitsToProcess.add(root.visit);
            }
        }

        for (LAB_VisitAI_DTO.VisitDTO vDto : visitsToProcess) {
            if (vDto == null) continue;

            Boolean hasContent =
                !String.isBlank(vDto.visit_id) ||
                !String.isBlank(vDto.visit_name) ||
                !String.isBlank(vDto.start_datetime) ||
                vDto.duration_minutes != null ||
                !String.isBlank(vDto.channel_code) ||
                !String.isBlank(vDto.purpose_type_code);

            if (!hasContent) continue;

            Id targetVisitId = safeId(vDto.visit_id);

            // Defensive: never treat the current visit as a follow-up visit in this block
            if (targetVisitId != null && targetVisitId == visitId) {
                continue;
            }

            // If the client sent _modified and this existing record is NOT modified, avoid any DML.
            if (targetVisitId != null && modifiedBlock != null && !modifiedVisits.isEmpty() &&
                !modifiedVisits.contains(vDto.reference_id)) {

                VisitResult vr = new VisitResult();
                vr.clientReferenceId = vDto.reference_id;
                vr.visitId = targetVisitId;
                result.visitResults.add(vr);

                if (followUpId == null) {
                    followUpId = targetVisitId;
                    result.visitClientReferenceId = vDto.reference_id;
                }
                continue;
            }

            Visit newV = (targetVisitId != null)
                ? new Visit(Id = targetVisitId)
                : new Visit();

            newV.AccountId = accountId;
            if (targetVisitId == null) newV.PlaceId = '131KY000000MQxmYAG';

            // Name
            if (!String.isBlank(vDto.visit_name)) {
                newV.LAB_Name__c = vDto.visit_name;
            } else {
                newV.LAB_Name__c = 'Seguimiento ' + v.LAB_Name__c;
            }

            // Start datetime
            if (!String.isBlank(vDto.start_datetime)) {
                try { newV.PlannedVisitStartTime = Datetime.valueOf(vDto.start_datetime); } catch (Exception ignore) {}
            }

            // Duration (stored as String in the model)
            if (vDto.duration_minutes != null) {
                try { newV.LAB_Duration__c = String.valueOf(vDto.duration_minutes); } catch (Exception ignore) {}
            }

            // Channel / purpose / other
            if (!String.isBlank(vDto.channel_code)) {
                try { newV.LAB_Channel__c = vDto.channel_code; } catch (Exception ignore) {}
            }
            if (!String.isBlank(vDto.purpose_type_code)) {
                try { newV.LAB_purpose_type__c = vDto.purpose_type_code; } catch (Exception ignore) {}
            }

            followUpIndexInUpsert.add(visitsForUpsert.size());
            followUpDtosForResult.add(vDto);
            visitsForUpsert.add(newV);
        }

        if (!visitsForUpsert.isEmpty()) {
            upsert visitsForUpsert;

            // Build result mapping only for follow-up visits
            for (Integer i = 0; i < followUpIndexInUpsert.size(); i++) {
                Integer idxInUpsert = followUpIndexInUpsert[i];
                LAB_VisitAI_DTO.VisitDTO dto = followUpDtosForResult[i];
                Visit savedV = visitsForUpsert[idxInUpsert];

                VisitResult vr = new VisitResult();
                vr.clientReferenceId = dto.reference_id;
                vr.visitId = savedV.Id;
                result.visitResults.add(vr);

                if (followUpId == null) {
                    followUpId = savedV.Id;
                    result.visitClientReferenceId = dto.reference_id;
                }
            }
        }

        }
        result.followUpVisitId = followUpId;


        // ==========================
        // CLIENT PARTICIPANTS (mostly inserts; already minimal DML)
        // ==========================
        if (includesClients(mode) && root.client_participants != null && !root.client_participants.isEmpty()) {

            // Existing visit contacts in the visit (excluding deleted)
            Map<Id, VisitedParty> existingVisitContactsByContactId = new Map<Id, VisitedParty>();
            Map<Id, VisitedParty> existingVisitContactsById = new Map<Id, VisitedParty>();

            for (VisitedParty vcExisting : [
                SELECT Id, ContactId
                FROM VisitedParty
                WHERE VisitId = :visitId
                  AND Id NOT IN :deletedVisitContactIds
            ]) {
                if (vcExisting.ContactId != null) {
                    existingVisitContactsByContactId.put(vcExisting.ContactId, vcExisting);
                }
                existingVisitContactsById.put(vcExisting.Id, vcExisting);
            }

            // Determine if we need RecordType lookup (only if any new contact lacks record_type_id)
            Boolean needsDesktopRtLookup = false;
            for (LAB_VisitAI_DTO.ClientParticipantDTO cpPeek : root.client_participants) {
                if (cpPeek == null) continue;
                Boolean needsNewContact = (cpPeek.needs_new_contact == true);
                if (!needsNewContact && (String.isBlank(cpPeek.contact_id) && String.isBlank(cpPeek.matched_contact_id))) {
                    // still could create a new contact from full_name/email
                    needsNewContact = true;
                }
                if (needsNewContact) {
                    if (cpPeek.new_contact == null || String.isBlank(cpPeek.new_contact.record_type_id)) {
                        needsDesktopRtLookup = true;
                        break;
                    }
                }
            }
            Id desktopContactRtId = needsDesktopRtLookup ? getDesktopContactRecordTypeId() : null;

            List<Contact> contactsToInsert = new List<Contact>();
            List<Integer> contactResultIdx = new List<Integer>();

            List<VisitedParty> visitContactsToInsert = new List<VisitedParty>();
            List<Integer> visitContactResultIdx = new List<Integer>();
            List<Integer> visitContactContactRefIdx = new List<Integer>(); // index in contactsToInsert or -1

            for (LAB_VisitAI_DTO.ClientParticipantDTO cp : root.client_participants) {
                if (cp == null) continue;

                ClientParticipantResult cpRes = new ClientParticipantResult();
                cpRes.clientReferenceId = cp.reference_id;
                result.clientParticipants.add(cpRes);

                Boolean needsNewContact = (cp.needs_new_contact == true);
                String matchedContactId = String.isBlank(cp.matched_contact_id) ? null : cp.matched_contact_id;

                Id visitContactId = safeId(cp.visit_contact_id);
                if (visitContactId != null) {
                    cpRes.visitContactId = visitContactId;
                    if (cpRes.contactId == null && existingVisitContactsById.containsKey(visitContactId)) {
                        cpRes.contactId = existingVisitContactsById.get(visitContactId).ContactId;
                    }
                    continue;
                }

                Id contactId = safeId(!String.isBlank(cp.contact_id) ? cp.contact_id : matchedContactId);
                if (contactId != null) {
                    cpRes.contactId = contactId;

                    // If already linked to visit, avoid any DML
                    if (existingVisitContactsByContactId.containsKey(contactId)) {
                        cpRes.visitContactId = existingVisitContactsByContactId.get(contactId).Id;
                        continue;
                    }

                    // Create VisitedParty link
                    VisitedParty vc = new VisitedParty();
                    vc.VisitId   = visitId;
                    vc.ContactId = contactId;
                    visitContactsToInsert.add(vc);
                    visitContactResultIdx.add(result.clientParticipants.size() - 1);
                    visitContactContactRefIdx.add(-1);
                    continue;
                }

                // New Contact creation
                if (needsNewContact || (!String.isBlank(cp.full_name) || !String.isBlank(cp.email))) {
                    String firstName  = null;
                    String lastName   = null;
                    String email      = null;
                    String phone      = null;
                    String titleRole  = null;

                    if (cp.new_contact != null) {
                        firstName = cp.new_contact.first_name;
                        lastName  = cp.new_contact.last_name;
                        email     = cp.new_contact.email;
                        phone     = cp.new_contact.phone;
                        titleRole = cp.new_contact.title_role;
                    }

                    if (String.isBlank(lastName)) {
                        if (!String.isBlank(cp.full_name)) {
                            List<String> parts = cp.full_name.split(' ', 2);
                            if (parts.size() == 1) {
                                lastName = parts[0];
                            } else {
                                if (String.isBlank(firstName)) firstName = parts[0];
                                lastName = parts[parts.size() - 1];
                            }
                        } else {
                            lastName = 'Contacto IA';
                        }
                    }

                    Contact c = new Contact();
                    c.AccountId = accountId;
                    c.FirstName = firstName;
                    c.LastName  = lastName;

                    if (contactId != null) {
                        try { c.put('Email_ExternalID__c', email); } catch (Exception ignore) {}
                    }
                    if (!String.isBlank(phone)) {
                        try { c.put('phone_id__c', phone); } catch (Exception ignore) { c.Phone = phone; }
                    }
                    if (!String.isBlank(titleRole)) {
                        try { c.Title = titleRole; } catch (Exception ignore) {}
                    } else if (!String.isBlank(cp.role)) {
                        try { c.Title = cp.role; } catch (Exception ignore) {}
                    }

                    Id rtToUse = null;
                    if (cp.new_contact != null && !String.isBlank(cp.new_contact.record_type_id)) {
                        rtToUse = safeId(cp.new_contact.record_type_id);
                    }
                    if (rtToUse == null) rtToUse = desktopContactRtId;
                    if (rtToUse != null) c.RecordTypeId = rtToUse;

                    contactsToInsert.add(c);
                    contactResultIdx.add(result.clientParticipants.size() - 1);

                    VisitedParty vcNew = new VisitedParty();
                    vcNew.VisitId = visitId;
                    visitContactsToInsert.add(vcNew);
                    visitContactResultIdx.add(result.clientParticipants.size() - 1);
                    visitContactContactRefIdx.add(contactsToInsert.size() - 1);
                }
            }

            if (!contactsToInsert.isEmpty()) {
                insert contactsToInsert;
                for (Integer i = 0; i < contactsToInsert.size(); i++) {
                    Integer resIdx = contactResultIdx[i];
                    if (resIdx != null && resIdx < result.clientParticipants.size()) {
                        result.clientParticipants[resIdx].contactId = contactsToInsert[i].Id;
                    }
                }
                for (Integer i = 0; i < visitContactsToInsert.size(); i++) {
                    Integer contactRefIdx = visitContactContactRefIdx[i];
                    if (contactRefIdx != null && contactRefIdx >= 0 && contactRefIdx < contactsToInsert.size()) {
                        visitContactsToInsert[i].ContactId = contactsToInsert[contactRefIdx].Id;
                    }
                }
            }

            if (!visitContactsToInsert.isEmpty()) {
                insert visitContactsToInsert;
                for (Integer i = 0; i < visitContactsToInsert.size(); i++) {
                    Integer resIdx = visitContactResultIdx[i];
                    if (resIdx != null && resIdx < result.clientParticipants.size()) {
                        ClientParticipantResult r = result.clientParticipants[resIdx];
                        if (r.contactId == null) {
                            r.contactId = visitContactsToInsert[i].ContactId;
                        }
                        r.visitContactId = visitContactsToInsert[i].Id;
                    }
                }
            }
        }

        // ==========================
        // INTERNAL PARTICIPANTS — avoid upsert when no real change
        // ==========================
        if (includesInternal(mode) && root.internal_participants != null && !root.internal_participants.isEmpty()) {

            // Collect userIds and mtIds
            Set<Id> payloadMtIds = new Set<Id>();
            Set<Id> payloadUserIds = new Set<Id>();

            for (LAB_VisitAI_DTO.InternalParticipantDTO bpPeek : root.internal_participants) {
                if (bpPeek == null) continue;
                Id mtId = safeId(bpPeek.visit_management_team_id);
                if (mtId != null) payloadMtIds.add(mtId);

                Id uId = safeId(bpPeek.matched_user_id);
                if (uId != null) payloadUserIds.add(uId);
            }

            // Existing MT by user in this visit (excluding deleted)
            Map<Id, Id> existingMtByUserId = new Map<Id, Id>();
            if (!payloadUserIds.isEmpty()) {
                for (Visit_Management_Team__c mt : [
                    SELECT Id, User__c
                    FROM Visit_Management_Team__c
                    WHERE Visit__c = :visitId
                      AND User__c IN :payloadUserIds
                      AND Id NOT IN :deletedVisitManagementTeamIds
                ]) {
                    if (mt.User__c != null) {
                        existingMtByUserId.put(mt.User__c, mt.Id);
                    }
                }
            }

            // Existing MT by Id (for comparisons if needed)
            Map<Id, Visit_Management_Team__c> existingMtById = new Map<Id, Visit_Management_Team__c>();
            if (!payloadMtIds.isEmpty()) {
                existingMtById = new Map<Id, Visit_Management_Team__c>([
                    SELECT Id, User__c, Visit__c
                    FROM Visit_Management_Team__c
                    WHERE Id IN :payloadMtIds
                ]);
            }

            List<Visit_Management_Team__c> mtToInsert = new List<Visit_Management_Team__c>();
            List<Integer> mtInsertResultIdx = new List<Integer>();

            List<Visit_Management_Team__c> mtToUpdate = new List<Visit_Management_Team__c>();
            List<Integer> mtUpdateResultIdx = new List<Integer>();

            for (LAB_VisitAI_DTO.InternalParticipantDTO bp : root.internal_participants) {
                if (bp == null) continue;

                InternalParticipantResult bpRes = new InternalParticipantResult();
                bpRes.clientReferenceId = bp.reference_id;
                result.internalParticipants.add(bpRes);
                Integer resIdx = result.internalParticipants.size() - 1;

                Id userId = safeId(bp.matched_user_id);
                if (userId == null) continue;

                Id mtId = safeId(bp.visit_management_team_id);

                // If _modified exists and this record isn't modified, skip DML, just return Id if present
                if (modifiedBlock != null && !modifiedInternal.isEmpty() && !modifiedInternal.contains(bp.reference_id)) {
                    if (mtId != null) {
                        bpRes.visitManagementTeamId = mtId;
                    } else if (existingMtByUserId.containsKey(userId)) {
                        bpRes.visitManagementTeamId = existingMtByUserId.get(userId);
                    }
                    continue;
                }

                // If MT already exists for this user+visit, avoid insert
                if (mtId == null && existingMtByUserId.containsKey(userId)) {
                    bpRes.visitManagementTeamId = existingMtByUserId.get(userId);
                    continue;
                }

                if (mtId != null && existingMtById.containsKey(mtId)) {
                    // Update only if something changed (user/visit)
                    Visit_Management_Team__c current = existingMtById.get(mtId);
                    if (current.User__c == userId && current.Visit__c == visitId) {
                        bpRes.visitManagementTeamId = current.Id;
                        continue;
                    }
                    Visit_Management_Team__c upd = new Visit_Management_Team__c(
                        Id = mtId,
                        Visit__c = visitId,
                        User__c  = userId
                    );
                    mtToUpdate.add(upd);
                    mtUpdateResultIdx.add(resIdx);
                    continue;
                }

                // Insert new
                Visit_Management_Team__c ins = new Visit_Management_Team__c(
                    Visit__c = visitId,
                    User__c  = userId
                );
                mtToInsert.add(ins);
                mtInsertResultIdx.add(resIdx);
            }

            if (!mtToInsert.isEmpty()) {
                insert mtToInsert;
                for (Integer i = 0; i < mtToInsert.size(); i++) {
                    Integer idxRes = mtInsertResultIdx[i];
                    if (idxRes != null && idxRes < result.internalParticipants.size()) {
                        result.internalParticipants[idxRes].visitManagementTeamId = mtToInsert[i].Id;
                    }
                }
            }

            if (!mtToUpdate.isEmpty()) {
                update mtToUpdate;
                for (Integer i = 0; i < mtToUpdate.size(); i++) {
                    Integer idxRes = mtUpdateResultIdx[i];
                    if (idxRes != null && idxRes < result.internalParticipants.size()) {
                        result.internalParticipants[idxRes].visitManagementTeamId = mtToUpdate[i].Id;
                    }
                }
            }
        }

        // ==========================
        // TASKS — avoid upsert when no change
        // ==========================
        if (includesTasks(mode) && root.tasks != null && !root.tasks.isEmpty()) {
            // Collect existing ids to compare
            Set<Id> payloadTaskIds = new Set<Id>();
            for (LAB_VisitAI_DTO.TaskDTO tPeek : root.tasks) {
                if (tPeek == null) continue;
                Id tid = safeId(tPeek.task_id);
                if (tid != null && !deletedTaskIds.contains(tid)) payloadTaskIds.add(tid);
            }

            Map<Id, Task> existingTasksById = new Map<Id, Task>();
            if (!payloadTaskIds.isEmpty()) {
                existingTasksById = new Map<Id, Task>([
                    SELECT Id, Subject, ActivityDate, Description, WhatId
                    FROM Task
                    WHERE Id IN :payloadTaskIds
                ]);
            }

            List<Task> tasksToInsert = new List<Task>();
            List<Integer> insertResultIdx = new List<Integer>();

            List<Task> tasksToUpdate = new List<Task>();
            List<Integer> updateResultIdx = new List<Integer>();

            for (LAB_VisitAI_DTO.TaskDTO t : root.tasks) {
                if (t == null) continue;

                Id taskId = safeId(t.task_id);
                if (taskId != null && deletedTaskIds.contains(taskId)) {
                    continue;
                }

                TaskResult taskRes = new TaskResult();
                taskRes.clientReferenceId = t.reference_id;
                result.tasks.add(taskRes);
                Integer resIdx = result.tasks.size() - 1;

                // Existing task
                if (taskId != null) {
                    taskRes.taskId = taskId;

                    // If subject is blank, keep existing task as-is
                    if (String.isBlank(t.subject)) {
                        continue;
                    }

                    // If _modified exists and this task isn't modified, avoid DML
                    if (modifiedBlock != null && !modifiedTasks.isEmpty() && !modifiedTasks.contains(t.reference_id)) {
                        continue;
                    }

                    Task current = existingTasksById.get(taskId);
                    Date desiredDate = safeDate(t.due_date);
                    String desiredDesc = (t.description == null ? null : t.description);
                    String desiredSubj = t.subject;

                    // If we can compare and it's unchanged, skip update
                    if (current != null) {
                        Boolean unchanged =
                            current.Subject == desiredSubj &&
                            String.valueOf(current.Description) == String.valueOf(desiredDesc) &&
                            String.valueOf(current.ActivityDate) == String.valueOf(desiredDate) &&
                            (current.WhatId == null || current.WhatId == visitId || current.WhatId == visitId);

                        if (unchanged) {
                            continue;
                        }
                    }

                    Task upd = new Task(
                        Id          = taskId,
                        Subject     = desiredSubj,
                        Description = desiredDesc,
                        WhatId      = (Id) visitId
                    );
                    if (desiredDate != null) upd.ActivityDate = desiredDate;

                    tasksToUpdate.add(upd);
                    updateResultIdx.add(resIdx);
                    continue;
                }

                // New task
                if (String.isBlank(t.subject)) continue;

                Task ins = new Task(
                    Subject     = t.subject,
                    Description = t.description,
                    OwnerId     = UserInfo.getUserId(),
                    WhatId      = (Id) visitId
                );
                Date newDate = safeDate(t.due_date);
                if (newDate != null) ins.ActivityDate = newDate;

                tasksToInsert.add(ins);
                insertResultIdx.add(resIdx);
            }

            if (!tasksToInsert.isEmpty()) {
                insert tasksToInsert;
                for (Integer i = 0; i < tasksToInsert.size(); i++) {
                    Integer idxRes = insertResultIdx[i];
                    if (idxRes != null && idxRes < result.tasks.size()) {
                        result.tasks[idxRes].taskId = tasksToInsert[i].Id;
                    }
                }
            }

            if (!tasksToUpdate.isEmpty()) {
                update tasksToUpdate;
                // task ids already known
            }
        }

        return result;
    }

    // ============================================================
    // HELPERS
    // ============================================================
    private static Set<Id> toIdSet(List<Object> raw) {
        Set<Id> out = new Set<Id>();
        if (raw == null) return out;
        for (Object o : raw) {
            try {
                out.add((Id) String.valueOf(o));
            } catch (Exception ignore) {}
        }
        return out;
    }

    private static Set<String> toStringSet(List<Object> raw) {
        Set<String> out = new Set<String>();
        if (raw == null) return out;
        for (Object o : raw) {
            if (o == null) continue;
            out.add(String.valueOf(o));
        }
        return out;
    }

    private static Id safeId(String raw) {
        if (String.isBlank(raw)) return null;
        try { return (Id) raw; } catch (Exception e) { return null; }
    }

    private static Date safeDate(String raw) {
        if (String.isBlank(raw)) return null;
        try { return Date.valueOf(raw); } catch (Exception e) { return null; }
    }

    private static void deleteVisitContactsByIds(Set<Id> ids) {
        if (ids == null || ids.isEmpty()) return;
        List<VisitedParty> stubs = new List<VisitedParty>();
        for (Id i : ids) stubs.add(new VisitedParty(Id = i));
        Database.DeleteResult[] res = Database.delete(stubs, false);
        if (res != null) {
            for (Database.DeleteResult r : res) {
                if (r == null || r.isSuccess()) continue;
                if (!r.getErrors().isEmpty()) {
                    throw new AuraHandledException('Failed deleting Visit Contact: ' + r.getErrors()[0].getMessage());
                }
            }
        }
    }

    private static void deleteVisitManagementTeamsByIds(Set<Id> ids) {
        if (ids == null || ids.isEmpty()) return;
        List<Visit_Management_Team__c> stubs = new List<Visit_Management_Team__c>();
        for (Id i : ids) stubs.add(new Visit_Management_Team__c(Id = i));
        Database.DeleteResult[] res = Database.delete(stubs, false);
        if (res != null) {
            for (Database.DeleteResult r : res) {
                if (r == null || r.isSuccess()) continue;
                if (!r.getErrors().isEmpty()) {
                    throw new AuraHandledException('Failed deleting Visit Management Team: ' + r.getErrors()[0].getMessage());
                }
            }
        }
    }

    private static void deleteTasksByIds(Set<Id> ids) {
        if (ids == null || ids.isEmpty()) return;
        List<Task> stubs = new List<Task>();
        for (Id i : ids) stubs.add(new Task(Id = i));
        Database.DeleteResult[] res = Database.delete(stubs, false);
        if (res != null) {
            for (Database.DeleteResult r : res) {
                if (r == null || r.isSuccess()) continue;
                if (!r.getErrors().isEmpty()) {
                    throw new AuraHandledException('Failed deleting Task: ' + r.getErrors()[0].getMessage());
                }
            }
        }
    }

    private static Visit buildVisitRecordFromDto(
        Visit current,
        Visit baseVisit,
        Id accountId,
        LAB_VisitAI_DTO.VisitDTO dto
    ) {
        Visit rec = (current != null)
            ? new Visit(Id = current.Id)
            : new Visit();

        rec.AccountId = accountId;
        if (current == null) rec.PlaceId = '131KY000000MQxmYAG';

        rec.LAB_Name__c = String.isBlank(dto.visit_name)
            ? 'Seguimiento ' + baseVisit.LAB_Name__c
            : dto.visit_name;

        if (!String.isBlank(dto.start_datetime)) {
            try { rec.PlannedVisitStartTime = Datetime.valueOf(dto.start_datetime); } catch (Exception ignore) {}
        }
        if (dto.duration_minutes != null) {
            try { rec.LAB_Duration__c = String.valueOf(dto.duration_minutes); } catch (Exception ignore) {}
        }
        if (!String.isBlank(dto.channel_code)) {
            try { rec.LAB_Channel__c = dto.channel_code; } catch (Exception ignore) {}
        }
        if (!String.isBlank(dto.purpose_type_code)) {
            try { rec.LAB_purpose_type__c = dto.purpose_type_code; } catch (Exception ignore) {}
        }

        return rec;
    }

    private static Boolean isVisitChanged(Visit current, Visit candidate) {
        if (current == null || candidate == null) return true;

        // Compare only fields we set
        if (String.valueOf(current.LAB_Name__c) != String.valueOf(candidate.LAB_Name__c)) return true;
        if (String.valueOf(current.PlannedVisitStartTime) != String.valueOf(candidate.PlannedVisitStartTime)) return true;
        if (String.valueOf(current.LAB_Duration__c) != String.valueOf(candidate.LAB_Duration__c)) return true;
        if (String.valueOf(current.LAB_Channel__c) != String.valueOf(candidate.LAB_Channel__c)) return true;
        if (String.valueOf(current.LAB_purpose_type__c) != String.valueOf(candidate.LAB_purpose_type__c)) return true;

        return false;
    }

    // ============================================================
    // CONTEXT BUILDERS (unchanged)
    // ============================================================
    private static String buildVisitContext(Id visitId) {
        if (visitId == null) return '';

        Visit v = [
            SELECT Id,
                LAB_Name__c,
                LAB_Summary__c,
                AccountId,
                Account.Name,
                PlannedVisitStartTime,
                LAB_Duration__c,
                LAB_Channel__c,
                LAB_purpose_type__c,
                (SELECT Id,
                        ContactId,
                        Contact.Id,
                        Contact.Name,
                        Contact.Email,
                        Contact.Phone
                 FROM VisitVisitedParties),
                (SELECT Id,
                        User__c,
                        User__r.Id,
                        User__r.Name,
                        User__r.Email,
                        User__r.Phone,
                        User__r.MobilePhone
                 FROM Visit_Management_Teams__r)
            FROM Visit
            WHERE Id = :visitId
            LIMIT 1
        ];

        Boolean currentUserIsParticipant = false;
        for (Visit_Management_Team__c mt : v.Visit_Management_Teams__r) {
            if (mt.User__c == UserInfo.getUserId()) {
                currentUserIsParticipant = true;
                break;
            }
        }

        String ctx = 'VISIT CONTEXT\n';
        ctx += 'Visit Id: ' + v.Id + '\n';
        ctx += 'Visit Name: ' + v.LAB_Name__c + '\n';
        ctx += 'Client Name: ' + (v.Account != null ? v.Account.Name : '') + '\n';
        ctx += 'Start Datetime: ' + String.valueOf(v.PlannedVisitStartTime) + '\n';
        ctx += 'Duration (minutes): ' + v.LAB_Duration__c + '\n';
        ctx += 'Channel Code: ' + v.LAB_Channel__c + '\n';
        ctx += 'Purpose Type: ' + v.LAB_purpose_type__c + '\n';

        ctx += '\nCLIENT PARTICIPANTS (ALREADY IN THIS VISIT)\n';
        for (VisitedParty vc : v.VisitVisitedParties) {
            String contactId   = (vc.Contact != null ? String.valueOf(vc.Contact.Id) : '');
            String contactName = (vc.Contact != null ? vc.Contact.Name : '');
            String email       = (vc.Contact != null ? vc.Contact.Email : '');
            String phone       = (vc.Contact != null ? vc.Contact.Phone : '');

            ctx += '- Contact Id: ' + contactId
                + ' | Name: ' + contactName
                + ' | Email: ' + email
                + ' | Phone: ' + phone
                + '\n';
        }

        ctx += '\nINTERNAL PARTICIPANTS (ALREADY IN THIS VISIT)\n';
        for (Visit_Management_Team__c mt : v.Visit_Management_Teams__r) {
            String userId = (mt.User__r != null ? String.valueOf(mt.User__r.Id) : '');
            String name   = (mt.User__r != null ? mt.User__r.Name : '');
            String email  = (mt.User__r != null ? mt.User__r.Email : '');
            String phone  = null;

            if (mt.User__r != null) {
                phone = !String.isBlank(mt.User__r.Phone)
                    ? mt.User__r.Phone
                    : mt.User__r.MobilePhone;
            }

            ctx += '- User Id: ' + userId
                + ' | Name: ' + name
                + ' | Email: ' + email
                + ' | Phone: ' + (phone != null ? phone : '')
                + '\n';
        }

        ctx += '\nCURRENT USER IS PARTICIPANT: ' + String.valueOf(currentUserIsParticipant) + '\n';

        List<Task> visitTasks = [
            SELECT Id, Subject, ActivityDate, Description
            FROM Task
            WHERE WhatId = :(Id) visitId
            ORDER BY ActivityDate DESC NULLS LAST, CreatedDate DESC
        ];

        ctx += '\nTASKS (ALREADY IN THIS VISIT)\n';
        for (Task t : visitTasks) {
            ctx += '- Task Id: ' + t.Id
                + ' | Subject: ' + t.Subject
                + ' | Due Date: ' + String.valueOf(t.ActivityDate)
                + ' | Description: ' + t.Description
                + '\n';
        }

        return ctx;
    }

    private static String buildAccountContext(Id accountId) {
        if (accountId == null) return '';

        Account acc = [
            SELECT Id,
                   Name,
                   Industry,
                   Type,
                   Rating,
                   BillingCountry,
                   (SELECT Id,
                           Name,
                           StageName,
                           Amount,
                           CloseDate
                    FROM Opportunities
                    WHERE IsClosed = FALSE
                    ORDER BY CloseDate ASC),
                    (SELECT Id,
                            LAB_Name__c,
                            PlannedVisitStartTime,
                            LAB_Duration__c,
                            LAB_Channel__c,
                            LAB_purpose_type__c,
                            LAB_Status_type__c,
                            LastModifiedDate
                     FROM Visits
                     WHERE LAB_Status_type__c != '06'
                     ORDER BY PlannedVisitStartTime DESC
                     LIMIT 30),
                   (SELECT Id,
                           Name,
                           Email,
                           Phone,
                           Title
                    FROM Contacts)
            FROM Account
            WHERE Id = :accountId
            LIMIT 1
        ];

        String ctx = 'ACCOUNT CONTEXT\n';
        ctx += 'Account Id: ' + acc.Id + '\n';
        ctx += 'Account Name: ' + acc.Name + '\n';
        ctx += 'Industry: ' + acc.Industry + '\n';
        ctx += 'Type: ' + acc.Type + '\n';
        ctx += 'Rating: ' + acc.Rating + '\n';
        ctx += 'Account BillingCountry: ' + acc.BillingCountry + '\n';

        ctx += '\nCONTACTS\n';
        for (Contact c : acc.Contacts) {
            ctx += '- Contact Id: ' + c.Id
                + ' | Name: ' + c.Name
                + ' | Email: ' + c.Email
                + ' | Phone: ' + c.Phone
                + ' | Title: ' + c.Title
                + '\n';
        }

        ctx += '\nOPPORTUNITIES\n';
        for (Opportunity opp : acc.Opportunities) {
            ctx += '- '
                + opp.Name
                + ' | Stage: ' + opp.StageName
                + ' | Amount: ' + String.valueOf(opp.Amount)
                + ' | CloseDate: ' + String.valueOf(opp.CloseDate)
                + '\n';
        }

        List<Visit> openVisits = new List<Visit>();
        List<Visit> closedVisits = new List<Visit>();
        for (Visit v : acc.Visits) {
            if (String.valueOf(v.LAB_Status_type__c) != '06') {
                openVisits.add(v);
            } else {
                closedVisits.add(v);
            }
        }

        ctx += '\nOPEN VISITS (Status != 06)\n';
        for (Visit v : openVisits) {
            ctx += '- Visit Id: ' + v.Id
                + ' | Name: ' + v.LAB_Name__c
                + ' | Status: ' + v.LAB_Status_type__c
                + ' | Start: ' + String.valueOf(v.PlannedVisitStartTime)
                + ' | Duration: ' + v.LAB_Duration__c
                + ' | Channel: ' + v.LAB_Channel__c
                + ' | Purpose: ' + v.LAB_purpose_type__c
                + ' | LastModified: ' + String.valueOf(v.LastModifiedDate)
                + '\n';
        }

        ctx += '\nRECENT CLOSED VISITS (Status = 06, most recent first)\n';
        Integer closedCount = 0;
        for (Visit v : closedVisits) {
            if (closedCount >= 10) break;
            closedCount++;
            ctx += '- Visit Id: ' + v.Id
                + ' | Name: ' + v.LAB_Name__c
                + ' | Status: ' + v.LAB_Status_type__c
                + ' | Start: ' + String.valueOf(v.PlannedVisitStartTime)
                + ' | Duration: ' + v.LAB_Duration__c
                + ' | Channel: ' + v.LAB_Channel__c
                + ' | Purpose: ' + v.LAB_purpose_type__c
                + ' | LastModified: ' + String.valueOf(v.LastModifiedDate)
                + '\n';
        }

        return ctx;
    }

    private static String normalizeContextText(String input, Integer maxLen) {
        if (String.isBlank(input)) return '';
        String cleaned = input.replaceAll('<[^>]*>', ' ');
        cleaned = cleaned.replaceAll('\\s+', ' ').trim();
        if (maxLen != null && cleaned.length() > maxLen) {
            cleaned = cleaned.substring(0, maxLen) + '...';
        }
        return cleaned;
    }

    // ============================================================
    // HELPER — DESKTOP CONTACT RECORDTYPE
    // ============================================================
    @TestVisible
    private static Id getDesktopContactRecordTypeId() {
        try {
            List<RecordType> rts = [
                SELECT Id
                FROM RecordType
                WHERE SObjectType = 'Contact'
                  AND DeveloperName = 'Desktop_Contact'
                LIMIT 1
            ];
            if (!rts.isEmpty()) {
                return rts[0].Id;
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }
}