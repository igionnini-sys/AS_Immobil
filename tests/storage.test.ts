import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '@immobil/core';
import { createScenario, emptyArchive, MAX_BYTES, mergeArchive, parseArchive, ScenarioRepository, serializeArchive, type TextDriver } from '@immobil/storage';
import { translations } from '@immobil/i18n';

function memory() {
  const files = new Map<string, string>();
  const driver: TextDriver = {
    async read(slot) { return files.get(slot) ?? null; },
    async write(slot, text) { files.set(slot, text); },
  };
  return { files, driver };
}
describe('Archivio locale versionato', () => {
  it('salva, accoda gli aggiornamenti e recupera la bozza dopo riapertura', async () => {
    const { driver } = memory(); const repo = new ScenarioRepository(driver);
    const archive = emptyArchive(); const scenario = createScenario('Prova', DEFAULT_PARAMS);
    archive.scenarios.push(scenario); archive.preferences.activeScenarioId = scenario.id;
    archive.draft = { inputs: { ...DEFAULT_PARAMS, affitto_lordo: 18000 }, updatedAt: new Date().toISOString() };
    const first = repo.save(emptyArchive()), second = repo.save(archive);
    await Promise.all([first, second]);
    expect((await new ScenarioRepository(driver).load()).archive).toEqual(archive);
  });
  it('recupera il backup valido e non sovrascrive con un archivio vuoto', async () => {
    const { driver, files } = memory(); const repo = new ScenarioRepository(driver);
    const first = emptyArchive(); first.scenarios.push(createScenario('Recuperabile', DEFAULT_PARAMS));
    await repo.save(first); await repo.save({ ...first, preferences: { language: 'en', activeScenarioId: null } });
    files.set('archive', '{broken');
    const loaded = await new ScenarioRepository(driver).load();
    expect(loaded.recovered).toBe(true); expect(loaded.archive.scenarios[0].name).toBe('Recuperabile');
  });
  it('segnala corruzione e problemi di lettura senza considerare vuoti i dati', async () => {
    const { driver, files } = memory(); files.set('archive', 'invalid');
    await expect(new ScenarioRepository(driver).load()).rejects.toThrow('CORRUPT_ARCHIVE');
    await expect(new ScenarioRepository({ ...driver, read: async () => { throw new Error('EACCES'); } }).load()).rejects.toThrow('EACCES');
  });
  it('una scrittura fallita mantiene i dati e consente un nuovo tentativo', async () => {
    const { driver, files } = memory(); let fail = false;
    const unreliable: TextDriver = { ...driver, async write(slot, text) { if (fail && slot === 'archive') throw new Error('ENOSPC'); await driver.write(slot, text); } };
    const repo = new ScenarioRepository(unreliable); await repo.save(emptyArchive());
    fail = true; const next = emptyArchive(); next.preferences.language = 'en';
    await expect(repo.save(next)).rejects.toThrow('ENOSPC');
    expect(parseArchive(files.get('archive')!).preferences.language).toBe('it');
    fail = false; await repo.save(next);
    expect((await new ScenarioRepository(driver).load()).archive.preferences.language).toBe('en');
  });
  it('importa copie senza sovrascrivere ID, preserva input e rifiuta versioni future', () => {
    const a = emptyArchive(); a.scenarios.push(createScenario('Casa', DEFAULT_PARAMS));
    const merged = mergeArchive(a, parseArchive(serializeArchive(a)));
    expect(merged.scenarios).toHaveLength(2);
    expect(merged.scenarios[0].id).not.toBe(merged.scenarios[1].id);
    expect(merged.scenarios[1].inputs).toEqual(DEFAULT_PARAMS);
    expect(() => parseArchive(JSON.stringify({ ...a, schemaVersion: 999 }))).toThrow('UNSUPPORTED_SCHEMA');
  });
  it('rifiuta duplicati, import oversize e parametri esterni non validi', () => {
    const a = emptyArchive(); const s = createScenario('Casa', DEFAULT_PARAMS); a.scenarios = [s, s];
    expect(() => serializeArchive(a)).toThrow('DUPLICATE_ID');
    expect(() => parseArchive(' '.repeat(MAX_BYTES + 1))).toThrow('ARCHIVE_TOO_LARGE');
    a.scenarios = [{ ...s, inputs: { ...DEFAULT_PARAMS, anni_investimento: -1 } }];
    expect(() => serializeArchive(a)).toThrow('INVALID_PARAMS');
  });
  it('restituisce una Promise rifiutata anche per errori di validazione prima della scrittura', async () => {
    const { driver, files } = memory(); const repo = new ScenarioRepository(driver);
    await repo.save(emptyArchive()); const previous = files.get('archive');
    const invalid = emptyArchive(); invalid.draft = { inputs: { ...DEFAULT_PARAMS, affitto_lordo: NaN }, updatedAt: new Date().toISOString() };
    await expect(repo.save(invalid)).rejects.toThrow('INVALID_PARAMS');
    expect(files.get('archive')).toBe(previous);
  });
  it('recupera una bozza esportata come scenario anche se non era stata salvata con nome', () => {
    const source = emptyArchive();
    source.draft = { inputs: DEFAULT_PARAMS, updatedAt: new Date().toISOString() };
    const merged = mergeArchive(emptyArchive(), source, 'Bozza importata');
    expect(merged.scenarios[0].inputs).toEqual(DEFAULT_PARAMS);
    expect(merged.scenarios[0].name).toBe('Bozza importata');
  });
  it('conserva le traduzioni con chiavi identiche e aggiorna la privacy per i dati locali', () => {
    expect(Object.keys(translations.it).sort()).toEqual(Object.keys(translations.en).sort());
    expect(translations.it.privacy).toContain('salvati localmente');
    expect(Object.keys(translations.it).length).toBeGreaterThanOrEqual(193);
  });
});
