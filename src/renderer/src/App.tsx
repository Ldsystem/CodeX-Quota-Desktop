export default function App(): React.JSX.Element {
  return (
    <main className="scaffold">
      <h1>Codex Quota</h1>
      <p>Desktop scaffold only. Features are intentionally unimplemented.</p>
      <p className="meta">platform: {window.codexQuotaDesktop?.platform ?? 'unknown'}</p>
    </main>
  )
}
