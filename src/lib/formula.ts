// Safe formula engine for calculated fields.
// Supports: numbers, field names, + - * /, parentheses and unary minus.
// It tokenizes and parses into an AST — it NEVER uses eval / new Function.

type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" }

export type FormulaNode =
  | { type: "num"; value: number }
  | { type: "ref"; name: string }
  | { type: "neg"; arg: FormulaNode }
  | { type: "bin"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode }

export class FormulaError extends Error {}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const raw = src.slice(i, j)
      const value = Number(raw)
      if (Number.isNaN(value)) throw new FormulaError(`Invalid number "${raw}"`)
      tokens.push({ kind: "num", value })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++
      tokens.push({ kind: "id", value: src.slice(i, j) })
      i = j
      continue
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch })
      i++
      continue
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch })
      i++
      continue
    }
    throw new FormulaError(`Character "${ch}" is not allowed. Use + - * / and field names only.`)
  }
  return tokens
}

/** Recursive-descent parser: expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* */
export function parseFormula(src: string): FormulaNode {
  if (!src.trim()) throw new FormulaError("Formula is empty")
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]

  function factor(): FormulaNode {
    const t = peek()
    if (!t) throw new FormulaError("Formula ends unexpectedly")
    if (t.kind === "op" && t.value === "-") {
      pos++
      return { type: "neg", arg: factor() }
    }
    if (t.kind === "num") {
      pos++
      return { type: "num", value: t.value }
    }
    if (t.kind === "id") {
      pos++
      return { type: "ref", name: t.value }
    }
    if (t.kind === "paren" && t.value === "(") {
      pos++
      const inner = expr()
      const close = peek()
      if (!close || close.kind !== "paren" || close.value !== ")") throw new FormulaError('Missing ")"')
      pos++
      return inner
    }
    throw new FormulaError(`Unexpected "${t.value}"`)
  }

  function term(): FormulaNode {
    let left = factor()
    for (;;) {
      const t = peek()
      if (t && t.kind === "op" && (t.value === "*" || t.value === "/")) {
        pos++
        left = { type: "bin", op: t.value, left, right: factor() }
      } else return left
    }
  }

  function expr(): FormulaNode {
    let left = term()
    for (;;) {
      const t = peek()
      if (t && t.kind === "op" && (t.value === "+" || t.value === "-")) {
        pos++
        left = { type: "bin", op: t.value, left, right: term() }
      } else return left
    }
  }

  const ast = expr()
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${tokens[pos].value}"`)
  return ast
}

export function formulaRefs(node: FormulaNode, acc: Set<string> = new Set()): Set<string> {
  if (node.type === "ref") acc.add(node.name)
  else if (node.type === "neg") formulaRefs(node.arg, acc)
  else if (node.type === "bin") {
    formulaRefs(node.left, acc)
    formulaRefs(node.right, acc)
  }
  return acc
}

export function evalFormula(node: FormulaNode, values: Record<string, unknown>): number {
  switch (node.type) {
    case "num":
      return node.value
    case "ref": {
      const v = Number(values[node.name])
      return Number.isFinite(v) ? v : 0
    }
    case "neg":
      return -evalFormula(node.arg, values)
    case "bin": {
      const a = evalFormula(node.left, values)
      const b = evalFormula(node.right, values)
      if (node.op === "+") return a + b
      if (node.op === "-") return a - b
      if (node.op === "*") return a * b
      return b === 0 ? 0 : a / b
    }
  }
}

/** Validate a formula against the numeric fields that are allowed as inputs. Returns an error message or null. */
export function validateFormula(src: string, allowedFields: string[]): string | null {
  try {
    const ast = parseFormula(src)
    for (const ref of formulaRefs(ast)) {
      if (!allowedFields.includes(ref)) return `Unknown field "${ref}". Allowed: ${allowedFields.join(", ") || "none"}`
    }
    return null
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid formula"
  }
}

/** Compute a formula, returning 0 for anything invalid (UI never crashes on a bad formula). */
export function computeFormula(src: string | undefined, values: Record<string, unknown>): number {
  if (!src) return 0
  try {
    return evalFormula(parseFormula(src), values)
  } catch {
    return 0
  }
}
