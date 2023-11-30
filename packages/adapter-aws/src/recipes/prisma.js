// @ts-check
import fs from 'node:fs'
import path from 'node:path'

/**
 *
 * @type {import('./prisma').default}
 */
export default function uploadPrisma(options) {
  return (directory) => {
    const engineFileName = path.basename(options.engine)
    const schemaFileName = 'schema.prisma'

    fs.copyFileSync(path.join(options.schema), path.join(directory, engineFileName))
    fs.chmodSync(path.join(directory, engineFileName), 0o755)
    fs.copyFileSync(options.schema, path.join(directory, schemaFileName))
  }
}
