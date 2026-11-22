// Clinical search terms apply to the exact catalog code. MeSH IDs document the
// selected NLM descriptors. Search terms can retrieve a broader study population.
export const diagnosisSearchTerms = {
  C34: { synonyms: ['lung cancer'], mesh: [['Lung Neoplasms', 'D008175']] },
  C50: { synonyms: ['breast cancer', 'breast carcinoma'], mesh: [['Breast Neoplasms', 'D001943']] },
  E282: { synonyms: ['polycystic ovary syndrome', 'PCOS'], mesh: [['Polycystic Ovary Syndrome', 'D011085']] },
  G4733: { synonyms: ['obstructive sleep apnea', 'obstructive sleep apnoea'], mesh: [['Sleep Apnea, Obstructive', 'D020181']] },
  I10: { synonyms: ['essential hypertension', 'primary hypertension'], mesh: [['Hypertension', 'D006973', 'noexp']] },
  I21: { synonyms: ['myocardial infarction', 'heart attack', 'STEMI', 'NSTEMI'], mesh: [['Myocardial Infarction', 'D009203']] },
  I48: { synonyms: ['atrial fibrillation', 'atrial flutter'], mesh: [['Atrial Fibrillation', 'D001281'], ['Atrial Flutter', 'D001282']] },
  I63: { synonyms: ['ischemic stroke', 'ischaemic stroke', 'cerebral infarction'], mesh: [['Ischemic Stroke', 'D000083242'], ['Brain Infarction', 'D020520']] },
  J44: { synonyms: ['chronic obstructive pulmonary disease', 'COPD'], mesh: [['Pulmonary Disease, Chronic Obstructive', 'D029424']] },
  J45: { synonyms: ['bronchial asthma', 'asthma'], mesh: [['Asthma', 'D001249']] },
  K760: {
    synonyms: ['fatty liver', 'hepatic steatosis', 'NAFLD', 'MASLD', 'non-alcoholic fatty liver disease'],
    mesh: [['Fatty Liver', 'D005234'], ['Non-alcoholic Fatty Liver Disease', 'D065626']],
  },
  N18: { synonyms: ['chronic kidney disease', 'CKD'], mesh: [['Renal Insufficiency, Chronic', 'D051436']] },
  O244: { synonyms: ['gestational diabetes', 'gestational diabetes mellitus'], mesh: [['Diabetes, Gestational', 'D016640']] },
  Z8632: {
    synonyms: ['prior gestational diabetes', 'previous gestational diabetes', 'history of gestational diabetes', 'after gestational diabetes'],
    mesh: [['Diabetes, Gestational', 'D016640']],
  },
};

const diabetes = [
  '"Diabetes Mellitus, Type 2"[MeSH Terms]',
  '"type 2 diabetes"[Title/Abstract]',
  '"type II diabetes"[Title/Abstract]',
  'T2DM[Title/Abstract]',
  '"Type2 Diabetes"[Title/Abstract]',
];

function titleTerm(phrase) {
  return '"' + phrase.replace(/["\r\n]/g, '').trim() + '"[Title/Abstract]';
}

export function pubmedQuery(record) {
  const key = record.code.replace('.', '').toUpperCase();
  const vetted = diagnosisSearchTerms[key];
  const phrases = [record.title, record.code, ...(vetted?.synonyms ?? [])];
  const uniquePhrases = [...new Map(phrases.map(phrase => [phrase.toLowerCase(), phrase])).values()];
  const terms = uniquePhrases.map(titleTerm);
  for (const [heading, , expansion] of vetted?.mesh ?? []) {
    terms.push('"' + heading + '"[MeSH Terms' + (expansion ? ':' + expansion : '') + ']');
  }

  const term = '(' + diabetes.join(' OR ') + ') AND (' + terms.join(' OR ') + ')';
  return {
    term,
    url: 'https://pubmed.ncbi.nlm.nih.gov/?' + new URLSearchParams({ term }),
    vocabulary: vetted ? 'vetted' : 'catalog_terms',
  };
}
