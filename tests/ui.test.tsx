// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseArchive } from '@immobil/storage';
import { App } from '../apps/web/src/App';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), exportFile: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) }));
vi.mock('../apps/web/src/adapters', async () => {
  const { ScenarioRepository } = await import('@immobil/storage');
  return {
    repository: new ScenarioRepository({
      async read(slot: string) { return mocks.files.get(slot) ?? null; },
      async write(slot: string, text: string) { mocks.files.set(slot, text); },
    }),
    exportFile: mocks.exportFile,
    pickAndroidFile: vi.fn(),
  };
});
beforeEach(() => { mocks.files.clear(); mocks.exportFile.mockClear(); });
afterEach(() => cleanup());

describe('Flussi UI', () => {
  it('mantiene bozze e scenari italiani e tedeschi separati, anche dopo riapertura ed export', async () => {
    const user = userEvent.setup(); const view = render(<App />);
    await screen.findByRole('button', { name: 'Italia' });
    await user.click(screen.getByRole('button', { name: 'Italia' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /Rendita catastale non rivalutata/ }), { target: { value: '900' } });
    await user.type(screen.getByRole('textbox', { name: 'Nome dello scenario' }), 'Casa Italia');
    await user.click(screen.getByRole('button', { name: 'Salva scenario' }));
    await waitFor(() => expect(parseArchive(mocks.files.get('archive')!).scenarios[0].inputs.taxProfile?.country).toBe('italy'));
    await user.click(screen.getByRole('button', { name: 'Germania' }));
    expect(screen.queryByRole('button', { name: 'Apri: Casa Italia' })).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton', { name: /Altro reddito imponibile/ }), { target: { value: '60000' } });
    await user.click(screen.getByRole('button', { name: 'Italia' }));
    expect((screen.getByRole('spinbutton', { name: /Rendita catastale non rivalutata/ }) as HTMLInputElement).value).toBe('900');
    await user.click(screen.getByRole('button', { name: 'Germania' }));
    await waitFor(() => expect(parseArchive(mocks.files.get('archive')!).preferences.section).toBe('germany'));
    view.unmount(); render(<App />);
    const income = await screen.findByRole('spinbutton', { name: /Altro reddito imponibile/ });
    expect((income as HTMLInputElement).value).toBe('60000');
    await user.click(screen.getByRole('button', { name: 'Calcola investimento' }));
    expect(screen.getByText(/Il carico fiscale del tuo scenario/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Esporta archivio/ }));
    const archive = parseArchive(mocks.exportFile.mock.calls[0][0]);
    expect(archive.sectionDrafts.italy!.inputs.taxProfile?.country).toBe('italy');
    expect(archive.sectionDrafts.germany!.inputs.taxProfile?.country).toBe('germany');
  });
  it('richiede i requisiti del 10% prima di calcolare e permette voci personalizzate', async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole('button', { name: 'Italia' });
    await user.click(screen.getByRole('button', { name: 'Italia' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Regime sui canoni' }), 'cedolare10');
    await user.click(screen.getByRole('button', { name: 'Calcola investimento' }));
    expect(screen.queryByTestId('total-profit')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /Confermo i requisiti/ }));
    fireEvent.click(screen.getByText('Voci annuali personalizzate (0/30)'));
    await user.click(screen.getByRole('button', { name: 'Aggiungi voce' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Importo annuo (€)' }), { target: { value: '1200' } });
    await user.click(screen.getByRole('button', { name: 'Calcola investimento' }));
    expect(screen.getByTestId('total-profit')).toBeTruthy();
    await waitFor(() => expect(parseArchive(mocks.files.get('archive')!).draft!.inputs.taxProfile!.customFlows[0].annualAmount).toBe(1200));
  });
  it('calcola, segnala risultati obsoleti, salva uno scenario e lo ritrova alla riapertura', async () => {
    const user = userEvent.setup(); const view = render(<App />);
    await screen.findByRole('button', { name: 'Calcola investimento' });
    await user.click(screen.getByRole('button', { name: 'Calcola investimento' }));
    expect(screen.getByTestId('total-profit').textContent).toContain('€');
    const rent = screen.getByRole('spinbutton', { name: /Affitto Lordo Mensile/ });
    fireEvent.change(rent, { target: { value: '1500' } });
    expect(screen.getByText(/Hai modificato i parametri/)).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Nome dello scenario' }), 'Casa Milano');
    await user.click(screen.getByRole('button', { name: 'Salva scenario' }));
    await waitFor(() => expect(parseArchive(mocks.files.get('archive')!).scenarios[0].name).toBe('Casa Milano'));
    expect(parseArchive(mocks.files.get('archive')!).draft?.inputs.affitto_lordo).toBe(18000);
    view.unmount(); render(<App />);
    const restored = await screen.findByRole('spinbutton', { name: /Affitto Lordo Mensile/ });
    expect((restored as HTMLInputElement).value).toBe('1500');
    expect(screen.getByRole('button', { name: 'Apri: Casa Milano' })).toBeTruthy();
  });
  it('cambia lingua, mantiene lo scenario e produce un archivio JSON esportabile', async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole('combobox', { name: 'Lingua' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lingua' }), 'en');
    await user.click(screen.getByRole('button', { name: 'Calculate investment' }));
    expect(screen.getByText('The future of your investment')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Export archive/ }));
    expect(mocks.exportFile).toHaveBeenCalledOnce();
    expect(parseArchive(mocks.exportFile.mock.calls[0][0]).preferences.language).toBe('en');
  });
  it('un campo vuoto impedisce calcoli e non sostituisce la bozza precedente', async () => {
    render(<App />);
    const input = await screen.findByRole('spinbutton', { name: /Valore Immobile/ });
    await waitFor(() => expect(mocks.files.has('archive')).toBe(true));
    const original = parseArchive(mocks.files.get('archive')!).draft!.inputs.valore_immobile;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcola investimento' }));
    expect(screen.queryByTestId('total-profit')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(parseArchive(mocks.files.get('archive')!).draft!.inputs.valore_immobile).toBe(original);
  });
  it('un archivio corrotto sospende le scritture e mostra un errore leggibile', async () => {
    mocks.files.set('archive', '{broken');
    render(<App />);
    await screen.findByText(/Impossibile leggere l’archivio/);
    expect((screen.getByRole('button', { name: 'Salva scenario' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.files.get('archive')).toBe('{broken');
  });
});
