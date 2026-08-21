/**
 * Tray-daemon rules that vary by OS, kept out of Electron modules so they
 * can be unit-tested.
 */

export function shouldQuitOnWindowAllClosed(
  platform: string,
  options: { trayPresent: boolean }
): boolean {
  if (platform === 'darwin') return false
  if (platform === 'win32' && options.trayPresent) return false
  return true
}

export function applyTrayStatus(
  platform: string,
  status: { title: string; tooltip: string }
): { templateImage: boolean; title: string; tooltip: string } {
  if (platform === 'darwin') {
    return { templateImage: true, title: status.title, tooltip: status.tooltip }
  }

  const figure = status.title.trim()
  const tooltip =
    figure.length === 0 || status.tooltip.includes(figure)
      ? status.tooltip
      : `${status.tooltip} · ${figure}`

  return { templateImage: false, title: '', tooltip }
}
