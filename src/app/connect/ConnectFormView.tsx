import { ArrowRight, Globe, LoaderCircle } from "lucide-react";

export type ConnectPhase = { kind: "idle" } | { kind: "connecting" } | { kind: "error"; message: string };
export type ConnectFormViewProps = { domain: string; phase: ConnectPhase; onDomainChange: (value: string) => void; onSubmit: () => void };

export function ConnectFormView({ domain, phase, onDomainChange, onSubmit }: ConnectFormViewProps) {
  const busy = phase.kind === "connecting";
  return <form data-testid="connect-form" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
    <label htmlFor="connect-domain" className="field-label">Publication domain</label>
    <div className="domain-field"><Globe size={19} aria-hidden="true" /><input id="connect-domain" data-testid="connect-domain" value={domain} onChange={e => onDomainChange(e.target.value)} placeholder="your-publication.substack.com" autoComplete="url" spellCheck={false} required disabled={busy} /><button className="primary-button" type="submit" disabled={busy} data-testid="connect-submit">{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}<span>{busy ? "Scanning…" : "Open radar"}</span></button></div>
    {busy && <p role="status" className="form-feedback" data-testid="connecting-note">Scanning recent posts, public discussions, and audience sizes. This can take a minute.</p>}
    {phase.kind === "error" && <p role="alert" className="error-message" data-testid="connect-error">{phase.message}</p>}
  </form>;
}
