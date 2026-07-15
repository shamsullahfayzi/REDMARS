// Emits the package.json marker files that tell Node how to read each half of
// the dual build.
//
// Both halves are plain .js. Node decides CJS-vs-ESM by walking up to the
// nearest package.json and reading "type" — which, for anything under dist/,
// would be this package's own package.json. It has no "type", so Node would
// read the ESM build as CommonJS and throw on the first `export` statement.
//
// These one-line markers scope that decision per directory. They are generated
// rather than committed because dist/ is gitignored, so a fresh clone has to
// produce them.
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const markers = [
  ['cjs', 'commonjs'],
  ['esm', 'module'],
]

for (const [dir, type] of markers) {
  const target = join(distDir, dir)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'package.json'), JSON.stringify({ type }, null, 2) + '\n')
}
