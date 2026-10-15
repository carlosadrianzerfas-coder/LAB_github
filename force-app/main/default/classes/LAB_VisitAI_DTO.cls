public with sharing class LAB_VisitAI_DTO {
    
    /* ============================================================
       ROOT
    ============================================================ */
    public class Root {
        public String feedback_richtext;
        public String language;
        public VisitDTO visit; // legacy single visit (visita actual)
        public List<VisitDTO> future_visits; // visitas futuras recomendadas
        public List<ClientParticipantDTO> client_participants;
        public List<InternalParticipantDTO> internal_participants;
        public List<TaskDTO> tasks;
        public DeletedDTO deleted;
    }

    /* ============================================================
       VISIT
    ============================================================ */
    public class VisitDTO {
        public String visit_id;
        public String reference_id;
        public Boolean requires_creation;
        public String visit_name;
        public String start_datetime;
        public Integer duration_minutes;
        public String channel_code;
        public String purpose_type_code;
    }

    /* ============================================================
       CLIENT PARTICIPANT
    ============================================================ */
    public class ClientParticipantDTO {
        public String full_name;
        public String role;
        public String email;
        public String phone;

        public Boolean exists_in_crm;
        public String matched_contact_id;
        public String visit_contact_id;
        public String contact_id;

        public String reference_id;

        public Boolean needs_new_contact;
        public NewContactDTO new_contact;
    }

    public class NewContactDTO {
        public String first_name;
        public String last_name;
        public String email;
        public String phone;
        public String title_role;
        public String record_type;
        public String record_type_id;
    }

    /* ============================================================
       INTERNAL PARTICIPANT
    ============================================================ */
    public class InternalParticipantDTO {
        public String full_name;
        public String email;
        public String phone;
        public String role;

        public String matched_user_id;
        public String visit_management_team_id;
        public Boolean exists_in_visit;

        public String reference_id;
    }

    /* ============================================================
       TASK
    ============================================================ */
    public class TaskDTO {
        public String task_id;
        public String reference_id;
        public String subject;
        public String due_date;
        public String description;
    }

    /* ============================================================
       DELETED
    ============================================================ */
    public class DeletedDTO {
        public List<String> visit_contact_ids;
        public List<String> visit_management_team_ids;
        public List<String> task_ids;
    }
}