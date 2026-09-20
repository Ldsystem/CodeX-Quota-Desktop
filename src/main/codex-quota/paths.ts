/**
 * Every path and tunable the bash CLI derived from `$HOME` and `CQ_*` variables.
 *
 * Resolution is a pure function of an environment and a home directory so tests
 * can point the whole app at a scratch directory.
 */

import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface CodexQuotaPaths {
  /** `~/.codex-quota`: registry, per-account profiles, backups. */
  home: string
  registry: string
  accountsDir: string
  backupsDir: string
  activeJson: string
  /** `~/.codex`: the home Codex itself uses. */
  codexHome: string
  liveAuth: string
  usageUrl: string
  tokenUrl: string
  oauthClientId: string
  /** Null when proxying is switched off. */
  proxyUrl: string | null
  windowStartModel: string
  windowStartReasoningEffort: string
}

type Env = Record<string, string | undefined>

const DEFAULT_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const DEFAULT_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'

/** App-specific proxy first, then the standard HTTPS and HTTP variables. */
function proxyFrom(source: Env): string | undefined {
  return source.CQ_HTTP_PROXY ?? source.HTTPS_PROXY ?? source.HTTP_PROXY
}

/** Explicit empty/off values disable proxying. */
function resolveProxy(processEnv: Env, fileEnv: Env): string | null {
  const proxy = proxyFrom(processEnv) ?? proxyFrom(fileEnv)
  if (proxy === undefined) return null
  if (proxy === '' || proxy === '0' || proxy === 'off' || proxy === 'false') return null
  return proxy
}

/** Read simple dotenv assignments without changing the process environment. */
export async function readCodexQuotaEnvFile(home: string = homedir()): Promise<Env> {
  try {
    return parseEnv(await readFile(join(home, '.codex-quota', '.env'), 'utf8'))
  } catch {
    return {}
  }
}

function parseEnv(body: string): Env {
  const result: Env = {}
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const assignment = line.startsWith('export ') ? line.slice(7).trimStart() : line
    const separator = assignment.indexOf('=')
    if (separator < 1) continue
    const key = assignment.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let value = assignment.slice(separator + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trimEnd()
    }
    result[key] = value
  }
  return result
}

export function resolvePaths(
  env: Env = {},
  home: string = homedir(),
  fileEnv: Env = {}
): CodexQuotaPaths {
  const root = join(home, '.codex-quota')
  const codexHome = join(home, '.codex')
  const configured = (key: string, fallback: string): string => env[key] ?? fileEnv[key] ?? fallback

  return {
    home: root,
    registry: join(root, 'accounts.txt'),
    accountsDir: join(root, 'accounts'),
    backupsDir: join(root, 'backups'),
    activeJson: join(root, 'active.json'),
    codexHome,
    liveAuth: join(codexHome, 'auth.json'),
    usageUrl: configured('CQ_QUOTA_USAGE_URL', DEFAULT_USAGE_URL),
    tokenUrl: configured('CQ_OAUTH_TOKEN_URL', DEFAULT_TOKEN_URL),
    oauthClientId: configured('CQ_OAUTH_CLIENT_ID', DEFAULT_CLIENT_ID),
    proxyUrl: resolveProxy(env, fileEnv),
    windowStartModel: configured('CQ_START_5H_MODEL', ''),
    windowStartReasoningEffort: configured('CQ_START_5H_REASONING_EFFORT', '')
  }
}

export function accountDir(paths: CodexQuotaPaths, account: string): string {
  return join(paths.accountsDir, account)
}

export function accountAuthPath(paths: CodexQuotaPaths, account: string): string {
  return join(accountDir(paths, account), 'auth.json')
}

export function accountProfilePath(paths: CodexQuotaPaths, account: string): string {
  return join(accountDir(paths, account), 'profile.json')
}
