/**
 * Connect page instructions — presentational, props only. Covers the spec's
 * first-visit state: what the product does, how to copy substack.sid, and
 * exactly what is and is not stored.
 */
export function ConnectInstructions() {
  return (
    <section data-testid="connect-instructions" className="mt-4 text-sm">
      <p>
        Influencer Radar ranks your Substack subscribers by their own public audience size, so
        the influential minority in your list is visible. It reads your subscriber list with
        your session cookie — nothing is written back to Substack.
      </p>
      <h2 className="mt-4 font-medium">Copy your substack.sid cookie</h2>
      <ol className="mt-1 list-inside list-decimal space-y-1 opacity-90">
        <li>
          Sign in to Substack at your publication&apos;s own domain — for example{" "}
          <code>whitetigercapital.substack.com</code> — not the <code>substack.com</code> reader
          site.
        </li>
        <li>
          Open developer tools &rarr; <em>Application</em> (Chrome/Edge) or <em>Storage</em>{" "}
          (Firefox) &rarr; Cookies &rarr; your publication&apos;s domain (e.g.{" "}
          <code>https://whitetigercapital.substack.com</code>).
        </li>
        <li>
          Copy the value of the cookie named <code>substack.sid</code>.
        </li>
      </ol>
      <p className="mt-2 opacity-90">
        These cookies expire. If a connection that used to work starts failing with
        &ldquo;That cookie was rejected&rdquo;, copy a fresh <code>substack.sid</code> and connect
        again — a fresh copy fixes it.
      </p>
      <h2 className="mt-4 font-medium">What we store — and what we don&apos;t</h2>
      <p className="mt-1 opacity-90">
        Stored: your publication&apos;s domain and the <code>substack.sid</code> cookie — the
        cookie is encrypted at rest and used only by the sync path on this server. Subscriber
        emails are encrypted at rest and never shown in the radar. Not stored: your Substack
        password. The cookie is never sent anywhere except Substack itself.
      </p>
    </section>
  );
}
