/**
 * The native `CodexQuotaService`: real registry reads, real usage calls, and
 * real credential moves.
 *
 * Everything that can refuse does so through `ActionError`, which carries the
 * advice line the CLI used to print. This layer turns those into outcomes the
 * workbench can show; it never decides policy of its own.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import {
  type ActionOutcome,
  type AddAccountInput,
  type CodexQuotaService,
  type EnvironmentSnapshot,
  type QuotaReport,
  type QuotaSource,
  type RegistrySnapshot,
  type TokenUsage,
  type WarningLabel
} from '../../shared/codex-quota'
import {
  addAccount,
  ensureStorage,
  readProfileMode,
  removeAccount,
  requireAccount,
  syncProfileEmail
} from './accounts'
import { activeMatchesAccount } from './active'
import { activateAccount, deleteStoredAuth, importActive } from './activate'
import { readAuthCredentials, type AuthCredentials } from './auth-file'
import { sha256File } from './checksum'
import { resolveCodexBinary, runCodex, startedBilledTurn, type ResolvedBinary } from './codex-cli'
import { isDesktopRunning } from './desktop'
import { ActionError } from './errors'
import { requestJson } from './http'
import { decodeJwtClaims } from './jwt'
import { mayRefresh, refreshAuthFile, refreshIfExpired } from './oauth'
import {
  accountAuthPath,
  accountDir,
  accountProfilePath,
  resolvePaths,
  type CodexQuotaPaths
} from './paths'
import { mapProfileResponse, PROFILE_URL } from './profile'
import { readEnvironmentSnapshot, readRegistrySnapshot } from './registry'
import {
  mapConsumeOutcome,
  mapResetCreditsList,
  resetCreditsConsumeUrl,
  resetCreditsListUrl,
  selectCreditForConsume
} from './reset-credits'
import { mapUsageResponse } from './usage'

interface Subscription {
  plan: string | null
  expiresOn: string | null
  email: string | null
}

function report(
  source: QuotaSource,
  subscription: Subscription,
  warnings: WarningLabel[],
  extra: Partial<QuotaReport> = {}
): QuotaReport {
  return {
    email: subscription.email,
    plan: subscription.plan,
    subscriptionExpiresOn: subscription.expiresOn,
    windows: [],
    availableResetCredits: null,
    tokenUsage: null,
    source,
    warnings,
    fetchedAt: new Date().toISOString(),
    ...extra
  }
}

async function readProfileEmail(path: string): Promise<string | null> {
  try {
    const profile: unknown = JSON.parse(await readFile(path, 'utf8'))
    const email = (profile as Record<string, unknown> | null)?.email
    return typeof email === 'string' && email.length > 0 ? email : null
  } catch {
    return null
  }
}

/**
 * Reads usage through whichever copy of the credential is authoritative: the
 * live file when the profile is byte-identical to it, so a refresh performed
 * here keeps Codex Desktop working, and the stored profile otherwise.
 */
async function resolveAuthPath(paths: CodexQuotaPaths, account: string): Promise<string | null> {
  const profilePath = accountAuthPath(paths, account)
  const profileSha = await sha256File(profilePath)
  if (profileSha === null) return null

  const liveSha = await sha256File(paths.liveAuth)
  return liveSha === profileSha ? paths.liveAuth : profilePath
}

function authorized(
  url: string,
  paths: CodexQuotaPaths,
  credentials: AuthCredentials,
  extra: { method?: 'GET' | 'POST'; json?: unknown } = {}
): ReturnType<typeof requestJson> {
  return requestJson(url, {
    proxyUrl: paths.proxyUrl,
    method: extra.method,
    json: extra.json,
    headers: {
      authorization: `Bearer ${credentials.accessToken}`,
      'chatgpt-account-id': credentials.accountId ?? '',
      'user-agent': 'codex-cli'
    }
  })
}

/**
 * Token history lives behind a different endpoint than the allowance, and it is
 * strictly a bonus: a failure there must never cost the user their quota
 * numbers, so it resolves to null instead of rejecting.
 */
async function fetchTokenUsage(
  paths: CodexQuotaPaths,
  credentials: AuthCredentials
): Promise<TokenUsage | null> {
  const response = await authorized(PROFILE_URL, paths, credentials).catch(() => null)
  return response?.status === 200 ? mapProfileResponse(response.body) : null
}

/** Turns a refusal or a crash into something the workbench can display. */
async function attempt(
  title: string,
  run: () => Promise<Omit<ActionOutcome, 'ok' | 'title'> | void>
): Promise<ActionOutcome> {
  try {
    const extra = (await run()) ?? {}
    return { ok: true, title, ...extra }
  } catch (error) {
    if (error instanceof ActionError) {
      return { ok: false, title: error.message, detail: error.advice ?? undefined }
    }
    return {
      ok: false,
      title: 'That action failed',
      detail: error instanceof Error ? error.message : String(error)
    }
  }
}

function joined(lines: readonly string[]): string | undefined {
  return lines.length === 0 ? undefined : lines.join(' ')
}

export interface ServiceOptions {
  /**
   * Refreshing an expired token rewrites the credential file, which is a write
   * during what is otherwise a read. The CLI does the same on every `status`,
   * and without it an expired profile simply stops reporting quota. Off by
   * default so a caller has to opt in deliberately.
   */
  allowTokenRefresh?: boolean
  /** Path to the `codex` copy shipped with the app, used only when PATH has none. */
  bundledCodexPath?: string | null
}

export function createCodexQuotaService(
  paths: CodexQuotaPaths = resolvePaths(process.env),
  options: ServiceOptions = {}
): CodexQuotaService {
  const allowTokenRefresh = options.allowTokenRefresh ?? false

  async function fetchQuota(account: string): Promise<QuotaReport> {
    const profileEmail = await readProfileEmail(accountProfilePath(paths, account))
    const authPath = await resolveAuthPath(paths, account)
    if (authPath === null) {
      return report('unknown', { plan: null, expiresOn: null, email: profileEmail }, ['quota-stub'])
    }

    if (allowTokenRefresh) await refreshIfExpired(paths, authPath)

    let credentials = await readAuthCredentials(authPath)
    const claims = credentials?.idToken ? decodeJwtClaims(credentials.idToken) : null
    const subscription: Subscription = {
      plan: claims?.plan ?? null,
      expiresOn: claims?.subscriptionExpiresOn ?? null,
      email: claims?.email ?? profileEmail
    }
    const known = subscription.plan !== null || subscription.expiresOn !== null

    if (!credentials?.accessToken || !credentials.accountId) {
      // Nothing to call the API with; a retry would fail the same way.
      return report(known ? 'codex-oauth-partial' : 'unknown', subscription, [
        known ? 'quota-partial' : 'quota-unavailable'
      ])
    }

    // Allowance and history are independent endpoints, so they go out together.
    let [response, tokenUsage] = await Promise.all([
      authorized(paths.usageUrl, paths, credentials).catch(() => null),
      fetchTokenUsage(paths, credentials)
    ])

    if (allowTokenRefresh && response?.status === 401 && (await mayRefresh(paths, authPath))) {
      if (await refreshAuthFile(paths, authPath)) {
        credentials = (await readAuthCredentials(authPath)) ?? credentials
        ;[response, tokenUsage] = await Promise.all([
          authorized(paths.usageUrl, paths, credentials).catch(() => null),
          tokenUsage === null ? fetchTokenUsage(paths, credentials) : Promise.resolve(tokenUsage)
        ])
      }
    }

    if (response?.status === 200) {
      const usage = mapUsageResponse(response.body)
      if (usage.usable) {
        return report(
          'codex-oauth',
          { ...subscription, plan: usage.plan ?? subscription.plan },
          [],
          {
            windows: usage.windows,
            availableResetCredits: usage.availableResetCredits,
            tokenUsage
          }
        )
      }
    }

    if (known) return report('codex-oauth-partial', subscription, ['quota-partial'], { tokenUsage })

    // Nothing to show and the call may well work on a retry, so surface it as a
    // failure the user can act on rather than an empty meter.
    throw new Error(
      response === null
        ? `The usage API could not be reached${paths.proxyUrl ? ` through ${paths.proxyUrl}` : ''}.`
        : `The usage API answered ${response.status}.`
    )
  }

  /** Refuses as an outcome rather than throwing, so the UI can explain it. */
  function findCodex(): Promise<ResolvedBinary | null> {
    return resolveCodexBinary({ bundledPath: options.bundledCodexPath ?? null })
  }

  async function requireCodex(): Promise<ResolvedBinary> {
    const binary = await findCodex()
    if (binary === null) {
      throw new ActionError(
        'The codex command could not be found.',
        'Install the Codex CLI, or set CODEX_QUOTA_CODEX_BIN to the codex you want the app to run.'
      )
    }
    return binary
  }

  /** What the environment looks like right now, both parts of it shelling out. */
  async function observe(): Promise<{ desktopRunning: boolean; codexBinary: string | null }> {
    const [desktopRunning, binary] = await Promise.all([isDesktopRunning(), findCodex()])
    return { desktopRunning, codexBinary: binary?.path ?? null }
  }

  async function loadCredentials(account: string): Promise<{
    name: string
    authPath: string
    credentials: AuthCredentials
  }> {
    const name = await requireAccount(paths, account)
    const authPath = await resolveAuthPath(paths, name)
    if (authPath === null) {
      throw new ActionError(
        `No stored credential for ${name}.`,
        'Sign in to this account, or import the live credential, first.'
      )
    }
    if (allowTokenRefresh) await refreshIfExpired(paths, authPath)
    const credentials = await readAuthCredentials(authPath)
    if (!credentials?.accessToken || !credentials.accountId) {
      throw new ActionError(
        `No usable access token for ${name}.`,
        'Sign in again, then retry the reset.'
      )
    }
    return { name, authPath, credentials }
  }

  async function authorizedWithRefresh(
    url: string,
    authPath: string,
    credentials: AuthCredentials,
    extra: { method?: 'GET' | 'POST'; json?: unknown } = {}
  ): Promise<{ response: Awaited<ReturnType<typeof requestJson>> | null; credentials: AuthCredentials }> {
    let current = credentials
    let response = await authorized(url, paths, current, extra).catch(() => null)
    if (allowTokenRefresh && response?.status === 401 && (await mayRefresh(paths, authPath))) {
      if (await refreshAuthFile(paths, authPath)) {
        current = (await readAuthCredentials(authPath)) ?? current
        response = await authorized(url, paths, current, extra).catch(() => null)
      }
    }
    return { response, credentials: current }
  }

  /** Lists currently available credits, then consumes one server-returned id. */
  async function consumeResetCredit(account: string): Promise<{ detail: string }> {
    const loaded = await loadCredentials(account)
    const listUrl = resetCreditsListUrl(paths.usageUrl)
    const consumeUrl = resetCreditsConsumeUrl(paths.usageUrl)
    if (listUrl === null || consumeUrl === null) {
      throw new ActionError(
        `Could not list reset credits for ${loaded.name}.`,
        'The configured usage URL is not a valid HTTP origin.'
      )
    }

    const listed = await authorizedWithRefresh(listUrl, loaded.authPath, loaded.credentials)
    if (listed.response?.status !== 200) {
      throw new ActionError(
        `Could not list reset credits for ${loaded.name}.`,
        listed.response === null
          ? `The usage API could not be reached${paths.proxyUrl ? ` through ${paths.proxyUrl}` : ''}.`
          : `The usage API answered ${listed.response.status}.`
      )
    }

    const mapped = mapResetCreditsList(listed.response.body)
    const credit = selectCreditForConsume(mapped)
    if (credit === null) {
      throw new ActionError(
        `No consumable reset credit for ${loaded.name}.`,
        mapped.availableCount !== null && mapped.availableCount > 0
          ? 'The usage API reported available resets but did not return a usable credit id.'
          : 'Refresh quota, then try again when a reset is available.'
      )
    }

    const redeemRequestId = crypto.randomUUID()
    const consumed = await authorizedWithRefresh(consumeUrl, loaded.authPath, listed.credentials, {
      method: 'POST',
      json: { credit_id: credit.id, redeem_request_id: redeemRequestId }
    })
    if (consumed.response === null) {
      throw new ActionError(
        `Could not consume a reset credit for ${loaded.name}.`,
        `The usage API could not be reached${paths.proxyUrl ? ` through ${paths.proxyUrl}` : ''}.`
      )
    }

    const outcome = mapConsumeOutcome(consumed.response.body, consumed.response.status)
    if (!outcome.ok) {
      throw new ActionError(
        outcome.code === 'no_credit'
          ? `No reset credit remained for ${loaded.name}.`
          : outcome.code === 'nothing_to_reset'
            ? `Nothing to reset for ${loaded.name}.`
            : `Could not consume a reset credit for ${loaded.name}.`,
        outcome.code === 'no_credit' || outcome.code === 'nothing_to_reset'
          ? 'Refresh quota to see the current reset count.'
          : consumed.response.status === 401
            ? 'Sign in again, then retry the reset.'
            : `The usage API answered ${consumed.response.status}${
                outcome.code ? ` (${outcome.code})` : ''
              }.`
      )
    }

    return {
      detail:
        outcome.code === 'already_redeemed'
          ? 'That reset was already redeemed. Refresh to see the current windows.'
          : 'One available reset was spent. Refresh to see the new windows.'
    }
  }

  /** One minimal billed request, which is what actually starts the window. */
  async function startWindow(account: string): Promise<{ detail: string }> {
    const name = await requireAccount(paths, account)
    if ((await sha256File(accountAuthPath(paths, name))) === null) {
      throw new ActionError(
        `No stored credential for ${name}.`,
        'Sign in to this account, or import the live credential, first.'
      )
    }

    const binary = await requireCodex()
    await ensureStorage(paths)
    const workdir = await mkdtemp(join(paths.home, '.start-window-'))

    try {
      const result = await runCodex(binary.path, {
        codexHome: accountDir(paths, name),
        stdin: 'Reply with exactly: ok',
        timeoutMs: 180_000,
        args: [
          'exec',
          '--ephemeral',
          '--skip-git-repo-check',
          '--ignore-rules',
          '--ignore-user-config',
          '--color',
          'never',
          '--json',
          '-m',
          paths.windowStartModel,
          '-s',
          'read-only',
          '-C',
          workdir,
          '-c',
          `model_reasoning_effort="${paths.windowStartReasoningEffort}"`
        ]
      })

      if (!startedBilledTurn(result.stdout)) {
        throw new ActionError(
          `Codex did not complete a billed turn for ${name}.`,
          result.timedOut
            ? 'The request timed out. Check the network, then try again.'
            : firstLine(result.stderr) ??
              `Make sure the account is signed in, then try again. Model ${paths.windowStartModel}.`
        )
      }

      return {
        detail: `Billed one ${paths.windowStartModel} request through ${binary.path}. Refresh to see the new window.`
      }
    } finally {
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  return {
    async readRegistry(): Promise<RegistrySnapshot> {
      return readRegistrySnapshot(paths, await observe())
    },

    async readEnvironment(): Promise<EnvironmentSnapshot> {
      return readEnvironmentSnapshot(paths, await observe())
    },
    fetchQuota,

    addAccount: (input: AddAccountInput) =>
      attempt(`Added ${input.account}`, async () => {
        await addAccount(paths, { account: input.account, profileMode: input.profileMode })
        return { detail: 'It has no credential yet. Sign in, or import the live one.' }
      }),

    importActive: (account, importOptions) =>
      attempt(`Imported the live credential into ${account}`, async () => {
        await importActive(paths, account, importOptions)
      }),

    activate: (account, activateOptions) =>
      attempt(`Switched Codex Desktop to ${account}`, async () => {
        const result = await activateAccount(paths, account, {
          desktopRunning: await isDesktopRunning(),
          force: activateOptions?.force
        })
        return {
          detail: joined([
            ...result.warnings,
            'Reopen Codex Desktop and confirm the expected account appears.'
          ]),
          backupPath: result.backupPath ?? undefined
        }
      }),

    login: (account) =>
      attempt(`Signed in to ${account}`, async () => {
        const name = await requireAccount(paths, account)
        const binary = await requireCodex()

        const result = await runCodex(binary.path, {
          codexHome: accountDir(paths, name),
          args: ['login'],
          timeoutMs: 600_000
        })

        if (result.code !== 0) {
          throw new ActionError(
            `Sign-in did not complete for ${name}.`,
            firstLine(result.stderr) ?? 'Try again, and finish the flow in the browser window.'
          )
        }

        await syncProfileEmail(paths, name).catch(() => undefined)
        const mode = await readProfileMode(paths, name)
        return {
          detail:
            mode === 'desktop_preserving'
              ? `The credential is stored under ${name} only. Switch to it to hand it to Codex Desktop.`
              : undefined
        }
      }),

    startQuotaWindow: (account) => attempt(`Started the quota window for ${account}`, () => startWindow(account)),

    invokeResetCredits: (account) =>
      attempt(`Invoked a reset for ${account}`, () => consumeResetCredit(account)),

    logout: (account) =>
      attempt(`Signed out of ${account}`, async () => {
        const name = await requireAccount(paths, account)
        const mode = await readProfileMode(paths, name)
        const binary = await requireCodex()
        const wasLive = mode === 'desktop_preserving' && (await activeMatchesAccount(paths, name))

        const result = await runCodex(binary.path, {
          codexHome: accountDir(paths, name),
          args: ['logout'],
          timeoutMs: 60_000
        })

        if (result.code !== 0) {
          throw new ActionError(
            `Sign-out failed for ${name}.`,
            firstLine(result.stderr) ?? 'Try again, or delete the stored credential instead.'
          )
        }

        await rm(accountAuthPath(paths, name), { force: true })
        return {
          detail: wasLive
            ? `The stored credential is gone. ${paths.liveAuth} was left as it is, so Codex Desktop keeps working until you switch accounts.`
            : undefined
        }
      }),

    deleteStoredAuth: (account) =>
      attempt(`Deleted the stored credential for ${account}`, async () => {
        await deleteStoredAuth(paths, account)
        return { detail: 'The live credential was not touched.' }
      }),

    removeAccount: (account) =>
      attempt(`Removed ${account}`, async () => {
        await removeAccount(paths, account)
      })
  }
}

function firstLine(text: string): string | undefined {
  const line = text
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
  return line
}
