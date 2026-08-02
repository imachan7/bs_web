/**
 * 効果実装漏れ検出スクリプト
 *
 * cards.json の各カードについて、テキスト（effect）と構造化データ（effects[]）を
 * 照合し、実装漏れの可能性があるものをレポートする。
 *
 * 検出するパターン:
 *   1. テキストに効果ブロック（Lv…/フラッシュ/メイン）が N 個あるのに
 *      effects[] のエントリ数が N 未満 → 一部ブロック未実装の疑い
 *   2. テキストにキーワード（【神速】等）を「自身が持つ」記法で書いているのに
 *      effects[] に kind:"keyword" が無い
 *   3. card-notes.json で status が unimplemented / partial のカード一覧
 *
 * 使い方:
 *   npx tsx scripts/check-effect-gaps.ts [--json] [--card BS01-016]
 */

import * as fs from "fs"
import * as path from "path"

// ---- 型（cards.json の最小構造だけ） ----
interface CardEffect {
    id: string
    kind: string
    keyword?: string
    [key: string]: unknown
}
interface Card {
    cardId: string
    name: string
    type: string
    effect: string
    effects: CardEffect[]
}
interface CardNote {
    status: string
    note: string
}
interface CardNotes {
    version: number
    notes: Record<string, CardNote>
}

// ---- 引数 ----
const args = process.argv.slice(2)
const jsonOutput = args.includes("--json")
// --check: ベースライン（data/effect-gaps-baseline.json）と突き合わせ、
// 「ベースラインに無い新しいギャップ」または「ベースラインにあるのに検出されなくなったもの」があれば
// 終了コード1で落とす。npm run validate:gaps がこれを使う
const checkMode = args.includes("--check")
// --update-baseline: 現在の検出結果でベースラインを作り直す（実装を進めたあとに実行する）
const updateBaseline = args.includes("--update-baseline")
const cardFilter = args.includes("--card")
    ? args[args.indexOf("--card") + 1]
    : null

// ---- データ読み込み ----
const dataDir = path.resolve(__dirname, "..", "data")
const cards: Card[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "cards.json"), "utf-8")
)
const cardNotes: CardNotes = JSON.parse(
    fs.readFileSync(path.join(dataDir, "card-notes.json"), "utf-8")
)

// ---- 1. テキストブロック数 vs effects[] エントリ数 ----

/**
 * テキストから効果ブロックのヘッダ行を抽出する。
 * 例: "Lv1･Lv2『このスピリットのアタック時』"
 *     "フラッシュ："
 *     "メイン："
 */
function extractBlockHeaders(text: string): string[] {
    const headers: string[] = []
    for (const line of text.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (/^(Lv\d|フラッシュ|メイン)/.test(trimmed)) {
            headers.push(trimmed.slice(0, 80))
        }
    }
    return headers
}

/**
 * テキスト内のキーワード記述を解析し、カード自身が持つキーワードと
 * 他を参照しているだけのキーワードを分離する。
 *
 * 「自身が持つ」判定基準:
 *   - "：フラッシュ【神速】" / "：フラッシュ【覚醒】" → 神速/覚醒
 *   - "【装甲：赤/紫】" のようにコロンで色が続く → 装甲
 *   - "【転召：コスト3以上】" → 転召
 *   - "【粉砕】" / "【呪撃】" / "【光芒】" が Lv行直後にある → 自身が持つ
 *
 * 「参照しているだけ」判定基準:
 *   - "【…】を持つ" / "【…】持ち" → 他のスピリットを参照
 *   - "【…】を与える" / "【…】を付与"
 *   - "種別がLv…以下のスピリット上の【…】" 等
 */

const KEYWORD_MAP: Record<string, string> = {
    "神速": "soku",
    "覚醒": "awaken",
    "装甲": "armor",
    "呪撃": "jugeki",
    "粉砕": "funsai",
    "光芒": "kobo",
    "転召": "tensho",
}

function analyzeKeywords(text: string): {
    selfKeywords: string[] // カード自身が持つキーワード名
    refKeywords: string[] // 参照しているだけのキーワード名
} {
    const selfKws = new Set<string>()
    const refKws = new Set<string>()

    // まず各キーワードの出現箇所を一つずつ判定
    for (const [jpName, engName] of Object.entries(KEYWORD_MAP)) {
        const fullBracket = `【${jpName}` // 【神速 or 【装甲： etc.

        let idx = 0
        while ((idx = text.indexOf(fullBracket, idx)) !== -1) {
            // この出現の前後のコンテキストを取る
            const before = text.slice(Math.max(0, idx - 30), idx)
            const after = text.slice(idx, Math.min(text.length, idx + 50))

            // 「参照」パターン
            const isRef =
                /【.+?】を持つ/.test(after) ||
                /【.+?】持ち/.test(after) ||
                /【.+?】を与え/.test(after) ||
                /【.+?】を付与/.test(after) ||
                /【.+?】の効果/.test(after) ||
                // ネクサス/マジックの効果文で他者のキーワードに言及
                /持つスピリット/.test(after) ||
                /持つ自分の/.test(after) ||
                /持つ相手の/.test(after) ||
                // 「"【キーワード】…"という効果を与える」パターン（effectGrant/keywordGrant）
                /["”「『]【/.test(before.slice(-5) + after.slice(0, 5)) ||
                /"【/.test(before.slice(-3) + after.slice(0, 3)) ||
                /“【/.test(before.slice(-3) + after.slice(0, 3)) ||
                // 「〜に【キーワード】を与える」の直前に「すべてに」「1体に」等
                /に$/.test(before.trim()) ||
                // 「〜によって」パターン（【呪撃】によって破壊された等）
                /^によって/.test(after.slice(jpName.length + 2).trim()) ||
                // 「〜で」パターン（【粉砕】で相手のデッキを破棄するとき等）
                /^で[相自]/.test(after.slice(jpName.length + 2).trim()) ||
                /^の効果は/.test(after.slice(jpName.length + 2).trim())

            // 「自身が持つ」パターン
            const isSelf =
                // フラッシュ【神速】 or フラッシュ【覚醒】
                /フラッシュ【/.test(before + after.slice(0, 10)) ||
                // 【装甲：色】
                (jpName === "装甲" && /【装甲：/.test(after)) ||
                // 【転召：コスト…】
                (jpName === "転召" && /【転召：/.test(after)) ||
                // Lv行の直後に来る【粉砕】【呪撃】【光芒】
                // (effect text format: "Lv1...\n【粉砕】..." or "Lv1...【呪撃】")
                (["粉砕", "呪撃", "光芒"].includes(jpName) &&
                    !/を持つ|持ち|付与|に与え/.test(after))

            if (isRef) {
                refKws.add(engName)
            } else if (isSelf) {
                selfKws.add(engName)
            } else {
                // 曖昧な場合：行のコンテキストで判定
                // Lvヘッダ行に直接含まれている場合は自身が持つ
                const lineStart = text.lastIndexOf("\n", idx)
                const lineEnd = text.indexOf("\n", idx)
                const line = text.slice(
                    lineStart === -1 ? 0 : lineStart,
                    lineEnd === -1 ? text.length : lineEnd
                )
                if (
                    /^Lv/.test(line.trim()) &&
                    !line.includes("を持つ") &&
                    !line.includes("持ち")
                ) {
                    selfKws.add(engName)
                } else {
                    // デフォルトは参照扱い
                    refKws.add(engName)
                }
            }
            idx += fullBracket.length
        }
    }

    return {
        selfKeywords: [...selfKws],
        refKeywords: [...refKws],
    }
}

// ---- 検出実行 ----

interface Gap {
    cardId: string
    name: string
    type: string
    category: "block_count" | "keyword_missing" | "noted"
    detail: string
    textBlocks?: number
    implCount?: number
    noteStatus?: string
    noteText?: string
}

const gaps: Gap[] = []

for (const card of cards) {
    if (cardFilter && card.cardId !== cardFilter) continue

    const text = (card.effect || "").trim()
    if (!text) continue

    // ---- カテゴリ1: テキストブロック数の不足 ----
    const headers = extractBlockHeaders(text)
    const textBlocks = headers.length
    const implCount = card.effects.length

    if (textBlocks > 0 && implCount < textBlocks) {
        // どのブロックが欠けているか推定
        // effects の id からブロック番号を取り出す (例: BS01-016-e1 → e1)
        const implIds = new Set(card.effects.map((e) => e.id))
        const missingHeaders: string[] = []

        // 簡易マッチング: 各ヘッダにe1, e2, ... を対応させて欠けを見つける
        for (let i = 0; i < headers.length; i++) {
            const expectedId = `${card.cardId}-e${i + 1}`
            if (!implIds.has(expectedId)) {
                missingHeaders.push(
                    `e${i + 1}: ${headers[i]}`
                )
            }
        }

        gaps.push({
            cardId: card.cardId,
            name: card.name,
            type: card.type,
            category: "block_count",
            detail:
                `テキスト ${textBlocks} ブロック / 実装 ${implCount} エントリ\n` +
                `  未実装の可能性:\n` +
                missingHeaders.map((h) => `    ${h}`).join("\n"),
            textBlocks,
            implCount,
        })
    }

    // ---- カテゴリ2: キーワード欠落 ----
    const { selfKeywords } = analyzeKeywords(text)
    const implKeywords = new Set(
        card.effects
            .filter((e) => e.kind === "keyword")
            .map((e) => e.keyword)
    )

    for (const kw of selfKeywords) {
        if (!implKeywords.has(kw)) {
            const jpName =
                Object.entries(KEYWORD_MAP).find(
                    ([, v]) => v === kw
                )?.[0] ?? kw
            gaps.push({
                cardId: card.cardId,
                name: card.name,
                type: card.type,
                category: "keyword_missing",
                detail: `テキストにカード自身の【${jpName}】があるが kind:"keyword"(${kw}) が effects に無い`,
            })
        }
    }
}

// ---- カテゴリ3: card-notes.json の未実装/部分実装 ----
for (const [cardId, note] of Object.entries(cardNotes.notes)) {
    if (cardFilter && cardId !== cardFilter) continue
    if (
        note.status === "unimplemented" ||
        note.status === "partial"
    ) {
        const card = cards.find((c) => c.cardId === cardId)
        gaps.push({
            cardId,
            name: card?.name ?? "???",
            type: card?.type ?? "???",
            category: "noted",
            detail: `[${note.status}] ${note.note}`,
            noteStatus: note.status,
            noteText: note.note,
        })
    }
}

// ---- 出力 ----

// 重複排除（同じカードが複数カテゴリに出ることはある）
// カードID順にソート
gaps.sort((a, b) => a.cardId.localeCompare(b.cardId))

// ---- ベースライン照合（--check / --update-baseline） ----
//
// cards.json は tsc の型検査の対象外なので、「効果を書かなかったこと」は型エラーにも smoke 失敗にも
// ならず、全緑をすり抜ける（実際に48枚のマジックと13枚のスピリットが長く見過ごされた）。
// そこで既知のギャップをベースラインに固定し、**増えたら落ちる**ようにする。
interface Baseline {
    _comment: string[]
    known: Record<string, { name: string; textBlocks: number; implCount: number }>
}
const baselinePath = path.join(dataDir, "effect-gaps-baseline.json")

if (updateBaseline) {
    const blocks = gaps.filter((g) => g.category === "block_count")
    const known: Baseline["known"] = {}
    for (const g of blocks.slice().sort((a, b) => a.cardId.localeCompare(b.cardId))) {
        known[g.cardId] = {
            name: g.name,
            textBlocks: g.textBlocks ?? 0,
            implCount: g.implCount ?? 0,
        }
    }
    const prev: Baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"))
    const next: Baseline = { _comment: prev._comment, known }
    fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 4)}\n`)
    console.log(
        `ベースラインを更新しました: ${Object.keys(prev.known).length} 件 → ${Object.keys(known).length} 件`,
    )
    process.exit(0)
}

if (checkMode) {
    const baseline: Baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"))
    const detected = new Map(
        gaps.filter((g) => g.category === "block_count").map((g) => [g.cardId, g]),
    )
    // 新規ギャップ：ベースラインにも card-notes.json にも無いのに検出された
    const added = [...detected.keys()].filter(
        (id) => !(id in baseline.known) && !(id in cardNotes.notes),
    )
    // 解消済み：ベースラインにあるのに検出されなくなった（実装した／誤検出が直った）
    const resolved = Object.keys(baseline.known).filter((id) => !detected.has(id))

    if (added.length === 0 && resolved.length === 0) {
        console.log(
            `効果実装漏れチェック：新しいギャップはありません（既知 ${Object.keys(baseline.known).length} 件）✅`,
        )
        process.exit(0)
    }
    if (added.length > 0) {
        console.error("")
        console.error("❌ 新しい効果実装漏れが検出されました:")
        for (const id of added) {
            const g = detected.get(id)!
            console.error(`   ${id} ${g.name}（テキスト${g.textBlocks}ブロック / 実装${g.implCount}エントリ）`)
        }
        console.error("")
        console.error("   効果を実装するか、意図的に実装しない場合は data/card-notes.json に理由を書いてください。")
        console.error("   （誤検出であれば npx tsx scripts/check-effect-gaps.ts --update-baseline で追認できます）")
    }
    if (resolved.length > 0) {
        console.error("")
        console.error("❌ ベースラインに残ったままのカードがあります（実装済み or 誤検出の解消）:")
        for (const id of resolved) {
            console.error(`   ${id} ${baseline.known[id]?.name ?? ""}`)
        }
        console.error("")
        console.error("   npx tsx scripts/check-effect-gaps.ts --update-baseline を実行してベースラインを縮めてください。")
    }
    console.error("")
    process.exit(1)
}

if (jsonOutput) {
    console.log(JSON.stringify(gaps, null, 2))
} else {
    // ---- サマリー ----
    const blockGaps = gaps.filter((g) => g.category === "block_count")
    const kwGaps = gaps.filter((g) => g.category === "keyword_missing")
    const noteGaps = gaps.filter((g) => g.category === "noted")

    // 重複しないカードID数
    const uniqueCards = new Set(gaps.map((g) => g.cardId))

    console.log("=" .repeat(60))
    console.log("効果実装漏れ検出レポート")
    console.log("=".repeat(60))
    console.log()
    console.log(`検査対象: ${cardFilter ?? "全カード"} (${cards.length} 枚)`)
    console.log(`問題のあるカード: ${uniqueCards.size} 枚`)
    console.log()
    console.log(
        `  [1] テキストブロック数不足:    ${blockGaps.length} 件`
    )
    console.log(
        `  [2] キーワード実装漏れ:        ${kwGaps.length} 件`
    )
    console.log(
        `  [3] card-notes 既知の未実装:   ${noteGaps.length} 件`
    )
    console.log()

    // ---- 詳細 ----
    if (blockGaps.length > 0) {
        console.log("-".repeat(60))
        console.log("[1] テキストブロック数不足")
        console.log(
            "    テキストには複数の効果ブロックがあるが effects[] のエントリが足りない"
        )
        console.log("-".repeat(60))
        for (const g of blockGaps) {
            console.log()
            console.log(`  ${g.cardId} ${g.name} (${g.type})`)
            console.log(`  ${g.detail}`)
        }
        console.log()
    }

    if (kwGaps.length > 0) {
        console.log("-".repeat(60))
        console.log("[2] キーワード実装漏れ")
        console.log(
            "    テキストにカード自身のキーワードがあるが effects[] に無い"
        )
        console.log(
            "    ※ 他カードへの参照（「を持つ」等）は除外済み"
        )
        console.log("-".repeat(60))
        for (const g of kwGaps) {
            console.log()
            console.log(`  ${g.cardId} ${g.name} (${g.type})`)
            console.log(`  ${g.detail}`)
        }
        console.log()
    }

    if (noteGaps.length > 0) {
        console.log("-".repeat(60))
        console.log("[3] card-notes.json 既知の未実装/部分実装")
        console.log("-".repeat(60))
        for (const g of noteGaps) {
            console.log()
            console.log(`  ${g.cardId} ${g.name}`)
            console.log(`  ${g.detail}`)
        }
        console.log()
    }

    // ---- カテゴリ1 と 3 で重複するカード ----
    const blockIds = new Set(blockGaps.map((g) => g.cardId))
    const noteIds = new Set(noteGaps.map((g) => g.cardId))
    const blockOnlyIds = [...blockIds].filter((id) => !noteIds.has(id))

    if (blockOnlyIds.length > 0) {
        console.log("=".repeat(60))
        console.log(
            "★ card-notes.json に未登録の実装漏れ候補:"
        )
        console.log(
            "  （以下はカテゴリ1で検出されたが card-notes に記載がないもの）"
        )
        console.log("=".repeat(60))
        for (const id of blockOnlyIds) {
            const g = blockGaps.find((g) => g.cardId === id)!
            console.log(`  ${g.cardId} ${g.name}`)
        }
        console.log()
    }
}
