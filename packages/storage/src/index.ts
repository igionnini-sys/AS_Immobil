import { MODEL_VERSION, parseParams, sectionOf, type InvestmentParams, type Section } from '@immobil/core';

export type Language = 'it' | 'en';
export interface Scenario {
  id: string; name: string; createdAt: string; updatedAt: string;
  modelVersion: string; inputs: InvestmentParams;
}
export interface Archive {
  schemaVersion: 2;
  /** startWizard assente equivale a true: la procedura guidata compare all'avvio. */
  preferences: { language: Language; activeScenarioId: string | null; section?: Section; startWizard?: boolean };
  draft: { inputs: InvestmentParams; updatedAt: string } | null;
  sectionDrafts: Record<Section, Archive['draft']>;
  scenarios: Scenario[];
}
export interface TextDriver {
  read(slot: 'archive' | 'backup'): Promise<string | null>;
  write(slot: 'archive' | 'backup', contents: string): Promise<void>;
}
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_SCENARIOS = 1000;
export const emptyArchive = (): Archive => ({ schemaVersion: 2, preferences: { language: 'it', activeScenarioId: null, section: 'generic' }, draft: null,
  sectionDrafts: { generic: null, italy: null, germany: null }, scenarios: [] });
export function withDraft(archive: Archive, inputs: InvestmentParams): Archive {
  const section = sectionOf(inputs), draft = { inputs, updatedAt: new Date().toISOString() };
  return { ...archive, draft, sectionDrafts: { ...archive.sectionDrafts, [section]: draft },
    preferences: { ...archive.preferences, section } };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_ARCHIVE');
  return value as Record<string, unknown>;
}
function boundedString(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('INVALID_ARCHIVE');
  return value;
}
function date(value: unknown): string {
  const text = boundedString(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error('INVALID_DATE');
  return text;
}
function identifier(value: unknown): string {
  const text = boundedString(value, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(text)) throw new Error('INVALID_ID');
  return text;
}
export function parseArchive(text: string): Archive {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('ARCHIVE_TOO_LARGE');
  const data = record(JSON.parse(text));
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2) throw new Error('UNSUPPORTED_SCHEMA');
  const prefs = record(data.preferences);
  if (prefs.language !== 'it' && prefs.language !== 'en') throw new Error('INVALID_LANGUAGE');
  if (prefs.startWizard !== undefined && typeof prefs.startWizard !== 'boolean') throw new Error('INVALID_PREFERENCES');
  if (!Array.isArray(data.scenarios) || data.scenarios.length > MAX_SCENARIOS) throw new Error('INVALID_SCENARIOS');
  const ids = new Set<string>();
  const scenarios = data.scenarios.map(item => {
    const s = record(item), id = identifier(s.id);
    if (ids.has(id)) throw new Error('DUPLICATE_ID');
    ids.add(id);
    return { id, name: boundedString(s.name, 120), createdAt: date(s.createdAt), updatedAt: date(s.updatedAt),
      modelVersion: boundedString(s.modelVersion, 40), inputs: parseParams(s.inputs) };
  });
  let draft: Archive['draft'] = null;
  if (data.draft !== null) {
    const d = record(data.draft);
    draft = { inputs: parseParams(d.inputs), updatedAt: date(d.updatedAt) };
  }
  const section = data.schemaVersion === 1 ? 'generic' : (prefs.section ?? (draft ? sectionOf(draft.inputs) : 'generic'));
  if (!['generic', 'italy', 'germany'].includes(section as string)) throw new Error('INVALID_SECTION');
  const sectionDrafts = emptyArchive().sectionDrafts;
  if (data.schemaVersion === 1) {
    if (draft?.inputs.taxProfile || scenarios.some(s => s.inputs.taxProfile)) throw new Error('LEGACY_PROFILE');
    sectionDrafts.generic = draft;
  } else {
    const drafts = record(data.sectionDrafts);
    for (const key of ['generic', 'italy', 'germany'] as const) {
      if (drafts[key] === null) continue;
      const d = record(drafts[key]), inputs = parseParams(d.inputs);
      if (sectionOf(inputs) !== key) throw new Error('SECTION_PROFILE_MISMATCH');
      sectionDrafts[key] = { inputs, updatedAt: date(d.updatedAt) };
    }
    if (draft && sectionOf(draft.inputs) !== section) throw new Error('SECTION_PROFILE_MISMATCH');
  }
  const active = prefs.activeScenarioId === null ? null : identifier(prefs.activeScenarioId);
  if (active !== null && !ids.has(active)) throw new Error('INVALID_ACTIVE_SCENARIO');
  const preferences: Archive['preferences'] = { language: prefs.language, activeScenarioId: active, section: section as Section };
  if (typeof prefs.startWizard === 'boolean') preferences.startWizard = prefs.startWizard;
  return { schemaVersion: 2, preferences, draft, sectionDrafts, scenarios };
}
export function serializeArchive(archive: Archive): string {
  const text = JSON.stringify(archive, null, 2);
  // JSON.stringify trasforma NaN in null: parseParams rifiuta anche quel caso.
  return JSON.stringify(parseArchive(text), null, 2);
}
export function createScenario(name: string, inputs: InvestmentParams): Scenario {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), name: boundedString(name.trim(), 120), inputs: parseParams(inputs),
    createdAt: now, updatedAt: now, modelVersion: MODEL_VERSION };
}

// Importazione additiva: nuovi ID anche in caso di conflitti, nessuna sovrascrittura.
export function mergeArchive(current: Archive, imported: Archive, draftName = 'Imported draft'): Archive {
  const validCurrent = parseArchive(serializeArchive(current));
  const validImport = parseArchive(serializeArchive(imported));
  const imports = [...validImport.scenarios];
  for (const draft of [validImport.draft, ...Object.values(validImport.sectionDrafts)]) {
    if (draft && !imports.some(s => JSON.stringify(s.inputs) === JSON.stringify(draft.inputs))) {
      imports.push(createScenario(draftName, draft.inputs));
    }
  }
  if (validCurrent.scenarios.length + imports.length > MAX_SCENARIOS) throw new Error('TOO_MANY_SCENARIOS');
  return { ...validCurrent, scenarios: [...validCurrent.scenarios,
    ...imports.map(s => ({ ...s, id: crypto.randomUUID() }))] };
}

export class ScenarioRepository {
  private queue: Promise<void> = Promise.resolve();
  private previous: string | null = null;
  constructor(private driver: TextDriver) {}

  async load(): Promise<{ archive: Archive; recovered: boolean }> {
    await this.queue;
    const main = await this.driver.read('archive');
    if (main !== null) {
      try {
        const archive = parseArchive(main); this.previous = serializeArchive(archive);
        return { archive, recovered: false };
      } catch { /* Il backup è verificato indipendentemente. */ }
    }
    const backup = await this.driver.read('backup');
    if (backup !== null) {
      const archive = parseArchive(backup); this.previous = serializeArchive(archive);
      return { archive, recovered: true };
    }
    if (main !== null) throw new Error('CORRUPT_ARCHIVE');
    return { archive: emptyArchive(), recovered: false };
  }

  async save(archive: Archive): Promise<void> {
    // Snapshot prima dell'accodamento: modifiche esterne non cambiano la scrittura.
    const next = serializeArchive(archive);
    const task = this.queue.then(async () => {
      if (this.previous !== null) await this.driver.write('backup', this.previous);
      await this.driver.write('archive', next);
      this.previous = next;
    });
    // Una scrittura fallita viene riportata al chiamante, ma non blocca i tentativi successivi.
    this.queue = task.catch(() => {});
    return task;
  }
  async flush(): Promise<void> { await this.queue; }
}
