// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../apps/web/src/ErrorBoundary';

afterEach(() => { cleanup(); delete window.immobilDesktop; vi.restoreAllMocks(); });

it('mostra una schermata di recupero se un componente non riesce a essere renderizzato', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const applicationReady = vi.fn();
  Object.defineProperty(window, 'immobilDesktop', { value: { applicationReady }, configurable: true });
  function Broken(): never { throw new Error('render failed'); }
  render(<ErrorBoundary><Broken /></ErrorBoundary>);
  expect(screen.getByRole('alert').textContent).toContain('Impossibile visualizzare');
  expect(screen.getByRole('button', { name: 'Ricarica' })).toBeTruthy();
  expect(applicationReady).toHaveBeenCalled();
});
