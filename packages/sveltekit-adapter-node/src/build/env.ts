export const ENV_PREFIX = import.meta['ENV_PREFIX']

const expected = new Set([
  'SOCKET_PATH',
  'HOST',
  'PORT',
  'ORIGIN',
  'XFF_DEPTH',
  'ADDRESS_HEADER',
  'PROTOCOL_HEADER',
  'HOST_HEADER',
  'BODY_SIZE_LIMIT',
])

if (ENV_PREFIX) {
  for (const name in process.env) {
    if (name.startsWith(ENV_PREFIX)) {
      const unprefixed = name.slice(ENV_PREFIX.length)
      if (!expected.has(unprefixed)) {
        throw new Error(
          `You should change envPrefix (${ENV_PREFIX}) to avoid conflicts with existing environment variables — unexpectedly saw ${name}`,
        )
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function env(name: string, fallback: any): any {
  const prefixed = ENV_PREFIX + name
  return prefixed in process.env ? process.env[prefixed] : fallback
}
