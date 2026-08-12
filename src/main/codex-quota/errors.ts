/**
 * A refusal the user can act on, as opposed to a crash.
 *
 * The bash CLI printed every failure as an `Error:` line plus an `Advice:` line
 * telling the user what to do about it. Keeping the pair together means the
 * workbench can show both without the main process formatting UI strings.
 */
export class ActionError extends Error {
  readonly advice: string | null

  constructor(message: string, advice: string | null = null) {
    super(message)
    this.name = 'ActionError'
    this.advice = advice
  }
}
