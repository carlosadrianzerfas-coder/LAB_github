public with sharing class AgentforceCreateOpportunity {
    public class Input {
        @InvocableVariable(label='Opportunity Data' required=true)
        public CreateOpportunityRequestData opportunityData;
        
        @InvocableVariable(label='Account Id' required=true)
        public String accountId;
    }

    public class Output {
        @InvocableVariable(label='Display Opportunity Data')
        public AgentforceDisplayOpportunityData displayInfo;
    }
    @InvocableMethod(label='Create Opportunity' description='Creates a Opportunity record regarding the Account and Opportunity Data.')
    public static List<Output> createOpportunity(List<Input> inputs) {
        List<Output> outputs = new List<Output>();

        for (Input input : inputs) {
            Output output = new Output();
            AgentforceDisplayOpportunityData result = new AgentforceDisplayOpportunityData();
            try {
                if (String.isBlank(input.accountId)) {
                    throw new IllegalArgumentException('Account Id is missing');
                }

                if (input.opportunityData == null) {
                    throw new IllegalArgumentException('Opportunity data is missing');
                }

                if (input.opportunityData.amount == null) {
                    throw new IllegalArgumentException('Amount is required');
                }

                if (input.opportunityData.amount <= 0) {
                    throw new IllegalArgumentException('Amount must be greater than 0.');
                }

                // 1. Account Check
                Account acc = [SELECT Id, Type FROM Account WHERE Id = :input.accountId LIMIT 1];
                
                // Using defensive check for null, although inputs usually valid
                // if (acc.Type != 'Subsidiary') {
                //     result.status = 'KO';
                //     result.errorMessage = 'Opportunities can only be create on subsidiary accounts';
                //     output.displayInfo = result;
                //     outputs.add(output);
                //     continue;
                // }

                // 2. Prepare Opportunity
                Opportunity opp = new Opportunity();
                opp.Name = input.opportunityData.opportunityName;
                opp.Amount = input.opportunityData.amount;
                opp.StageName = input.opportunityData.stage;
                if (input.opportunityData.closeDate != null) {
                    opp.CloseDate = (Date) input.opportunityData.closeDate;

                } 
                opp.Type = input.opportunityData.opportunityType; 
                // opp.ForecastCategory = input.opportunityData.forecastCategory;
                opp.AccountId = input.accountId;

                insert opp;

                result.status = 'OK';
                result.opportunityId = opp.Id;

            } catch (Exception e) {
                result.status = 'KO';
                result.errorMessage = e.getMessage();
            }
            output.displayInfo = result;
            outputs.add(output);
        }
        return outputs;
    }
}