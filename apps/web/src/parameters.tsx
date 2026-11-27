import { DEFAULT_PARAMS, FIELD_RULES, defaultTaxProfile, type InputIssue, type InvestmentParams, type NumericField, type Section } from '@immobil/core';
import { currency, plainText, translator, type Language } from '@immobil/i18n';

/** Parametri iniziali di una sezione: valori di esempio e profilo fiscale del Paese. */
export const freshParams = (section: Section): InvestmentParams => section === 'generic' ? { ...DEFAULT_PARAMS }
  : { ...DEFAULT_PARAMS, taxProfile: defaultTaxProfile(section) };

export const fieldLabels: Record<NumericField, string> = {
  valore_immobile: 'property_value', costo_acquisto: 'purchase_cost', costo_ristrutturazione: 'renovation_cost',
  affitto_lordo: 'monthly_rent', rivalutazione_annua: 'annual_appreciation', anni_investimento: 'investment_years',
  commissione_iniziale: 'initial_commission', commissione_finale: 'final_commission',
  costi_assicurazione_euro: 'insurance_costs', costi_gestione_euro: 'annual_fixed_costs',
  manutenzione_straordinaria_perc: 'extraordinary_maintenance', tassazione_affitti_perc: 'rent_taxation',
  tassa_catastale_perc: 'property_tax', rata_mutuo_mensile: 'monthly_mortgage', anni_restanti_mutuo: 'remaining_mortgage_years',
  debito_residuo_mutuo: 'mortgage_debt',
  periodo_sfitto_perc: 'vacancy_period', inflazione_perc: 'annual_inflation', adeguamento_affitto_anni: 'rent_adjustment_years',
};

/** Campo numerico dei parametri. L'affitto si inserisce mensile e viene salvato annuale. */
export function ParameterField({ name, params, issues, language, help, onChange }: {
  name: NumericField; params: InvestmentParams; issues: InputIssue[]; language: Language; help?: string;
  onChange: (value: number) => void;
}) {
  const t = translator(language);
  const rule = FIELD_RULES[name], monthly = name === 'affitto_lordo';
  const issue = issues.find(i => i.field === name), divisor = monthly ? 12 : 1;
  return <label className={`field ${issue ? 'invalid-field' : ''}`}>
    <span>{t(fieldLabels[name])}</span>
    <input name={name} type="number" inputMode={rule.integer ? 'numeric' : 'decimal'} required
      min={rule.min / divisor} max={rule.max / divisor} step={rule.integer ? 1 : 'any'}
      value={Number.isFinite(params[name]) ? params[name] / divisor : ''}
      aria-invalid={!!issue} aria-describedby={issue || help ? `${name}-help` : undefined}
      onChange={event => onChange(event.target.value === '' ? NaN : Number(event.target.value) * divisor)} />
    {issue ? <small id={`${name}-help`} className="field-error">{issue.code === 'integer' ? t('integer') : issue.code === 'mortgage' ? t('mortgage_debt_invalid') : `${t('range')}: ${rule.min / divisor}–${rule.max / divisor}`}</small>
      : help ? <small id={`${name}-help`}>{plainText(t(help))}</small> : null}
    {monthly && Number.isFinite(params.affitto_lordo) && <small>{t('annual_rent')}: {currency(params.affitto_lordo, language)}</small>}
  </label>;
}
