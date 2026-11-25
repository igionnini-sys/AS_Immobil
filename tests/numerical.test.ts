import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateInvestment, calculateIrr, DEFAULT_PARAMS, npv, validateParams, type InvestmentParams } from '@immobil/core';

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
  it('gestisce assenza di soluzione e input invalidi', () => {
    expect(calculateIrr([-100, 0]).status).toBe('same_sign');
    expect(calculateIrr([100, 110]).status).toBe('same_sign');
    expect(calculateIrr([-100, NaN]).status).toBe('invalid');
    expect(calculateIrr([-1, 1000]).status).toBe('no_convergence');
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
