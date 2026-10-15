public with sharing class LAB_SustainabilityDocAI_Controller {
    // Returns [{id, title, fileType}] of all documents linked to the Opportunity
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getLinkedDocuments(Id opportunityId) {
        try {
            return LAB_DocumentAI_Service.getLinkedDocuments(opportunityId);
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    // Sends the selected document + question to the Prompt Template and returns the answer
    @AuraEnabled(cacheable=false)
    public static String askQuestion(Id contentDocumentId, String question) {
        try {
            return LAB_DocumentAI_Service.askQuestion(contentDocumentId, question);
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}