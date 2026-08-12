const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

/**
 * Ad-hoc sign the packaged bundle.
 *
 * An arm64 app must carry a signature over the whole bundle before
 * LaunchServices will start it; without one, double-clicking does nothing at
 * all while running the binary by hand still works. This is not a Gatekeeper
 * credential and does not replace a Developer ID. electron-builder cannot do it
 * itself, because it looks `identity` up in the keychain and `-` is not there.
 */
exports.default = async function adHocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--strict', app], { stdio: 'inherit' })
}
