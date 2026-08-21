/**
 * Running the real `codex` binary for the three things only it can do: the
 * device-auth sign-in flow, sign-out, and a minimal billed request that starts
 * the quota window.
 *
 * The user's own install wins. It is the one whose version and config they
 * already trust, and it is on PATH precisely because they put it there. The
 * copy shipped inside the app is only a fallback for machines without one.
 *
 * PATH alone is not enough once the app is launched from Finder: a GUI process
 * inherits `/usr/bin:/bin:/usr/sbin:/sbin` and none of the shell profile that
 * puts `codex` within reach, so the usual install directories are searched too.
 */

import { spawn } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'

export type BinaryOrigin = 'configured' | 'path' | 'known-location' | 'bundled'

export interface ResolvedBinary {
  path: string
  origin: BinaryOrigin
}

export interface ResolveOptions {
  env?: Record<string, string | undefined>
  /** Null when the app ships without a fallback copy. */
  bundledPath?: string | null
  home?: string
  /** Overridable so tests never depend on what this machine has installed. */
  knownDirectories?: readonly string[]
  platform?: NodeJS.Platform | string
}

/** Where the documented installers put `codex`, in the order they are tried. */
const UNIX_KNOWN_DIRECTORIES: readonly string[] = [
  '~/.local/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '~/.bun/bin',
  '~/.volta/bin',
  '~/.npm-global/bin',
  '~/bin'
]

function windowsKnownDirectories(
  env: Record<string, string | undefined>,
  home: string
): readonly string[] {
  const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  const roaming = env.APPDATA ?? join(home, 'AppData', 'Roaming')
  return [
    join(local, 'Programs'),
    join(home, 'scoop', 'shims'),
    join(local, 'Microsoft', 'WinGet', 'Links'),
    join(roaming, 'npm'),
    ...UNIX_KNOWN_DIRECTORIES
  ]
}

function binaryNames(platform: string, env: Record<string, string | undefined>): readonly string[] {
  if (platform !== 'win32') return ['codex']
  const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`))
  const names = ['codex', ...extensions.map((ext) => `codex${ext.toLowerCase()}`)]
  return Array.from(new Set(names))
}

export interface RunOptions {
  /** Per-account `CODEX_HOME`, which is how credentials stay separated. */
  codexHome: string
  args: string[]
  stdin?: string
  timeoutMs?: number
  env?: Record<string, string | undefined>
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

async function executable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveCodexBinary(options: ResolveOptions = {}): Promise<ResolvedBinary | null> {
  const env = options.env ?? process.env
  const home = options.home ?? homedir()
  const platform = options.platform ?? process.platform
  const names = binaryNames(platform, env)

  // An explicit setting beats every guess, which is the escape hatch for an
  // install this list has never heard of.
  const configured = env.CODEX_QUOTA_CODEX_BIN
  if (configured !== undefined && configured.length > 0) {
    return (await executable(configured)) ? { path: configured, origin: 'configured' } : null
  }

  const onPath = (env.PATH ?? '').split(delimiter).filter((entry) => entry.length > 0)
  for (const directory of onPath) {
    for (const name of names) {
      const candidate = join(directory, name)
      if (await executable(candidate)) return { path: candidate, origin: 'path' }
    }
  }

  const known = options.knownDirectories ?? (
    platform === 'win32' ? windowsKnownDirectories(env, home) : UNIX_KNOWN_DIRECTORIES
  )
  for (const directory of known) {
    const expanded = isAbsolute(directory) ? directory : join(home, directory.replace(/^~\//, ''))
    for (const name of names) {
      const candidate = join(expanded, name)
      if (await executable(candidate)) return { path: candidate, origin: 'known-location' }
    }
  }

  const bundled = options.bundledPath
  if (bundled && (await executable(bundled))) return { path: bundled, origin: 'bundled' }

  return null
}

export async function runCodex(binary: string, options: RunOptions): Promise<RunResult> {
  const { codexHome, args, stdin, timeoutMs = 120_000 } = options

  return new Promise<RunResult>((resolve, reject) => {
    const env = options.env ?? process.env
    const child = spawn(binary, args, {
      env: {
        ...env,
        // Codex looks for its own helpers next to itself, which a GUI-inherited
        // PATH would not cover.
        PATH: [dirname(binary), env.PATH ?? '/usr/bin:/bin'].join(delimiter),
        CODEX_HOME: codexHome,
        TERM: process.env.TERM ?? 'xterm-256color'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })

    // Codex hangs when stdin stays open, so the prompt is written and closed.
    child.stdin.end(stdin ?? '')
  })
}

/**
 * The quota window only starts once a turn is actually billed. Codex can exit
 * zero having done nothing, so success is read from the JSONL stream instead of
 * the exit code.
 */
export function startedBilledTurn(jsonl: string): boolean {
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    let event: { type?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } }
    try {
      event = JSON.parse(trimmed)
    } catch {
      continue
    }

    if (event.type !== 'turn.completed') continue
    const input = Number(event.usage?.input_tokens ?? 0)
    const output = Number(event.usage?.output_tokens ?? 0)
    if (input > 0 || output > 0) return true
  }

  return false
}
