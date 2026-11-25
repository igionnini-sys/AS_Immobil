import { acquisitionTax, annualFiscal, fiscalIssues, parseTaxProfile, type FiscalYear, type TaxProfile } from './fiscal';
export * from './fiscal';
export const MODEL_VERSION = '3.0.0';
export type Adjustment = 'property_value' | 'inflation' | 'none';

export interface InvestmentParams {
  valore_immobile: number;
  costo_acquisto: number;
  costo_ristrutturazione: number;
  affitto_lordo: number;
  rivalutazione_annua: number;
  anni_investimento: number;
  commissione_iniziale: number;
  commissione_finale: number;
  costi_assicurazione_euro: number;
  costi_gestione_euro: number;
  manutenzione_straordinaria_perc: number;
  tassazione_affitti_perc: number;
  tassa_catastale_perc: number;
  rata_mutuo_mensile: number;
  anni_restanti_mutuo: number;
  periodo_sfitto_perc: number;
  inflazione_perc: number;
  tipo_adeguamento: Adjustment;
  adeguamento_affitto_anni: number;
  taxProfile?: TaxProfile;
}
export type NumericField = Exclude<keyof InvestmentParams, 'tipo_adeguamento' | 'taxProfile'>;
export const DEFAULT_PARAMS: InvestmentParams = {
  valore_immobile: 200000, costo_acquisto: 0, costo_ristrutturazione: 0,
  affitto_lordo: 12000, rivalutazione_annua: 2, anni_investimento: 10,
  commissione_iniziale: 0, commissione_finale: 0,
  costi_assicurazione_euro: 250, costi_gestione_euro: 250,
  manutenzione_straordinaria_perc: 1, tassazione_affitti_perc: 21, tassa_catastale_perc: 0.8,
  rata_mutuo_mensile: 0, anni_restanti_mutuo: 0, periodo_sfitto_perc: 5,
  inflazione_perc: 2, tipo_adeguamento: 'property_value', adeguamento_affitto_anni: 4,
};

// Percentuali 0–100; affitto e costi del motore sono annuali, rata mensile.
export const FIELD_RULES: Record<NumericField, { min: number; max: number; integer?: boolean }> = {
  valore_immobile: { min: 5000, max: 1e12 },
  costo_acquisto: { min: 0, max: 1e12 }, costo_ristrutturazione: { min: 0, max: 1e12 },
  affitto_lordo: { min: 0, max: 1e12 }, rivalutazione_annua: { min: 0, max: 50 },
  anni_investimento: { min: 1, max: 100, integer: true },
  commissione_iniziale: { min: 0, max: 1e12 }, commissione_finale: { min: 0, max: 1e12 },
  costi_assicurazione_euro: { min: 0, max: 10000 }, costi_gestione_euro: { min: 0, max: 100000 },
  manutenzione_straordinaria_perc: { min: 0, max: 99 }, tassazione_affitti_perc: { min: 0, max: 99 },
  tassa_catastale_perc: { min: 0, max: 99 }, rata_mutuo_mensile: { min: 0, max: 10000 },
  anni_restanti_mutuo: { min: 0, max: 50, integer: true }, periodo_sfitto_perc: { min: 0, max: 100 },
  inflazione_perc: { min: 0, max: 100 }, adeguamento_affitto_anni: { min: 1, max: 99, integer: true },
};

export interface InputIssue { field: keyof InvestmentParams; code: 'range' | 'integer' | 'mode' | 'profile' }
export function validateParams(value: unknown): InputIssue[] {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const issues: InputIssue[] = [];
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const v = data[field];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < rule.min || v > rule.max) {
      issues.push({ field: field as NumericField, code: 'range' });
    } else if (rule.integer && !Number.isInteger(v)) issues.push({ field: field as NumericField, code: 'integer' });
  }
  if (!['property_value', 'inflation', 'none'].includes(data.tipo_adeguamento as string)) {
    issues.push({ field: 'tipo_adeguamento', code: 'mode' });
  }
  if (data.taxProfile !== undefined && fiscalIssues(data.taxProfile).length) issues.push({ field: 'taxProfile', code: 'profile' });
  return issues;
}
export function parseParams(value: unknown): InvestmentParams {
  const issues = validateParams(value);
  if (issues.length) throw new Error(`INVALID_PARAMS:${issues.map(i => i.field).join(',')}`);
  const source = value as InvestmentParams;
  const result = Object.fromEntries(Object.keys(DEFAULT_PARAMS).map(key => [key, source[key as keyof InvestmentParams]])) as unknown as InvestmentParams;
  if (source.taxProfile !== undefined) result.taxProfile = parseTaxProfile(source.taxProfile);
  return result;
}

export type IrrStatus = 'ok' | 'same_sign' | 'ambiguous' | 'no_convergence' | 'invalid';
export interface IrrResult { value: number | null; status: IrrStatus; residual: number | null }
export function npv(rate: number, flows: readonly number[]): number {
  // Horner evita potenze molto grandi vicino al limite inferiore del tasso.
  let result = 0;
  for (let i = flows.length - 1; i >= 0; i--) result = result / (1 + rate) + flows[i];
  return result;
}
export function calculateIrr(flows: readonly number[]): IrrResult {
  const absent = (status: IrrStatus): IrrResult => ({ value: null, status, residual: null });
  if (flows.length < 2 || !flows.every(Number.isFinite)) return absent('invalid');
  const signs = flows.filter(v => v !== 0).map(Math.sign);
  let changes = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++;
  if (changes === 0) return absent('same_sign');
  if (changes > 1) return absent('ambiguous');
  // Una sola variazione di segno: NPV ha al massimo una radice per r > -1.
  let lo = -0.999999999, hi = 10;
  let left = npv(lo, flows), right = npv(hi, flows);
  if (Number.isNaN(left) || Number.isNaN(right) || Math.sign(left) === Math.sign(right)) return absent('no_convergence');
  const tolerance = 1e-10 * Math.max(1, flows.reduce((s, v) => s + Math.abs(v), 0));
  for (let i = 0; i < 256; i++) {
    const mid = (lo + hi) / 2, residual = npv(mid, flows);
    if (Number.isFinite(residual) && Math.abs(residual) <= tolerance && hi - lo <= 1e-10) {
      return { value: mid, status: 'ok', residual };
    }
    if (Math.sign(residual) === Math.sign(left)) { lo = mid; left = residual; }
    else { hi = mid; right = residual; }
  }
  return absent('no_convergence');
}

export function annualize(ratio: number, years: number): number | null {
  if (ratio < 0 || !Number.isFinite(ratio) || years <= 0) return null;
  const value = ratio ** (1 / years) - 1;
  return Number.isFinite(value) ? value : null;
}

export function calculateInvestment(input: InvestmentParams) {
  const p = parseParams(input);
  const growth = 1 + p.rivalutazione_annua / 100, inflation = 1 + p.inflazione_perc / 100;
  const actualCosts = p.costo_acquisto + p.costo_ristrutturazione;
  const hasCosts = p.costo_acquisto > 0 || p.costo_ristrutturazione > 0;
  const profile = p.taxProfile;
  const purchaseTax = profile ? acquisitionTax(profile, p.costo_acquisto || p.valore_immobile) : 0;
  const acquisitionExtras = purchaseTax + (profile?.additionalAcquisitionCosts ?? 0);
  const initial = (hasCosts ? actualCosts : p.valore_immobile) + p.commissione_iniziale + acquisitionExtras;
  const exitTax = profile?.exitTaxAmount ?? 0;
  const initialGain = hasCosts ? p.valore_immobile - actualCosts : 0;
  let property = p.valore_immobile, rent = p.affitto_lordo;
  let management = p.costi_gestione_euro, insurance = p.costi_assicurazione_euro;
  const valori_annuali: number[] = [], affitti_lordi_annuali: number[] = [], affitti_netti_annuali: number[] = [];
  const rendimenti_annuali: number[] = [], costi_gestione_annuali: number[] = [], costi_mutuo_annuali: number[] = [];
  const fiscalYears: FiscalYear[] = [], mortgageTaxBenefits: number[] = [];
  const fixedRent = profile?.country === 'italy' && (profile.regime === 'cedolare21' || profile.regime === 'cedolare10');
  for (let year = 1; year <= p.anni_investimento; year++) {
    property *= growth; management *= inflation; insurance *= inflation;
    if (!fixedRent && year % p.adeguamento_affitto_anni === 0) {
      if (p.tipo_adeguamento === 'property_value') rent = property * (p.affitto_lordo / p.valore_immobile);
      if (p.tipo_adeguamento === 'inflation') rent *= inflation ** p.adeguamento_affitto_anni;
    }
    const mortgage = year <= p.anni_restanti_mutuo ? p.rata_mutuo_mensile * 12 : 0;
    const effective = rent * (1 - p.periodo_sfitto_perc / 100);
    const operatingCashCosts = insurance + management + property * p.manutenzione_straordinaria_perc / 100;
    let costs = operatingCashCosts + property * p.tassa_catastale_perc / 100 + effective * p.tassazione_affitti_perc / 100 + mortgage;
    let customIncome = 0;
    if (profile) {
      const taxInput = { year, rentReceived: effective, operatingCashCosts, mortgageCash: mortgage, inflation,
        occupiedFraction: 1 - p.periodo_sfitto_perc / 100 };
      const fiscal = annualFiscal(profile, taxInput);
      fiscalYears.push(fiscal);
      const tax = (row: FiscalYear) => row.incomeTax + row.surtax + row.solidarity + row.churchTax;
      const withoutMortgage = annualFiscal(profile, { ...taxInput, mortgageCash: 0 });
      mortgageTaxBenefits.push(tax(withoutMortgage) - tax(fiscal));
      costs = operatingCashCosts + mortgage + tax(fiscal) + fiscal.propertyTax + fiscal.leaseDuties + fiscal.customExpenses;
      customIncome = fiscal.customIncome;
    }
    const net = effective + customIncome - costs;
    valori_annuali.push(property); affitti_lordi_annuali.push(rent); affitti_netti_annuali.push(net);
    rendimenti_annuali.push(net / p.valore_immobile * 100);
    costi_gestione_annuali.push(management); costi_mutuo_annuali.push(mortgage);
  }
  const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
  const real = (values: number[]) => sum(values.map((v, i) => v / inflation ** (i + 1)));
  const terminalDiscount = inflation ** p.anni_investimento;
  const finalNominal = property, finalReal = property / terminalDiscount;
  const rentTotal = sum(affitti_netti_annuali), rentReal = real(affitti_netti_annuali);
  const mortgageTotal = sum(costi_mutuo_annuali);
  // Modello 2: tutti i costi terminali sono deflazionati allo stesso istante.
  const finalCommissionReal = (p.commissione_finale + exitTax) / terminalDiscount;
  const profit = rentTotal + finalNominal - p.valore_immobile + initialGain - p.commissione_iniziale - acquisitionExtras - p.commissione_finale - exitTax;
  const profitReal = rentReal + finalReal - p.valore_immobile + initialGain - p.commissione_iniziale - acquisitionExtras - finalCommissionReal;
  const cash_flows_nominal = [-initial, ...affitti_netti_annuali];
  cash_flows_nominal[p.anni_investimento] += finalNominal - p.commissione_finale - exitTax;
  const cash_flows_real = cash_flows_nominal.map((v, year) => v / inflation ** year);
  const irrNominal = calculateIrr(cash_flows_nominal), irrReal = calculateIrr(cash_flows_real);
  const roi = (profit + mortgageTotal - sum(mortgageTaxBenefits)) / initial * 100;
  const roiReal = (profitReal + real(costi_mutuo_annuali) - real(mortgageTaxBenefits)) / initial * 100;
  const roe = profit / initial * 100, roeReal = profitReal / initial * 100;
  const warnings: string[] = [];
  if (p.rata_mutuo_mensile > 0) warnings.push('roe_estimated');
  if (p.rata_mutuo_mensile > 0 && p.anni_restanti_mutuo === 0) warnings.push('mortgage_zero_years');
  if (p.costo_acquisto === 0 && p.costo_ristrutturazione > 0) warnings.push('renovation_only');
  if (fixedRent && p.tipo_adeguamento !== 'none') warnings.push('cedolare_fixed_rent');
  if (profile) warnings.push('fiscal_projection', 'sale_tax_manual');
  if (profile?.country === 'germany') warnings.push('german_estimate');
  if (fiscalYears.some(row => row.operatingDeductionRequested > row.operatingDeduction + 1e-6)) warnings.push('deduction_capped');
  if (irrNominal.status === 'ambiguous' || irrReal.status === 'ambiguous') warnings.push('irr_ambiguous');
  const cagr = annualize((finalNominal + rentTotal - p.commissione_finale - exitTax) / initial, p.anni_investimento);
  const cagrReal = annualize((finalReal + rentReal - finalCommissionReal) / initial, p.anni_investimento);
  if (cagr === null || cagrReal === null) warnings.push('annualization_unavailable');
  return {
    modelVersion: MODEL_VERSION, warnings,
    fiscal: profile ? { country: profile.country, rulesYear: profile.rulesYear, purchaseTax,
      additionalAcquisitionCosts: profile.additionalAcquisitionCosts, exitTax, years: fiscalYears,
      totalIncomeTax: sum(fiscalYears.map(y => y.incomeTax + y.surtax + y.solidarity + y.churchTax)),
      totalPropertyTax: sum(fiscalYears.map(y => y.propertyTax)),
      totalLeaseDuties: sum(fiscalYears.map(y => y.leaseDuties)),
      totalTaxes: purchaseTax + exitTax + sum(fiscalYears.map(y => y.incomeTax + y.surtax + y.solidarity + y.churchTax + y.propertyTax + y.leaseDuties)),
    } : null,
    valori_annuali, affitti_lordi_annuali, affitti_netti_annuali, rendimenti_annuali,
    costi_gestione_annuali, costi_mutuo_annuali, cash_flows_nominal, cash_flows_real,
    valore_finale_nominale: finalNominal, valore_finale_reale: finalReal,
    totale_affitti_netti: rentTotal, totale_affitti_netti_reale: rentReal,
    totale_costi_mutuo: mortgageTotal, rendimento_medio_annuo: sum(rendimenti_annuali) / p.anni_investimento,
    guadagno_capitale_nominale: finalNominal - p.valore_immobile,
    guadagno_capitale_reale: finalReal - p.valore_immobile,
    rendimento_totale_nominale: profit, rendimento_totale_reale: profitReal,
    cagr_nominale: cagr, cagr_reale: cagrReal,
    affitto_finale: rent,
    crescita_affitto_totale: p.affitto_lordo > 0 ? (rent / p.affitto_lordo - 1) * 100 : 0,
    crescita_affitto_annua: p.affitto_lordo > 0 ? (annualize(rent / p.affitto_lordo, p.anni_investimento) ?? 0) * 100 : 0,
    costi_gestione_finali: management,
    crescita_costi_gestione: p.costi_gestione_euro > 0 ? (management / p.costi_gestione_euro - 1) * 100 : 0,
    commissione_iniziale: p.commissione_iniziale, commissione_finale: p.commissione_finale,
    plusvalore_minusvalore_iniziale: initialGain, costo_acquisto: p.costo_acquisto,
    costo_ristrutturazione: p.costo_ristrutturazione, investimento_iniziale_reale: initial,
    investimento_iniziale: initial, capitale_proprio: initial,
    roi_nominale: roi, roi_reale: roiReal, roe_nominale: roe, roe_reale: roeReal,
    roi_annualizzato: annualize(1 + roi / 100, p.anni_investimento),
    roe_annualizzato: annualize(1 + roe / 100, p.anni_investimento),
    tir_nominale: irrNominal.value === null ? null : irrNominal.value * 100,
    tir_reale: irrReal.value === null ? null : irrReal.value * 100,
    irrNominal, irrReal,
  };
}
export type InvestmentResult = ReturnType<typeof calculateInvestment>;
