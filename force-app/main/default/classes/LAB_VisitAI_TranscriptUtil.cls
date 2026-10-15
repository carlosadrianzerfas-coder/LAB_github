public with sharing class LAB_VisitAI_TranscriptUtil {
    private static final Set<String> STOPWORDS_ES = new Set<String>{
        'el','la','los','las','de','que','y','en','un','una','para','por','con','del','al',
        'se','es','son','fue','fueron','como','porque','pero','si','no','ya','luego',
        'aqui','tambien','cuando','donde','hay','muy','mas',
        'me','les','lo','nada','pues','hasta','hoy','ahi','eso'
    };

    private static final Set<String> STOPWORDS_EN = new Set<String>{
        'the','and','of','to','in','for','with','on','we','you','is','are','was','were',
        'have','has','this','that','these','those','from','as','at','by','be','been',
        'it','its','they','their','our','your'
    };

    public static Map<String, Object> buildTranscriptPayload(String rawTranscript) {
        Map<String, Object> payload = new Map<String, Object>();
        String safe = rawTranscript == null ? '' : rawTranscript;
        payload.put('text', safe);
        payload.put('language', detectLanguage(safe));
        return payload;
    }

    private static String detectLanguage(String rawTranscript) {
        if (String.isBlank(rawTranscript)) {
            return 'ES';
        }

        String normalized = normalizeForLanguage(rawTranscript);
        List<String> tokens = tokenize(normalized);
        if (tokens.isEmpty()) {
            return 'ES';
        }

        Integer countEs = 0;
        Integer countEn = 0;
        for (String token : tokens) {
            if (STOPWORDS_ES.contains(token)) countEs++;
            if (STOPWORDS_EN.contains(token)) countEn++;
        }

        if (countEn >= countEs + 3) {
            return 'EN';
        }
        return 'ES';
    }

    private static String normalizeForLanguage(String input) {
        String lower = input == null ? '' : input.toLowerCase();
        String noDiacritics = stripDiacritics(lower);
        String collapsed = noDiacritics.replaceAll('\\s+', ' ').trim();
        return collapsed;
    }

    private static List<String> tokenize(String input) {
        if (String.isBlank(input)) return new List<String>();
        String[] parts = input.split('[^a-z]+');
        List<String> out = new List<String>();
        for (String p : parts) {
            if (!String.isBlank(p)) out.add(p);
        }
        return out;
    }

    private static String stripDiacritics(String input) {
        if (String.isBlank(input)) return '';
        String out = input;
        out = out.replace('á', 'a').replace('à', 'a').replace('ä', 'a').replace('â', 'a');
        out = out.replace('é', 'e').replace('è', 'e').replace('ë', 'e').replace('ê', 'e');
        out = out.replace('í', 'i').replace('ì', 'i').replace('ï', 'i').replace('î', 'i');
        out = out.replace('ó', 'o').replace('ò', 'o').replace('ö', 'o').replace('ô', 'o');
        out = out.replace('ú', 'u').replace('ù', 'u').replace('ü', 'u').replace('û', 'u');
        out = out.replace('ñ', 'n');
        return out;
    }
}