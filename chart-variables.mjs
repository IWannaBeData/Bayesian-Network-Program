const yesNo = ['Yes', 'No', 'Unknown', 'Declined'];
const useStatus = ['Never', 'Former', 'Current', 'Unknown', 'Declined'];
const diagnosis = ['icd10cm', 'snomedct', 'local'];
const clinical = ['snomedct', 'local'];
const medications = ['rxnorm', 'ndc', 'local'];
const tests = ['loinc', 'local'];
const procedures = ['cpt', 'hcpcs', 'icd10pcs', 'snomedct', 'local'];

export const VOCABULARIES = {
  icd10cm: { label: 'ICD-10-CM', uri: 'http://hl7.org/fhir/sid/icd-10-cm' },
  snomedct: { label: 'SNOMED CT', uri: 'http://snomed.info/sct' },
  rxnorm: { label: 'RxNorm', uri: 'http://www.nlm.nih.gov/research/umls/rxnorm' },
  ndc: { label: 'NDC', uri: 'http://hl7.org/fhir/sid/ndc' },
  loinc: { label: 'LOINC', uri: 'http://loinc.org' },
  cvx: { label: 'CVX', uri: 'http://hl7.org/fhir/sid/cvx' },
  cpt: { label: 'CPT', uri: 'http://www.ama-assn.org/go/cpt' },
  hcpcs: { label: 'HCPCS Level II' },
  icd10pcs: { label: 'ICD-10-PCS', uri: 'http://www.cms.gov/Medicare/Coding/ICD10' },
  hgnc: { label: 'HGNC gene ID', uri: 'https://www.genenames.org/' },
  clinvar: { label: 'ClinVar variant ID', uri: 'https://www.ncbi.nlm.nih.gov/clinvar/' },
  hgvs: { label: 'HGVS variant', uri: 'https://hgvs-nomenclature.org/' },
  udi: { label: 'Unique device identifier' },
  local: { label: 'Uncoded term or local code' },
};

const named = (type, list) => list.split('|').map(pair => {
  const [id, label] = pair.split('=');
  return { id, label, type };
});
const notes = list => named('text', list);
const dates = list => named('date', list);
const number = (id, label, unit, min, max, integer = false) => ({ id, label, type: 'number', unit, min, max, integer });
const choice = (id, label, options = yesNo) => ({ id, label, type: 'enum', options });
const coded = (id, label, systems, extra = {}) => ({ id, label, type: 'code', systems, ...extra });
const result = (id, label, systems = tests) => coded(id, label, systems, { result: true });
const relationships = ['Mother', 'Father', 'Sibling', 'Child', 'Maternal grandmother', 'Maternal grandfather',
  'Paternal grandmother', 'Paternal grandfather', 'Aunt', 'Uncle', 'Cousin', 'Other relative', 'Unknown relationship'];

const inventory = [
  ['demographics', 'Demographics', [
    { id: 'age_years', label: 'Age in completed years', type: 'age' },
    number('age_months', 'Pediatric age in months', 'mo', 0, 120, true),
    number('age_days', 'Infant age in days', 'd', 0, 365, true),
    choice('administrative_sex', 'Administrative sex as recorded', ['Female', 'Male', 'Other', 'Unknown']),
    choice('sex_assigned_at_birth', 'Sex assigned at birth', ['Female', 'Male', 'Another value as recorded', 'Unknown', 'Declined']),
    choice('sex_parameter_clinical_use', 'Sex parameter for clinical use', ['Female-typical', 'Male-typical', 'Specified', 'Unknown']),
    notes('gender_identity=Gender identity as recorded|race=Race as recorded|ethnicity=Ethnicity as recorded|preferred_language=Preferred language|communication_need=Communication or accessibility needs|marital_status=Marital or partnership status'),
    choice('interpreter_needed', 'Interpreter needed'),
  ]],
  ['symptoms', 'Symptoms, exam and review of systems', [
    coded('symptom', 'Symptom or reported concern', diagnosis, { reuseICD: true }),
    coded('exam_finding', 'Physical examination finding', diagnosis, { reuseICD: true }),
    notes('chief_complaint=Chief complaint|hpi=History of present illness|symptom_location=Symptom location|symptom_quality=Symptom quality|symptom_radiation=Radiation|symptom_duration=Duration|symptom_frequency=Frequency|symptom_timing=Timing and pattern|aggravating_factor=Aggravating factor|relieving_factor=Relieving factor|associated_symptoms=Associated symptoms|review_of_systems=Review of systems|physical_exam=Physical examination detail|mental_status_exam=Mental status examination'),
    dates('symptom_onset=Symptom onset|symptom_resolution=Symptom resolution'),
    number('symptom_severity', 'Symptom severity', '0–10 score', 0, 10),
    choice('symptom_course', 'Symptom course', ['New', 'Improving', 'Stable', 'Worsening', 'Intermittent', 'Resolved', 'Unknown']),
    choice('laterality', 'Laterality', ['Left', 'Right', 'Bilateral', 'Midline', 'Unknown']),
  ]],
  ['problems', 'Diagnoses and personal history', [
    coded('diagnosis', 'Problem list or encounter diagnosis', diagnosis, { reuseICD: true }),
    coded('past_diagnosis', 'Personal history of a condition', diagnosis),
    coded('past_infection', 'History of infection', diagnosis),
    notes('medical_history=Past medical history detail|diagnosis_stage=Stage, grade or subtype|differential_diagnosis=Differential diagnosis|problem_note=Problem list note|medical_history_source=Source of personal history'),
    dates('diagnosis_onset=Diagnosis onset|diagnosis_recorded=Diagnosis documented date|diagnosis_abatement=Diagnosis abatement or resolution'),
    choice('problem_status', 'Problem clinical status', ['Active', 'Recurring', 'In remission', 'Resolved', 'Inactive', 'Unknown']),
    choice('diagnosis_certainty', 'Diagnosis verification', ['Confirmed', 'Provisional', 'Differential', 'Refuted', 'Entered in error', 'Unknown']),
  ]],
  ['family', 'Family history and genetics', [
    coded('family_history', 'Condition in a relative', diagnosis, { relationships }),
    coded('genetic_gene', 'Gene of clinical interest', ['hgnc', 'local']),
    coded('genetic_variant', 'Reported genetic variant', ['clinvar', 'hgvs', 'local']),
    result('genetic_test', 'Genetic or genomic test'),
    choice('genetic_classification', 'Reported variant classification', ['Pathogenic', 'Likely pathogenic', 'Uncertain significance', 'Likely benign', 'Benign', 'Other', 'Unknown']),
    choice('genetic_zygosity', 'Reported zygosity', ['Heterozygous', 'Homozygous', 'Hemizygous', 'Compound heterozygous', 'Mosaic', 'Other', 'Unknown']),
    choice('consanguinity', 'Consanguinity documented'),
    number('relative_age_at_diagnosis', 'Relative’s age at diagnosis', 'years', 0, 140, true),
    number('relative_age_at_death', 'Relative’s age at death', 'years', 0, 140, true),
    notes('family_history_note=Family history and pedigree details|inheritance_pattern=Reported inheritance pattern|genetic_reference=Reference sequence, genome build or report ID'),
  ]],
  ['medications', 'Medications, treatments and supplements', [
    coded('medication', 'Medication or supplement reportedly taken', medications),
    coded('medication_order', 'Medication ordered or prescribed', medications),
    coded('medication_dispense', 'Medication dispensed', medications),
    coded('medication_administration', 'Medication administered', medications),
    coded('medication_indication', 'Reason for a medication', diagnosis),
    choice('medication_status', 'Medication status', ['Active', 'Held', 'Stopped', 'Completed', 'Historical', 'Not taking', 'Unknown']),
    choice('medication_adherence', 'Medication adherence', ['As prescribed', 'Some doses missed', 'Not taking', 'Unknown', 'Declined']),
    number('medication_dose', 'Medication dose amount', null, 0),
    notes('medication_strength=Strength or concentration|medication_unit=Dose unit|medication_route=Administration route|medication_frequency=Frequency and schedule|medication_form=Formulation|medication_sig=Dosing instructions or SIG|medication_response=Treatment response|medication_stop_reason=Discontinuation reason|prescriber=Prescriber or source|medication_reconciliation=Medication reconciliation notes'),
    dates('medication_start=Medication start date|medication_end=Medication end date|medication_last_dose=Last dose date'),
  ]],
  ['allergies', 'Allergies, reactions and adverse events', [
    coded('drug_allergy', 'Medication allergen', ['rxnorm', 'snomedct', 'local']),
    coded('allergy', 'Food, environmental or other allergen', clinical),
    coded('allergy_reaction', 'Allergy reaction or manifestation', clinical),
    coded('adverse_event', 'Adverse event', diagnosis),
    choice('allergy_type', 'Allergy or intolerance', ['Allergy', 'Intolerance', 'Other', 'Unknown']),
    choice('reaction_severity', 'Reaction severity', ['Mild', 'Moderate', 'Severe', 'Unknown']),
    choice('allergy_status', 'Allergy verification', ['Confirmed', 'Unconfirmed', 'Refuted', 'No known allergies documented', 'Unknown']),
    notes('adverse_event_outcome=Adverse event outcome|adverse_event_context=Suspected cause or intervention|allergy_note=Allergy and adverse reaction details'),
    dates('reaction_onset=Allergy or adverse event onset'),
  ]],
  ['tobacco', 'Tobacco, nicotine and vaping', [
    choice('smoking_status', 'Cigarette smoking status', ['Never', 'Former', 'Current daily', 'Current some days', 'Current frequency unknown', 'Unknown', 'Declined']),
    choice('vaping_status', 'Vaping or e-cigarette use', useStatus),
    choice('smokeless_tobacco_status', 'Smokeless tobacco use', useStatus),
    choice('secondhand_smoke', 'Secondhand smoke exposure'),
    number('smoking_pack_years', 'Cigarette pack-years', 'pack-years', 0),
    number('cigarettes_per_day', 'Cigarettes per day', 'cigarettes/day', 0),
    number('smoking_start_age', 'Age at smoking initiation', 'years', 0, 140, true),
    dates('smoking_quit_date=Quit date'),
    notes('tobacco_type=Other tobacco or nicotine product|tobacco_history=Tobacco exposure history|smoking_cessation=Smoking cessation counseling or therapy'),
  ]],
  ['substances', 'Alcohol and other substance use', [
    choice('alcohol_use', 'Alcohol use status', useStatus),
    choice('cannabis_use', 'Cannabis use status', useStatus),
    choice('nonmedical_drug_use', 'Nonmedical drug use status', useStatus),
    choice('injection_drug_use', 'Injection drug use status', useStatus),
    coded('substance_exposure', 'Substance or exposure', clinical),
    number('alcohol_drinks_per_week', 'Standard alcoholic drinks per week', 'drinks/week', 0),
    dates('substance_last_use=Last use date'),
    notes('substance_use_pattern=Quantity, frequency and route|substance_treatment_history=Treatment or recovery history'),
  ]],
  ['sexual', 'Sexual, reproductive and perinatal history', [
    choice('sexual_activity', 'Sexual activity', ['Never', 'Previously active', 'Currently active', 'Unknown', 'Declined']),
    choice('barrier_use', 'Barrier protection use', ['Always', 'Sometimes', 'Never', 'Not applicable', 'Unknown', 'Declined']),
    number('sexual_partner_count', 'Number of partners in documented interval', 'people', 0, undefined, true),
    notes('sexual_orientation=Sexual orientation as recorded|sexual_partner_interval=Interval covered by partner count|sexual_practices=Sexual practices as documented|sexual_partner_history=Partner history|contraception=Contraception method|reproductive_goals=Reproductive intentions|menstrual_history=Menstrual history|ob_gyn_history=Obstetric and gynecologic history|pregnancy_outcome=Prior pregnancy outcome|birth_history=Birth or perinatal history|fertility_history=Fertility and treatment history'),
    coded('sti_history', 'History of sexually transmitted infection', diagnosis),
    result('sexual_health_screen', 'Sexual health screening result'),
    coded('obstetric_history', 'Obstetric or perinatal condition', diagnosis),
    choice('pregnancy_status', 'Pregnancy status', ['Pregnant', 'Not pregnant', 'Unknown', 'Declined']),
    choice('menopause_status', 'Menopausal status', ['Premenopausal', 'Perimenopausal', 'Postmenopausal', 'Other', 'Unknown']),
    number('gravidity', 'Gravidity', 'pregnancies', 0, undefined, true),
    number('parity', 'Parity', 'births', 0, undefined, true),
    number('gestational_age', 'Gestational age', 'weeks', 0),
    dates('last_menstrual_period=Last menstrual period|estimated_due_date=Estimated due date|delivery_date=Delivery date'),
  ]],
  ['social', 'Social history, environment and access', [
    notes('living_arrangement=Living arrangement|occupation=Occupation or duties|industry=Industry|employment_status=Employment status|occupational_exposure=Occupational exposure|environmental_exposure=Home or environmental exposure|education_level=Education level|financial_strain=Financial strain|diet=Diet and nutrition|sleep_habits=Sleep habits|travel_history=Travel history|animal_exposure=Animal exposure|sick_contacts=Illness exposure or sick contact|social_support=Social support|military_history=Military service and exposures|caregiver_support=Caregiver availability|physical_activity=Physical activity habits'),
    choice('housing_insecurity', 'Housing insecurity documented'),
    choice('food_insecurity', 'Food insecurity documented'),
    choice('transportation_barrier', 'Transportation barrier documented'),
    choice('interpersonal_safety', 'Interpersonal safety concern documented'),
    number('physical_activity_minutes', 'Physical activity per week', 'min/week', 0),
    number('sleep_duration', 'Usual nightly sleep duration', 'h/night', 0, 24),
    coded('social_need', 'Coded social need or barrier', diagnosis),
    coded('social_service', 'Social service referral or intervention', clinical),
  ]],
  ['procedures', 'Procedures, surgeries and devices', [
    coded('procedure', 'Procedure or surgery performed', procedures),
    coded('procedure_history', 'Past operation or procedure', procedures),
    coded('procedure_order', 'Procedure ordered', procedures),
    coded('device', 'Implanted or external device', ['udi', 'snomedct', 'local']),
    coded('transfusion', 'Transfusion or blood product', clinical),
    notes('procedure_indication=Procedure indication|procedure_outcome=Procedure findings or outcome|procedure_site=Procedure site or laterality|device_status=Device model or use status|surgical_history=Uncoded surgical history'),
    dates('procedure_date=Procedure date|device_implanted=Date implanted|device_removed=Date removed'),
  ]],
  ['vitals', 'Vitals, flowsheets and anthropometrics', [
    number('systolic_bp', 'Systolic blood pressure', 'mmHg', 0),
    number('diastolic_bp', 'Diastolic blood pressure', 'mmHg', 0),
    number('heart_rate', 'Heart rate', 'beats/min', 0),
    number('respiratory_rate', 'Respiratory rate', 'breaths/min', 0),
    number('oxygen_saturation', 'Oxygen saturation', '%', 0, 100),
    number('oxygen_flow', 'Supplemental oxygen flow', 'L/min', 0),
    number('temperature_c', 'Body temperature', '°C', 0),
    number('height_cm', 'Height or length', 'cm', 0),
    number('weight_kg', 'Weight', 'kg', 0),
    number('bmi', 'Recorded body mass index', 'kg/m²', 0),
    number('head_circumference', 'Head circumference', 'cm', 0),
    number('waist_circumference', 'Waist circumference', 'cm', 0),
    number('pain_score', 'Pain score', '0–10 score', 0, 10),
    number('peak_flow', 'Peak expiratory flow', 'L/min', 0),
    number('growth_percentile', 'Pediatric growth percentile', '%', 0, 100),
    result('other_vital', 'Other measured vital sign or flowsheet item'),
    notes('measurement_position=Measurement posture or site|oxygen_delivery=Oxygen delivery method|measurement_method=Measurement method or equipment'),
  ]],
  ['tests', 'Labs, imaging, pathology and diagnostics', [
    result('lab_result', 'Laboratory test result'), coded('lab_order', 'Laboratory test ordered', tests),
    result('microbiology_result', 'Microbiology result'),
    result('diagnostic_test', 'Other diagnostic test result'),
    coded('imaging_order', 'Imaging ordered', ['loinc', 'cpt', 'local']),
    coded('imaging_study', 'Imaging study performed', ['loinc', 'cpt', 'local']),
    coded('imaging_finding', 'Imaging finding', diagnosis),
    result('pathology_result', 'Pathology result', ['loinc', 'snomedct', 'local']),
    coded('specimen_type', 'Specimen type or source', clinical), coded('organism', 'Reported organism', clinical),
    dates('specimen_collected=Specimen collection date|test_result_date=Test result date'),
    notes('reference_range=Reported reference range|test_interpretation=Result interpretation flag|test_result_status=Preliminary, corrected or final result status|imaging_modality=Imaging modality|diagnostic_impression=Diagnostic report impression|test_method=Test method or assay|specimen_identifier=Specimen or accession identifier|diagnostic_report_link=Reference to report or images'),
  ]],
  ['prevention', 'Immunizations, screening and prevention', [
    coded('immunization', 'Vaccine or immunization event', ['cvx', 'ndc', 'local']),
    result('screening', 'Screening exam or test', ['loinc', 'snomedct', 'cpt', 'local']),
    number('vaccine_dose', 'Vaccine dose or series number', 'dose', 1, undefined, true),
    dates('vaccine_date=Vaccine administration date|screening_due=Screening due date'),
    notes('vaccine_lot=Vaccine lot number|vaccine_manufacturer=Vaccine manufacturer|vaccine_site=Vaccine administration route or site|vaccine_status=Immunization completion or refusal reason|health_maintenance=Health maintenance item'),
  ]],
  ['functional', 'Function, disability and behavioral health', [
    coded('functional_finding', 'Functional, disability or mental-status finding', clinical),
    result('questionnaire', 'Questionnaire or screening scale score'),
    notes('adl=Activities of daily living|iadl=Instrumental activities of daily living|mobility=Mobility or gait|assistive_device=Assistive device|cognition=Cognition or mental status|mood=Mood or behavior|behavioral_history=Behavioral health history|hearing=Hearing function|vision=Vision function|disability=Disability or accessibility information'),
    choice('history_of_falls', 'History of falls documented'),
    number('falls_count', 'Falls in the documented interval', 'falls', 0, undefined, true),
  ]],
  ['encounters', 'Encounters, admissions and referrals', [
    choice('encounter_setting', 'Encounter setting', ['Office', 'Emergency department', 'Inpatient', 'Urgent care', 'Telehealth', 'Home', 'Other', 'Unknown']),
    coded('admission_reason', 'Reason for admission or referral', diagnosis),
    dates('encounter_date=Encounter date|admission_date=Admission date|discharge_date=Discharge date'),
    notes('discharge_disposition=Discharge disposition|hospitalization_history=Hospitalization history|encounter_service=Department or specialty|referral_reason=Referral reason|referral_status=Referral status|appointment_status=Appointment status|visit_type=Encounter or visit type'),
  ]],
  ['plan', 'Care plans, goals and preferences', [
    coded('treatment_intervention', 'Care intervention', clinical),
    notes('care_plan=Care plan|assessment_plan=Assessment and plan|patient_goal=Patient-stated goal|goal_status=Goal progress or outcome|treatment_preference=Treatment or care preference|advance_directive=Advance directive status|resuscitation_status=Resuscitation or code status|scope_of_treatment=Scope of treatment|care_team_role=Care team role|followup_plan=Follow-up or safety-net instructions'),
    dates('next_follow_up=Planned follow-up date'),
  ]],
  ['documentation', 'Notes, documents and provenance', [
    notes('note_type=Clinical note type|note_title=Note or document title|note_body=Clinical note or document text|note_reference=Document reference|document_status=Signature, amendment or correction status|record_author=Author or source role|record_origin=Source organization or system|record_method=Patient-reported, observed or imported|chart_alert=Chart alert or flag|consent_status=Consent or authorization status|media_reference=Media or attachment reference|audit_event=Record access or change event'),
    dates('authored_date=Note authored date|verified_date=Verification date'),
  ], 'metadata'],
  ['administration', 'Registration, facility, coverage and billing', [
    notes('patient_identifier=Patient identifier or MRN|identifier_issuer=Identifier issuer|patient_name=Name as charted|preferred_name=Preferred name|pronouns=Pronouns|address=Chart address|phone=Chart phone|email=Chart email|related_contact=Emergency or related contact|guarantor=Guarantor details|payer=Insurance payer|coverage_plan=Coverage plan|coverage_id=Member or group identifier|coverage_status=Insurance eligibility|primary_clinician=Primary clinician or practice|facility=Facility name or identifier|facility_location=Facility location|authorization=Authorization reference|billing_claim=Claim or charge reference|billing_status=Billing or payment status'),
    dates('date_of_birth=Date of birth|date_of_death=Date of death|coverage_start=Coverage begins|coverage_end=Coverage ends'),
  ], 'metadata'],
  ['custom', 'Specialty and local fields', [
    coded('custom_finding', 'Additional coded or uncoded finding', Object.keys(VOCABULARIES)),
    result('custom_result', 'Additional structured result', Object.keys(VOCABULARIES)),
    { id: 'custom_field', label: 'Additional named chart field', type: 'custom' },
  ]],
];

export const CHART_SECTIONS = inventory.map(([id, label, fields, role = 'evidence']) => ({
  id, label, fields: fields.flat().map(field => ({ ...field, section: id, role })),
}));
export const CHART_FIELDS = CHART_SECTIONS.flatMap(section => section.fields);

export const AGE_VARIABLES = Object.freeze(Array.from({ length: 141 }, (_, years) => Object.freeze({
  id: 'age_' + years,
  years,
  label: 'Age ' + years + (years === 1 ? ' year' : ' years'),
  section: 'demographics',
  type: 'age_state',
  role: 'evidence',
  exclusiveGroup: 'age_years',
})));

const fields = new Map([...CHART_FIELDS, ...AGE_VARIABLES].map(field => [field.id, field]));

export function lookupChartVariable(id) {
  return fields.get(id);
}
