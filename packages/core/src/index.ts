import { acquisitionTax, annualFiscal, fiscalIssues, GERMANY_PRIVATE_SALE_YEARS, germanyPrivateSaleTax2026, parseTaxProfile, type FiscalYear, type TaxProfile } from './fiscal';
export * from './fiscal';
export const MODEL_VERSION = '3.3.0';
/** Plusvalenza immobiliare tassabile se la vendita avviene entro 5 anni (art. 67 TUIR). */
const ITALY_CAPITAL_GAIN_YEARS = 5, ITALY_CAPITAL_GAIN_RATE = 0.26;
/** Soglie oltre le quali un'aliquota italiana è probabilmente un errore di inserimento. */
const ITALY_MAX_IMU_PERMILLE = 11.4, ITALY_MAX_SURTAX_PERCENT = 4.5;
/** Durata complessiva dei contratti abitativi: 3+2 anni concordato, 4+4 anni libero (L. 431/1998). */
const ITALY_CONTRACT_YEARS_CONCORDATO = 5, ITALY_CONTRACT_YEARS_FREE = 8;
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
  /** Capitale del mutuo ancora da rimborsare all'inizio; 0 se non indicato (archivi precedenti). */
  debito_residuo_mutuo: number;
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
  rata_mutuo_mensile: 0, anni_restanti_mutuo: 0, debito_residuo_mutuo: 0, periodo_sfitto_perc: 5,
  inflazione_perc: 2, tipo_adeguamento: 'property_value', adeguamento_affitto_anni: 4,
};

// Percentuali 0–100; affitto e costi del motore sono annuali, rata mensile.
export const FIELD_RULES: Record<NumericField, { min: number; max: number; integer?: boolean }> = {
  valore_immobile: { min: 5000, max: 1e12 },
  costo_acquisto: { min: 0, max: 1e12 }, costo_ristrutturazione: { min: 0, max: 1e12 },
  affitto_lordo: { min: 0, max: 1e12 }, rivalutazione_annua: { min: 0, max: 50 },
  anni_investimento: { min: 1, max: 100, integer: true },
  commissione_iniziale: { min: 0, max: 1e12 }, commissione_finale: { min: 0, max: 1e12 },
  costi_assicurazione_euro: { min: 0, max: 1e12 }, costi_gestione_euro: { min: 0, max: 1e12 },
  manutenzione_straordinaria_perc: { min: 0, max: 99 }, tassazione_affitti_perc: { min: 0, max: 99 },
  tassa_catastale_perc: { min: 0, max: 99 }, rata_mutuo_mensile: { min: 0, max: 1e12 },
  anni_restanti_mutuo: { min: 0, max: 50, integer: true }, debito_residuo_mutuo: { min: 0, max: 1e12 }, periodo_sfitto_perc: { min: 0, max: 100 },
  inflazione_perc: { min: 0, max: 100 }, adeguamento_affitto_anni: { min: 1, max: 99, integer: true },
};

/** Valori dei campi introdotti dopo la migrazione, per gli archivi che non li contengono. */
const LEGACY_PARAM_DEFAULTS: Partial<Record<NumericField, number>> = { debito_residuo_mutuo: 0 };

/** Mutuo a rata mensile costante: il tasso è ricavato da debito, rata e mesi residui. */
export interface MortgagePlan { debt: number; monthlyPayment: number; months: number; monthlyRate: number }
export function mortgagePlan(debt: number, monthlyPayment: number, years: number): MortgagePlan | null {
  const months = Math.round(years * 12);
  if (!(debt > 0) || !(monthlyPayment > 0) || !(months > 0)) return null;
  const presentValue = (rate: number) => rate === 0 ? monthlyPayment * months : monthlyPayment * (1 - (1 + rate) ** -months) / rate;
  // Le rate devono almeno rimborsare il capitale; oltre il 100% mensile il dato è certamente errato.
  if (presentValue(0) < debt * (1 - 1e-12) || presentValue(1) > debt) return null;
  let lo = 0, hi = 1;
  if (presentValue(0) > debt) for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (presentValue(mid) > debt) lo = mid; else hi = mid;
  } else hi = 0;
  return { debt, monthlyPayment, months, monthlyRate: (lo + hi) / 2 };
}
/** Debito ancora dovuto dopo il numero di mesi indicato. */
export function mortgageBalance(plan: MortgagePlan, afterMonths: number): number {
  const k = Math.min(Math.max(0, afterMonths), plan.months), r = plan.monthlyRate;
  if (k === plan.months) return 0;
  const balance = r === 0 ? plan.debt - plan.monthlyPayment * k : plan.debt * (1 + r) ** k - plan.monthlyPayment * ((1 + r) ** k - 1) / r;
  return Math.max(0, balance);
}

export interface InputIssue { field: keyof InvestmentParams; code: 'range' | 'integer' | 'mode' | 'profile' | 'mortgage' }
export function validateParams(value: unknown): InputIssue[] {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const issues: InputIssue[] = [];
  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    const v = data[field];
    if (v === undefined && field in LEGACY_PARAM_DEFAULTS) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < rule.min || v > rule.max) {
      issues.push({ field: field as NumericField, code: 'range' });
    } else if (rule.integer && !Number.isInteger(v)) issues.push({ field: field as NumericField, code: 'integer' });
  }
  if (!['property_value', 'inflation', 'none'].includes(data.tipo_adeguamento as string)) {
    issues.push({ field: 'tipo_adeguamento', code: 'mode' });
  }
  if (data.taxProfile !== undefined && fiscalIssues(data.taxProfile).length) issues.push({ field: 'taxProfile', code: 'profile' });
  // Il debito deve essere rimborsabile con rata e anni indicati e inferiore al costo iniziale.
  const debt = typeof data.debito_residuo_mutuo === 'number' ? data.debito_residuo_mutuo : 0;
  if (debt > 0 && !issues.some(i => ['debito_residuo_mutuo', 'rata_mutuo_mensile', 'anni_restanti_mutuo'].includes(i.field))) {
    const n = (key: string) => typeof data[key] === 'number' ? data[key] as number : NaN;
    const purchase = n('costo_acquisto') + n('costo_ristrutturazione');
    const cost = (purchase > 0 ? purchase : n('valore_immobile')) + n('commissione_iniziale');
    if (!mortgagePlan(debt, n('rata_mutuo_mensile'), n('anni_restanti_mutuo')) || !(debt < cost)) issues.push({ field: 'debito_residuo_mutuo', code: 'mortgage' });
  }
  return issues;
}
export function parseParams(value: unknown): InvestmentParams {
  const issues = validateParams(value);
  if (issues.length) throw new Error(`INVALID_PARAMS:${issues.map(i => i.field).join(',')}`);
  const source = value as InvestmentParams;
  const result = Object.fromEntries(Object.keys(DEFAULT_PARAMS).map(key => [key,
    source[key as keyof InvestmentParams] ?? LEGACY_PARAM_DEFAULTS[key as NumericField]])) as unknown as InvestmentParams;
  if (source.taxProfile !== undefined) result.taxProfile = parseTaxProfile(source.taxProfile);
  return result;
}

export type IrrStatus = 'ok' | 'same_sign' | 'ambiguous' | 'no_convergence' | 'invalid';
/** positiveOnly: i flussi cambiano segno più volte e si riporta l'unico TIR positivo garantito dal criterio di Norström. */
export interface IrrResult { value: number | null; status: IrrStatus; residual: number | null; positiveOnly?: boolean }
export function npv(rate: number, flows: readonly number[]): number {
  // Horner evita potenze molto grandi vicino al limite inferiore del tasso.
  let result = 0;
  for (let i = flows.length - 1; i >= 0; i--) result = result / (1 + rate) + flows[i];
  return result;
}
/** Criterio di Norström: flussi cumulati che partono negativi e cambiano segno una sola volta implicano un unico TIR positivo. */
function norstromUnique(flows: readonly number[]): boolean {
  let total = 0;
  const signs: number[] = [];
  for (const flow of flows) { total += flow; if (total !== 0) signs.push(Math.sign(total)); }
  if (signs[0] !== -1) return false;
  let changes = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++;
  return changes === 1;
}
export function calculateIrr(flows: readonly number[]): IrrResult {
  const absent = (status: IrrStatus): IrrResult => ({ value: null, status, residual: null });
  if (flows.length < 2 || !flows.every(Number.isFinite)) return absent('invalid');
  const signs = flows.filter(v => v !== 0).map(Math.sign);
  let changes = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++;
  if (changes === 0) return absent('same_sign');
  // Una sola variazione di segno: NPV ha al massimo una radice per r > -1.
  // Con più variazioni si accetta solo il caso di Norström e si cerca la radice sopra zero.
  const positiveOnly = changes > 1;
  if (positiveOnly && !norstromUnique(flows)) return absent('ambiguous');
  let lo = positiveOnly ? 0 : -0.999999999, hi = 10;
  let left = npv(lo, flows), right = npv(hi, flows);
  if (left === 0) return { value: lo, status: 'ok', residual: 0, ...(positiveOnly ? { positiveOnly } : {}) };
  if (Number.isNaN(left) || Number.isNaN(right) || Math.sign(left) === Math.sign(right)) return absent('no_convergence');
  const tolerance = 1e-10 * Math.max(1, flows.reduce((s, v) => s + Math.abs(v), 0));
  for (let i = 0; i < 256; i++) {
    const mid = (lo + hi) / 2, residual = npv(mid, flows);
    if (Number.isFinite(residual) && Math.abs(residual) <= tolerance && hi - lo <= 1e-10) {
      return { value: mid, status: 'ok', residual, ...(positiveOnly ? { positiveOnly } : {}) };
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
  // Con sola ristrutturazione l'immobile risulta già posseduto: nessuna imposta d'acquisto.
  const renovationOnly = p.costo_acquisto === 0 && p.costo_ristrutturazione > 0;
  const purchaseTax = profile && !renovationOnly ? acquisitionTax(profile, p.costo_acquisto || p.valore_immobile) : 0;
  const acquisitionExtras = purchaseTax + (profile?.additionalAcquisitionCosts ?? 0);
  const initial = (hasCosts ? actualCosts : p.valore_immobile) + p.commissione_iniziale + acquisitionExtras;
  const exitTax = profile?.exitTaxAmount ?? 0;
  const initialGain = hasCosts ? p.valore_immobile - actualCosts : 0;
  let property = p.valore_immobile, rent = p.affitto_lordo;
  let management = p.costi_gestione_euro, insurance = p.costi_assicurazione_euro;
  const valori_annuali: number[] = [], affitti_lordi_annuali: number[] = [], affitti_netti_annuali: number[] = [];
  const rendimenti_annuali: number[] = [], costi_gestione_annuali: number[] = [], costi_mutuo_annuali: number[] = [];
  const fiscalYears: FiscalYear[] = [], mortgageTaxBenefits: number[] = [];
  // Perdite tedesche riportate, anche nel caso senza mutuo usato per il ROI senza leva.
  let carry = 0, carryWithoutMortgage = 0;
  // Con il debito residuo il piano del mutuo dà capitale proprio, debito finale e interessi di ogni anno.
  const plan = p.debito_residuo_mutuo > 0 ? mortgagePlan(p.debito_residuo_mutuo, p.rata_mutuo_mensile, p.anni_restanti_mutuo) : null;
  // Germania: quota fabbricato di imposta di trasferimento, commissione e altri costi iniziali, ammortizzata col fabbricato.
  const price = p.costo_acquisto || p.valore_immobile;
  const afaBasisExtra = profile?.country === 'germany' && profile.afaIncludesAcquisitionCosts
    ? (acquisitionExtras + p.commissione_iniziale) * Math.min(1, profile.buildingTaxBasis / price) : 0;
  // Il riallineamento italiano presuppone un nuovo accordo esplicitamente selezionato.
  const cedolare = profile?.country === 'italy' && (profile.regime === 'cedolare21' || profile.regime === 'cedolare10');
  for (let year = 1; year <= p.anni_investimento; year++) {
    // Sezioni Italia e Germania: gli importi inseriti valgono per il primo anno, la manutenzione usa il valore
    // a inizio anno e il canone si adegua dopo N anni interi. La sezione Generale conserva il calcolo originale,
    // che indicizza costi e canone già nel primo anno (parità con la baseline Python).
    const startValue = property;
    property *= growth;
    if (!profile || year > 1) { management *= inflation; insurance *= inflation; }
    const adjustmentDue = profile ? year > 1 && (year - 1) % p.adeguamento_affitto_anni === 0 : year % p.adeguamento_affitto_anni === 0;
    const italianProfile = profile?.country === 'italy' ? profile : undefined;
    if (adjustmentDue) {
      // In Italia il riallineamento al valore richiede la scelta esplicita di un nuovo accordo.
      if (p.tipo_adeguamento === 'property_value' && (!italianProfile || italianProfile.renegotiateRent))
        rent = (profile ? startValue : property) * (p.affitto_lordo / p.valore_immobile);
      // ISTAT sospeso per la durata dell'opzione cedolare.
      if (p.tipo_adeguamento === 'inflation' && !cedolare) rent *= inflation ** p.adeguamento_affitto_anni;
    }
    const mortgage = year <= p.anni_restanti_mutuo ? p.rata_mutuo_mensile * 12 : 0;
    const effective = rent * (1 - p.periodo_sfitto_perc / 100);
    const operatingCashCosts = insurance + management + (profile ? startValue : property) * p.manutenzione_straordinaria_perc / 100;
    let costs = operatingCashCosts + property * p.tassa_catastale_perc / 100 + effective * p.tassazione_affitti_perc / 100 + mortgage;
    let customIncome = 0;
    if (profile) {
      const mortgageInterest = plan ? mortgage - (mortgageBalance(plan, (year - 1) * 12) - mortgageBalance(plan, year * 12)) : undefined;
      const taxInput = { year, rentReceived: effective, operatingCashCosts, mortgageCash: mortgage, inflation, mortgageInterest, afaBasisExtra,
        occupiedFraction: 1 - p.periodo_sfitto_perc / 100, rentIndex: p.affitto_lordo > 0 ? rent / p.affitto_lordo : 1 };
      const fiscal = annualFiscal(profile, { ...taxInput, lossCarryforward: carry });
      fiscalYears.push(fiscal);
      const tax = (row: FiscalYear) => row.incomeTax + row.surtax + row.solidarity + row.churchTax;
      const withoutMortgage = annualFiscal(profile, { ...taxInput, mortgageCash: 0, mortgageInterest: 0, lossCarryforward: carryWithoutMortgage });
      carry = fiscal.lossCarryforward; carryWithoutMortgage = withoutMortgage.lossCarryforward;
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
  // Con il debito residuo si investe solo il capitale proprio: il prestito copre il resto all'inizio
  // e alla vendita si estingue il debito non ancora rimborsato dalle rate. Senza debito: modello precedente.
  const debt = plan ? plan.debt : 0;
  const residualDebt = plan ? mortgageBalance(plan, p.anni_investimento * 12) : 0;
  const equity = initial - debt;
  // Modello 2: tutti i costi terminali sono deflazionati allo stesso istante.
  const finalCommissionReal = (p.commissione_finale + exitTax + residualDebt) / terminalDiscount;
  const profit = rentTotal + finalNominal - p.valore_immobile + initialGain - p.commissione_iniziale - acquisitionExtras - p.commissione_finale - exitTax
    + debt - residualDebt;
  const profitReal = rentReal + finalReal - p.valore_immobile + initialGain - p.commissione_iniziale - acquisitionExtras - finalCommissionReal + debt;
  const cash_flows_nominal = [-equity, ...affitti_netti_annuali];
  cash_flows_nominal[p.anni_investimento] += finalNominal - p.commissione_finale - exitTax - residualDebt;
  const cash_flows_real = cash_flows_nominal.map((v, year) => v / inflation ** year);
  const irrNominal = calculateIrr(cash_flows_nominal), irrReal = calculateIrr(cash_flows_real);
  // ROI senza leva: prezzo pieno, nessuna rata, nessun debito né beneficio fiscale degli interessi.
  const roi = (profit - debt + residualDebt + mortgageTotal - sum(mortgageTaxBenefits)) / initial * 100;
  const roiReal = (profitReal - debt + residualDebt / terminalDiscount + real(costi_mutuo_annuali) - real(mortgageTaxBenefits)) / initial * 100;
  const roe = profit / equity * 100, roeReal = profitReal / equity * 100;
  const warnings: string[] = [];
  if (p.rata_mutuo_mensile > 0 && p.anni_restanti_mutuo > 0 && !plan) warnings.push('mortgage_debt_missing');
  if (p.rata_mutuo_mensile > 0 && p.anni_restanti_mutuo === 0) warnings.push('mortgage_zero_years');
  if (renovationOnly) warnings.push(profile ? 'renovation_only_no_purchase_tax' : 'renovation_only');
  if (cedolare && p.tipo_adeguamento === 'inflation') warnings.push('cedolare_fixed_rent');
  if (profile?.country === 'italy' && p.tipo_adeguamento === 'property_value') warnings.push('italy_rent_renegotiation');
  if (profile) warnings.push('fiscal_projection', 'sale_tax_manual');
  let capitalGainTaxEstimate: number | null = null;
  if (profile?.country === 'italy') {
    if (p.periodo_sfitto_perc > 0 && profile.vacantSameMunicipality === 'unknown') warnings.push('italy_vacancy_unknown');
    if (p.periodo_sfitto_perc > 0 && (profile.regime === 'ordinary' || profile.regime === 'custom') && profile.leaseDutiesMode === 'auto') warnings.push('italy_registration_estimate');
    // Con la cedolare gli aumenti sono sospesi per la durata dell'opzione: il nuovo canone presuppone un nuovo contratto.
    const interval = p.adeguamento_affitto_anni;
    if (cedolare && profile.renegotiateRent && p.tipo_adeguamento === 'property_value' && p.anni_investimento > interval
      && interval % ITALY_CONTRACT_YEARS_CONCORDATO !== 0 && interval % ITALY_CONTRACT_YEARS_FREE !== 0) warnings.push('italy_renegotiation_mid_contract');
    if (p.periodo_sfitto_perc > 0) warnings.push('italy_vacancy_imu_estimate');
    if (p.anni_investimento < ITALY_CAPITAL_GAIN_YEARS) {
      // Costo fiscale: prezzo, lavori, oneri accessori e imposte d'acquisto; prezzo di vendita al netto della commissione.
      const basis = (p.costo_acquisto || p.valore_immobile) + p.costo_ristrutturazione + p.commissione_iniziale + acquisitionExtras;
      capitalGainTaxEstimate = Math.max(0, finalNominal - p.commissione_finale - basis) * ITALY_CAPITAL_GAIN_RATE;
      if (capitalGainTaxEstimate > 0 && exitTax === 0) warnings.push('italy_capital_gain');
    }
    if (profile.cadastralRent <= 0) warnings.push('italy_cadastral_missing');
    if (profile.otherIncomeType === 'none' && profile.otherTaxableIncome > 0 && profile.otherTaxableIncome < 50000) warnings.push('italy_work_deductions_excluded');
    if (profile.otherIncomeType === 'employee' && profile.otherTaxableIncome > 0 && profile.otherTaxableIncome <= 28000) warnings.push('italy_integrative_excluded');
    if (!renovationOnly && profile.purchaseTaxMode === 'manual' && profile.manualPurchaseTax === 0) warnings.push('italy_purchase_tax_zero');
    // Cedolare 10% e riduzione IRPEF del 30% presuppongono un canone concordato, che dà diritto anche all'IMU al 75%.
    const concordato = profile.regime === 'cedolare10' || (profile.regime === 'ordinary' && profile.ordinaryConcordatoReduction);
    if (concordato && !profile.imuConcordatoReduction && p.periodo_sfitto_perc < 100) warnings.push('italy_imu_concordato');
    if (profile.imuRatePermille > ITALY_MAX_IMU_PERMILLE || (p.periodo_sfitto_perc > 0 && profile.imuVacantRatePermille > ITALY_MAX_IMU_PERMILLE)
      || (profile.localSurtaxPercent > ITALY_MAX_SURTAX_PERCENT && (profile.regime === 'ordinary' || (p.periodo_sfitto_perc > 0 && profile.vacantSameMunicipality === 'yes')))) warnings.push('italy_rate_unusual');
  }
  if (profile?.country === 'germany') {
    warnings.push('german_estimate');
    if (!profile.allowLossOffset && fiscalYears.some(row => row.taxableRentalIncome < 0)) warnings.push('german_losses_ignored');
    if (plan && profile.deductibleInterestAnnual > 0) warnings.push('german_interest_from_plan');
    if (p.anni_investimento <= GERMANY_PRIVATE_SALE_YEARS) {
      // Costo fiscale ridotto dell'ammortamento dedotto (§23 c. 3 EStG); possesso contato dall'inizio della simulazione.
      const depreciation = profile.alreadyDepreciated + sum(fiscalYears.map(row => row.depreciation));
      const basis = (p.costo_acquisto || p.valore_immobile) + p.costo_ristrutturazione + p.commissione_iniziale + acquisitionExtras - depreciation;
      const last = fiscalYears[fiscalYears.length - 1];
      capitalGainTaxEstimate = germanyPrivateSaleTax2026(profile, finalNominal - p.commissione_finale - basis, last.assessedIncome, last.lossCarryforward);
      if (capitalGainTaxEstimate > 0 && exitTax === 0) warnings.push('germany_private_sale');
    }
  }
  if (fiscalYears.some(row => row.operatingDeductionRequested > row.operatingDeduction + 1e-6)) warnings.push('deduction_capped');
  if (irrNominal.status === 'ambiguous' || irrReal.status === 'ambiguous') warnings.push('irr_ambiguous');
  if (irrNominal.positiveOnly || irrReal.positiveOnly) warnings.push('irr_positive_unique');
  const cagr = annualize((finalNominal + rentTotal - p.commissione_finale - exitTax - residualDebt) / equity, p.anni_investimento);
  const cagrReal = annualize((finalReal + rentReal - finalCommissionReal) / equity, p.anni_investimento);
  if (cagr === null || cagrReal === null) warnings.push('annualization_unavailable');
  return {
    modelVersion: MODEL_VERSION, warnings,
    fiscal: profile ? { country: profile.country, rulesYear: profile.rulesYear, purchaseTax,
      additionalAcquisitionCosts: profile.additionalAcquisitionCosts, exitTax, capitalGainTaxEstimate, years: fiscalYears,
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
    investimento_iniziale: initial, capitale_proprio: equity,
    mutuo: plan ? { debito_iniziale: debt, tasso_annuo_implicito: plan.monthlyRate * 12 * 100, debito_residuo_finale: residualDebt } : null,
    roi_nominale: roi, roi_reale: roiReal, roe_nominale: roe, roe_reale: roeReal,
    roi_annualizzato: annualize(1 + roi / 100, p.anni_investimento),
    roe_annualizzato: annualize(1 + roe / 100, p.anni_investimento),
    tir_nominale: irrNominal.value === null ? null : irrNominal.value * 100,
    tir_reale: irrReal.value === null ? null : irrReal.value * 100,
    irrNominal, irrReal,
  };
}
export type InvestmentResult = ReturnType<typeof calculateInvestment>;
