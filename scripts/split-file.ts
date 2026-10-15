// ファイル分割の道具（設計の2原則の2）。最上位の宣言を名前で指定して別ファイルへ移し、import を直す。
// 使い方: npx tsx scripts/split-file.ts <元ファイル> <先ファイル> <名前…> [--dry-run] [--reexport]
// --reexport：利用側の import は書き換えず、元ファイルから再輸出する（型を types/ へ出すとき。利用側は type.ts から import する約束のため）
// 限界: default export・`export { X }` 形の別置き・動的 import／import() 型・名前空間 import 経由の参照は扱わない（tsc が落ちるので手で直す）。
//       同名の関数オーバーロードはまとめて移す。移したコードの参照解決は識別子の文字列一致（影に隠れた名前は余分な import になり、organizeImports が消す）。
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import ts from "typescript"

const ROOTS = ["server", "shared", "public/src", "scripts", "data"]

type Edit = { pos: number; end: number; text: string }

const parse = (file: string, text: string): ts.SourceFile => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)

function applyEdits(text: string, edits: Edit[]): string {
    return [...edits].sort((a, b) => b.pos - a.pos || b.end - a.end).reduce((t, e) => t.slice(0, e.pos) + e.text + t.slice(e.end), text)
}

function walk(dir: string): string[] {
    if (!existsSync(dir)) return []
    return readdirSync(dir).flatMap((name) => {
        if (name === "node_modules" || name.startsWith(".")) return []
        const p = join(dir, name)
        return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []
    })
}

const declNames = (s: ts.Statement): string[] => {
    if (ts.isVariableStatement(s)) return s.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : []))
    if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isEnumDeclaration(s)) && s.name)
        return [s.name.text]
    return []
}

const hasModifier = (s: ts.Statement, k: ts.SyntaxKind): boolean => (ts.canHaveModifiers(s) ? ts.getModifiers(s)?.some((m) => m.kind === k) ?? false : false)

// 宣言の直前に空行なしで続くコメント（// 行と JSDoc）の先頭位置。無ければ宣言の先頭
function commentStart(text: string, s: ts.Statement): number {
    const ranges = ts.getLeadingCommentRanges(text, s.getFullStart()) ?? []
    let start = s.getStart()
    for (let i = ranges.length - 1; i >= 0; i--) {
        const r = ranges[i]!
        if ((text.slice(r.end, start).match(/\n/g) ?? []).length > 1) break
        // 1行目はファイルの概念のコメント（WHERE_TO_ADD §0）なので、空行なしで宣言が続いても宣言側に含めない
        if (r.pos === 0) break
        start = r.pos
    }
    return start
}

// 比較用: コメント込みの宣言テキスト。先頭の export だけ除く
export function declText(text: string, s: ts.Statement): string {
    const cs = commentStart(text, s)
    const st = s.getStart()
    return text.slice(cs, st) + text.slice(st, s.end).replace(/^export\s+/, "")
}

function topLevel(file: string, text: string, sf: ts.SourceFile = parse(file, text)): Map<string, ts.Statement[]> {
    const m = new Map<string, ts.Statement[]>()
    for (const s of sf.statements) for (const n of declNames(s)) m.set(n, [...(m.get(n) ?? []), s])
    return m
}

// 移した宣言が先ファイルで1文字も変わっていないかの検査。食い違った名前を返す
export function verifyMoved(origText: string, dstText: string, names: string[]): string[] {
    const o = topLevel("o.ts", origText)
    const d = topLevel("d.ts", dstText)
    const bad: string[] = []
    const join_ = (t: string, ss: ts.Statement[] | undefined) => (ss ?? []).map((s) => declText(t, s)).join("\u0000")
    for (const n of names) if (join_(origText, o.get(n)) !== join_(dstText, d.get(n))) bad.push(n)
    return bad
}

function identsOf(nodes: ts.Node[]): Set<string> {
    const set = new Set<string>()
    const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n)) set.add(n.text)
        ts.forEachChild(n, visit)
    }
    nodes.forEach(visit)
    return set
}

function specFor(from: string, to: string, style: string): string {
    let rel = relative(dirname(from), to.replace(/\.ts$/, "")).split("\\").join("/")
    if (!rel.startsWith(".")) rel = "./" + rel
    return rel + (style.endsWith(".js") ? ".js" : style.endsWith(".ts") ? ".ts" : "")
}

const stripExt = (p: string) => p.replace(/\.(js|ts)$/, "")

// 追加する import 行を差し込む位置（最後の import の直後。無ければ先頭コメント行の直後）
function importInsertPos(text: string, sf: ts.SourceFile): { pos: number; prefix: string } {
    const imps = sf.statements.filter(ts.isImportDeclaration)
    if (imps.length > 0) return { pos: imps[imps.length - 1]!.end, prefix: "\n" }
    if (text.startsWith("//")) {
        const nl = text.indexOf("\n")
        return { pos: nl < 0 ? text.length : nl, prefix: "\n" }
    }
    return { pos: 0, prefix: "" }
}

function main(): number {
    const args = process.argv.slice(2)
    const dry = args.includes("--dry-run")
    const reexport = args.includes("--reexport")
    const [srcArg, dstArg, ...names] = args.filter((a) => a !== "--dry-run" && a !== "--reexport")
    if (!srcArg || !dstArg || names.length === 0) {
        console.error("使い方: npx tsx scripts/split-file.ts <元ファイル> <先ファイル> <名前…> [--dry-run]")
        return 1
    }
    const src = resolve(srcArg)
    const dst = resolve(dstArg)
    const srcText = readFileSync(src, "utf8")
    const sf = parse(src, srcText)
    const table = topLevel(src, srcText, sf)

    const missing = names.filter((n) => !table.has(n))
    if (missing.length > 0) {
        console.error(`元ファイルに最上位の宣言が見つかりません: ${missing.join(", ")}`)
        return 1
    }
    const moved = [...new Set(names.flatMap((n) => table.get(n)!))].sort((a, b) => a.pos - b.pos)
    for (const s of moved) {
        if (hasModifier(s, ts.SyntaxKind.DefaultKeyword)) return (console.error("default export は扱えません"), 1)
        const extra = declNames(s).filter((n) => !names.includes(n))
        if (extra.length > 0) return (console.error(`同じ宣言文に ${extra.join(", ")} も含まれます。まとめて指定してください`), 1)
    }
    const movedNames = new Set(moved.flatMap(declNames))
    const dstExists = existsSync(dst)
    const dstText0 = dstExists ? readFileSync(dst, "utf8") : ""
    const dstTable = dstExists ? topLevel(dst, dstText0) : new Map()
    const clash = [...movedNames].filter((n) => dstTable.has(n))
    if (clash.length > 0) return (console.error(`先ファイルに同名の宣言があります: ${clash.join(", ")}`), 1)

    const pos = (p: number) => sf.getLineAndCharacterOfPosition(p).line + 1
    const ranges = moved.map((s) => ({ s, start: commentStart(srcText, s), end: s.end }))

    // 元ファイルの編集: 移した宣言の削除、残る宣言の export 化、移した名前の import
    const srcEdits: Edit[] = ranges.map(({ start, end }) => {
        let e = srcText[end] === "\n" ? end + 1 : end
        if (start === 0 || srcText.slice(start - 2, start) === "\n\n") while (srcText[e] === "\n") e++
        return { pos: start, end: e, text: "" }
    })
    const identsMoved = identsOf(moved)
    const remaining = sf.statements.filter((s) => !moved.includes(s))
    const exportedNow: string[] = []
    for (const s of remaining) {
        const ns = declNames(s)
        if (ns.some((n) => identsMoved.has(n)) && !hasModifier(s, ts.SyntaxKind.ExportKeyword)) srcEdits.push({ pos: s.getStart(), end: s.getStart(), text: "export " })
        if (ns.some((n) => identsMoved.has(n))) exportedNow.push(...ns.filter((n) => identsMoved.has(n)))
    }
    const stillUsed = [...movedNames].filter((n) => identsOf(remaining.filter((s) => !ts.isImportDeclaration(s))).has(n))

    // 先ファイルの import
    const srcStyle = sf.statements.filter(ts.isImportDeclaration).map((i) => (i.moduleSpecifier as ts.StringLiteral).text).find((t) => t.startsWith(".")) ?? ""
    const dstImports: string[] = []
    const dstHave = dstExists ? identsOf(parse(dst, dstText0).statements.filter(ts.isImportDeclaration)) : new Set<string>()
    for (const imp of sf.statements.filter(ts.isImportDeclaration)) {
        const c = imp.importClause
        if (!c) continue
        const spec = (imp.moduleSpecifier as ts.StringLiteral).text
        const newSpec = spec.startsWith(".") ? specFor(dst, resolve(dirname(src), stripExt(spec)), spec) : spec
        const typeOnly = c.isTypeOnly ? "type " : ""
        const def = c.name && identsMoved.has(c.name.text) && !dstHave.has(c.name.text) ? c.name.text : undefined
        let named = ""
        if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) {
            if (identsMoved.has(c.namedBindings.name.text)) named = `* as ${c.namedBindings.name.text}`
        } else if (c.namedBindings) {
            const els = c.namedBindings.elements.filter((e) => identsMoved.has(e.name.text) && !dstHave.has(e.name.text))
            if (els.length > 0) named = `{ ${els.map((e) => e.getText()).join(", ")} }`
        }
        if (!def && !named) continue
        dstImports.push(`import ${typeOnly}${[def, named].filter(Boolean).join(", ")} from "${newSpec}"`)
    }
    const fromSrc = [...new Set(exportedNow)].filter((n) => !dstHave.has(n))
    if (fromSrc.length > 0) dstImports.push(`import { ${fromSrc.join(", ")} } from "${specFor(dst, src, srcStyle)}"`)

    if (reexport) {
        const ip = importInsertPos(srcText, sf)
        const isType = (s: ts.Statement) => ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)
        const typeNames = moved.filter(isType).flatMap(declNames)
        const valueNames = moved.filter((s) => !isType(s)).flatMap(declNames)
        const lines = [
            ...(typeNames.length > 0 ? [`export type { ${typeNames.join(", ")} } from "${specFor(src, dst, srcStyle)}"`] : []),
            ...(valueNames.length > 0 ? [`export { ${valueNames.join(", ")} } from "${specFor(src, dst, srcStyle)}"`] : []),
        ]
        srcEdits.push({ pos: ip.pos, end: ip.pos, text: ip.prefix + lines.join("\n") })
    }
    if (stillUsed.length > 0) {
        const ip = importInsertPos(srcText, sf)
        srcEdits.push({ pos: ip.pos, end: ip.pos, text: `${ip.prefix}import { ${stillUsed.join(", ")} } from "${specFor(src, dst, srcStyle)}"` })
    }

    // 移すコード（export 付き）
    const blocks = ranges.map(({ s, start, end }) => {
        const st = s.getStart()
        const body = srcText.slice(start, end)
        return hasModifier(s, ts.SyntaxKind.ExportKeyword) ? body : body.slice(0, st - start) + "export " + body.slice(st - start)
    })
    let newDst: string
    if (dstExists) {
        const dsf = parse(dst, dstText0)
        const ip = importInsertPos(dstText0, dsf)
        const withImports = dstImports.length > 0 ? applyEdits(dstText0, [{ pos: ip.pos, end: ip.pos, text: ip.prefix + dstImports.join("\n") }]) : dstText0
        newDst = withImports.replace(/\n*$/, "\n") + "\n" + blocks.join("\n\n") + "\n"
    } else {
        const head = `// 概念: ${basename(dst, ".ts")}（split-file.ts で作成。中身に合わせて書き直す）`
        newDst = head + "\n" + (dstImports.length > 0 ? dstImports.join("\n") + "\n" : "") + "\n" + blocks.join("\n\n") + "\n"
    }

    // 利用側の import を先へ向ける
    const contents = new Map<string, string>([[src, applyEdits(srcText, srcEdits)], [dst, newDst]])
    const consumerFiles: string[] = []
    for (const f of reexport ? [] : ROOTS.flatMap(walk).map((p) => resolve(p))) {
        // 先ファイルが元から移す名前を import していたら、その import は消す（先で宣言されるので）
        if (f === src || (f === dst && !dstExists)) continue
        const text = f === dst ? newDst : readFileSync(f, "utf8")
        if (!text.includes(basename(stripExt(src)))) continue
        const fsf = parse(f, text)
        const edits: Edit[] = []
        for (const st of fsf.statements) {
            const isImp = ts.isImportDeclaration(st)
            const isExp = ts.isExportDeclaration(st) && st.moduleSpecifier !== undefined
            if (!isImp && !isExp) continue
            const specNode = st.moduleSpecifier as ts.StringLiteral
            if (!specNode.text.startsWith(".") || resolve(dirname(f), stripExt(specNode.text)) !== stripExt(src)) continue
            const named = isImp ? (st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) ? st.importClause.namedBindings : undefined) : st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause : undefined
            if (!named) continue
            const els = named.elements as readonly (ts.ImportSpecifier | ts.ExportSpecifier)[]
            const mv = els.filter((e) => movedNames.has((e.propertyName ?? e.name).text))
            if (mv.length === 0) continue
            const keep = els.filter((e) => !mv.includes(e))
            const q = text[specNode.getStart()]!
            const newSpec = specFor(f, dst, specNode.text)
            const kw = isImp ? "import" : "export"
            const typeOnly = (isImp ? st.importClause!.isTypeOnly : (st as ts.ExportDeclaration).isTypeOnly) ? "type " : ""
            const mk = (list: readonly ts.Node[], spec: string, def?: string) => `${kw} ${typeOnly}${def ? def + ", " : ""}{ ${list.map((e) => e.getText()).join(", ")} } from ${q}${spec}${q}`
            const def = isImp ? st.importClause?.name?.text : undefined
            const lines: string[] = []
            if (keep.length > 0 || def) lines.push(def && keep.length === 0 ? `import ${typeOnly}${def} from ${q}${specNode.text}${q}` : mk(keep, specNode.text, def))
            if (f !== dst) lines.push(mk(mv, newSpec))
            edits.push({ pos: st.getStart(), end: st.end, text: lines.join("\n") })
        }
        if (edits.length > 0) {
            contents.set(f, applyEdits(text, edits))
            if (f !== dst) consumerFiles.push(f)
        }
    }

    const rel = (p: string) => relative(process.cwd(), p)
    if (dry) {
        console.log("移す宣言:")
        for (const { s, start, end } of ranges) console.log(`  ${declNames(s).join(", ")}（${rel(src)}:${pos(start)}-${pos(end)}）`)
        console.log(`書き換える import のファイル（${consumerFiles.length}）:`)
        for (const f of consumerFiles) console.log("  " + rel(f))
        if (exportedNow.length > 0) console.log(`元ファイルで export を付ける: ${[...new Set(exportedNow)].join(", ")}`)
        console.log(`WHERE_TO_ADD.md に ${rel(dst)} の節を足すこと`)
        return 0
    }

    // 触る前に全部控える
    const backup = new Map<string, string | null>([...contents.keys()].map((f) => [f, existsSync(f) ? readFileSync(f, "utf8") : null]))
    const restore = () => {
        for (const [f, t] of backup) t === null ? existsSync(f) && unlinkSync(f) : writeFileSync(f, t)
    }
    try {
        mkdirSync(dirname(dst), { recursive: true })
        for (const [f, t] of contents) writeFileSync(f, t)
        organize([...contents.keys()])
        const bad = verifyMoved(srcText, readFileSync(dst, "utf8"), [...movedNames])
        if (bad.length > 0) {
            restore()
            console.error(`移した宣言のテキストが元と一致しません（元に戻しました）: ${bad.join(", ")}`)
            return 1
        }
    } catch (e) {
        restore()
        console.error("途中で失敗したので元に戻しました:", e)
        return 1
    }
    console.log(`移動: ${[...movedNames].join(", ")} → ${rel(dst)}（検査: 全宣言のテキスト一致）`)
    console.log(`触ったファイル: ${[...contents.keys()].map(rel).join(", ")}`)
    const tsc = spawnSync("npx", ["tsc", "--noEmit"], { stdio: "inherit" })
    console.log(`tsc --noEmit の終了コード: ${tsc.status}`)
    const cm = spawnSync("npm", ["run", "codemap"], { stdio: "inherit" })
    console.log(`npm run codemap の終了コード: ${cm.status}`)
    console.log(`WHERE_TO_ADD.md に ${rel(dst)} の節を足すこと`)
    return tsc.status === 0 && cm.status === 0 ? 0 : 1
}

// 触ったファイルだけ未使用 import を消す（並べ替えはしない）
function organize(files: string[]): void {
    const cfg = ts.getParsedCommandLineOfConfigFile("tsconfig.json", {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(String(d.messageText)) } })!
    const host: ts.LanguageServiceHost = {
        getScriptFileNames: () => cfg.fileNames,
        getScriptVersion: () => "1",
        getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)!) : undefined),
        getCurrentDirectory: () => process.cwd(),
        getCompilationSettings: () => cfg.options,
        getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
    }
    const fmt = { ...ts.getDefaultFormatCodeSettings(), insertSpaceAfterCommaDelimiter: true, insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true }
    const ls = ts.createLanguageService(host, ts.createDocumentRegistry())
    for (const f of files) {
        for (const ch of ls.organizeImports({ type: "file", fileName: f, mode: ts.OrganizeImportsMode.RemoveUnused }, fmt, {})) {
            const t = readFileSync(ch.fileName, "utf8")
            writeFileSync(ch.fileName, applyEdits(t, ch.textChanges.map((c) => ({ pos: c.span.start, end: c.span.start + c.span.length, text: c.newText }))))
        }
    }
}

if (require.main === module) process.exit(main())
