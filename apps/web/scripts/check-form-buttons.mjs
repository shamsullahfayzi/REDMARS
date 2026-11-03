// Fails when a <Button> inside a <form> has neither `type` nor `onClick`.
//
// The shared Button wraps Base UI, whose buttons default to type="button". A bare
// <Button> in a form therefore never submits, and nothing reports it.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const problems = []

function* tsxFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* tsxFiles(path)
    else if (entry.name.endsWith('.tsx')) yield path
  }
}

for (const file of tsxFiles(root)) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node, inForm) => {
    const tag = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null
    let nowInForm = inForm
    if (tag) {
      const name = tag.tagName.getText()
      if (name === 'form') nowInForm = true
      if (name === 'Button' && inForm) {
        const attrs = tag.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText())
        if (!attrs.includes('type') && !attrs.includes('onClick') && !attrs.includes('render')) {
          const { line } = sf.getLineAndCharacterOfPosition(tag.getStart())
          problems.push(`${relative(root, file)}:${line + 1}`)
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, nowInForm))
  }
  visit(sf, false)
}

if (problems.length) {
  console.error('<Button> inside <form> without type="submit" (it will not submit):')
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log('form buttons OK')
