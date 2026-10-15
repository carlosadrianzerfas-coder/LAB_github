public with sharing class LAB_VisitAI_Controller {
   // ============================================================
   // 1) Cargar estado previo almacenado en la visita
   // ============================================================
   @AuraEnabled(cacheable=true)
   public static Map<String, String> getVisitState(Id visitId) {
       if (visitId == null) return new Map<String, String>();

       try {
           List<Visit> visits = [
               SELECT
                   AI_VISIT_TXT_TranscriptOfTheVisit__c,
                   AI_VISIT_TXT_AnalysisVisitTranscriptJSON__c
               FROM Visit
               WHERE Id = :visitId
               LIMIT 1
           ];
           if (visits.isEmpty()) {
               return new Map<String, String>();
           }
           Visit v = visits[0];
           return new Map<String, String>{
               'transcript' => v.AI_VISIT_TXT_TranscriptOfTheVisit__c,
               'analysisJson' => v.AI_VISIT_TXT_AnalysisVisitTranscriptJSON__c
           };
       } catch (Exception e) {
           return new Map<String, String>();
       }
   }
   // ============================================================
   // 2) Guardar estado parcial (transcripción + JSON)
   // ============================================================
   @AuraEnabled
   public static void savePartialState(
       Id visitId,
       String transcript,
       String analysisJson,
       String feedbackRichText,
       Boolean isFinalized
   ) {
       if (visitId == null)
           throw new AuraHandledException('visitId cannot be null.');
       Visit v = new Visit(
           Id = visitId,
           AI_VISIT_TXT_TranscriptOfTheVisit__c = transcript,
           AI_VISIT_TXT_AnalysisVisitTranscriptJSON__c = analysisJson,
           LAB_Summary__c = feedbackRichText
       );
       if (isFinalized != null && isFinalized) {
           v.LAB_Status_type__c = '06'; // Finalized
       }
       update v;
   }
   // ============================================================
   // 3) Llamada al Prompt Template
   // ============================================================
   @AuraEnabled(cacheable=false)
   public static String analyzeVisit(
       Id visitId,
       Id accountId,
       String transcript
   ) {
       if (String.isBlank(transcript)) {
           throw new AuraHandledException('The transcript cannot be empty.');
       }
       // Llama al servicio actualizado
       return LAB_VisitAI_Service.callPromptTemplate(
           visitId,
           accountId,
           transcript
       );
   }
   // ============================================================
   // 4) Aplicar cambios definitivos en Salesforce
   // ============================================================
   @AuraEnabled
   public static LAB_VisitAI_Service.ApplyResult applyVisitResult(Id visitId, String jsonResult) {
       if (visitId == null) {
           throw new AuraHandledException('visitId is required.');
       }
       if (String.isBlank(jsonResult)) {
           throw new AuraHandledException('Empty JSON.');
       }
       // Procesado profundo en el Service
       return LAB_VisitAI_Service.applyVisitResult(visitId, jsonResult);
   }

   // ============================
   // 4b) Aplicar por secciones
   // ============================
   @AuraEnabled
   public static LAB_VisitAI_Service.ApplyResult applyVisitScheduling(Id visitId, String jsonResult) {
       return LAB_VisitAI_Service.applyVisitResult(visitId, jsonResult, LAB_VisitAI_Service.ApplyMode.VISITS);
   }

   @AuraEnabled
   public static LAB_VisitAI_Service.ApplyResult applyClientParticipants(Id visitId, String jsonResult) {
       return LAB_VisitAI_Service.applyVisitResult(visitId, jsonResult, LAB_VisitAI_Service.ApplyMode.CLIENTS);
   }

   @AuraEnabled
   public static LAB_VisitAI_Service.ApplyResult applyInternalParticipants(Id visitId, String jsonResult) {
       return LAB_VisitAI_Service.applyVisitResult(visitId, jsonResult, LAB_VisitAI_Service.ApplyMode.INTERNAL);
   }

   @AuraEnabled
   public static LAB_VisitAI_Service.ApplyResult applyTasks(Id visitId, String jsonResult) {
       return LAB_VisitAI_Service.applyVisitResult(visitId, jsonResult, LAB_VisitAI_Service.ApplyMode.TASKS);
   }
   // ============================================================
   // 5) Obtener la cuenta asociada a la visita
   // ============================================================
   @AuraEnabled(cacheable=true)
   public static Id getVisitAccount(Id visitId) {
       if (visitId == null) return null;
       try {
           List<Visit> visits = [
               SELECT AccountId
               FROM Visit
               WHERE Id = :visitId
               LIMIT 1
           ];
           return visits.isEmpty() ? null : visits[0].AccountId;
       } catch (Exception e) {
           return null;
       }
   }

   // ============================================================
   // 5b) Obtener datos basicos de la cuenta (Account)
   // ============================================================
   public class AccountInfoWrapper {
       @AuraEnabled public Id accountId;
       @AuraEnabled public String accountName;
   }

   @AuraEnabled(cacheable=true)
   public static AccountInfoWrapper getAccountInfo(Id accountId) {
       if (accountId == null) return null;
       try {
           Account a = [
               SELECT Id, Name
               FROM Account
               WHERE Id = :accountId
               LIMIT 1
           ];
           AccountInfoWrapper w = new AccountInfoWrapper();
           w.accountId = a.Id;
           w.accountName = a.Name;
           return w;
       } catch (Exception e) {
           return null;
       }
   }

   // ============================================================
   // 5c) Visitas abiertas de un cliente (no finalizadas)
   // ============================================================
   public class OpenVisitWrapper {
       @AuraEnabled public Id visitId;
       @AuraEnabled public String visitName;
       @AuraEnabled public String startDatetime;
       @AuraEnabled public String visitStatusType;
       @AuraEnabled public Boolean hasSavedAnalysis;
   }

   @AuraEnabled(cacheable=true)
   public static List<OpenVisitWrapper> getOpenVisitsByAccount(Id accountId) {
       List<OpenVisitWrapper> outList = new List<OpenVisitWrapper>();
       if (accountId == null) return outList;

       for (Visit v : [
           SELECT Id,
                  LAB_Name__c,
                  PlannedVisitStartTime,
                  LAB_Status_type__c,
                  AI_VISIT_TXT_AnalysisVisitTranscriptJSON__c
           FROM Visit
           WHERE AccountId = :accountId
             AND LAB_Status_type__c != '06'
           ORDER BY PlannedVisitStartTime DESC NULLS LAST
           LIMIT 50
       ]) {
           OpenVisitWrapper w = new OpenVisitWrapper();
           w.visitId = v.Id;
           w.visitName = v.LAB_Name__c;
           w.startDatetime = v.PlannedVisitStartTime == null ? null : String.valueOf(v.PlannedVisitStartTime);
           w.visitStatusType = v.LAB_Status_type__c;
           w.hasSavedAnalysis = String.isNotBlank(v.AI_VISIT_TXT_AnalysisVisitTranscriptJSON__c);
           outList.add(w);
       }
       return outList;
   }

   // ============================================================
   // 6) Obtener participantes cliente ya vinculados a la visita
   // ============================================================
   public class VisitClientParticipantWrapper {
       @AuraEnabled public Id visitContactId;
       @AuraEnabled public Id contactId;
       @AuraEnabled public String name;
       @AuraEnabled public String firstName;
       @AuraEnabled public String lastName;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
       @AuraEnabled public String title;
   }

   @AuraEnabled(cacheable=true)
   public static List<VisitClientParticipantWrapper> getVisitClientParticipants(Id visitId) {
       if (visitId == null) {
           return new List<VisitClientParticipantWrapper>();
       }

       List<VisitClientParticipantWrapper> result = new List<VisitClientParticipantWrapper>();

       for (VisitedParty vc : [
           SELECT Id,
                  ContactId,
                  Contact.Name,
                  Contact.FirstName,
                  Contact.LastName,
                  Contact.Email,
                  Contact.Phone,
                  Contact.Title
            FROM VisitedParty
            WHERE VisitId = :visitId
        ]) {
           VisitClientParticipantWrapper w = new VisitClientParticipantWrapper();
           w.visitContactId = vc.Id;
           w.contactId      = vc.ContactId;
           w.name           = (vc.Contact != null) ? vc.Contact.Name : null;
           w.firstName      = (vc.Contact != null) ? vc.Contact.FirstName : null;
           w.lastName       = (vc.Contact != null) ? vc.Contact.LastName : null;
           w.email          = (vc.Contact != null) ? vc.Contact.Email : null;
           w.phone          = (vc.Contact != null) ? vc.Contact.Phone : null;
           w.title = (vc.Contact != null) ? vc.Contact.Title : null;
           result.add(w);
       }

       return result;
   }

   // ============================================================
   // 7) Obtener nombre de la visita y nombre del cliente
   // ============================================================
   public class VisitInfoWrapper {
       @AuraEnabled public Id visitId;
       @AuraEnabled public String visitName;
       @AuraEnabled public String accountName;
       @AuraEnabled public Id accountId;
       @AuraEnabled public String visitStatusType;
       @AuraEnabled public String startDatetime;
       @AuraEnabled public String durationMinutes;
       @AuraEnabled public String channelCode;
        @AuraEnabled public String purposeTypeCode;
    }

   @AuraEnabled(cacheable=true)
   public static VisitInfoWrapper getVisitInfo(Id visitId) {
       if (visitId == null) {
           return null;
       }
       try {
           List<Visit> visits = [
               SELECT LAB_Name__c,
                       LAB_Status_type__c,
                       AccountId,
                       Account.Name,
                       PlannedVisitStartTime,
                       LAB_Duration__c,
                       LAB_Channel__c,
                       LAB_purpose_type__c
               FROM Visit
               WHERE Id = :visitId
               LIMIT 1
           ];
           if (visits.isEmpty()) {
               return null;
           }
           Visit v = visits[0];
           VisitInfoWrapper w = new VisitInfoWrapper();
           w.visitId = v.Id;
            w.visitName = v.LAB_Name__c;
            w.accountId = v.AccountId;
            w.accountName = v.Account != null ? v.Account.Name : null;
             w.visitStatusType = v.LAB_Status_type__c;
            w.startDatetime = v.PlannedVisitStartTime == null ? null : String.valueOf(v.PlannedVisitStartTime);
           w.durationMinutes = v.LAB_Duration__c;
           w.channelCode = v.LAB_Channel__c;
           w.purposeTypeCode = v.LAB_purpose_type__c;
            return w;
       } catch (Exception e) {
           return null;
       }
   }

   // ============================================================
   // 8) Obtener RecordType "Desktop Contact" (Id y Nombre)
   // ============================================================
   public class RecordTypeInfoWrapper {
       @AuraEnabled public Id recordTypeId;
       @AuraEnabled public String name;
   }

   @AuraEnabled(cacheable=true)
   public static RecordTypeInfoWrapper getDesktopContactRecordTypeInfo() {
       RecordTypeInfoWrapper w = new RecordTypeInfoWrapper();
       try {
           List<RecordType> rts = [
               SELECT Id, Name
               FROM RecordType
               WHERE SObjectType = 'Contact'
               AND DeveloperName = 'Desktop_Contact'
               LIMIT 1
           ];
           if (!rts.isEmpty()) {
               w.recordTypeId = rts[0].Id;
               w.name = rts[0].Name;
           }
       } catch (Exception e) {
           // silent fail, will return nulls
       }
       return w;
   }

   // ============================================================
   // 8b) Obtener RecordType "AccountVisit" (Id y Nombre)
   // ============================================================
   @AuraEnabled(cacheable=true)
   public static RecordTypeInfoWrapper getAccountVisitRecordTypeInfo() {
       RecordTypeInfoWrapper w = new RecordTypeInfoWrapper();
       try {
           List<RecordType> rts = [
               SELECT Id, Name
               FROM RecordType
               WHERE SObjectType = 'Visit'
               AND DeveloperName = 'AccountVisit'
               LIMIT 1
           ];
           if (!rts.isEmpty()) {
               w.recordTypeId = rts[0].Id;
               w.name = rts[0].Name;
           }
       } catch (Exception e) {
           // silent fail, will return nulls
       }
       return w;
   }

   // ============================================================
   // 8c) Crear visita inicial desde Account
   // ============================================================
   @AuraEnabled
   public static VisitInfoWrapper createInitialVisit(
       Id accountId,
       String visitName,
       String startDatetime,
       Integer durationMinutes,
       String channelCode,
        String purposeTypeCode
    ) {
       if (accountId == null) {
           throw new AuraHandledException('accountId is required.');
       }
       if (String.isBlank(visitName) ||
           String.isBlank(startDatetime) ||
           durationMinutes == null ||
           String.isBlank(channelCode) ||
           String.isBlank(purposeTypeCode)) {
           throw new AuraHandledException('Visit details are incomplete.');
       }

       Visit v = new Visit();
       v.AccountId = accountId;
       v.PlaceId = '131KY000000MQxmYAG';
       String trimmedName = visitName != null ? visitName.trim() : '';
       if (trimmedName.length() > 80) {
           trimmedName = trimmedName.substring(0, 80);
       }
       v.LAB_Name__c = trimmedName;
       try {
           v.PlannedVisitStartTime = Datetime.valueOf(startDatetime);
       } catch (Exception e) {
           throw new AuraHandledException('Invalid start date/time.');
       }
       v.LAB_Duration__c = String.valueOf(durationMinutes);
       v.LAB_Channel__c = channelCode;
       v.LAB_purpose_type__c = purposeTypeCode;

       // Apply record type logically (Confidential logic removed as requested)
       try {
           Map<String, Schema.RecordTypeInfo> rtByDev =
               Schema.SObjectType.Visit.getRecordTypeInfosByDeveloperName();
           Id accountVisitId = rtByDev.containsKey('AccountVisit')
               ? rtByDev.get('AccountVisit').getRecordTypeId()
               : null;
           // If we need a specific record type not named RecordTypeId, it should be changed here.
       } catch (Exception e) {
           // ignore
       }

       try {
           insert v;
           return getVisitInfo(v.Id);
       } catch (DmlException e) {
           String detail = e.getDmlMessage(0);
           throw new AuraHandledException('Could not create the initial visit. ' + detail);
       } catch (Exception e) {
           throw new AuraHandledException('Could not create the initial visit. ' + e.getMessage());
       }
   }

   // ============================================================
   // 9) Buscar contactos por Account + término
   // ============================================================
   public class ContactSearchResult {
       @AuraEnabled public Id id;
       @AuraEnabled public String name;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
       @AuraEnabled public String title;
       @AuraEnabled public String desTitleRole;
   }

   @AuraEnabled(cacheable=true)
   public static List<ContactSearchResult> searchContacts(Id accountId, String searchTerm) {
       List<ContactSearchResult> results = new List<ContactSearchResult>();
       if (accountId == null || String.isBlank(searchTerm)) {
           return results;
       }
       String term = '%' + String.escapeSingleQuotes(searchTerm.trim()) + '%';
       for (Contact c : [
           SELECT Id, Name, Email, Phone, Title
           FROM Contact
           WHERE AccountId = :accountId
           AND (Name LIKE :term OR Email LIKE :term)
           ORDER BY Name
           LIMIT 20
       ]) {
           ContactSearchResult r = new ContactSearchResult();
           r.id = c.Id;
           r.name = c.Name;
           r.email = c.Email;
           r.phone = c.Phone;
           r.title = c.Title;
           results.add(r);
       }
       return results;
   }

   // ============================================================
   // 9b) Buscar destinatarios (Contact, Lead, User) por término
   // ============================================================
   public class EmailRecipientSearchResult {
       @AuraEnabled public String type;
       @AuraEnabled public Id id;
       @AuraEnabled public String name;
       @AuraEnabled public String email;
       @AuraEnabled public String title;
   }

   @AuraEnabled(cacheable=true)
   public static List<EmailRecipientSearchResult> searchEmailRecipients(Id accountId, String searchTerm) {
       List<EmailRecipientSearchResult> results = new List<EmailRecipientSearchResult>();
       if (String.isBlank(searchTerm)) {
           return results;
       }
       String term = '%' + String.escapeSingleQuotes(searchTerm.trim()) + '%';

       Integer limitPerType = 10;

       List<Contact> contacts;
       if (accountId != null) {
           contacts = [
               SELECT Id, Name, Email, Title
               FROM Contact
               WHERE AccountId = :accountId
               AND (Name LIKE :term OR Email LIKE :term)
               ORDER BY Name
               LIMIT :limitPerType
           ];
       } else {
           contacts = [
               SELECT Id, Name, Email, Title
               FROM Contact
               WHERE (Name LIKE :term OR Email LIKE :term)
               ORDER BY Name
               LIMIT :limitPerType
           ];
       }
       for (Contact c : contacts) {
           EmailRecipientSearchResult r = new EmailRecipientSearchResult();
           r.type = 'CONTACT';
           r.id = c.Id;
           r.name = c.Name;
           r.email = c.Email;
           r.title = c.Title;
           results.add(r);
       }

       for (Lead l : [
           SELECT Id, Name, Email, Title
           FROM Lead
           WHERE (Name LIKE :term OR Email LIKE :term)
           ORDER BY Name
           LIMIT :limitPerType
       ]) {
           EmailRecipientSearchResult r = new EmailRecipientSearchResult();
           r.type = 'LEAD';
           r.id = l.Id;
           r.name = l.Name;
           r.email = l.Email;
           r.title = l.Title;
           results.add(r);
       }

       for (User u : [
           SELECT Id, Name, Email, Title, Username
           FROM User
           WHERE IsActive = true
           AND (Name LIKE :term OR Email LIKE :term OR Username LIKE :term)
           ORDER BY Name
           LIMIT :limitPerType
       ]) {
           EmailRecipientSearchResult r = new EmailRecipientSearchResult();
           r.type = 'USER';
           r.id = u.Id;
           r.name = u.Name;
           r.email = u.Email;
           r.title = u.Title;
           results.add(r);
       }

       return results;
   }

   // ============================================================
   // 10) Obtener datos básicos de contactos por Id
   // ============================================================
   public class ContactBasicsWrapper {
       @AuraEnabled public Id id;
       @AuraEnabled public String firstName;
       @AuraEnabled public String lastName;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
       @AuraEnabled public String role;
   }

   @AuraEnabled(cacheable=true)
   public static List<ContactBasicsWrapper> getContactsBasicsByIds(List<Id> contactIds) {
       if (contactIds == null || contactIds.isEmpty()) {
           return new List<ContactBasicsWrapper>();
       }
       List<ContactBasicsWrapper> outList = new List<ContactBasicsWrapper>();
       for (Contact c : [
           SELECT Id, FirstName, LastName, Email, Phone, Title
           FROM Contact
           WHERE Id IN :contactIds
       ]) {
           ContactBasicsWrapper w = new ContactBasicsWrapper();
           w.id = c.Id;
           w.firstName = c.FirstName;
           w.lastName = c.LastName;
           w.email = c.Email;
           w.phone = c.Phone;
           w.role = c.Title;
           outList.add(w);
       }
       return outList;
   }

   // ============================================================
   // 10b) Obtener datos básicos de leads por Id
   // ============================================================
   public class LeadBasicsWrapper {
       @AuraEnabled public Id id;
       @AuraEnabled public String name;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
       @AuraEnabled public String title;
   }

   @AuraEnabled(cacheable=true)
   public static List<LeadBasicsWrapper> getLeadsBasicsByIds(List<Id> leadIds) {
       if (leadIds == null || leadIds.isEmpty()) {
           return new List<LeadBasicsWrapper>();
       }
       List<LeadBasicsWrapper> outList = new List<LeadBasicsWrapper>();
       for (Lead l : [
           SELECT Id, Name, Email, Phone, Title
           FROM Lead
           WHERE Id IN :leadIds
       ]) {
           LeadBasicsWrapper w = new LeadBasicsWrapper();
           w.id = l.Id;
           w.name = l.Name;
           w.email = l.Email;
           w.phone = l.Phone;
           w.title = l.Title;
           outList.add(w);
       }
       return outList;
   }

   // ============================================================
   // 10) Obtener Internal Participants ya asociados a la visita
   // ============================================================
   public class VisitInternalParticipantWrapper {
       @AuraEnabled public Id visitManagementTeamId;
       @AuraEnabled public Id userId;
       @AuraEnabled public String name;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
       @AuraEnabled public String title;
   }

   @AuraEnabled(cacheable=true)
   public static List<VisitInternalParticipantWrapper> getVisitInternalParticipants(Id visitId) {
       if (visitId == null) {
           return new List<VisitInternalParticipantWrapper>();
       }
       List<VisitInternalParticipantWrapper> result = new List<VisitInternalParticipantWrapper>();
       for (Visit_Management_Team__c mt : [
           SELECT Id,
                  User__c,
                  User__r.Name,
                  User__r.Email,
                  User__r.Phone,
                  User__r.MobilePhone,
                  User__r.Title
           FROM Visit_Management_Team__c
           WHERE Visit__c = :visitId
       ]) {
           VisitInternalParticipantWrapper w = new VisitInternalParticipantWrapper();
           w.visitManagementTeamId = mt.Id;
           w.userId = mt.User__c;
           w.name = (mt.User__r != null) ? mt.User__r.Name : null;
           w.email = (mt.User__r != null) ? mt.User__r.Email : null;
           // Prefer Phone, fallback MobilePhone
           if (mt.User__r != null) {
               if (!String.isBlank(mt.User__r.Phone)) {
                   w.phone = mt.User__r.Phone;
               } else {
                   w.phone = mt.User__r.MobilePhone;
               }
               w.title = mt.User__r.Title;
           }
           result.add(w);
       }
       return result;
   }

   // ============================================================
   // 11) Obtener datos del usuario actual
   // ============================================================
   public class CurrentUserInfoWrapper {
       @AuraEnabled public Id userId;
       @AuraEnabled public String name;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
       @AuraEnabled public String title;
       @AuraEnabled public Id managerId;
       @AuraEnabled public String managerName;
       @AuraEnabled public String managerEmail;
   }

   @AuraEnabled(cacheable=true)
   public static CurrentUserInfoWrapper getCurrentUserInfo() {
       CurrentUserInfoWrapper w = new CurrentUserInfoWrapper();
       User u = [
           SELECT Id, Name, Email, Phone, MobilePhone, Title, ManagerId, Manager.Name, Manager.Email
           FROM User
           WHERE Id = :UserInfo.getUserId()
           LIMIT 1
       ];
       w.userId = u.Id;
       w.name = u.Name;
       w.email = u.Email;
       w.phone = !String.isBlank(u.Phone) ? u.Phone : u.MobilePhone;
       w.title = u.Title;
       w.managerId = u.ManagerId;
       w.managerName = (u.Manager != null) ? u.Manager.Name : null;
       w.managerEmail = (u.Manager != null) ? u.Manager.Email : null;
       return w;
   }

   // ============================================================
   // 12) Obtener datos básicos de usuarios por Id
   // ============================================================
   public class UserBasicsWrapper {
       @AuraEnabled public Id id;
       @AuraEnabled public String name;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
   }

   @AuraEnabled(cacheable=true)
   public static List<UserBasicsWrapper> getUsersBasicsByIds(List<Id> userIds) {
       if (userIds == null || userIds.isEmpty()) {
           return new List<UserBasicsWrapper>();
       }
       List<UserBasicsWrapper> outList = new List<UserBasicsWrapper>();
       for (User u : [
           SELECT Id, Name, Email, Phone, MobilePhone
           FROM User
           WHERE Id IN :userIds
       ]) {
           UserBasicsWrapper w = new UserBasicsWrapper();
           w.id = u.Id;
           w.name = u.Name;
           w.email = u.Email;
           w.phone = !String.isBlank(u.Phone) ? u.Phone : u.MobilePhone;
           outList.add(w);
       }
       return outList;
   }

   // ============================================================
   // 13) Buscar usuarios por tǫrmino (nombre, email o username)
   // ============================================================
   public class UserSearchResult {
       @AuraEnabled public Id id;
       @AuraEnabled public String name;
       @AuraEnabled public String email;
       @AuraEnabled public String phone;
       @AuraEnabled public String title;
   }

   @AuraEnabled(cacheable=true)
   public static List<UserSearchResult> searchUsers(String searchTerm) {
       List<UserSearchResult> results = new List<UserSearchResult>();
       if (String.isBlank(searchTerm)) {
           return results;
       }
       String term = '%' + String.escapeSingleQuotes(searchTerm.trim()) + '%';
       for (User u : [
           SELECT Id, Name, Email, Phone, MobilePhone, Title, Username
           FROM User
           WHERE IsActive = true
           AND (Name LIKE :term OR Email LIKE :term OR Username LIKE :term)
           ORDER BY Name
           LIMIT 20
       ]) {
           UserSearchResult r = new UserSearchResult();
           r.id = u.Id;
           r.name = u.Name;
           r.email = u.Email;
           r.phone = !String.isBlank(u.Phone) ? u.Phone : u.MobilePhone;
           r.title = u.Title;
           results.add(r);
       }
       return results;
   }

   // ============================================================
   // 14) Obtener tareas existentes asociadas a la visita
   // ============================================================
   public class VisitTaskWrapper {
       @AuraEnabled public Id taskId;
       @AuraEnabled public String subject;
       @AuraEnabled public String dueDate;
       @AuraEnabled public String description;
   }

   @AuraEnabled(cacheable=true)
   public static List<VisitTaskWrapper> getVisitTasks(Id visitId) {
       if (visitId == null) {
           return new List<VisitTaskWrapper>();
       }
       List<VisitTaskWrapper> result = new List<VisitTaskWrapper>();
       for (Task t : [
           SELECT Id, Subject, ActivityDate, Description
           FROM Task
           WHERE WhatId = :visitId
       ]) {
           VisitTaskWrapper w = new VisitTaskWrapper();
           w.taskId = t.Id;
           w.subject = t.Subject;
           w.dueDate = t.ActivityDate == null ? null : String.valueOf(t.ActivityDate);
           w.description = t.Description;
           result.add(w);
       }
       return result;
   }
}