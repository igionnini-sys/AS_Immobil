import { useEffect, useRef, useState, type FormEvent } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { calculateInvestment, DEFAULT_PARAMS, MODEL_VERSION, validateParams, sectionOf, type Section, type FiscalYear, type InvestmentParams, type InvestmentResult, type NumericField } from '@immobil/core';
import { createScenario, emptyArchive, MAX_BYTES, MAX_SCENARIOS, mergeArchive, parseArchive, serializeArchive, withDraft, type Archive } from '@immobil/storage';
import { currency, percentage, plainText, translator } from '@immobil/i18n';
import { exportFile, pickAndroidFile, repository } from './adapters';
import { FiscalControls } from './FiscalControls';
import { freshParams, ParameterField } from './parameters';
import { Wizard } from './Wizard';

const fieldHelp: Partial<Record<NumericField, string>> = { costo_acquisto: 'purchase_cost_help', costo_ristrutturazione: 'renovation_cost_help', tassa_catastale_perc: 'property_tax_help', debito_residuo_mutuo: 'mortgage_debt_help' };
const groups: { label: string; fields: NumericField[] }[] = [
  { label: 'propertyGroup', fields: ['valore_immobile', 'costo_acquisto', 'costo_ristrutturazione', 'affitto_lordo', 'anni_investimento', 'commissione_iniziale', 'commissione_finale'] },
  { label: 'costsGroup', fields: ['costi_assicurazione_euro', 'costi_gestione_euro', 'manutenzione_straordinaria_perc', 'tassazione_affitti_perc', 'tassa_catastale_perc', 'rata_mutuo_mensile', 'anni_restanti_mutuo', 'debito_residuo_mutuo'] },
  { label: 'economyGroup', fields: ['rivalutazione_annua', 'periodo_sfitto_perc', 'inflazione_perc', 'adeguamento_affitto_anni'] },
];

export function App() {
  const [archive, setArchive] = useState<Archive>(emptyArchive);
  const [params, setParams] = useState<InvestmentParams>({ ...DEFAULT_PARAMS });
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false), [loadFailed, setLoadFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''), [notice, setNotice] = useState('');
  const [result, setResult] = useState<{ params: InvestmentParams; values: InvestmentResult } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // La procedura guidata compare all'avvio salvo preferenza contraria; la chiave la riavvia da zero.
  const [mode, setMode] = useState<'wizard' | 'expert'>('expert');
  const [wizardRun, setWizardRun] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = useRef({ archive, params, ready, loadFailed });
  current.current = { archive, params, ready, loadFailed };
  const lang = archive.preferences.language, t = translator(lang);
  const money = (value: number) => currency(value, lang);
  const pct = (value: number | null) => percentage(value, lang);
  const issues = validateParams(params);
  const valid = issues.length === 0;
  const section = sectionOf(params);
  const scenarios = archive.scenarios.filter(s => sectionOf(s.inputs) === section);

  useEffect(() => {
    let cancelled = false;
    void repository.load().then(({ archive: saved, recovered }) => {
      if (cancelled) return;
      setArchive(saved);
      const active = saved.scenarios.find(s => s.id === saved.preferences.activeScenarioId);
      setParams(saved.draft?.inputs ?? saved.sectionDrafts[saved.preferences.section ?? 'generic']?.inputs ?? active?.inputs ?? freshParams(saved.preferences.section ?? 'generic'));
      setName(active?.name ?? '');
      if (recovered) setNotice('recovered');
      if (saved.preferences.startWizard !== false) setMode('wizard');
      setReady(true);
    }).catch(() => { if (!cancelled) { setLoadFailed(true); setReady(true); setNotice('loadError'); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { document.documentElement.lang = lang; document.title = t('page_title'); }, [lang, t]);
  useEffect(() => { if (ready) window.immobilDesktop?.applicationReady(); }, [ready]);

  useEffect(() => {
    if (!ready || loadFailed || !valid) return;
    let cancelled = false;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      const snapshot = withDraft(archive, { ...params });
      void repository.save(snapshot).then(() => { if (!cancelled) setSaveStatus('saved'); })
        .catch(() => { if (!cancelled) setSaveStatus('saveError'); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [archive, params, ready, loadFailed, valid]);

  useEffect(() => {
    const persist = async () => {
      const state = current.current;
      if (!state.ready || state.loadFailed || validateParams(state.params).length) return true;
      try {
        await repository.save(withDraft(state.archive, state.params));
        setSaveStatus('saved');
        return true;
      } catch { setSaveStatus('saveError'); return false; }
    };
    const visibility = () => { if (document.visibilityState === 'hidden') void persist(); };
    document.addEventListener('visibilitychange', visibility);
    const removeBeforeClose = window.immobilDesktop?.onBeforeClose(persist);
    let handle: { remove(): Promise<void> } | undefined, cancelled = false;
    if (Capacitor.isNativePlatform()) {
      void NativeApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) void persist(); }).then(h => {
        if (cancelled) void h.remove(); else handle = h;
      });
    }
    return () => { cancelled = true; document.removeEventListener('visibilitychange', visibility); removeBeforeClose?.(); void handle?.remove(); };
  }, []);

  const calculate = (event?: FormEvent) => {
    event?.preventDefault();
    if (!valid) { setNotice('invalid'); return; }
    try { setResult({ params: { ...params }, values: calculateInvestment(params) }); setNotice(''); }
    catch { setNotice('invalid'); }
  };
  const saveScenario = () => {
    if (!valid || loadFailed) return;
    const active = archive.preferences.activeScenarioId;
    const scenario = archive.scenarios.find(s => s.id === active);
    const next = scenario ? { ...scenario, name: name.trim() || t('defaultName'), inputs: { ...params }, updatedAt: new Date().toISOString(), modelVersion: MODEL_VERSION }
      : createScenario(name.trim() || t('defaultName'), params);
    setArchive(a => ({ ...a, scenarios: scenario ? a.scenarios.map(s => s.id === next.id ? next : s) : [...a.scenarios, next],
      preferences: { ...a.preferences, activeScenarioId: next.id } }));
    setName(next.name);
  };
  const newScenario = () => {
    setParams(freshParams(section)); setResult(null); setName(''); setNotice('');
    setArchive(a => ({ ...a, preferences: { ...a.preferences, activeScenarioId: null } }));
  };
  const switchSection = (next: Section) => {
    const snapshot = valid ? withDraft(archive, params) : archive;
    const draft = snapshot.sectionDrafts[next];
    setArchive({ ...snapshot, draft, preferences: { ...snapshot.preferences, section: next, activeScenarioId: null } });
    setParams(draft?.inputs ?? freshParams(next)); setResult(null); setName(''); setNotice(''); setDeleteId(null);
  };
  const importText = (text: string) => {
    try {
      const imported = parseArchive(text);
      setArchive(mergeArchive(archive, imported, t('importedDraft'))); setNotice('imported');
    } catch { setNotice('importError'); }
  };
  const handleImport = async () => {
    if (Capacitor.isNativePlatform()) {
      try { const text = await pickAndroidFile(); if (text !== null) importText(text); }
      catch { setNotice('importError'); }
    } else fileInput.current?.click();
  };
  const handleExport = async () => {
    try {
      const data = valid ? withDraft(archive, params) : archive;
      await exportFile(serializeArchive(data));
    } catch { setNotice('exportError'); }
  };

  const field = (key: NumericField) => <ParameterField key={key} name={key} params={params} issues={issues} language={lang} help={fieldHelp[key]}
    onChange={value => setParams(p => ({ ...p, [key]: value }))} />;

  const startWizard = () => { setWizardRun(run => run + 1); setMode('wizard'); setNotice(''); setDeleteId(null); };
  /** Applica i dati della procedura come nuovo scenario non ancora salvato; la bozza si aggiorna col salvataggio automatico. */
  const applyWizardInputs = (inputs: InvestmentParams, scenarioName: string | null) => {
    const scenario = scenarioName ? createScenario(scenarioName, inputs) : null;
    setArchive(a => ({ ...a, scenarios: scenario ? [...a.scenarios, scenario] : a.scenarios,
      preferences: { ...a.preferences, activeScenarioId: scenario?.id ?? null } }));
    setParams(inputs); setName(scenario?.name ?? ''); setNotice(''); setDeleteId(null);
  };
  const finishWizard = (inputs: InvestmentParams, scenarioName: string | null) => {
    applyWizardInputs(inputs, scenarioName);
    try { setResult({ params: { ...inputs }, values: calculateInvestment(inputs) }); }
    catch { setResult(null); setNotice('invalid'); }
    setMode('expert');
  };
  const leaveWizard = (wizardSection: Section, inputs: InvestmentParams | null) => {
    if (inputs) { applyWizardInputs(inputs, null); setResult(null); }
    else if (wizardSection !== section) switchSection(wizardSection);
    setMode('expert');
  };

  const r = result?.values, rp = result?.params;
  const stale = result && JSON.stringify(params) !== JSON.stringify(result.params);
  const stat = (label: string, value: string, primary = false) => <div className={`stat ${primary ? 'primary-stat' : ''}`} key={label}><span>{plainText(t(label))}</span><strong>{value}</strong></div>;
  if (!ready) return <div className="loading" role="status">Immobiliare…</div>;
  const noticeBanner = notice && <p className={`notice ${/Error|invalid/.test(notice) ? 'error' : ''}`} role={/Error|invalid/.test(notice) ? 'alert' : 'status'}>{t(notice)}</p>;
  const footer = <footer><p>{t('educational')}</p><p>{t('privacy')}</p><span>Immobiliare · {MODEL_VERSION}</span></footer>;
  return <>
    <header className="topbar"><a className="brand" href="#"><span className="brand-icon" aria-hidden="true">⌂</span>Immobiliare<span className="brand-dot">.</span></a>
      <div className="topbar-right"><span className="local-badge"><i />{t('local')}</span>
        <label className="language">{t('language')}<select aria-label={t('language')} value={lang} onChange={e => setArchive(a => ({ ...a, preferences: { ...a.preferences, language: e.target.value as 'it' | 'en' } }))}><option value="it">Italiano</option><option value="en">English</option></select></label>
      </div>
    </header>
    {mode === 'wizard' ? <main className="wizard-main">{noticeBanner}
      <Wizard key={wizardRun} language={lang} initialSection={section} canSaveScenario={!loadFailed && archive.scenarios.length < MAX_SCENARIOS}
        onFinish={finishWizard} onExpert={leaveWizard} />
      {footer}
    </main> : <main>
      <section className="hero"><div><p className="eyebrow">{t('eyebrow')}</p><h1>{t('headline')}</h1><p className="intro">{t('intro')}</p></div><div className="hero-mark" aria-hidden="true"><span>⌂</span><i /><i /><i /><i /></div></section>
      <div className="mode-bar"><button className="button secondary" type="button" onClick={startWizard}>{t('wizard_start')}</button>
        <label className="tax-check"><input type="checkbox" checked={archive.preferences.startWizard !== false} onChange={e => { const startWizard = e.target.checked; setArchive(a => ({ ...a, preferences: { ...a.preferences, startWizard } })); }} /><span>{t('wizard_on_startup')}</span></label>
      </div>
      <nav className="country-tabs" aria-label={t('sections')}>{(['generic', 'italy', 'germany'] as const).map(key => <button key={key} type="button" aria-current={key === section ? 'page' : undefined} onClick={() => { if (key !== section) switchSection(key); }}>{t(key)}</button>)}</nav>
      {params.taxProfile && <p className="country-scope">{t(section === 'italy' ? 'fiscalScopeItaly' : 'fiscalScopeGermany')}</p>}
      {noticeBanner}
      <div className="workspace">
        <aside>
          <form className="parameter-card" onSubmit={calculate} noValidate>
            <div className="card-heading"><div><p className="eyebrow">01 / INPUT</p><h2>{t('parameters')}</h2></div><button className="icon-button" type="button" onClick={newScenario} title={t('newScenario')} aria-label={t('newScenario')}>＋</button></div>
            {groups.map((group, index) => <details className="field-group" key={group.label} open={index === 0}>
              <summary><span className="group-index">0{index + 1}</span>{t(group.label)}<span className="chevron">⌄</span></summary>
              <div className="fields">{group.fields.filter(key => !params.taxProfile || !['tassazione_affitti_perc', 'tassa_catastale_perc'].includes(key)).map(field)}
                {index === 2 && <label className="field"><span>{t('rent_adjustment_mode')}</span><select name="tipo_adeguamento" value={params.tipo_adeguamento} onChange={e => setParams(p => ({ ...p, tipo_adeguamento: e.target.value as InvestmentParams['tipo_adeguamento'] }))}>
                  <option value="property_value">{t('property_value_adj')}</option><option value="inflation">{t('inflation_adj')}</option><option value="none">{t('no_adjustment')}</option>
                </select></label>}
              </div>
            </details>)}
            {params.taxProfile && <><p className="tax-replacement">{t('inactiveGenericTaxes')}</p><FiscalControls profile={params.taxProfile} language={lang} onChange={taxProfile => setParams(p => ({ ...p, taxProfile }))} /></>}
            <div className="calculate-area"><button className="button main-button" type="submit">{t('calculate')}<span aria-hidden="true">↗</span></button>
              <p className={saveStatus === 'saveError' || !valid ? 'save-state error-text' : 'save-state'} role="status">{!valid ? t('invalid') : t(saveStatus)}</p>
            </div>
          </form>
          <section className="scenario-card"><h2>{t('savedScenarios')}</h2>
            <label className="field"><span>{t('scenarioName')}</span><input type="text" maxLength={120} value={name} placeholder={t('defaultName')} onChange={e => setName(e.target.value)} /></label>
            <button className="button secondary" type="button" onClick={saveScenario} disabled={!valid || loadFailed || archive.scenarios.length >= 1000 && !archive.preferences.activeScenarioId}>{t('save')}</button>
            {scenarios.length === 0 && <p className="muted small">{t('empty')}</p>}
            <ul className="scenario-list">{scenarios.map(s => <li key={s.id} className={s.id === archive.preferences.activeScenarioId ? 'active' : ''}>
              <button className="scenario-open" type="button" aria-label={`${t('load')}: ${s.name}`} onClick={() => {
                setParams({ ...s.inputs }); setName(s.name); setResult({ params: { ...s.inputs }, values: calculateInvestment(s.inputs) });
                setArchive(a => ({ ...withDraft(a, s.inputs), preferences: { ...a.preferences, activeScenarioId: s.id, section: sectionOf(s.inputs) } }));
                setNotice(s.modelVersion !== MODEL_VERSION ? 'olderModel' : '');
              }}><strong>{s.name}</strong><small>{money(s.inputs.valore_immobile)} · {s.inputs.anni_investimento} {t('years')}</small></button>
              <button className="icon-button delete-button" type="button" aria-label={`${t('remove')}: ${s.name}`} onClick={() => setDeleteId(s.id)}>×</button>
              {deleteId === s.id && <div className="delete-confirm"><p>{t('confirmDelete')}</p><button className="button danger" onClick={() => { setArchive(a => ({ ...a, scenarios: a.scenarios.filter(item => item.id !== s.id), preferences: { ...a.preferences, activeScenarioId: a.preferences.activeScenarioId === s.id ? null : a.preferences.activeScenarioId } })); setDeleteId(null); }}>{t('remove')}</button><button className="icon-button" aria-label={t('cancel')} onClick={() => setDeleteId(null)}>×</button></div>}
            </li>)}</ul>
            <div className="archive-actions"><button type="button" onClick={() => void handleExport()}>{t('export')} ↗</button><button type="button" onClick={() => void handleImport()} disabled={loadFailed}>{t('import')} ↙</button></div>
            <p className="small muted">{t('importNote')}</p>
            <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" aria-label={t('import')} onChange={async e => {
              const file = e.target.files?.[0]; e.target.value = '';
              if (!file) return;
              if (file.size > MAX_BYTES) { setNotice('importError'); return; }
              try { importText(await file.text()); } catch { setNotice('importError'); }
            }} />
          </section>
        </aside>
        <section className="results" aria-label={t('results_title')} aria-live="polite">
          {stale && <p className="notice">{t('stale')}</p>}
          {r && rp ? <>
            <div className="result-heading"><div><p className="eyebrow">02 / {rp.anni_investimento} {t('years').toUpperCase()}</p><h2>{t('resultTitle')}</h2><p className="muted">{t('resultIntro')}</p></div><span className="model-badge">{t('model')} {r.modelVersion}</span></div>
            <div className="profit-card"><div><p>{t('profit')} · {t('nominal')}</p><strong data-testid="total-profit">{money(r.rendimento_totale_nominale)}</strong><span>{t('real')}: {money(r.rendimento_totale_reale)}</span></div><div className="profit-detail"><span>{t(r.mutuo ? 'equity' : 'invested')}</span><strong>{money(r.capitale_proprio)}</strong><span>{rp.anni_investimento} {t('years')} · EUR</span></div></div>
            <div className="metrics">{stat('nominalCagr', pct(r.cagr_nominale === null ? null : r.cagr_nominale * 100), true)}{stat('realCagr', pct(r.cagr_reale === null ? null : r.cagr_reale * 100))}{stat('nominalIrr', pct(r.tir_nominale))}{stat('realIrr', pct(r.tir_reale))}</div>
            {r.warnings.map(w => <p className="notice" key={w}>{t(w)}</p>)}
            {r.fiscal && <>
              <section className="result-card fiscal-summary"><h3>{t('fiscalSummary')} · {t(r.fiscal.country)}</h3><div className="stat-grid">
                {stat('purchaseTax', money(r.fiscal.purchaseTax))}{stat('totalIncomeTax', money(r.fiscal.totalIncomeTax))}{stat('totalPropertyTax', money(r.fiscal.totalPropertyTax))}
                {stat('totalLeaseDuties', money(r.fiscal.totalLeaseDuties))}{stat('exitTaxAmount', money(r.fiscal.exitTax))}{stat('totalTaxes', money(r.fiscal.totalTaxes))}
                {r.fiscal.capitalGainTaxEstimate !== null && stat('capitalGainTaxEstimate', money(r.fiscal.capitalGainTaxEstimate))}
              </div></section>
              <details className="result-card annual-table" open><summary>{t('fiscalBreakdown')}</summary><div className="table-scroll" tabIndex={0}><table><thead><tr><th>{t('year')}</th>{(['rentReceived', 'customIncome', 'customExpenses', 'operatingDeduction', 'interestDeduction', 'depreciation', 'taxableRentalIncome', 'vacantTaxableIncome', 'incomeTax', 'lostDeductions', 'surtax', 'solidarity', 'churchTax', 'propertyTax', 'leaseDuties', 'lossCarryforward'] as const).map(key => <th key={key}>{t(key)}</th>)}<th>{t('netCash')}</th></tr></thead><tbody>{r.fiscal.years.map((row, index) => <tr key={row.year}><td>{row.year}</td>{(['rentReceived', 'customIncome', 'customExpenses', 'operatingDeduction', 'interestDeduction', 'depreciation', 'taxableRentalIncome', 'vacantTaxableIncome', 'incomeTax', 'lostDeductions', 'surtax', 'solidarity', 'churchTax', 'propertyTax', 'leaseDuties', 'lossCarryforward'] as (keyof FiscalYear)[]).map(key => <td key={key}>{money(row[key])}</td>)}<td>{money(r.affitti_netti_annuali[index])}</td></tr>)}</tbody></table></div></details>
            </>}
            {(r.tir_nominale === null || r.tir_reale === null) && !r.warnings.includes('irr_ambiguous') && <p className="notice">{t('irrUnavailable')}</p>}
            <section className="result-card"><h3>{t('propertyGroup')}</h3><div className="stat-grid">{stat('terminal', money(r.valore_finale_nominale))}{stat('real', money(r.valore_finale_reale))}{stat('netRent', money(r.totale_affitti_netti))}{stat('total_net_rents_real', money(r.totale_affitti_netti_reale))}{stat('initialGain', money(r.plusvalore_minusvalore_iniziale))}{stat('finalCapital', money(r.capitale_proprio + r.rendimento_totale_nominale))}</div></section>
            <section className="result-card"><h3>{t('rent_analysis')}</h3><div className="stat-grid">{stat('initialRent', money(rp.affitto_lordo / 12))}{stat('finalRent', money(r.affitto_finale / 12))}{stat('rentGrowth', pct(r.crescita_affitto_totale))}{stat('avgRent', money(r.totale_affitti_netti_reale / (12 * rp.anni_investimento)))}{stat('managementGrowth', pct(r.crescita_costi_gestione))}{stat('mortgageTotal', money(r.totale_costi_mutuo))}</div></section>
            <section className="result-card"><h3>{t('secondary_metrics')}</h3><div className="stat-grid">{stat('nominalRoi', pct(r.roi_nominale))}{stat('realRoi', pct(r.roi_reale))}{stat('nominalRoe', pct(r.roe_nominale))}{stat('realRoe', pct(r.roe_reale))}{stat('annualRoi', pct(r.roi_annualizzato === null ? null : r.roi_annualizzato * 100))}{stat('annualRoe', pct(r.roe_annualizzato === null ? null : r.roe_annualizzato * 100))}</div></section>
            {rp.rata_mutuo_mensile > 0 && rp.affitto_lordo > 0 && <section className="result-card"><h3>{plainText(t('mortgage_analysis'))}</h3><p className="small">{plainText(t('monthly_payment_vs_initial_rent'))}: {pct(rp.rata_mutuo_mensile * 12 / rp.affitto_lordo * 100)}</p>{r.mutuo && <div className="stat-grid">{stat('initial_debt', money(r.mutuo.debito_iniziale))}{stat('implied_rate', pct(r.mutuo.tasso_annuo_implicito))}{stat('final_debt', money(r.mutuo.debito_residuo_finale))}</div>}<p className="notice">{t(rp.rata_mutuo_mensile * 12 / rp.affitto_lordo < 0.5 ? 'sustainable_mortgage_monthly' : rp.rata_mutuo_mensile * 12 / rp.affitto_lordo < 0.7 ? 'challenging_mortgage_monthly' : 'risky_mortgage_monthly')}</p></section>}
            <details className="result-card annual-table"><summary>{t('annualDetails')}</summary><div className="table-scroll" tabIndex={0}><table><thead><tr>{['year', 'property', 'grossRent', 'annualNet', 'management', 'mortgage', 'annualYield'].map(key => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>{r.valori_annuali.map((value, i) => <tr key={i}><td>{i + 1}</td><td>{money(value)}</td><td>{money(r.affitti_lordi_annuali[i])}</td><td>{money(r.affitti_netti_annuali[i])}</td><td>{money(r.costi_gestione_annuali[i])}</td><td>{money(r.costi_mutuo_annuali[i])}</td><td>{pct(r.rendimenti_annuali[i])}</td></tr>)}</tbody></table></div></details>
          </> : <div className="empty-result"><div className="empty-icon" aria-hidden="true">⌂<span>↗</span></div><p className="eyebrow">02 / OUTPUT</p><h2>{t('startTitle')}</h2><p>{t('startBody')}</p><div className="empty-metrics"><span>CAGR</span><span>TIR / IRR</span><span>ROI & ROE</span></div></div>}
          <details className="notes"><summary>{t('notes')}</summary><p>{t('cashflowNote')}</p>{['appreciation_note', 'rent_adjustment_note', 'management_costs_note', 'fixed_mortgage_note', 'property_tax_note', 'tir_note']
            // Con un profilo nazionale l'imposta sulla proprietà non è calcolata sul valore dell'immobile.
            .filter(key => !params.taxProfile || key !== 'property_tax_note').map(key => <p key={key}>{plainText(t(key))}</p>)}</details>
        </section>
      </div>
      {footer}
    </main>}
  </>;
}
