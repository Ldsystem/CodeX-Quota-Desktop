const { execFileSync } = require('node:child_process')
const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

/**
 * Ad-hoc sign the packaged bundle.
 *
 * An arm64 app must carry a signature over the whole bundle before
 * LaunchServices will start it; without one, double-clicking does nothing at
 * all while running the binary by hand still works. This is not a Gatekeeper
 * credential and does not replace a Developer ID. electron-builder cannot do it
 * itself, because it looks `identity` up in the keychain and `-` is not there.
 *
 * Signing runs inside out rather than through `--deep`, which intermittently
 * fails on `Electron Framework.framework` with "bundle format is ambiguous":
 * the same commit signed cleanly on one runner and not on the next. A framework
 * is signed at its versioned directory, which is the form codesign cannot
 * misread.
 */
function sign(target) {
  execFileSync('codesign', ['--force', '--sign', '-', target], { stdio: 'inherit' })
}

exports.default = async function adHocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const frameworks = join(app, 'Contents', 'Frameworks')

  if (existsSync(frameworks)) {
    for (const entry of readdirSync(frameworks)) {
      const target = join(frameworks, entry)
      sign(entry.endsWith('.framework') ? join(target, 'Versions', 'A') : target)
    }
  }

  sign(app)

  try {
    execFileSync('codesign', ['--verify', '--strict', app], { stdio: 'inherit' })
  } catch (error) {
    // A rejected bundle is almost always a framework whose symlink layout did
    // not survive being copied, and that is invisible from the error alone.
    for (const entry of readdirSync(frameworks)) {
      if (!entry.endsWith('.framework')) continue
      execFileSync('ls', ['-la', join(frameworks, entry)], { stdio: 'inherit' })
    }
    throw error
  }
}
