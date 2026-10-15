public with sharing class LAB_VisitSummaryEmailService {
   
    public class SendResult {
        @AuraEnabled public Boolean emailSent;
        @AuraEnabled public Boolean emailMessageCreated;
        @AuraEnabled public String emailMessageError;
    }

    @AuraEnabled
    public static SendResult sendSummaryEmail(
        List<String> toAddresses,
        String subject,
        String htmlBody,
        Id relatedRecordId,
        String emailMessageHtmlBody,
        String emailMessageTextBody,
        Id targetObjectId
    ) {
        if ((toAddresses == null || toAddresses.isEmpty()) && targetObjectId == null) {
            throw new AuraHandledException('Missing recipient email address.');
        }
        if (String.isBlank(htmlBody)) {
            throw new AuraHandledException('Missing email body.');
        }

        List<String> recipients = new List<String>();
        if (toAddresses != null) {
            for (String addr : toAddresses) {
                String trimmed = addr == null ? '' : addr.trim();
                if (!String.isBlank(trimmed)) {
                    recipients.add(trimmed);
                }
            }
        }
        if (recipients.isEmpty() && targetObjectId == null) {
            throw new AuraHandledException('Missing recipient email address.');
        }

        Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
        if (!recipients.isEmpty()) {
            mail.setToAddresses(recipients);
        }
        mail.setSubject(subject == null ? '' : subject);
        mail.setHtmlBody(htmlBody);
        mail.setSaveAsActivity(false);
        if (targetObjectId != null) {
            mail.setTargetObjectId(targetObjectId);
            mail.setTreatTargetObjectAsRecipient(recipients.isEmpty());
        }

        Messaging.SendEmailResult[] results = Messaging.sendEmail(
            new Messaging.SingleEmailMessage[] { mail }
        );

        if (results != null && !results.isEmpty() && !results[0].isSuccess()) {
            String errMsg = 'Email could not be sent.';
            if (results[0].getErrors() != null && !results[0].getErrors().isEmpty()) {
                errMsg = results[0].getErrors()[0].getMessage();
            }
            throw new AuraHandledException(errMsg);
        }

        SendResult result = new SendResult();
        result.emailSent = true;
        result.emailMessageCreated = false;

        if (relatedRecordId != null) {
            try {
                EmailMessage emailRecord = new EmailMessage();
                String subjectValue = subject == null ? '' : subject;
                String htmlBodyValue = String.isBlank(emailMessageHtmlBody) ? htmlBody : emailMessageHtmlBody;
                String textBodyValue = String.isBlank(emailMessageTextBody)
                    ? stripHtmlToText(htmlBodyValue)
                    : emailMessageTextBody;
                String toAddress = recipients.isEmpty() ? '' : String.join(recipients, '; ');
                setIfCreateable(emailRecord, 'Subject', subjectValue);
                setIfCreateable(emailRecord, 'HtmlBody', htmlBodyValue);
                setIfCreateable(emailRecord, 'TextBody', textBodyValue);
                setIfCreateable(emailRecord, 'FromAddress', UserInfo.getUserEmail());
                setIfCreateable(emailRecord, 'ToAddress', toAddress);
                setIfCreateable(emailRecord, 'Incoming', false);
                setIfCreateable(emailRecord, 'Status', '3');
                setIfCreateable(emailRecord, 'MessageDate', System.now());
                if (relatedRecordId != null) {
                    if (isFieldCreateable('EmailMessage', 'RelatedToId')) {
                        emailRecord.put('RelatedToId', relatedRecordId);
                    } else if (isFieldCreateable('EmailMessage', 'ParentId')) {
                        emailRecord.put('ParentId', relatedRecordId);
                    }
                }
                insert emailRecord;
                result.emailMessageCreated = true;
            } catch (Exception e) {
                result.emailMessageError = e.getMessage();
            }
        }

        return result;
    }

    private static void setIfCreateable(SObject record, String fieldName, Object value) {
        if (value == null) return;
        Schema.SObjectField field = record.getSObjectType().getDescribe().fields.getMap().get(fieldName);
        if (field != null && field.getDescribe().isCreateable()) {
            record.put(fieldName, value);
        }
    }

    private static Boolean isFieldCreateable(String sobjectName, String fieldName) {
        Schema.SObjectType sobjectType = Schema.getGlobalDescribe().get(sobjectName);
        if (sobjectType == null) return false;
        Schema.SObjectField field = sobjectType.getDescribe().fields.getMap().get(fieldName);
        return field != null && field.getDescribe().isCreateable();
    }

    private static String stripHtmlToText(String htmlBody) {
        if (String.isBlank(htmlBody)) return '';
        String text = htmlBody;
        text = text.replaceAll('(?i)<br\\s*/?>', '\n');
        text = text.replaceAll('(?i)</p\\s*>', '\n');
        text = text.replaceAll('<[^>]+>', '');
        return text;
    }
}