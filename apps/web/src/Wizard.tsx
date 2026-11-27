import { useState } from 'react';
import { fiscalIssues, sectionOf, validateParams, type InvestmentParams, type NumericField, type Section } from '@immobil/core';
import { currency, percentage, plainText, translator, type Language } from '@immobil/i18n';
import { FiscalControls } from './FiscalControls';
import { fieldLabels, freshParams, ParameterField } from './parameters';

type StepId = 'section' | 'property' | 'rent' | 'costs' | 'mortgage' | 'horizon' | 'tax' | 'summary';

const STEP_FIELDS: Partial<Record<StepId, NumericField[]>> = {
  property: ['valore_immobile', 'costo_acquisto', 'costo_ristrutturazione', 'commissione_iniziale'],
  rent: ['affitto_lordo', 'periodo_sfitto_perc', 'adeguamento_affitto_anni'],
  costs: ['costi_gestione_euro', 'costi_assicurazione_euro', 'manutenzione_straordinaria_perc', 'tassazione_affitti_perc', 'tassa_catastale_perc'],
  mortgage: ['rata_mutuo_mensile', 'anni_restanti_mutuo', 'debito_residuo_mutuo'],
  horizon: ['anni_investimento', 'rivalutazione_annua', 'inflazione_perc', 'commissione_finale'],
};
/** Le aliquote generiche sono sostituite dal profilo fiscale del Paese. */
const GENERIC_ONLY: NumericField[] = ['tassazione_affitti_perc', 'tassa_catastale_perc'];
const HELP: Partial<Record<NumericField, string>> = {
  valore_immobile: 'wizard_help_value', costo_acquisto: 'purchase_cost_help', costo_ristrutturazione: 'renovation_cost_help',
  commissione_iniziale: 'initial_commission_help', affitto_lordo: 'wizard_help_rent', periodo_sfitto_perc: 'wizard_help_vacancy',
  adeguamento_affitto_anni: 'rent_adjustment_years_help', costi_gestione_euro: 'annual_costs_help', costi_assicurazione_euro: 'insurance_help',
  manutenzione_straordinaria_perc: 'wizard_help_maintenance', tassazione_affitti_perc: 'wizard_help_rent_tax', tassa_catastale_perc: 'property_tax_help',
  rata_mutuo_mensile: 'wizard_help_mortgage_payment', anni_restanti_mutuo: 'wizard_help_mortgage_years', debito_residuo_mutuo: 'mortgage_debt_help', anni_investimento: 'wizard_help_years',
  rivalutazione_annua: 'wizard_help_appreciation', inflazione_perc: 'wizard_help_inflation', commissione_finale: 'final_commission_help',
};
const YEAR_FIELDS: NumericField[] = ['anni_investimento', 'anni_restanti_mutuo', 'adeguamento_affitto_anni'];
const PERCENT_FIELDS: NumericField[] = ['rivalutazione_annua', 'periodo_sfitto_perc', 'inflazione_perc', 'manutenzione_straordinaria_perc', 'tassazione_affitti_perc', 'tassa_catastale_perc'];
const ADJUSTMENT_LABELS = { property_value: 'property_value_adj', inflation: 'inflation_adj', none: 'no_adjustment' } as const;

export interface WizardProps {
  language: Language;
  initialSection: Section;
  /** Falso quando l'archivio ha raggiunto il numero massimo di scenari. */
  canSaveScenario: boolean;
  /** Dati completi e validi; scenarioName è null se l'utente non vuole salvare uno scenario. */
  onFinish: (inputs: InvestmentParams, scenarioName: string | null) => void;
  /** inputs è null se l'utente non ha modificato alcun dato: si conserva la bozza esistente. */
  onExpert: (section: Section, inputs: InvestmentParams | null) => void;
}

export function Wizard({ language, initialSection, canSaveScenario, onFinish, onExpert }: WizardProps) {
  const t = translator(language);
  const [params, setParams] = useState<InvestmentParams>(() => freshParams(initialSection));
  const [stepIndex, setStepIndex] = useState(0);
  /** Passo più avanzato già raggiunto: dopo una modifica dal riepilogo si può tornare avanti direttamente. */
  const [furthest, setFurthest] = useState(0);
  const [hasMortgage, setHasMortgage] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [saveScenario, setSaveScenario] = useState(canSaveScenario);
  const [scenarioName, setScenarioName] = useState('');
  const section = sectionOf(params);
  const steps: StepId[] = ['section', 'property', 'rent', 'costs', 'mortgage', 'horizon', ...(section === 'generic' ? [] : ['tax' as const]), 'summary'];
  const step = steps[stepIndex];
  const issues = validateParams(params);
  const visibleFields = (id: StepId) => (STEP_FIELDS[id] ?? []).filter(f => !params.taxProfile || !GENERIC_ONLY.includes(f))
    .filter(() => id !== 'mortgage' || hasMortgage);
  const dirty = JSON.stringify(params) !== JSON.stringify(freshParams(section));
  const money = (value: number) => currency(value, language);

  const update = (field: NumericField, value: number) => { setParams(p => ({ ...p, [field]: value })); setBlocked(null); };
  const chooseSection = (next: Section) => { if (next !== section) { setParams(freshParams(next)); setHasMortgage(false); setFurthest(0); } setBlocked(null); };
  const chooseMortgage = (yes: boolean) => {
    setHasMortgage(yes); setBlocked(null);
    if (!yes) setParams(p => ({ ...p, rata_mutuo_mensile: 0, anni_restanti_mutuo: 0, debito_residuo_mutuo: 0 }));
  };
  /** Motivo che impedisce di lasciare il passo, oppure null. */
  const stepProblem = (id: StepId): string | null => {
    if (issues.some(i => visibleFields(id).includes(i.field as NumericField))) return 'wizard_fix_errors';
    if (id === 'mortgage' && hasMortgage && (!(params.rata_mutuo_mensile > 0) || !(params.anni_restanti_mutuo >= 1) || !(params.debito_residuo_mutuo > 0))) return 'wizard_mortgage_required';
    if (id === 'tax' && params.taxProfile && fiscalIssues(params.taxProfile).length) return 'wizard_fix_errors';
    return null;
  };
  const goTo = (index: number) => { setStepIndex(index); setFurthest(f => Math.max(f, index)); setBlocked(null); };
  /** Andando avanti il passo corrente deve essere valido; tornare indietro è sempre possibile. */
  const jump = (index: number) => {
    const problem = index > stepIndex ? stepProblem(step) : null;
    if (problem) { setBlocked(problem); return; }
    goTo(index);
  };
  const next = () => jump(stepIndex + 1);
  const finish = () => {
    const firstInvalid = steps.findIndex(id => stepProblem(id));
    if (firstInvalid >= 0 || issues.length) { goTo(Math.max(0, firstInvalid)); setBlocked('wizard_fix_errors'); return; }
    onFinish({ ...params }, saveScenario && canSaveScenario ? scenarioName.trim() || t('defaultName') : null);
  };

  const fields = (id: StepId) => <div className="fields wizard-fields">{visibleFields(id).map(f =>
    <ParameterField key={f} name={f} params={params} issues={issues} language={language} help={HELP[f]} onChange={value => update(f, value)} />)}</div>;
  const formatValue = (f: NumericField) => {
    const value = params[f];
    if (YEAR_FIELDS.includes(f)) return `${value} ${t('years')}`;
    if (PERCENT_FIELDS.includes(f)) return percentage(value, language);
    return money(f === 'affitto_lordo' ? value / 12 : value);
  };
  const summaryRows = (id: StepId): [string, string][] => {
    if (id === 'section') return [[t('sections'), t(section)]];
    if (id === 'mortgage' && !hasMortgage) return [[t('wizard_step_mortgage'), t('wizard_mortgage_no')]];
    if (id === 'tax' && params.taxProfile) {
      const p = params.taxProfile;
      return p.country === 'italy'
        ? [[t('regime'), t(p.regime)], [t('otherTaxableIncome'), money(p.otherTaxableIncome)], [t('otherIncomeType'), t(`incomeType_${p.otherIncomeType}`)], [t('cadastralRent'), money(p.cadastralRent)]]
        : [[t('otherTaxableIncome'), money(p.otherTaxableIncome)], [t('buildingTaxBasis'), money(p.buildingTaxBasis)], [t('afaRatePercent'), percentage(p.afaRatePercent, language)], [t('transferTaxPercent'), percentage(p.transferTaxPercent, language)]];
    }
    const rows: [string, string][] = visibleFields(id).map(f => [t(fieldLabels[f]), formatValue(f)]);
    if (id === 'rent') rows.push([t('rent_adjustment_mode'), t(ADJUSTMENT_LABELS[params.tipo_adeguamento])]);
    return rows;
  };

  return <section className="wizard parameter-card" aria-labelledby="wizard-title">
    <div className="card-heading wizard-heading">
      <div><p className="eyebrow">{t('wizard_eyebrow')} · {t('wizard_step_of').replace('{n}', String(stepIndex + 1)).replace('{total}', String(steps.length))}</p>
        <h2 id="wizard-title">{t(`wizard_step_${step}`)}</h2></div>
      <button className="button secondary" type="button" onClick={() => onExpert(section, dirty ? { ...params } : null)}>{t('wizard_expert')}</button>
    </div>
    <ol className="wizard-progress" aria-label={t('wizard_progress')}>{steps.map((id, index) => <li key={id} className={index <= furthest && index !== stepIndex ? 'done' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
      {index <= furthest && index !== stepIndex ? <button type="button" onClick={() => jump(index)}>{t(`wizard_step_${id}`)}</button> : <span>{t(`wizard_step_${id}`)}</span>}
    </li>)}</ol>
    <div className="wizard-body">
      <p className="wizard-intro">{t(`wizard_intro_${step}`)}</p>
      {step === 'section' && <fieldset className="wizard-choices"><legend className="visually-hidden">{t('sections')}</legend>
        {(['generic', 'italy', 'germany'] as const).map(key => <label key={key} className={`wizard-choice ${key === section ? 'selected' : ''}`}>
          <input type="radio" name="wizard-section" checked={key === section} onChange={() => chooseSection(key)} />
          <span><strong>{t(key)}</strong><small>{t(key === 'generic' ? 'wizard_section_generic' : key === 'italy' ? 'fiscalScopeItaly' : 'fiscalScopeGermany')}</small></span>
        </label>)}
      </fieldset>}
      {(step === 'property' || step === 'costs' || step === 'horizon') && fields(step)}
      {step === 'rent' && <>{fields('rent')}
        <label className="field wizard-wide"><span>{t('rent_adjustment_mode')}</span><select name="tipo_adeguamento" value={params.tipo_adeguamento} onChange={e => setParams(p => ({ ...p, tipo_adeguamento: e.target.value as InvestmentParams['tipo_adeguamento'] }))}>
          <option value="property_value">{t('property_value_adj')}</option><option value="inflation">{t('inflation_adj')}</option><option value="none">{t('no_adjustment')}</option>
        </select><small>{plainText(t('rent_adjustment_help'))}</small></label></>}
      {step === 'mortgage' && <><fieldset className="wizard-choices compact"><legend>{t('wizard_mortgage_question')}</legend>
        {[false, true].map(yes => <label key={String(yes)} className={`wizard-choice ${yes === hasMortgage ? 'selected' : ''}`}>
          <input type="radio" name="wizard-mortgage" checked={yes === hasMortgage} onChange={() => chooseMortgage(yes)} />
          <span><strong>{t(yes ? 'wizard_mortgage_yes' : 'wizard_mortgage_no')}</strong></span>
        </label>)}
      </fieldset>{hasMortgage && fields('mortgage')}</>}
      {step === 'tax' && params.taxProfile && <FiscalControls profile={params.taxProfile} language={language} onChange={taxProfile => { setParams(p => ({ ...p, taxProfile })); setBlocked(null); }} />}
      {step === 'summary' && <>
        <div className="wizard-summary">{steps.filter(id => id !== 'summary').map(id => <section key={id}>
          <div className="wizard-summary-head"><h3>{t(`wizard_step_${id}`)}</h3><button type="button" className="link-button" aria-label={`${t('wizard_edit')}: ${t(`wizard_step_${id}`)}`} onClick={() => goTo(steps.indexOf(id))}>{t('wizard_edit')}</button></div>
          <dl>{summaryRows(id).map(([label, value]) => <div key={label}><dt>{plainText(label)}</dt><dd>{value}</dd></div>)}</dl>
        </section>)}</div>
        <div className="wizard-save">
          <label className="tax-check"><input type="checkbox" checked={saveScenario && canSaveScenario} disabled={!canSaveScenario} onChange={e => setSaveScenario(e.target.checked)} /><span>{t(canSaveScenario ? 'wizard_save_scenario' : 'wizard_save_full')}</span></label>
          {saveScenario && canSaveScenario && <label className="field"><span>{t('scenarioName')}</span><input type="text" maxLength={120} value={scenarioName} placeholder={t('defaultName')} onChange={e => setScenarioName(e.target.value)} /></label>}
        </div>
      </>}
      {blocked && <p className="notice error" role="alert">{t(blocked)}</p>}
    </div>
    <div className="wizard-nav">
      <button className="button secondary" type="button" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>{t('wizard_back')}</button>
      {step === 'summary' ? <button className="button main-button" type="button" onClick={finish}>{t('wizard_finish')}<span aria-hidden="true">↗</span></button>
        : <button className="button main-button" type="button" onClick={next}>{t('wizard_next')}</button>}
    </div>
  </section>;
}
