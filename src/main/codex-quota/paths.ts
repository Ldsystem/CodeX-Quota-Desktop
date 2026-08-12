/**
 * Every path and tunable the bash CLI derived from `$HOME` and `CQ_*` variables.
 *
 * Resolution is a pure function of an environment and a home directory so tests
 * can point the whole app at a scratch directory.
 */

import { homedir } from 'node:os'
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

const DEFAULT_PROXY = 'http://127.0.0.1:7897'
const DEFAULT_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const DEFAULT_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const DEFAULT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const DEFAULT_WINDOW_START_MODEL = 'gpt-5.4-mini'
const DEFAULT_WINDOW_START_EFFORT = 'low'

/** `CQ_HTTP_PROXY` doubles as an off switch in the CLI. */
function resolveProxy(value: string | undefined): string | null {
  const proxy = value ?? DEFAULT_PROXY
  if (proxy === '' || proxy === '0' || proxy === 'off' || proxy === 'false') return null
  return proxy
}

export function resolvePaths(env: Env = {}, home: string = homedir()): CodexQuotaPaths {
  const root = join(home, '.codex-quota')
  const codexHome = join(home, '.codex')

  return {
    home: root,
    registry: join(root, 'accounts.txt'),
    accountsDir: join(root, 'accounts'),
    backupsDir: join(root, 'backups'),
    activeJson: join(root, 'active.json'),
    codexHome,
    liveAuth: join(codexHome, 'auth.json'),
    usageUrl: env.CQ_QUOTA_USAGE_URL ?? DEFAULT_USAGE_URL,
    tokenUrl: env.CQ_OAUTH_TOKEN_URL ?? DEFAULT_TOKEN_URL,
    oauthClientId: env.CQ_OAUTH_CLIENT_ID ?? DEFAULT_CLIENT_ID,
    proxyUrl: resolveProxy(env.CQ_HTTP_PROXY),
    windowStartModel: env.CQ_START_5H_MODEL ?? DEFAULT_WINDOW_START_MODEL,
    windowStartReasoningEffort: env.CQ_START_5H_REASONING_EFFORT ?? DEFAULT_WINDOW_START_EFFORT
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
