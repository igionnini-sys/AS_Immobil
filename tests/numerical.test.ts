import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateInvestment, calculateIrr, DEFAULT_PARAMS, mortgageBalance, mortgagePlan, npv, parseParams, validateParams, type InvestmentParams } from '@immobil/core';

interface LegacyCase { id: string; params: Record<string, number | string>; status: string; legacyResult?: Record<string, unknown> }
const baseline = JSON.parse(readFileSync(new URL('../docs/migrazione/baseline.json', import.meta.url), 'utf8')) as { cases: LegacyCase[] };
const modes: Record<string, InvestmentParams['tipo_adeguamento']> = { 'Valore Immobile': 'property_value', 'Inflazione': 'inflation', 'Nessun Adeguamento': 'none' };
const params = (data: LegacyCase): InvestmentParams => ({ ...data.params, tipo_adeguamento: modes[data.params.tipo_adeguamento] }) as InvestmentParams;
function close(actual: unknown, expected: unknown, path: string) {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((v, i) => close((actual as unknown[])[i], v, `${path}[${i}]`));
  } else if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(expected) * 1e-9));
  } else if (expected === null) expect(actual, path).toBeNull();
}

describe('Parità con Python, escluse le rettifiche dichiarate del modello 2', () => {
  for (const fixture of baseline.cases) {
    it(fixture.id, () => {
      if (fixture.status === 'raised') { expect(() => calculateInvestment(params(fixture))).toThrow('INVALID_PARAMS'); return; }
      const result = calculateInvestment(params(fixture));
      const omitted = new Set(['roe_note']);
      if (Number(fixture.params.commissione_finale) > 0) {
        ['rendimento_totale_reale', 'cagr_reale', 'roi_reale', 'roe_reale', 'cash_flows_real', 'tir_reale'].forEach(k => omitted.add(k));
      }
      if (Number(fixture.params.rata_mutuo_mensile) > 0 && Number(fixture.params.anni_restanti_mutuo) > 0) omitted.add('roi_reale');
      if (result.irrNominal.status === 'ambiguous') omitted.add('tir_nominale');
      if (result.irrReal.status === 'ambiguous') omitted.add('tir_reale');
      for (const [key, expected] of Object.entries(fixture.legacyResult!)) {
        if (omitted.has(key)) continue;
        expect(key in result, key).toBe(true);
        close(result[key as keyof typeof result], expected, `${fixture.id}.${key}`);
      }
    });
  }
});

describe('TIR con residuo verificato', () => {
  it.each([
    [[-100, 110], 0.1], [[-100, 0, 121], 0.1], [[-100, 1], -0.99], [[-100, 100], 0],
  ])('radice analitica %j', (flows, expected) => {
    const result = calculateIrr(flows as number[]);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo(expected as number, 7);
    expect(Math.abs(npv(result.value!, flows as number[]))).toBeLessThan(1e-6);
  });
  it('rifiuta una radice arbitraria in presenza di più cambi di segno', () => {
    expect(calculateIrr([-100, 230, -132])).toMatchObject({ value: null, status: 'ambiguous' });
  });
  it('con più cambi di segno riporta l’unico TIR positivo se i flussi cumulati cambiano segno una volta', () => {
    const flows = [-100, 50, -10, 80];
    const result = calculateIrr(flows);
    expect(result).toMatchObject({ status: 'ok', positiveOnly: true });
    expect(result.value!).toBeGreaterThan(0);
    expect(Math.abs(npv(result.value!, flows))).toBeLessThan(1e-6);
    expect(calculateIrr([-100, 110]).positiveOnly).toBeUndefined();
    const declining = calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 30, rivalutazione_annua: 6, manutenzione_straordinaria_perc: 3, tipo_adeguamento: 'none' });
    expect(declining.irrNominal).toMatchObject({ status: 'ok', positiveOnly: true });
    expect(declining.tir_nominale).not.toBeNull();
    expect(declining.warnings).toContain('irr_positive_unique');
  });
  it('gestisce assenza di soluzione e input invalidi', () => {
    expect(calculateIrr([-100, 0]).status).toBe('same_sign');
    expect(calculateIrr([100, 110]).status).toBe('same_sign');
    expect(calculateIrr([-100, NaN]).status).toBe('invalid');
    expect(calculateIrr([-1, 1000]).status).toBe('no_convergence');
  });
});

describe('Mutuo con debito residuo', () => {
  // 160.000 EUR al 4% nominale annuo per 20 anni: rata da formula di ammortamento francese.
  const monthly = 0.04 / 12, months = 240;
  const payment = 160000 * monthly / (1 - (1 + monthly) ** -months);
  const leveraged = { ...DEFAULT_PARAMS, rata_mutuo_mensile: payment, anni_restanti_mutuo: 20, debito_residuo_mutuo: 160000 };
  it('ricava il tasso implicito e il debito residuo dal piano di ammortamento', () => {
    const plan = mortgagePlan(160000, payment, 20)!;
    expect(plan.monthlyRate * 12).toBeCloseTo(0.04, 10);
    const expected = 160000 * (1 + monthly) ** 120 - payment * ((1 + monthly) ** 120 - 1) / monthly;
    expect(mortgageBalance(plan, 120)).toBeCloseTo(expected, 6);
    expect(mortgageBalance(plan, 240)).toBe(0);
    expect(mortgageBalance(mortgagePlan(12000, 100, 10)!, 60)).toBeCloseTo(6000, 8);
    expect(mortgagePlan(13000, 100, 10)).toBeNull();
    expect(mortgagePlan(0, 100, 10)).toBeNull();
  });
  it('investe solo il capitale proprio ed estingue il debito residuo alla vendita', () => {
    const r = calculateInvestment(leveraged);
    const residual = mortgageBalance(mortgagePlan(160000, payment, 20)!, 120);
    expect(r.capitale_proprio).toBeCloseTo(40000, 8);
    expect(r.investimento_iniziale).toBe(200000);
    expect(r.cash_flows_nominal[0]).toBeCloseTo(-40000, 8);
    expect(r.cash_flows_nominal[10]).toBeCloseTo(r.affitti_netti_annuali[9] + r.valore_finale_nominale - residual, 6);
    expect(r.mutuo).toMatchObject({ debito_iniziale: 160000 });
    expect(r.mutuo!.tasso_annuo_implicito).toBeCloseTo(4, 8);
    expect(r.mutuo!.debito_residuo_finale).toBeCloseTo(residual, 6);
    expect(r.rendimento_totale_nominale).toBeCloseTo(r.cash_flows_nominal.reduce((s, v) => s + v, 0), 6);
    expect(r.rendimento_totale_reale).toBeCloseTo(r.cash_flows_real.reduce((s, v) => s + v, 0), 6);
    expect(r.roe_nominale).toBeCloseTo(r.rendimento_totale_nominale / 40000 * 100, 8);
    expect(r.tir_nominale).toBeCloseTo(calculateIrr(r.cash_flows_nominal).value! * 100, 8);
    expect(r.tir_nominale!).toBeGreaterThan(calculateInvestment(DEFAULT_PARAMS).tir_nominale!);
    expect(r.warnings).not.toContain('mortgage_debt_missing');
  });
  it('il ROI senza leva coincide con il caso senza mutuo anche con debito residuo', () => {
    const r = calculateInvestment(leveraged), cash = calculateInvestment(DEFAULT_PARAMS);
    expect(r.roi_nominale).toBeCloseTo(cash.roi_nominale, 8);
    expect(r.roi_reale).toBeCloseTo(cash.roi_reale, 8);
    const shortLoan = calculateInvestment({ ...DEFAULT_PARAMS, rata_mutuo_mensile: 1000, anni_restanti_mutuo: 5, debito_residuo_mutuo: 50000 });
    expect(shortLoan.mutuo!.debito_residuo_finale).toBe(0);
    expect(shortLoan.roi_nominale).toBeCloseTo(cash.roi_nominale, 8);
  });
  it('senza debito indicato mantiene il calcolo precedente e lo segnala', () => {
    const legacy = calculateInvestment({ ...DEFAULT_PARAMS, rata_mutuo_mensile: 970, anni_restanti_mutuo: 20 });
    expect(legacy.capitale_proprio).toBe(200000);
    expect(legacy.mutuo).toBeNull();
    expect(legacy.warnings).toContain('mortgage_debt_missing');
    const { debito_residuo_mutuo: _omitted, ...older } = DEFAULT_PARAMS;
    expect(_omitted).toBe(0);
    expect(validateParams(older)).toEqual([]);
    expect(parseParams(older).debito_residuo_mutuo).toBe(0);
  });
  it('rifiuta debiti non rimborsabili o non inferiori al costo iniziale', () => {
    const issue = (p: object) => validateParams({ ...DEFAULT_PARAMS, ...p }).map(i => `${i.field}:${i.code}`);
    expect(issue({ debito_residuo_mutuo: 50000 })).toEqual(['debito_residuo_mutuo:mortgage']);
    expect(issue({ debito_residuo_mutuo: 130000, rata_mutuo_mensile: 1000, anni_restanti_mutuo: 10 })).toEqual(['debito_residuo_mutuo:mortgage']);
    expect(issue({ debito_residuo_mutuo: 200000, rata_mutuo_mensile: 5000, anni_restanti_mutuo: 10 })).toEqual(['debito_residuo_mutuo:mortgage']);
    expect(issue({ debito_residuo_mutuo: -1 })).toEqual(['debito_residuo_mutuo:range']);
    expect(issue({ debito_residuo_mutuo: 120000, rata_mutuo_mensile: 1000, anni_restanti_mutuo: 10 })).toEqual([]);
  });
});

describe('Rettifiche indipendenti e limiti', () => {
  it('deflaziona tutto il flusso terminale e mantiene la relazione fra TIR reale e nominale', () => {
    const p = { ...DEFAULT_PARAMS, commissione_finale: 7000, commissione_iniziale: 3000 };
    const result = calculateInvestment(p);
    result.cash_flows_nominal.forEach((flow, year) => {
      expect(result.cash_flows_real[year]).toBeCloseTo(flow / 1.02 ** year, 6);
    });
    expect(result.irrReal.value).toBeCloseTo((1 + result.irrNominal.value!) / 1.02 - 1, 7);
    expect(result.rendimento_totale_reale).toBeCloseTo(result.cash_flows_real.reduce((s, v) => s + v, 0), 6);
  });
  it('ricostruisce il ROI reale senza mutuo con rate attualizzate', () => {
    const financed = calculateInvestment({ ...DEFAULT_PARAMS, rata_mutuo_mensile: 500, anni_restanti_mutuo: 5 });
    const cash = calculateInvestment(DEFAULT_PARAMS);
    expect(financed.roi_reale).toBeCloseTo(cash.roi_reale, 9);
    expect(financed.costi_mutuo_annuali).toEqual([6000, 6000, 6000, 6000, 6000, 0, 0, 0, 0, 0]);
  });
  it('non serializza tassi complessi quando il capitale finale è negativo', () => {
    const result = calculateInvestment({ ...DEFAULT_PARAMS, commissione_finale: 1000000 });
    expect(result.cagr_nominale).toBeNull(); expect(result.roi_annualizzato).toBeNull();
    expect(result.warnings).toContain('annualization_unavailable');
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });
  it('accetta rate e costi annui coerenti con immobili di valore elevato', () => {
    expect(validateParams({ ...DEFAULT_PARAMS, valore_immobile: 3e6, rata_mutuo_mensile: 15000, anni_restanti_mutuo: 20,
      costi_assicurazione_euro: 20000, costi_gestione_euro: 250000 })).toEqual([]);
    expect(validateParams({ ...DEFAULT_PARAMS, rata_mutuo_mensile: 2e12 }).map(i => i.field)).toEqual(['rata_mutuo_mensile']);
  });
  it('rifiuta valori non finiti, anni frazionari e modalità tradotte', () => {
    expect(validateParams({ ...DEFAULT_PARAMS, anni_investimento: 1.5, affitto_lordo: Infinity, tipo_adeguamento: 'Inflazione' })).toHaveLength(3);
    expect(() => calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 101 })).toThrow();
  });
  it('mantiene finiti i risultati nell’intervallo operativo massimo', () => {
    const result = calculateInvestment({ ...DEFAULT_PARAMS, anni_investimento: 100, valore_immobile: 1e12, rivalutazione_annua: 50, inflazione_perc: 100 });
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
    expect(result.valori_annuali.every(Number.isFinite)).toBe(true);
  });
});
