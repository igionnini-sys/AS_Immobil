import { describe, expect, it } from 'vitest';
import { acquisitionTax, annualFiscal, calculateInvestment, DEFAULT_PARAMS, defaultTaxProfile, germanyIncomeTax2026, germanySoli2026, italyIrpef2026, parseTaxProfile } from '@immobil/core';
import { createScenario, emptyArchive, mergeArchive, parseArchive, serializeArchive, withDraft } from '@immobil/storage';

const annual = { year: 1, rentReceived: 12000, operatingCashCosts: 2000, mortgageCash: 0, inflation: 1, occupiedFraction: 1 };
describe('Italia: regole 2026 per persona fisica residente', () => {
  it.each([[0, 0], [28000, 6440], [50000, 13700], [60000, 18000]])('IRPEF su %s', (income, expected) => {
    expect(italyIrpef2026(income)).toBeCloseTo(expected, 8);
  });
  it('calcola cedolare e IMU catastale, applicando la riduzione solo se selezionata', () => {
    const p = defaultTaxProfile('italy'); p.cadastralRent = 1000; p.imuRatePermille = 10;
    expect(annualFiscal(p, annual)).toMatchObject({ incomeTax: 2520, propertyTax: 1680, operatingDeduction: 0 });
    p.imuConcordatoReduction = true; p.regime = 'cedolare10'; p.reducedRateEligible = true;
    expect(annualFiscal(parseTaxProfile(p), annual)).toMatchObject({ incomeTax: 1200, propertyTax: 1260 });
  });
  it('usa IRPEF incrementale e 95% del canone, senza dedurre le spese effettive', () => {
    const p = { ...defaultTaxProfile('italy'), regime: 'ordinary' as const, otherTaxableIncome: 25000, localSurtaxPercent: 2, annualLeaseDuties: 100 };
    const r = annualFiscal(p, annual);
    expect(r.taxableRentalIncome).toBe(11400);
    expect(r.incomeTax).toBeCloseTo(3000 * .23 + 8400 * .33, 8);
    expect(r.surtax).toBe(228); expect(r.leaseDuties).toBe(100);
    expect(annualFiscal({ ...p, ordinaryConcordatoReduction: true }, annual).taxableRentalIncome).toBeCloseTo(7980, 8);
  });
  it('calcola prezzo-valore senza duplicare la rivalutazione, applica il minimo e richiede requisiti', () => {
    const p = { ...defaultTaxProfile('italy'), purchaseTaxMode: 'second_home_private' as const, priceValueEligible: true, cadastralRent: 900 };
    expect(acquisitionTax(p, 200000)).toBeCloseTo(10306, 8);
    expect(acquisitionTax({ ...p, cadastralRent: 1 }, 200000)).toBe(1100);
    expect(() => parseTaxProfile({ ...p, priceValueEligible: false })).toThrow();
    expect(() => parseTaxProfile({ ...p, regime: 'cedolare10' })).toThrow();
  });
  it('blocca adeguamenti in cedolare e tassa i canoni accessori nello stesso regime', () => {
    const p = defaultTaxProfile('italy');
    p.customFlows = [{ id: 'accessory', label: 'Pertinenza', kind: 'income', annualAmount: 1200, inflationLinked: true, deductible: false }];
    const r = calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p });
    expect(r.affitti_lordi_annuali).toEqual(Array(10).fill(12000));
    expect(r.fiscal!.years[1].customIncome).toBe(1200);
    const ordinary = annualFiscal({ ...p, regime: 'ordinary' }, annual);
    expect(ordinary.taxableRentalIncome).toBe(13200 * .95);
  });
  it('sfitto completo non genera canoni imponibili nel perimetro dichiarato', () => {
    const r = calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 100, taxProfile: defaultTaxProfile('italy') });
    expect(r.fiscal!.years[0].incomeTax).toBe(0);
    expect(r.fiscal!.years[0].propertyTax).toBeGreaterThan(0);
  });
});

describe('Germania: EStG e SolzG 2026', () => {
  it.each([[12348, 0], [17799, 1034], [69878, 18213], [100000, 30864], [300000, 115529]])('ESt analitica su %s', (income, expected) => {
    expect(germanyIncomeTax2026(income)).toBe(expected);
  });
  it('splitting usa due volte la tariffa sul reddito congiunto dimezzato', () => {
    expect(germanyIncomeTax2026(100000, true)).toBe(2 * germanyIncomeTax2026(50000));
    expect(germanyIncomeTax2026(24696, true)).toBe(0);
    expect(germanyIncomeTax2026(50000.99)).toBe(germanyIncomeTax2026(50000));
  });
  it('Soli rispetta franchigia, zona di attenuazione e limite 5,5%', () => {
    expect(germanySoli2026(20350)).toBe(0); expect(germanySoli2026(40700, true)).toBe(0);
    expect(germanySoli2026(21000)).toBe(77.35); expect(germanySoli2026(100000)).toBe(5500);
  });
  it('AfA riduce l’imponibile senza sottrarre contanti e non eccede la base residua', () => {
    const p = { ...defaultTaxProfile('germany'), buildingTaxBasis: 100000, afaRatePercent: 2, alreadyDepreciated: 99000 };
    expect(annualFiscal(p, annual).depreciation).toBe(1000);
    expect(annualFiscal(p, { ...annual, year: 2 }).depreciation).toBe(0);
    const without = calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 1, taxProfile: { ...p, afaRatePercent: 0 } });
    const withAfa = calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 1, taxProfile: p });
    const taxSaving = without.fiscal!.totalIncomeTax - withAfa.fiscal!.totalIncomeTax;
    expect(withAfa.totale_affitti_netti - without.totale_affitti_netti).toBeCloseTo(taxSaving, 6);
  });
  it('non deduce la quota capitale e termina gli interessi alla scadenza del mutuo', () => {
    const p = { ...defaultTaxProfile('germany'), deductibleInterestAnnual: 2000 };
    const result = calculateInvestment({ ...DEFAULT_PARAMS, rata_mutuo_mensile: 500, anni_restanti_mutuo: 1, taxProfile: p });
    expect(result.fiscal!.years[0].interestDeduction).toBe(2000);
    expect(result.fiscal!.years[1].interestDeduction).toBe(0);
    expect(annualFiscal(p, { ...annual, mortgageCash: 1000 }).interestDeduction).toBe(1000);
  });
  it('limita i costi deducibili ai costi monetari considerati e segnala il limite', () => {
    const p = { ...defaultTaxProfile('germany'), deductibleOperatingAnnual: 99999, grundsteuerAnnual: 400 };
    expect(annualFiscal(p, annual).operatingDeduction).toBe(2400);
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p }).warnings).toContain('deduction_capped');
  });
  it('non produce rimborsi da perdite salvo opzione esplicita; nessun rimborso oltre imposta di base', () => {
    const p = { ...defaultTaxProfile('germany'), buildingTaxBasis: 1e6, afaRatePercent: 10 };
    expect(annualFiscal(p, annual).incomeTax).toBe(0);
    const loss = annualFiscal({ ...p, allowLossOffset: true }, annual);
    expect(loss.incomeTax).toBe(-germanyIncomeTax2026(p.otherTaxableIncome));
  });
  it('ROI senza leva ricostruisce il caso senza mutuo, rimuovendo anche il beneficio fiscale degli interessi', () => {
    const p = { ...defaultTaxProfile('germany'), deductibleInterestAnnual: 2000 };
    const financed = calculateInvestment({ ...DEFAULT_PARAMS, rata_mutuo_mensile: 500, anni_restanti_mutuo: 5, taxProfile: p });
    const cash = calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p });
    expect(financed.roi_nominale).toBeCloseTo(cash.roi_nominale, 8);
    expect(financed.roi_reale).toBeCloseTo(cash.roi_reale, 8);
  });
});

describe('Voci personalizzate, flussi e formato dati', () => {
  it('costi aggiuntivi, acquisto e vendita compaiono una volta sola nei flussi', () => {
    const p = defaultTaxProfile('germany');
    p.customFlows = [{ id: 'cost', label: 'Spese extra', kind: 'expense', annualAmount: 1000, inflationLinked: true, deductible: true }];
    p.additionalAcquisitionCosts = 3000; p.exitTaxAmount = 5000;
    const r = calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p });
    expect(r.investimento_iniziale).toBe(210000);
    expect(r.fiscal!.years[0].customExpenses).toBe(1000);
    expect(r.fiscal!.years[1].customExpenses).toBe(1020);
    expect(r.rendimento_totale_nominale).toBeCloseTo(r.cash_flows_nominal.reduce((a, b) => a + b, 0), 6);
    expect(r.rendimento_totale_reale).toBeCloseTo(r.cash_flows_real.reduce((a, b) => a + b, 0), 6);
  });
  it('migra schema 1 senza modificare scenari e bozza generici', () => {
    const scenario = createScenario('Vecchio scenario', DEFAULT_PARAMS);
    const draft = { inputs: DEFAULT_PARAMS, updatedAt: new Date().toISOString() };
    const migrated = parseArchive(JSON.stringify({ schemaVersion: 1, preferences: { language: 'it', activeScenarioId: scenario.id }, scenarios: [scenario], draft }));
    expect(migrated.schemaVersion).toBe(2); expect(migrated.scenarios[0]).toEqual(scenario);
    expect(migrated.sectionDrafts.generic).toEqual(draft); expect(migrated.preferences.section).toBe('generic');
  });
  it('conserva e importa tre bozze indipendenti, mantenendo tutti i profili fiscali', () => {
    let a = withDraft(emptyArchive(), DEFAULT_PARAMS);
    a = withDraft(a, { ...DEFAULT_PARAMS, taxProfile: defaultTaxProfile('italy') });
    a = withDraft(a, { ...DEFAULT_PARAMS, taxProfile: defaultTaxProfile('germany') });
    const read = parseArchive(serializeArchive(a));
    expect(read.sectionDrafts.italy!.inputs.taxProfile?.country).toBe('italy');
    expect(read.sectionDrafts.germany!.inputs.taxProfile?.country).toBe('germany');
    expect(mergeArchive(emptyArchive(), read).scenarios).toHaveLength(3);
  });
  it('rifiuta profili alterati, versioni non supportate, numeri non finiti e sezioni non corrispondenti', () => {
    expect(() => parseTaxProfile({ ...defaultTaxProfile('germany'), afaRatePercent: NaN })).toThrow();
    expect(() => parseTaxProfile({ ...defaultTaxProfile('italy'), rulesYear: 2027 })).toThrow();
    const a = withDraft(emptyArchive(), { ...DEFAULT_PARAMS, taxProfile: defaultTaxProfile('italy') });
    a.preferences.section = 'germany'; expect(() => serializeArchive(a)).toThrow('SECTION_PROFILE_MISMATCH');
  });
});
