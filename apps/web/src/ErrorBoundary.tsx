import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Errore interfaccia:', error, info.componentStack);
    window.immobilDesktop?.applicationReady();
  }
  render() {
    if (this.state.failed) return <main className="startup-error" role="alert">
      <h1>Impossibile visualizzare l’applicazione</h1>
      <p>I dati salvati non sono stati cancellati. Prova a ricaricare l’interfaccia.</p>
      <button type="button" className="button main-button" onClick={() => window.location.reload()}>Ricarica</button>
    </main>;
    return this.props.children;
  }
}
