import { describe, expect, it } from 'vitest';
import { acquisitionTax, annualFiscal, calculateInvestment, DEFAULT_PARAMS, defaultTaxProfile, germanyIncomeTax2026, germanyPrivateSaleTax2026, germanySoli2026, italyEmployeeExemptSum2026, mortgageBalance, mortgagePlan, italyIrpef2026, italyWorkDeduction2026, parseTaxProfile } from '@immobil/core';
import { createScenario, emptyArchive, mergeArchive, parseArchive, serializeArchive, withDraft } from '@immobil/storage';

const annual = { year: 1, rentReceived: 12000, operatingCashCosts: 2000, mortgageCash: 0, inflation: 1, occupiedFraction: 1 };
describe('Italia: regole 2026 per persona fisica residente', () => {
  it.each([[0, 0], [28000, 6440], [50000, 13700], [60000, 18000]])('IRPEF su %s', (income, expected) => {
    expect(italyIrpef2026(income)).toBeCloseTo(expected, 8);
  });
  it('calcola cedolare e IMU catastale, applicando la riduzione solo se selezionata', () => {
    const p = defaultTaxProfile('italy'); p.cadastralRent = 1000; p.imuRatePermille = 10; p.otherIncomeType = 'none';
    expect(annualFiscal(p, annual)).toMatchObject({ incomeTax: 2520, propertyTax: 1680, operatingDeduction: 0 });
    p.imuConcordatoReduction = true; p.regime = 'cedolare10'; p.reducedRateEligible = true;
    expect(annualFiscal(parseTaxProfile(p), annual)).toMatchObject({ incomeTax: 1200, propertyTax: 1260 });
  });
  it('usa la rendita rivalutata quando supera il canone in cedolare', () => {
    const p = { ...defaultTaxProfile('italy'), cadastralRent: 8000, otherIncomeType: 'none' as const };
    const input = { ...annual, rentReceived: 6000 };
    expect(annualFiscal(p, input)).toMatchObject({ taxableRentalIncome: 8400, incomeTax: 1764 });
    expect(annualFiscal({ ...p, regime: 'cedolare10', reducedRateEligible: true }, input))
      .toMatchObject({ taxableRentalIncome: 8400, incomeTax: 840 });
    expect(annualFiscal({ ...p, regime: 'ordinary' }, input).taxableRentalIncome).toBe(8400);
    expect(annualFiscal({ ...p, regime: 'custom', customTaxPercent: 15 }, input))
      .toMatchObject({ taxableRentalIncome: 6000, incomeTax: 900 });
  });
  it('usa IRPEF incrementale e 95% del canone, senza dedurre le spese effettive', () => {
    const p = { ...defaultTaxProfile('italy'), regime: 'ordinary' as const, otherTaxableIncome: 25000, otherIncomeType: 'none' as const, localSurtaxPercent: 2,
      leaseDutiesMode: 'manual' as const, annualLeaseDuties: 100 };
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
  it('in cedolare blocca l’ISTAT, mantiene fissi i canoni accessori e li tassa nello stesso regime', () => {
    const p = defaultTaxProfile('italy');
    p.customFlows = [{ id: 'accessory', label: 'Pertinenza', kind: 'income', annualAmount: 1200, inflationLinked: true, deductible: false }];
    const r = calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 0, tipo_adeguamento: 'inflation', taxProfile: p });
    expect(r.affitti_lordi_annuali).toEqual(Array(10).fill(12000));
    expect(r.warnings).toContain('cedolare_fixed_rent');
    expect(r.fiscal!.years[1].customIncome).toBe(1200);
    const ordinary = annualFiscal({ ...p, regime: 'ordinary' }, annual);
    expect(ordinary.taxableRentalIncome).toBe(13200 * .95);
  });
  it('riallinea il canone solo dopo otto anni e solo se è simulato un nuovo accordo', () => {
    const params = { ...DEFAULT_PARAMS, adeguamento_affitto_anni: 8, tipo_adeguamento: 'property_value' as const };
    const p = defaultTaxProfile('italy');
    expect(calculateInvestment({ ...params, taxProfile: p }).affitti_lordi_annuali).toEqual(Array(10).fill(12000));
    const r = calculateInvestment({ ...params, taxProfile: { ...p, renegotiateRent: true } });
    expect(r.affitti_lordi_annuali.slice(0, 8)).toEqual(Array(8).fill(12000));
    expect(r.affitti_lordi_annuali[8]).toBeCloseTo(12000 * 1.02 ** 8);
    expect(r.warnings).toContain('italy_rent_renegotiation');
  });
  it('su 20 anni la cedolare 21% resta più conveniente dell’IRPEF al 33% con gli stessi canoni', () => {
    const params = { ...DEFAULT_PARAMS, anni_investimento: 20, periodo_sfitto_perc: 0, adeguamento_affitto_anni: 8 };
    const cedolare = calculateInvestment({ ...params, taxProfile: defaultTaxProfile('italy') });
    const ordinary = calculateInvestment({ ...params, taxProfile: { ...defaultTaxProfile('italy'), regime: 'ordinary', otherTaxableIncome: 30000 } });
    expect(cedolare.affitti_lordi_annuali).toEqual(ordinary.affitti_lordi_annuali);
    expect(cedolare.rendimento_totale_nominale).toBeGreaterThan(ordinary.rendimento_totale_nominale);
  });
  it('calcola la quota locatore del registro, con minimo e riduzione per canone concordato', () => {
    const p = { ...defaultTaxProfile('italy'), regime: 'ordinary' as const };
    expect(p.leaseDutiesMode).toBe('auto');
    expect(annualFiscal(p, annual).leaseDuties).toBeCloseTo(120, 8);
    expect(annualFiscal({ ...p, ordinaryConcordatoReduction: true }, annual).leaseDuties).toBeCloseTo(84, 8);
    const small = { ...annual, rentReceived: 2000 };
    expect(annualFiscal(p, small).leaseDuties).toBeCloseTo(33.5, 8);
    expect(annualFiscal(p, { ...small, year: 2 }).leaseDuties).toBeCloseTo(20, 8);
    expect(annualFiscal(p, { ...annual, rentReceived: 0 }).leaseDuties).toBe(0);
    expect(annualFiscal(defaultTaxProfile('italy'), annual).leaseDuties).toBe(0);
    const growing = calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 0, tipo_adeguamento: 'inflation', taxProfile: p });
    expect(growing.fiscal!.years[9].leaseDuties).toBeCloseTo(growing.fiscal!.years[9].rentReceived * 0.01, 8);
  });
  it('profili salvati prima del registro automatico restano in modalità manuale', () => {
    const legacy: Record<string, unknown> = { ...defaultTaxProfile('italy'), regime: 'ordinary', annualLeaseDuties: 150 };
    delete legacy.leaseDutiesMode;
    const parsed = parseTaxProfile(legacy);
    expect(parsed).toMatchObject({ leaseDutiesMode: 'manual', annualLeaseDuties: 150 });
    expect(annualFiscal(parsed, annual).leaseDuties).toBe(150);
    expect(() => parseTaxProfile({ ...legacy, leaseDutiesMode: 'other' })).toThrow();
  });
  it('stima la plusvalenza al 26% se la vendita avviene entro 5 anni, senza includerla nei risultati', () => {
    const p = { ...defaultTaxProfile('italy'), manualPurchaseTax: 5000 };
    const params = { ...DEFAULT_PARAMS, anni_investimento: 3, costo_acquisto: 150000 };
    const r = calculateInvestment({ ...params, taxProfile: p });
    expect(r.fiscal!.capitalGainTaxEstimate).toBeCloseTo((200000 * 1.02 ** 3 - 155000) * 0.26, 6);
    expect(r.warnings).toContain('italy_capital_gain');
    expect(r.fiscal!.exitTax).toBe(0);
    expect(r.cash_flows_nominal[3]).toBeCloseTo(r.affitti_netti_annuali[2] + r.valore_finale_nominale, 6);
    expect(calculateInvestment({ ...params, taxProfile: { ...p, exitTaxAmount: 16000 } }).warnings).not.toContain('italy_capital_gain');
    const fiveYears = calculateInvestment({ ...params, anni_investimento: 5, taxProfile: p });
    expect(fiveYears.fiscal!.capitalGainTaxEstimate).toBeNull();
    expect(fiveYears.warnings).not.toContain('italy_capital_gain');
    const germany = calculateInvestment({ ...params, taxProfile: defaultTaxProfile('germany') });
    expect(germany.fiscal!.capitalGainTaxEstimate!).toBeGreaterThan(0);
    expect(germany.warnings).toContain('germany_private_sale');
    expect(germany.warnings).not.toContain('italy_capital_gain');
  });
  it('segnala rendita mancante, imposte di acquisto nulle e aliquote fuori dai massimi abituali', () => {
    const base = { ...defaultTaxProfile('italy'), manualPurchaseTax: 5000 };
    const warnings = (p: object) => calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: { ...base, ...p } }).warnings;
    expect(warnings({})).not.toContain('italy_cadastral_missing');
    expect(warnings({})).not.toContain('italy_purchase_tax_zero');
    expect(warnings({})).not.toContain('italy_rate_unusual');
    expect(warnings({ cadastralRent: 0 })).toContain('italy_cadastral_missing');
    expect(warnings({ manualPurchaseTax: 0 })).toContain('italy_purchase_tax_zero');
    expect(warnings({ imuRatePermille: 15 })).toContain('italy_rate_unusual');
    expect(warnings({ regime: 'ordinary', localSurtaxPercent: 8 })).toContain('italy_rate_unusual');
    expect(warnings({ localSurtaxPercent: 8 })).not.toContain('italy_rate_unusual');
  });
  it('segnala il canone concordato senza riduzione IMU al 75%', () => {
    const base = { ...defaultTaxProfile('italy'), manualPurchaseTax: 5000 };
    const warnings = (p: object, params: object = {}) => calculateInvestment({ ...DEFAULT_PARAMS, ...params, taxProfile: { ...base, ...p } }).warnings;
    const cedolare10 = { regime: 'cedolare10', reducedRateEligible: true };
    expect(warnings(cedolare10)).toContain('italy_imu_concordato');
    expect(warnings({ ...cedolare10, imuConcordatoReduction: true })).not.toContain('italy_imu_concordato');
    expect(warnings(cedolare10, { periodo_sfitto_perc: 100 })).not.toContain('italy_imu_concordato');
    expect(warnings({ regime: 'ordinary', ordinaryConcordatoReduction: true })).toContain('italy_imu_concordato');
    expect(warnings({ regime: 'ordinary' })).not.toContain('italy_imu_concordato');
    expect(warnings({})).not.toContain('italy_imu_concordato');
  });
  it('controlla l’aliquota IMU dello sfitto solo se lo sfitto è presente', () => {
    const p = { ...defaultTaxProfile('italy'), manualPurchaseTax: 5000, imuVacantRatePermille: 15 };
    expect(calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 0, taxProfile: p }).warnings).not.toContain('italy_rate_unusual');
    expect(calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 5, taxProfile: p }).warnings).toContain('italy_rate_unusual');
  });
  it('in regime ordinario l’ISTAT decorre dalla seconda annualità', () => {
    const params = { ...DEFAULT_PARAMS, periodo_sfitto_perc: 0, tipo_adeguamento: 'inflation' as const };
    const p = { ...defaultTaxProfile('italy'), regime: 'ordinary' as const };
    const yearly = calculateInvestment({ ...params, adeguamento_affitto_anni: 1, taxProfile: p }).affitti_lordi_annuali;
    expect(yearly[0]).toBe(12000);
    expect(yearly[1]).toBeCloseTo(12000 * 1.02, 8);
    expect(yearly[9]).toBeCloseTo(12000 * 1.02 ** 9, 8);
    const everyFour = calculateInvestment({ ...params, adeguamento_affitto_anni: 4, taxProfile: p }).affitti_lordi_annuali;
    expect(everyFour.slice(0, 4)).toEqual(Array(4).fill(12000));
    expect(everyFour[4]).toBeCloseTo(12000 * 1.02 ** 4, 8);
    expect(everyFour[8]).toBeCloseTo(12000 * 1.02 ** 8, 8);
    expect(calculateInvestment({ ...params, adeguamento_affitto_anni: 1, taxProfile: { ...p, regime: 'custom' } }).affitti_lordi_annuali[0]).toBe(12000);
    // La sezione generica conserva la parità con il modello Python.
    expect(calculateInvestment({ ...params, adeguamento_affitto_anni: 1 }).affitti_lordi_annuali[0]).toBeCloseTo(12240, 8);
  });
  it('con aliquota personalizzata calcola il registro come in regime ordinario, senza base ridotta', () => {
    const p = { ...defaultTaxProfile('italy'), regime: 'custom' as const, customTaxPercent: 30, otherIncomeType: 'none' as const };
    expect(annualFiscal(p, annual)).toMatchObject({ incomeTax: 3600 });
    expect(annualFiscal(p, annual).leaseDuties).toBeCloseTo(120, 8);
    expect(annualFiscal({ ...p, ordinaryConcordatoReduction: true }, annual).leaseDuties).toBeCloseTo(120, 8);
    expect(annualFiscal({ ...p, leaseDutiesMode: 'manual', annualLeaseDuties: 0 }, annual).leaseDuties).toBe(0);
    expect(annualFiscal({ ...p, leaseDutiesMode: 'manual', annualLeaseDuties: 90 }, annual).leaseDuties).toBe(90);
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p }).warnings).toContain('italy_registration_estimate');
  });
  it('in cedolare segnala la rinegoziazione che non coincide con la scadenza di un contratto', () => {
    const p = { ...defaultTaxProfile('italy'), renegotiateRent: true };
    const warnings = (params: object, profile: object = p) => calculateInvestment({ ...DEFAULT_PARAMS, ...params, taxProfile: { ...p, ...profile } }).warnings;
    expect(warnings({ adeguamento_affitto_anni: 4 })).toContain('italy_renegotiation_mid_contract');
    for (const interval of [5, 8]) expect(warnings({ adeguamento_affitto_anni: interval })).not.toContain('italy_renegotiation_mid_contract');
    expect(warnings({ adeguamento_affitto_anni: 10, anni_investimento: 20 })).not.toContain('italy_renegotiation_mid_contract');
    expect(warnings({ adeguamento_affitto_anni: 4, anni_investimento: 4 })).not.toContain('italy_renegotiation_mid_contract');
    expect(warnings({ adeguamento_affitto_anni: 4 }, { renegotiateRent: false })).not.toContain('italy_renegotiation_mid_contract');
    expect(warnings({ adeguamento_affitto_anni: 4 }, { regime: 'ordinary' })).not.toContain('italy_renegotiation_mid_contract');
  });
  it('in cedolare le voci accessorie indicizzate seguono il nuovo accordo', () => {
    const flow = { kind: 'income' as const, annualAmount: 1200, deductible: false };
    const p = { ...defaultTaxProfile('italy'), renegotiateRent: true, customFlows: [
      { ...flow, id: 'box', label: 'Box', inflationLinked: true }, { ...flow, id: 'cantina', label: 'Cantina', inflationLinked: false }] };
    const r = calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 0, adeguamento_affitto_anni: 8, taxProfile: p });
    expect(r.fiscal!.years[7].customIncome).toBe(2400);
    expect(r.fiscal!.years[8].customIncome).toBeCloseTo(1200 * 1.02 ** 8 + 1200, 8);
    expect((r.fiscal!.years[8].customIncome - 1200) / 1200).toBeCloseTo(r.affitti_lordi_annuali[8] / 12000, 8);
  });
  it('calcola le detrazioni 2026 da lavoro, pensione e autonomo e la somma esente dei dipendenti', () => {
    expect(italyWorkDeduction2026('employee', 15000)).toBe(1955);
    expect(italyWorkDeduction2026('employee', 28000)).toBeCloseTo(1910 + 65 + 1000, 8);
    expect(italyWorkDeduction2026('employee', 36000)).toBeCloseTo(1910 * 14000 / 22000 + 500, 8);
    expect(italyWorkDeduction2026('employee', 50000)).toBe(0);
    expect(italyWorkDeduction2026('pension', 8500)).toBe(1955);
    expect(italyWorkDeduction2026('pension', 27000)).toBeCloseTo(700 + 1255 / 19500 * 1000 + 50, 8);
    expect(italyWorkDeduction2026('self_employed', 5500)).toBe(1265);
    expect(italyWorkDeduction2026('self_employed', 39000)).toBeCloseTo(250, 8);
    expect(italyWorkDeduction2026('none', 20000)).toBe(0);
    expect(italyEmployeeExemptSum2026(8000, 8000)).toBeCloseTo(568, 8);
    expect(italyEmployeeExemptSum2026(18000, 18000)).toBeCloseTo(864, 8);
    expect(italyEmployeeExemptSum2026(18000, 20001)).toBe(0);
  });
  it('include nella cedolare e nell’IRPEF ordinaria le detrazioni perse dal dipendente', () => {
    const p = defaultTaxProfile('italy');
    expect(p).toMatchObject({ otherIncomeType: 'employee', otherTaxableIncome: 30000 });
    const lost = (1910 * 20000 / 22000 + 65 + 1000) - 1910 * 8000 / 22000;
    const cedolare = annualFiscal(p, annual);
    expect(cedolare.lostDeductions).toBeCloseTo(lost, 8);
    expect(cedolare.incomeTax).toBeCloseTo(2520 + lost, 8);
    const ordinary = annualFiscal({ ...p, regime: 'ordinary' }, annual);
    const lostOrdinary = (1910 * 20000 / 22000 + 65 + 1000) - 1910 * 8600 / 22000;
    expect(ordinary.lostDeductions).toBeCloseTo(lostOrdinary, 8);
    expect(ordinary.incomeTax).toBeCloseTo(italyIrpef2026(41400) - italyIrpef2026(30000) + lostOrdinary, 8);
    expect(annualFiscal({ ...p, otherIncomeType: 'none' }, annual)).toMatchObject({ incomeTax: 2520, lostDeductions: 0 });
    expect(annualFiscal({ ...p, otherTaxableIncome: 60000 }, annual)).toMatchObject({ incomeTax: 2520, lostDeductions: 0 });
  });
  it('non porta le detrazioni sotto l’imposta lorda e conta la perdita della somma esente', () => {
    const p = { ...defaultTaxProfile('italy'), otherTaxableIncome: 5000 };
    expect(annualFiscal(p, annual)).toMatchObject({ incomeTax: 2520, lostDeductions: 0 });
    const mid = annualFiscal({ ...p, otherTaxableIncome: 18000 }, annual);
    const before = italyIrpef2026(18000) - (1910 + 1190 * 10000 / 13000) - 864;
    const after = italyIrpef2026(18000) - (1910 * 20000 / 22000 + 65 + 1000);
    expect(mid.lostDeductions).toBeCloseTo(after - before, 8);
    expect(annualFiscal({ ...p, otherIncomeType: 'pension', otherTaxableIncome: 0 }, annual).lostDeductions).toBe(0);
  });
  it('profili salvati senza tipo di reddito restano senza detrazioni e lo segnalano', () => {
    const legacy: Record<string, unknown> = { ...defaultTaxProfile('italy'), manualPurchaseTax: 5000 };
    delete legacy.otherIncomeType;
    const parsed = parseTaxProfile(legacy);
    expect(parsed).toMatchObject({ otherIncomeType: 'none' });
    expect(annualFiscal(parsed, annual)).toMatchObject({ incomeTax: 2520, lostDeductions: 0 });
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: parsed }).warnings).toContain('italy_work_deductions_excluded');
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: { ...parsed, otherTaxableIncome: 60000 } }).warnings).not.toContain('italy_work_deductions_excluded');
    expect(() => parseTaxProfile({ ...legacy, otherIncomeType: 'student' })).toThrow();
    const employee = { ...defaultTaxProfile('italy'), manualPurchaseTax: 5000 };
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: employee }).warnings).not.toContain('italy_work_deductions_excluded');
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: { ...employee, otherTaxableIncome: 20000 } }).warnings).toContain('italy_integrative_excluded');
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: employee }).warnings).not.toContain('italy_integrative_excluded');
  });
  it('sfitto completo non genera canoni imponibili nel perimetro dichiarato', () => {
    const r = calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 100, taxProfile: defaultTaxProfile('italy') });
    expect(r.fiscal!.years[0].incomeTax).toBe(0);
    expect(r.fiscal!.years[0].propertyTax).toBeGreaterThan(0);
  });
  it('calcola separatamente la rendita dello sfitto nello stesso Comune anche in cedolare', () => {
    const p = { ...defaultTaxProfile('italy'), vacantSameMunicipality: 'yes' as const, cadastralRent: 1200, otherTaxableIncome: 30000, otherIncomeType: 'none' as const, localSurtaxPercent: 2 };
    const row = annualFiscal(p, { ...annual, occupiedFraction: 0.5, rentReceived: 6000 });
    expect(row.vacantTaxableIncome).toBeCloseTo(420);
    expect(row.taxableRentalIncome).toBe(6000);
    expect(row.incomeTax).toBeCloseTo(1260 + 420 * .33);
    expect(row.surtax).toBeCloseTo(420 * .02);
    const ordinary = annualFiscal({ ...p, regime: 'ordinary' }, { ...annual, occupiedFraction: 0.5, rentReceived: 6000 });
    expect(ordinary.incomeTax).toBeCloseTo((5700 + 420) * .33);
    expect(annualFiscal({ ...p, vacantSameMunicipality: 'no' }, { ...annual, occupiedFraction: 0, rentReceived: 0 }).vacantTaxableIncome).toBe(0);
  });
  it('ripartisce IMU e canoni accessori tra periodi locati e sfitti', () => {
    const p = { ...defaultTaxProfile('italy'), cadastralRent: 1000, imuRatePermille: 8, imuVacantRatePermille: 10,
      imuConcordatoReduction: true, customFlows: [{ id: 'p', label: 'Box', kind: 'income' as const, annualAmount: 1200, inflationLinked: false, deductible: false }] };
    const half = annualFiscal(p, { ...annual, occupiedFraction: .5, rentReceived: 6000 });
    expect(half.propertyTax).toBeCloseTo(168000 * (.5 * .008 * .75 + .5 * .01));
    expect(half.customIncome).toBe(600);
    const empty = annualFiscal(p, { ...annual, occupiedFraction: 0, rentReceived: 0 });
    expect(empty.propertyTax).toBeCloseTo(1680);
    expect(empty.customIncome).toBe(0);
    expect(empty.incomeTax).toBe(0);
  });
  it('segnala le informazioni mancanti su sfitto e registro senza inventare contratti', () => {
    const p = { ...defaultTaxProfile('italy'), regime: 'ordinary' as const };
    const r = calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p });
    expect(r.warnings).toEqual(expect.arrayContaining(['italy_vacancy_unknown', 'italy_registration_estimate', 'italy_vacancy_imu_estimate']));
    expect(calculateInvestment({ ...DEFAULT_PARAMS, periodo_sfitto_perc: 0, taxProfile: p }).warnings).not.toContain('italy_vacancy_unknown');
  });
  it('migra i campi mancanti con incertezza esplicita e aliquota IMU sfitto pari a quella salvata', () => {
    const legacy: Record<string, unknown> = { ...defaultTaxProfile('italy'), imuRatePermille: 7.6 };
    delete legacy.vacantSameMunicipality; delete legacy.renegotiateRent; delete legacy.imuVacantRatePermille;
    expect(parseTaxProfile(legacy)).toMatchObject({ vacantSameMunicipality: 'unknown', renegotiateRent: false, imuVacantRatePermille: 7.6 });
    expect(() => parseTaxProfile({ ...legacy, vacantSameMunicipality: 'maybe' })).toThrow();
  });
});

describe('Germania: EStG e SolzG 2026', () => {
  it('adegua il canone dopo N anni interi, con inflazione o valore dell’immobile', () => {
    const params = { ...DEFAULT_PARAMS, taxProfile: defaultTaxProfile('germany') };
    const yearly = calculateInvestment({ ...params, tipo_adeguamento: 'inflation', adeguamento_affitto_anni: 1 }).affitti_lordi_annuali;
    expect(yearly[0]).toBe(12000);
    expect(yearly[1]).toBeCloseTo(12240, 8);
    expect(yearly[9]).toBeCloseTo(12000 * 1.02 ** 9, 8);
    const value = calculateInvestment({ ...params, tipo_adeguamento: 'property_value', adeguamento_affitto_anni: 4 }).affitti_lordi_annuali;
    expect(value.slice(0, 4)).toEqual(Array(4).fill(12000));
    expect(value[4]).toBeCloseTo(12000 * 1.02 ** 4, 8);
    expect(value[8]).toBeCloseTo(12000 * 1.02 ** 8, 8);
  });
  it('usa nel primo anno i costi inseriti e la manutenzione sul valore a inizio anno', () => {
    const p = { ...defaultTaxProfile('germany'), deductibleOperatingAnnual: 99999 };
    const r = calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p });
    expect(r.costi_gestione_annuali.slice(0, 2)).toEqual([250, 255]);
    expect(r.fiscal!.years[0].operatingDeduction).toBeCloseTo(250 + 250 + 200000 * 0.01, 8);
    expect(r.fiscal!.years[1].operatingDeduction).toBeCloseTo(255 + 255 + 204000 * 0.01, 8);
  });
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
  it('compensa le perdite per default, riporta l’eccedenza e non rimborsa oltre l’imposta di base', () => {
    const p = { ...defaultTaxProfile('germany'), buildingTaxBasis: 1e6, afaRatePercent: 10 };
    expect(p.allowLossOffset).toBe(true);
    const loss = annualFiscal(p, annual);
    expect(loss.taxableRentalIncome).toBe(12000 - 100000);
    expect(loss.incomeTax).toBe(-germanyIncomeTax2026(p.otherTaxableIncome));
    expect(loss).toMatchObject({ lossCarryforward: 48000, assessedIncome: 0 });
    const ignored = annualFiscal({ ...p, allowLossOffset: false }, { ...annual, lossCarryforward: 5000 });
    expect(ignored).toMatchObject({ incomeTax: 0, lossCarryforward: 0 });
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: { ...p, allowLossOffset: false } }).warnings).toContain('german_losses_ignored');
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p }).warnings).not.toContain('german_losses_ignored');
  });
  it('con il debito residuo deduce gli interessi effettivi del piano, in calo ogni anno', () => {
    const p = { ...defaultTaxProfile('germany'), deductibleInterestAnnual: 6000 };
    const params = { ...DEFAULT_PARAMS, rata_mutuo_mensile: 970, anni_restanti_mutuo: 20, debito_residuo_mutuo: 160000 };
    const r = calculateInvestment({ ...params, taxProfile: p });
    const plan = mortgagePlan(160000, 970, 20)!;
    const interest = (y: number) => 970 * 12 - (mortgageBalance(plan, (y - 1) * 12) - mortgageBalance(plan, y * 12));
    r.fiscal!.years.forEach((row, i) => expect(row.interestDeduction).toBeCloseTo(interest(i + 1), 6));
    expect(r.fiscal!.years[0].interestDeduction).toBeGreaterThan(r.fiscal!.years[9].interestDeduction);
    expect(r.warnings).toContain('german_interest_from_plan');
    // Il ROI senza leva toglie anche il beneficio fiscale degli interessi effettivi.
    expect(r.roi_nominale).toBeCloseTo(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: p }).roi_nominale, 8);
    const manual = calculateInvestment({ ...params, debito_residuo_mutuo: 0, taxProfile: p });
    expect(manual.fiscal!.years.map(row => row.interestDeduction)).toEqual(Array(10).fill(6000));
    expect(manual.warnings).not.toContain('german_interest_from_plan');
  });
  it('aggiunge alla base AfA la quota fabbricato dei costi accessori e deduce la Grundsteuer a parte', () => {
    const p = { ...defaultTaxProfile('germany'), buildingTaxBasis: 150000, afaRatePercent: 2, grundsteuerAnnual: 400 };
    const r = calculateInvestment({ ...DEFAULT_PARAMS, commissione_iniziale: 3000, taxProfile: p });
    expect(r.fiscal!.years[0].depreciation).toBeCloseTo((150000 + (7000 + 3000) * 0.75) * 0.02, 8);
    expect(r.fiscal!.years[0].operatingDeduction).toBe(400);
    const legacy = calculateInvestment({ ...DEFAULT_PARAMS, commissione_iniziale: 3000,
      taxProfile: { ...p, afaIncludesAcquisitionCosts: false, autoDeductGrundsteuer: false } });
    expect(legacy.fiscal!.years[0].depreciation).toBe(3000);
    expect(legacy.fiscal!.years[0].operatingDeduction).toBe(0);
    // Con Grundsteuer automatica la deduzione operativa resta limitata ai costi monetari, senza contarla due volte.
    const capped = annualFiscal({ ...p, deductibleOperatingAnnual: 99999 }, annual);
    expect(capped.operatingDeduction).toBe(2000 + 400);
    const saved: Record<string, unknown> = { ...defaultTaxProfile('germany') };
    delete saved.autoDeductGrundsteuer; delete saved.afaIncludesAcquisitionCosts;
    expect(parseTaxProfile(saved)).toMatchObject({ autoDeductGrundsteuer: false, afaIncludesAcquisitionCosts: false });
    expect(() => parseTaxProfile({ ...saved, autoDeductGrundsteuer: 'yes' })).toThrow();
  });
  it('usa le perdite riportate negli anni successivi fino a esaurimento', () => {
    const p = defaultTaxProfile('germany');
    const used = annualFiscal(p, { ...annual, lossCarryforward: 5000 });
    expect(used).toMatchObject({ assessedIncome: 47000, lossCarryforward: 0 });
    expect(used.incomeTax).toBe(germanyIncomeTax2026(47000) - germanyIncomeTax2026(40000));
    const partly = annualFiscal(p, { ...annual, lossCarryforward: 60000 });
    expect(partly).toMatchObject({ assessedIncome: 0, lossCarryforward: 8000 });
    // Un anno in forte perdita seguito da anni in utile: il riporto si consuma nel tempo.
    const r = calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 12, taxProfile: { ...p, otherTaxableIncome: 0,
      buildingTaxBasis: 30000, afaRatePercent: 100 } });
    expect(r.fiscal!.years[0].lossCarryforward).toBeGreaterThan(0);
    expect(r.fiscal!.years.at(-1)!.lossCarryforward).toBe(0);
    expect(r.fiscal!.years.every((row, i) => i === 0 || row.lossCarryforward <= r.fiscal!.years[i - 1].lossCarryforward)).toBe(true);
  });
  it('stima la tassazione della vendita entro 10 anni, riducendo il costo dell’ammortamento dedotto', () => {
    const p = { ...defaultTaxProfile('germany'), buildingTaxBasis: 150000, afaRatePercent: 2 };
    const r = calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 9, taxProfile: p });
    const afa = 9 * (150000 + 7000 * 0.75) * 0.02, gain = 200000 * 1.02 ** 9 - (200000 + 7000 - afa);
    const last = r.fiscal!.years.at(-1)!;
    expect(r.fiscal!.capitalGainTaxEstimate).toBeCloseTo(germanyPrivateSaleTax2026(p, gain, last.assessedIncome), 8);
    expect(r.fiscal!.capitalGainTaxEstimate!).toBeGreaterThan(germanyIncomeTax2026(last.assessedIncome + gain) - germanyIncomeTax2026(last.assessedIncome) - 1);
    expect(r.warnings).toContain('germany_private_sale');
    expect(r.fiscal!.exitTax).toBe(0);
    expect(calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 10, taxProfile: p }).fiscal!.capitalGainTaxEstimate!).toBeGreaterThan(0);
    expect(calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 11, taxProfile: p }).fiscal!.capitalGainTaxEstimate).toBeNull();
    expect(calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 9, taxProfile: { ...p, exitTaxAmount: 25000 } }).warnings).not.toContain('germany_private_sale');
    expect(germanyPrivateSaleTax2026(p, 999, 40000)).toBe(0);
    expect(germanyPrivateSaleTax2026(p, 1000, 40000)).toBeGreaterThan(0);
    expect(germanyPrivateSaleTax2026(p, 5000, 40000, 5000)).toBe(0);
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
  it('con sola ristrutturazione non applica imposte di acquisto a un immobile già posseduto', () => {
    const params = { ...DEFAULT_PARAMS, costo_ristrutturazione: 30000 };
    const germany = calculateInvestment({ ...params, taxProfile: defaultTaxProfile('germany') });
    expect(germany.fiscal!.purchaseTax).toBe(0);
    expect(germany.investimento_iniziale).toBe(30000);
    expect(germany.warnings).toContain('renovation_only_no_purchase_tax');
    const italy = calculateInvestment({ ...params, taxProfile: { ...defaultTaxProfile('italy'), manualPurchaseTax: 5000 } });
    expect(italy.fiscal!.purchaseTax).toBe(0);
    expect(calculateInvestment({ ...params, taxProfile: defaultTaxProfile('italy') }).warnings).not.toContain('italy_purchase_tax_zero');
    expect(calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: defaultTaxProfile('germany') }).fiscal!.purchaseTax).toBe(7000);
    expect(calculateInvestment(params).warnings).toContain('renovation_only');
  });
  it('allinea l’indicizzazione dei costi principali e delle voci personalizzate nelle sezioni nazionali', () => {
    const flow = { id: 'c', label: 'Costo', kind: 'expense' as const, annualAmount: 250, inflationLinked: true, deductible: false };
    for (const country of ['italy', 'germany'] as const) {
      const r = calculateInvestment({ ...DEFAULT_PARAMS, taxProfile: { ...defaultTaxProfile(country), customFlows: [flow] } });
      r.fiscal!.years.forEach((row, i) => expect(row.customExpenses).toBeCloseTo(r.costi_gestione_annuali[i], 8));
    }
    // La sezione Generale conserva il calcolo originale, già indicizzato nel primo anno.
    expect(calculateInvestment(DEFAULT_PARAMS).costi_gestione_annuali[0]).toBeCloseTo(255, 8);
  });
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
