public with sharing class EnglobaQuery {
    public class Input {
        @InvocableVariable(label='JSON Input' description='JSON configuration' required=false)
        public String jsonInput;

        @InvocableVariable(label='Record ID' description='ID of the record' required=false)
        public String recordId;

        @InvocableVariable(label='SObject Name' description='Name of the Salesforce Object' required=false)
        public String sObjectName;
    }

    public class Output {
        @InvocableVariable(label='Status' description='OK or KO')
        public String status;

        @InvocableVariable(label='Error Message' description='Error message if status is KO')
        public String errorMessage;

        @InvocableVariable(label='Result' description='Result of the query')
        public String result;
    }

    public class QueryRequest {
        public String function;
        public List<Object> timeframes;
        public List<Object> filters;
        // NUEVOS CAMPOS PARA FILTRADO
        public String businessArea;
        public String businessSubarea;
    }

    @InvocableMethod(label='Execute Engloba Query' description='Executes logic based on JSON input')
    public static List<Output> executeQuery(List<Input> inputs) {
        List<Output> outputs = new List<Output>();

        for (Input inp : inputs) {
            Output out = new Output();
            try {
                if (String.isBlank(inp.recordId)) {
                    throw new CalloutException('Por favor, visualice un registro de cliente válido.');
                }

                if (inp.sObjectName != 'Account') {
                    throw new CalloutException('Esta funcionalidad solo está disponible para clientes.');
                }

                String effectiveRecordId = inp.recordId;
                List<QueryRequest> requests = parseQueryRequests(inp.jsonInput);
                Map<String, Object> results = new Map<String, Object>();

                for (QueryRequest req : requests) {
                    if (req.function == 'getEnglobaData') {
                        results.put('getEnglobaData', getEnglobaData(effectiveRecordId, req.timeframes, req.filters, req.businessArea, req.businessSubarea));
                    }
                }
                
                out.status = 'OK';
                out.result = JSON.serialize(results);
            } catch (Exception e) {
                out.status = 'KO';
                out.errorMessage = e.getMessage();
            }
            outputs.add(out);
        }
        return outputs;
    }

    private static List<QueryRequest> parseQueryRequests(String jsonInput) {
        if (String.isBlank(jsonInput)) {
            return new List<QueryRequest>();
        }
        
        String sanitizedJson = jsonInput.unescapeHtml4();
        sanitizedJson = sanitizedJson.replaceAll('```json', '').replaceAll('```', '').trim();
        
        Object deserialized = JSON.deserializeUntyped(sanitizedJson);
        List<Object> rawList = new List<Object>();

        if (deserialized instanceof List<Object>) {
            rawList = (List<Object>) deserialized;
        } else if (deserialized instanceof Map<String, Object>) {
            rawList.add(deserialized);
        }

        List<QueryRequest> requests = new List<QueryRequest>();
        
        for (Object rawItem : rawList) {
            Map<String, Object> itemMap = (Map<String, Object>) rawItem;
            QueryRequest req = new QueryRequest();
            req.function = (String) itemMap.get('function');
            req.timeframes = (List<Object>) itemMap.get('timeframes');
            req.filters = (List<Object>) itemMap.get('filters');
            // MAPEAMOS LOS NUEVOS FILTROS DESDE EL JSON
            req.businessArea = (String) itemMap.get('businessArea');
            req.businessSubarea = (String) itemMap.get('businessSubarea');
            requests.add(req);
        }
        return requests;
    }

    private static Map<String, Object> getEnglobaData(String accountId, List<Object> timeframes, List<Object> filters, String bArea, String bSubarea) {
        Map<String, Object> result = new Map<String, Object>();
        
        if (timeframes == null || timeframes.isEmpty()) {
            return result;
        }

        List<String> perimeterTypes = new List<String>();
        if (filters != null) {
            for (Object f : filters) {
                String filterVal = (String)f;
                if (filterVal == 'CIB') {
                    perimeterTypes.add('D');
                } else if (filterVal == 'NoCIB') {
                    perimeterTypes.add('F');
                }
            }
        }
        
        if (!perimeterTypes.isEmpty()) {
            throw new CalloutException(
                'The CIB/NoCIB filter is not available for the current Revenue data model.'
                );
            }
            
        for (Object tfObj : timeframes) {
            String tf = (String)tfObj;
            Integer currentYear = Date.today().year();
            Integer lastYear = Date.today().year() - 1;
            
            // Reemplaza esto con la lógica real de tus años si 'thisYear'/'lastYear' no son literales en el campo
            String query = 'SELECT LAB_Account__c, LAB_Revenue_Year__c, LAB_Business_Area__c, LAB_Country__c, ' +
                           'LAB_Business_Subarea__c, LAB_Revenue_Amount__c ' +
                           'FROM LAB_Client_Revenue__c ' +
                           'WHERE LAB_Account__c = :accountId ';

            if (tf == 'thisYear') {
                query += ' AND LAB_Revenue_Year__c = :currentYear';
            }
            else{
                query += ' AND LAB_Revenue_Year__c = :lastYear';
            }
// FILTROS DE ÁREA Y SUBÁREA
            if (String.isNotBlank(bArea)) query += ' AND LAB_Business_Area__c = :bArea ';
            if (String.isNotBlank(bSubarea)) query += ' AND LAB_Business_Subarea__c = :bSubarea ';

            // Ejecución de la query con el objeto correcto
            List<LAB_Client_Revenue__c> rows = Database.query(query);
            
            Map<String, Object> tfResult = new Map<String, Object>();
            tfResult.put('data', buildMatrix(rows));
            tfResult.put('query', query);

            result.put(tf, tfResult);
        }

        return result;
    }

    private static Map<String, Object> buildMatrix(List<LAB_Client_Revenue__c> rows) {
        Map<String, Object> byCountry = new Map<String, Object>();
        Map<String, Object> globalData = new Map<String, Object>{
            'total' => 0.0,
            'types' => new Map<String, Object>()
        };

        for (LAB_Client_Revenue__c r : rows) {
            Decimal rev = (r.LAB_Revenue_Amount__c == null) ? 0 : r.LAB_Revenue_Amount__c;
            String country = String.isBlank(r.LAB_Country__c) ? 'Unknown' : r.LAB_Country__c;
            // Usamos Business Area como "Type" y Subarea como "Product" según los campos de tu nueva query
            String area = String.isBlank(r.LAB_Business_Area__c) ? 'Unknown' : r.LAB_Business_Area__c;
            String subarea = String.isBlank(r.LAB_Business_Subarea__c) ? 'Unknown' : r.LAB_Business_Subarea__c;

            updateHierarchy(globalData, area, subarea, rev);

            if (!byCountry.containsKey(country)) {
                byCountry.put(country, new Map<String, Object>{
                    'total' => 0.0,
                    'types' => new Map<String, Object>()
                });
            }
            updateHierarchy((Map<String, Object>) byCountry.get(country), area, subarea, rev);
        }

        return new Map<String, Object>{
            'byCountry' => byCountry,
            'global'    => globalData
        };
    }

    private static void updateHierarchy(Map<String, Object> container, String type, String product, Decimal rev) {
        Decimal currentTotal = (Decimal) container.get('total');
        container.put('total', currentTotal + rev);

        Map<String, Object> typesMap = (Map<String, Object>) container.get('types');
        
        if (!typesMap.containsKey(type)) {
            typesMap.put(type, new Map<String, Object>{
                'total' => 0.0,
                'products' => new Map<String, Decimal>()
            });
        }
        
        Map<String, Object> typeEntry = (Map<String, Object>) typesMap.get(type);
        typeEntry.put('total', (Decimal)typeEntry.get('total') + rev);

        Map<String, Decimal> productsMap = (Map<String, Decimal>) typeEntry.get('products');
        Decimal productTotal = productsMap.containsKey(product) ? productsMap.get(product) : 0;
        productsMap.put(product, productTotal + rev);
    }
}