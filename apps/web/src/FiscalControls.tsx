import { FISCAL_SOURCES, fiscalIssues, type CustomFlow, type TaxProfile } from '@immobil/core';
import { translator, type Language } from '@immobil/i18n';

export function FiscalControls({ profile, language, onChange }: { profile: TaxProfile; language: Language; onChange: (profile: TaxProfile) => void }) {
  const t = translator(language), issues = fiscalIssues(profile);
  const data = profile as unknown as Record<string, unknown>;
  const update = (field: string, value: unknown) => onChange({ ...profile, [field]: value } as TaxProfile);
  const error = (field: string) => issues.some(i => i.field === field);
  const numeric = (field: string, max = 1e12, help?: string) => <label className="field" key={field}>
    <span>{t(field)}</span><input type="number" name={`tax.${field}`} inputMode="decimal" min={0} max={max} step="any"
      value={Number.isFinite(data[field]) ? data[field] as number : ''} aria-invalid={error(field)}
      onChange={e => update(field, e.target.value === '' ? NaN : Number(e.target.value))} />
    {help && <small>{t(help)}</small>}{error(field) && <small className="field-error">{t('fiscalRequired')}</small>}
  </label>;
  const check = (field: string) => <label className="tax-check" key={field}><input name={`tax.${field}`} type="checkbox" checked={data[field] === true}
    onChange={e => update(field, e.target.checked)} /><span>{t(field)}{error(field) && <small className="field-error">{t('fiscalRequired')}</small>}</span></label>;
  const flowUpdate = (id: string, change: Partial<CustomFlow>) => update('customFlows', profile.customFlows.map(f => f.id === id ? { ...f, ...change } : f));
  return <section className="fiscal-controls">
    <h3>{t('fiscalTitle')}</h3><p className="small muted">{t('fiscalAssumptions')}</p>
    {profile.country === 'italy' ? <>
      <label className="field"><span>{t('regime')}</span><select name="tax.regime" value={profile.regime} onChange={e => update('regime', e.target.value)}>
        {['cedolare21', 'cedolare10', 'ordinary', 'custom'].map(key => <option key={key} value={key}>{t(key)}</option>)}
      </select></label>
      {profile.regime === 'cedolare10' && check('reducedRateEligible')}
      {profile.regime === 'custom' && numeric('customTaxPercent', 100)}
      {profile.regime === 'ordinary' && <>{numeric('otherTaxableIncome', 1e12, 'otherIncomeHelp')}{numeric('localSurtaxPercent', 20)}{check('ordinaryConcordatoReduction')}{numeric('annualLeaseDuties')}</>}
      {numeric('cadastralRent')}{numeric('imuRatePermille', 30, 'imuHelp')}{check('imuConcordatoReduction')}
      <label className="field"><span>{t('purchaseTaxMode')}</span><select name="tax.purchaseTaxMode" value={profile.purchaseTaxMode} onChange={e => update('purchaseTaxMode', e.target.value)}>
        <option value="manual">{t('manual')}</option><option value="second_home_private">{t('second_home_private')}</option>
      </select></label>
      {profile.purchaseTaxMode === 'manual' ? numeric('manualPurchaseTax') : <><p className="small muted">{t('priceValueHelp')}</p>{check('priceValueEligible')}</>}
    </> : <>
      {numeric('otherTaxableIncome', 1e12, 'otherIncomeHelp')}{check('jointAssessment')}
      {numeric('deductibleOperatingAnnual', 1e12, 'deductionHelp')}{numeric('deductibleInterestAnnual', 1e12, 'interestHelp')}
      {numeric('buildingTaxBasis', 1e12, 'buildingHelp')}{numeric('alreadyDepreciated')}{numeric('afaRatePercent', 100, 'afaHelp')}
      {numeric('grundsteuerAnnual', 1e12, 'grundsteuerHelp')}{numeric('transferTaxPercent', 10, 'transferHelp')}
      <label className="field"><span>{t('churchTaxPercent')}</span><select name="tax.churchTaxPercent" value={profile.churchTaxPercent} onChange={e => update('churchTaxPercent', Number(e.target.value))}>
        {[0, 8, 9].map(rate => <option key={rate} value={rate}>{rate}%</option>)}
      </select></label>{check('applySoli')}{check('allowLossOffset')}
    </>}
    {numeric('additionalAcquisitionCosts', 1e12, 'acquisitionHelp')}{numeric('exitTaxAmount', 1e12, 'exitHelp')}
    <details className="custom-flows"><summary>{t('customFlows')} ({profile.customFlows.length}/30)</summary>
      <p className="small muted">{t('flowHelp')}</p>
      {profile.customFlows.map(flow => <div className="flow-row" key={flow.id}>
        <label className="field"><span>{t('flowLabel')}</span><input maxLength={80} value={flow.label} onChange={e => flowUpdate(flow.id, { label: e.target.value })} /></label>
        <label className="field"><span>{t('flowKind')}</span><select value={flow.kind} onChange={e => flowUpdate(flow.id, { kind: e.target.value as CustomFlow['kind'] })}><option value="expense">{t('expense')}</option><option value="income">{t('income')}</option></select></label>
        <label className="field"><span>{t('annualAmount')}</span><input type="number" min={0} max={1e12} step="any" value={Number.isFinite(flow.annualAmount) ? flow.annualAmount : ''} onChange={e => flowUpdate(flow.id, { annualAmount: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        <label className="tax-check"><input type="checkbox" checked={flow.inflationLinked} onChange={e => flowUpdate(flow.id, { inflationLinked: e.target.checked })} />{t('inflationLinked')}</label>
        {profile.country === 'germany' && flow.kind === 'expense' && <label className="tax-check"><input type="checkbox" checked={flow.deductible} onChange={e => flowUpdate(flow.id, { deductible: e.target.checked })} />{t('deductible')}</label>}
        <button className="flow-remove" type="button" onClick={() => update('customFlows', profile.customFlows.filter(f => f.id !== flow.id))}>{t('remove')}</button>
      </div>)}
      {error('customFlows') && <p className="field-error">{t('fiscalRequired')}</p>}
      <button type="button" className="button secondary" disabled={profile.customFlows.length >= 30} onClick={() => update('customFlows', [...profile.customFlows,
        { id: crypto.randomUUID(), label: t('flowDefault'), kind: 'expense', annualAmount: 0, inflationLinked: false, deductible: false }])}>{t('addFlow')}</button>
    </details>
    <details className="fiscal-sources"><summary>{t('fiscalSources')}</summary><ul>{FISCAL_SOURCES[profile.country].map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></details>
  </section>;
}
