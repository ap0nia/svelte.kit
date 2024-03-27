export interface InternalEvent {
  /**
   */
  readonly method: string

  /**
   */
  readonly path: string

  /**
   */
  readonly url: string

  /**
   */
  readonly body: Buffer

  /**
   */
  readonly headers: Record<string, string>

  /**
   */
  readonly remoteAddress: string
}
