/** Modelli per persone fisiche residenti, immobili residenziali nel medesimo Paese.
 * Regole 2026 verificate il 30/10/2026. Fonti e limiti: docs/FISCALITA.md.
 * Le proiezioni mantengono le regole 2026 costanti, senza predire norme future.
 */
export type Section = 'generic' | 'italy' | 'germany';
export interface CustomFlow {
  id: string; label: string; kind: 'income' | 'expense'; annualAmount: number;
  inflationLinked: boolean; deductible: boolean;
}
interface CommonProfile {
  rulesYear: 2026;
  additionalAcquisitionCosts: number;
  exitTaxAmount: number;
  customFlows: CustomFlow[];
}
export interface ItalyProfile extends CommonProfile {
  country: 'italy';
  regime: 'cedolare21' | 'cedolare10' | 'ordinary' | 'custom';
  reducedRateEligible: boolean;
  customTaxPercent: number;
  otherTaxableIncome: number;
  localSurtaxPercent: number;
  cadastralRent: number;
  imuRatePermille: number;
  imuConcordatoReduction: boolean;
  ordinaryConcordatoReduction: boolean;
  /** 'auto': quota locatore del registro calcolata sul canone; 'manual': annualLeaseDuties. */
  leaseDutiesMode: 'auto' | 'manual';
  annualLeaseDuties: number;
  purchaseTaxMode: 'manual' | 'second_home_private';
  priceValueEligible: boolean;
  manualPurchaseTax: number;
}
export interface GermanyProfile extends CommonProfile {
  country: 'germany';
  otherTaxableIncome: number;
  jointAssessment: boolean;
  churchTaxPercent: number;
  applySoli: boolean;
  allowLossOffset: boolean;
  deductibleOperatingAnnual: number;
  deductibleInterestAnnual: number;
  buildingTaxBasis: number;
  alreadyDepreciated: number;
  afaRatePercent: number;
  grundsteuerAnnual: number;
  transferTaxPercent: number;
}
export type TaxProfile = ItalyProfile | GermanyProfile;
export const sectionOf = (value: { taxProfile?: TaxProfile }): Section => value.taxProfile?.country ?? 'generic';
export function defaultTaxProfile(country: 'italy'): ItalyProfile;
export function defaultTaxProfile(country: 'germany'): GermanyProfile;
export function defaultTaxProfile(country: Exclude<Section, 'generic'>): TaxProfile;
export function defaultTaxProfile(country: Exclude<Section, 'generic'>): TaxProfile {
  const common = { rulesYear: 2026 as const, additionalAcquisitionCosts: 0, exitTaxAmount: 0, customFlows: [] };
  return country === 'italy' ? { ...common, country, regime: 'cedolare21', reducedRateEligible: false,
    customTaxPercent: 21, otherTaxableIncome: 30000, localSurtaxPercent: 2,
    cadastralRent: 800, imuRatePermille: 10.6, imuConcordatoReduction: false,
    ordinaryConcordatoReduction: false, leaseDutiesMode: 'auto', annualLeaseDuties: 0,
    purchaseTaxMode: 'manual', priceValueEligible: false, manualPurchaseTax: 0 }
    : { ...common, country, otherTaxableIncome: 40000, jointAssessment: false, churchTaxPercent: 0,
      applySoli: true, allowLossOffset: false, deductibleOperatingAnnual: 0, deductibleInterestAnnual: 0,
      buildingTaxBasis: 0, alreadyDepreciated: 0, afaRatePercent: 2, grundsteuerAnnual: 0, transferTaxPercent: 3.5 };
}

export interface FiscalIssue { field: string; code: 'range' | 'boolean' | 'choice' | 'required' }
export const fiscalIssues = (value: unknown): FiscalIssue[] => {
  const issues: FiscalIssue[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ field: 'country', code: 'required' }];
  const p = value as Record<string, unknown>;
  function number(field: string, min = 0, max = 1e12) {
    if (typeof p[field] !== 'number' || !Number.isFinite(p[field]) || Number(p[field]) < min || Number(p[field]) > max) issues.push({ field, code: 'range' });
  }
  function bool(field: string) { if (typeof p[field] !== 'boolean') issues.push({ field, code: 'boolean' }); }
  function choice(field: string, options: unknown[]) { if (!options.includes(p[field])) issues.push({ field, code: 'choice' }); }
  choice('country', ['italy', 'germany']); choice('rulesYear', [2026]);
  number('additionalAcquisitionCosts'); number('exitTaxAmount');
  if (!Array.isArray(p.customFlows) || p.customFlows.length > 30) issues.push({ field: 'customFlows', code: 'range' });
  else {
    const ids = new Set<string>();
    for (const flow of p.customFlows) {
      if (!flow || typeof flow !== 'object' || typeof flow.id !== 'string' || !flow.id || flow.id.length > 80 || ids.has(flow.id)
        || typeof flow.label !== 'string' || !flow.label.trim() || flow.label.length > 80
        || !['income', 'expense'].includes(flow.kind) || typeof flow.annualAmount !== 'number'
        || !Number.isFinite(flow.annualAmount) || flow.annualAmount < 0 || flow.annualAmount > 1e12
        || typeof flow.inflationLinked !== 'boolean' || typeof flow.deductible !== 'boolean') issues.push({ field: 'customFlows', code: 'required' });
      if (flow && typeof flow.id === 'string') ids.add(flow.id);
    }
  }
  if (p.country === 'italy') {
    choice('regime', ['cedolare21', 'cedolare10', 'ordinary', 'custom']);
    choice('purchaseTaxMode', ['manual', 'second_home_private']);
    // Assente negli archivi creati prima del modello 3.1.0: vedi LEGACY_DEFAULTS.
    if (p.leaseDutiesMode !== undefined) choice('leaseDutiesMode', ['auto', 'manual']);
    for (const f of ['reducedRateEligible', 'imuConcordatoReduction', 'ordinaryConcordatoReduction', 'priceValueEligible']) bool(f);
    for (const f of ['otherTaxableIncome', 'cadastralRent', 'annualLeaseDuties', 'manualPurchaseTax']) number(f);
    number('customTaxPercent', 0, 100); number('localSurtaxPercent', 0, 20); number('imuRatePermille', 0, 30);
    if (p.regime === 'cedolare10' && p.reducedRateEligible !== true) issues.push({ field: 'reducedRateEligible', code: 'required' });
    if (p.purchaseTaxMode === 'second_home_private' && p.priceValueEligible !== true) issues.push({ field: 'priceValueEligible', code: 'required' });
    if (p.purchaseTaxMode === 'second_home_private' && Number(p.cadastralRent) <= 0) issues.push({ field: 'cadastralRent', code: 'required' });
  } else if (p.country === 'germany') {
    for (const f of ['otherTaxableIncome', 'deductibleOperatingAnnual', 'deductibleInterestAnnual', 'buildingTaxBasis', 'alreadyDepreciated', 'grundsteuerAnnual']) number(f);
    for (const f of ['jointAssessment', 'applySoli', 'allowLossOffset']) bool(f);
    choice('churchTaxPercent', [0, 8, 9]); number('afaRatePercent', 0, 100); number('transferTaxPercent', 0, 10);
    if (Number(p.alreadyDepreciated) > Number(p.buildingTaxBasis)) issues.push({ field: 'alreadyDepreciated', code: 'range' });
  }
  return issues;
};
/** Valori per campi introdotti dopo la creazione dell'archivio: conservano il comportamento precedente. */
const LEGACY_DEFAULTS: Record<string, unknown> = { leaseDutiesMode: 'manual' };
export function parseTaxProfile(value: unknown): TaxProfile {
  const issues = fiscalIssues(value);
  if (issues.length) throw new Error(`INVALID_TAX_PROFILE:${issues.map(i => i.field).join(',')}`);
  const p = value as TaxProfile;
  const source = p as unknown as Record<string, unknown>;
  const defaults = defaultTaxProfile(p.country);
  return Object.fromEntries(Object.keys(defaults).map(key => [key,
    key === 'customFlows' ? p.customFlows.map(f => ({ id: f.id, label: f.label.trim(), kind: f.kind,
      annualAmount: f.annualAmount, inflationLinked: f.inflationLinked, deductible: f.deductible }))
      : source[key] ?? LEGACY_DEFAULTS[key]])) as unknown as TaxProfile;
}

export function italyIrpef2026(taxable: number): number {
  const x = Math.max(0, taxable);
  return Math.min(x, 28000) * 0.23 + Math.min(Math.max(0, x - 28000), 22000) * 0.33 + Math.max(0, x - 50000) * 0.43;
}
/** Quota del locatore (50%) dell'imposta di registro annua sulla locazione abitativa:
 * 2% del canone; base al 70% per canone concordato in comuni ad alta tensione abitativa
 * (art. 8 L. 431/1998); minimo 67 EUR sulla prima annualità. Bollo escluso. */
export function italyLeaseRegistrationShare(annualRent: number, firstYear: boolean, concordato: boolean): number {
  if (annualRent <= 0) return 0;
  const tax = annualRent * (concordato ? 0.7 : 1) * 0.02;
  return (firstYear ? Math.max(67, tax) : tax) / 2;
}
export function germanyIncomeTax2026(taxable: number, joint = false): number {
  const divisor = joint ? 2 : 1, x = Math.floor(Math.max(0, taxable) / divisor);
  const y = (x - 12348) / 10000, z = (x - 17799) / 10000;
  const tax = x <= 12348 ? 0 : x <= 17799 ? (914.51 * y + 1400) * y
    : x <= 69878 ? (173.10 * z + 2397) * z + 1034.87
      : x <= 277825 ? 0.42 * x - 11135.63 : 0.45 * x - 19470.38;
  return divisor * Math.floor(Math.max(0, tax));
}
export function germanySoli2026(incomeTax: number, joint = false): number {
  const threshold = joint ? 40700 : 20350;
  return Math.floor(Math.max(0, Math.min(incomeTax * 0.055, (incomeTax - threshold) * 0.119)) * 100 + 1e-8) / 100;
}
export function acquisitionTax(profile: TaxProfile, purchasePrice: number): number {
  if (profile.country === 'germany') return Math.floor(purchasePrice * profile.transferTaxPercent / 100);
  return profile.purchaseTaxMode === 'manual' ? profile.manualPurchaseTax
    : Math.max(1000, profile.cadastralRent * 1.05 * 120 * 0.09) + 100;
}

export interface FiscalYear {
  year: number; rentReceived: number; taxableRentalIncome: number;
  incomeTax: number; propertyTax: number; surtax: number; solidarity: number; churchTax: number;
  leaseDuties: number; depreciation: number; operatingDeduction: number; interestDeduction: number;
  operatingDeductionRequested: number;
  customIncome: number; customExpenses: number;
}
export function annualFiscal(profile: TaxProfile, input: {
  year: number; rentReceived: number; operatingCashCosts: number; mortgageCash: number; inflation: number; occupiedFraction?: number;
}): FiscalYear {
  const { year, rentReceived, operatingCashCosts, mortgageCash, inflation } = input;
  const index = inflation ** (year - 1);
  let customIncome = 0, customExpenses = 0, customDeductible = 0;
  for (const flow of profile.customFlows) {
    const fixedAccessoryRent = profile.country === 'italy' && ['cedolare21', 'cedolare10'].includes(profile.regime) && flow.kind === 'income';
    const amount = flow.annualAmount * (flow.inflationLinked && !fixedAccessoryRent ? index : 1);
    if (flow.kind === 'income') customIncome += amount;
    else { customExpenses += amount; if (flow.deductible) customDeductible += amount; }
  }
  const base: FiscalYear = { year, rentReceived, taxableRentalIncome: 0, incomeTax: 0, propertyTax: 0,
    surtax: 0, solidarity: 0, churchTax: 0, leaseDuties: 0, depreciation: 0,
    operatingDeduction: 0, operatingDeductionRequested: 0, interestDeduction: 0, customIncome, customExpenses };
  if (profile.country === 'italy') {
    base.propertyTax = profile.cadastralRent * 1.05 * 160 * profile.imuRatePermille / 1000 * (profile.imuConcordatoReduction ? 0.75 : 1);
    // Ipotesi: intero anno, intera proprietà, immobile residenziale locato.
    // La quota sfitto riduce il canone contrattuale simulato, non simula morosità.
    const rentBase = Math.max(profile.cadastralRent * 1.05 * (input.occupiedFraction ?? 1), (rentReceived + customIncome) * (profile.regime === 'ordinary' ? 0.95 : 1));
    const reducedBase = profile.regime === 'ordinary' && profile.ordinaryConcordatoReduction ? rentBase * 0.7 : rentBase;
    base.taxableRentalIncome = reducedBase;
    if (profile.regime === 'ordinary') {
      base.incomeTax = italyIrpef2026(profile.otherTaxableIncome + base.taxableRentalIncome) - italyIrpef2026(profile.otherTaxableIncome);
      base.surtax = base.taxableRentalIncome * profile.localSurtaxPercent / 100;
      base.leaseDuties = profile.leaseDutiesMode === 'auto'
        ? italyLeaseRegistrationShare(rentReceived + customIncome, year === 1, profile.ordinaryConcordatoReduction)
        : profile.annualLeaseDuties;
    } else {
      const rate = profile.regime === 'cedolare21' ? 21 : profile.regime === 'cedolare10' ? 10 : profile.customTaxPercent;
      base.incomeTax = base.taxableRentalIncome * rate / 100;
    }
    // Le voci di ricavo personalizzate italiane rappresentano canoni accessori
    // soggetti allo stesso regime. Spese effettive non dedotte dalla cedolare/IRPEF fondiaria.
    return base;
  }
  base.propertyTax = profile.grundsteuerAnnual;
  base.operatingDeductionRequested = profile.deductibleOperatingAnnual * index + customDeductible;
  base.operatingDeduction = Math.min(profile.deductibleOperatingAnnual * index, operatingCashCosts + base.propertyTax) + customDeductible;
  base.interestDeduction = Math.min(profile.deductibleInterestAnnual, mortgageCash);
  base.depreciation = Math.min(profile.buildingTaxBasis * profile.afaRatePercent / 100,
    Math.max(0, profile.buildingTaxBasis - profile.alreadyDepreciated - (year - 1) * profile.buildingTaxBasis * profile.afaRatePercent / 100));
  base.taxableRentalIncome = rentReceived + customIncome - base.operatingDeduction - base.interestDeduction - base.depreciation;
  const deltaIncome = profile.allowLossOffset ? base.taxableRentalIncome : Math.max(0, base.taxableRentalIncome);
  const before = germanyIncomeTax2026(profile.otherTaxableIncome, profile.jointAssessment);
  const after = germanyIncomeTax2026(profile.otherTaxableIncome + deltaIncome, profile.jointAssessment);
  base.incomeTax = after - before;
  if (profile.applySoli) base.solidarity = germanySoli2026(after, profile.jointAssessment) - germanySoli2026(before, profile.jointAssessment);
  base.churchTax = (after - before) * profile.churchTaxPercent / 100;
  return base;
}

export const FISCAL_SOURCES = {
  italy: [
    { title: 'Agenzia delle Entrate · Guida agli affitti', url: 'https://www.agenziaentrate.gov.it/portale/documents/20143/3015794/GUIDA%2BAFFITTI%2B17%2BOTTOBRE%2BINTERNET%2B%281%29.pdf' },
    { title: 'Agenzia delle Entrate · Locazioni abitative', url: 'https://infoprecompilata.agenziaentrate.gov.it/portale/sl/web/guest/semplificata-mod-fabbricati' },
    { title: 'MEF · TUIR art. 11 (2026)', url: 'https://def.finanze.it/DocTribFrontend/getArticoloDetailFromResultList.do?codiceOrdinamento=0000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000&id=%7BD5368F6F-A959-4AF5-A60F-8CB8BD99E176%7D&idAttoNormativo=%7B31D694E8-4398-4030-873B-FEAF5A6647F9%7D' },
    { title: 'Agenzia delle Entrate · Acquisto della casa', url: 'https://www1.agenziaentrate.gov.it/web_app_entrate/guida_acquisto_casa.html' },
    { title: 'Comune di Venezia · Base imponibile IMU', url: 'https://www.comune.venezia.it/it/node/28631' },
    { title: 'Comune di Milano · IMU canone concordato', url: 'https://servizicrm.comune.milano.it/centro-supporto/KA-01874/IMU-calcolo-abitazione-locata-con-canone-concordato' },
  ],
  germany: [
    { title: 'EStG § 32a · Einkommensteuertarif 2026', url: 'https://www.gesetze-im-internet.de/estg/__32a.html' },
    { title: 'EStG § 7 · AfA', url: 'https://www.gesetze-im-internet.de/estg/__7.html' },
    { title: 'EStG § 9 · Werbungskosten', url: 'https://www.gesetze-im-internet.de/estg/__9.html' },
    { title: 'SolzG · Solidaritätszuschlag', url: 'https://www.gesetze-im-internet.de/solzg_1995/BJNR097500993.html' },
    { title: 'BMF · Grundsteuer', url: 'https://www.bundesfinanzministerium.de/Content/DE/FAQ/faq-die-neue-grundsteuer.htm' },
  ],
};
