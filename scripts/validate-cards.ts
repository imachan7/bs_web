// data/cards.json の妥当性検証。
//
// **なぜ必要か**: cards.json はランタイムに fs で読み込むため tsc の型検査対象外で、
// データとコードの不整合が実行時（そのカードを実際に使ったとき）まで発覚しない。
// しかも resolveAction は未登録の action.type を引くと `handler is not a function` で
// 対戦中にクラッシュする。過去に「cardId が全面的にズレる」事故も起きている。
//
// 検証の柱は「**コード側を正として突き合わせる**」こと。有効な action.type / keyword は
// ここにハードコードせず ACTION_HANDLERS / KEYWORDS から実行時に取得するので、
// 型やハンドラを追加しても検証側の更新は不要（陳腐化しない）。
//
// 単体実行: npm run validate:cards
// CI では smoke（part61）経由で自動実行される
import * as fs from "node:fs"
import * as path from "node:path"
import ACTION_HANDLERS from "../server/src/logic/actions/index"
import { KEYWORDS } from "../shared/rules"
import { COLOR_LABELS } from "../data/constants"
import type { CardData } from "../server/src/type"

const VALID_ACTIONS = new Set(Object.keys(ACTION_HANDLERS))
const VALID_KEYWORDS = new Set(Object.keys(KEYWORDS))
const VALID_COLORS = new Set(Object.keys(COLOR_LABELS))
const VALID_TYPES = new Set(["spirit", "nexus", "magic"])

// 効果エントリの kind。EffectDef のユニオンに対応する（新しい kind を足したらここにも追記する）
const VALID_KINDS = new Set([
    "triggered", "magic", "keyword", "constraint", "aura", "step", "fieldEvent",
    "reviveOnDestroy", "reductionGrant", "levelAs", "battleWon", "magicRestriction",
    "globalConstraint", "coreBonus", "costMod", "effectGrant", "colorAs", "funsaiBonus",
    "activated", "mustBlockGrant", "magicBuffBonus", "familyGrant", "exhaustOnManualCoreAdd",
    "magicFreeGrant", "coreStepBonus", "immunityGrant", "constraintGrant", "drawDouble",
    "keywordGrant", "lifeDamageNegate", "exhaustImmunityGrant", "funsaiOnBlock",
    "triggerSuppression",
])

export interface ValidationIssue {
    cardId: string
    message: string
}

// effects の中に現れるすべての action オブジェクトを再帰的に集める
// （triggered.action / magic.action だけでなく、reviveOnDestroy.cost などの入れ子も拾う）
function collectActions(node: unknown, out: { type?: unknown }[]): void {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) {
        for (const x of node) collectActions(x, out)
        return
    }
    for (const [key, value] of Object.entries(node)) {
        if (key === "action" && value && typeof value === "object" && !Array.isArray(value)) {
            out.push(value as { type?: unknown })
        }
        collectActions(value, out)
    }
}

// 仮想発生源では意味を成さない「self を参照するアクション」。
// 仮想発生源は場に存在せず resolveAction に self=null が渡るため、これらは不発か誤動作になる
// （TURN_EFFECT_SOURCES.md §4.1）
const SELF_REFERENCING_ACTIONS = new Set([
    "selfBuff",
    "selfBuffPer",
    "selfBuffByHandDiscard",
    "refreshSelf",
    "destroySelf",
    "returnSelfToHand",
    "coreRemoveSelf",
    "coreToTrashSelf",
    "voidCoreToSelf",
    "voidCoreToSelfPer",
    "tenshoCoreDump",
])

// lendSelfThisTurn を持つカードの「貸される側」の効果エントリを検査する。
// 貸与は kind:"magic" のエントリが発動し、それ以外の継続効果エントリが仮想発生源として有効になる
function checkLentEffects(
    c: CardData,
    add: (cardId: string, message: string) => void,
): void {
    for (const e of c.effects as { id?: string; kind?: string; levels?: unknown; aura?: { target?: string } }[]) {
        // 発動そのもの（kind:"magic"）とキーワード宣言は貸与対象ではない
        if (e.kind === "magic" || e.kind === "keyword") continue

        // §2.2: levels が null 以外だと、仮想発生源の currentLevel が 0 のため
        // effectActiveAtLevel が false を返し、**エラーも出ずに一度も発火しない**
        if (e.levels !== null) {
            add(
                c.cardId,
                `貸与効果 ${e.id ?? e.kind} の levels が null でない（仮想発生源は Lv0 のため無言で発火しなくなる。TURN_EFFECT_SOURCES.md §2.2）`,
            )
        }

        // §4.1: aura の target:"self" は仮想発生源では常に不成立
        if (e.kind === "aura" && e.aura?.target === "self") {
            add(c.cardId, `貸与効果 ${e.id ?? e.kind} の aura target が "self"（仮想発生源では成立しない）`)
        }

        // §4.1: self 参照アクションは仮想発生源（self=null）では意味を成さない
        const lent: { type?: unknown }[] = []
        collectActions([e], lent)
        for (const a of lent) {
            if (typeof a.type === "string" && SELF_REFERENCING_ACTIONS.has(a.type)) {
                add(
                    c.cardId,
                    `貸与効果 ${e.id ?? e.kind} が self 参照アクション "${a.type}" を含む（仮想発生源は場に存在せず self=null になる）`,
                )
            }
        }
    }
}

// costMod の mode:"set"（コスト置換。BS05 パントマイスター／ゴッドスピード）の検査。
//
// 加算側（costModTotal）は colorFilter / cardType / side / phaseTurn / condition を見るが、
// 置換側（costSetOverride）が見るのは levels / familyFilter / keywordFilter / costFilter だけ。
// 同じ kind に両方のフィールドが同居できる型なので、置換に加算側のフィルタを書くと
// **絞り込みが無言で無視され、全カードに置換が適用される**（エラーも出ない）。
// 現行データ（BS05-030 / BS05-073）は該当しないが、将来「相手の◯色のカードのコストを△にする」を
// 書いた瞬間に発現するため、データ側で落とす。
const COST_SET_UNSUPPORTED = ["colorFilter", "cardType", "side", "phaseTurn", "condition"] as const

function checkCostSetEffects(
    c: CardData,
    add: (cardId: string, message: string) => void,
): void {
    for (const e of c.effects as { id?: string; kind?: string; mode?: string }[]) {
        if (e.kind !== "costMod" || e.mode !== "set") continue
        for (const field of COST_SET_UNSUPPORTED) {
            if (field in e) {
                add(
                    c.cardId,
                    `costMod mode:"set" の ${e.id ?? e.kind} に ${field} がある（costSetOverride は参照しないため絞り込みが無言で無視される）`,
                )
            }
        }
    }
}

export function validateCards(cards: CardData[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const add = (cardId: string, message: string): void => {
        issues.push({ cardId, message })
    }
    const seenIds = new Set<string>()
    const nameById = new Map<string, string>()

    for (const c of cards) {
        const id = c?.cardId ?? "(cardId なし)"

        // --- 基本構造 ---
        if (typeof c.cardId !== "string" || c.cardId === "") add(id, "cardId が文字列でない")
        if (seenIds.has(c.cardId)) add(id, "cardId が重複している")
        seenIds.add(c.cardId)
        nameById.set(c.cardId, c.name)

        if (typeof c.name !== "string" || c.name === "") add(id, "name が空")
        if (!VALID_TYPES.has(c.type)) add(id, `type が不正: ${String(c.type)}`)
        if (typeof c.cost !== "number" || c.cost < 0) add(id, `cost が不正: ${String(c.cost)}`)

        // --- 色 ---
        if (!Array.isArray(c.colors) || c.colors.length === 0) {
            add(id, "colors が空（単色でも要素1が必要）")
        } else {
            for (const col of c.colors) {
                if (!VALID_COLORS.has(col)) add(id, `colors に未知の色: ${String(col)}`)
            }
        }
        for (const col of c.reduction ?? []) {
            if (!VALID_COLORS.has(col)) add(id, `reduction に未知の色: ${String(col)}`)
        }
        for (const col of c.symbol ?? []) {
            if (!VALID_COLORS.has(col)) add(id, `symbol に未知の色: ${String(col)}`)
        }
        // 軽減シンボルは自分の色の範囲に収まるはず（多色カードは混色。BS05-X19＝赤3白3）
        for (const col of c.reduction ?? []) {
            if (Array.isArray(c.colors) && !c.colors.includes(col)) {
                add(id, `reduction に自色以外の色が含まれる: ${col}（colors=${c.colors.join("/")}）`)
            }
        }

        // --- レベル ---
        if (c.type === "magic") {
            if (c.levels.length !== 0) add(id, "magic なのに levels が空でない")
            if (c.symbol.length !== 0) add(id, "magic なのに symbol が空でない")
        } else {
            if (!Array.isArray(c.levels) || c.levels.length === 0) {
                add(id, `${c.type} なのに levels が空`)
            } else {
                let prevLevel = 0
                let prevCores = -1
                for (const lv of c.levels) {
                    if (lv.level <= prevLevel) add(id, `levels の level が昇順でない（${lv.level}）`)
                    if (lv.cores < prevCores) add(id, `levels の cores が昇順でない（Lv${lv.level}=${lv.cores}）`)
                    prevLevel = lv.level
                    prevCores = lv.cores
                }
            }
            if (c.symbol.length === 0) add(id, `${c.type} なのに symbol が空`)
        }

        // --- 効果 ---
        if (!Array.isArray(c.effects)) {
            add(id, "effects が配列でない")
            continue
        }
        const seenEffectIds = new Set<string>()
        for (const e of c.effects as { id?: string; kind?: string; keyword?: string }[]) {
            if (typeof e.id === "string") {
                if (seenEffectIds.has(e.id)) add(id, `effects の id が重複: ${e.id}`)
                seenEffectIds.add(e.id)
            }
            if (!e.kind || !VALID_KINDS.has(e.kind)) {
                add(id, `未知の effect kind: ${String(e.kind)}`)
            }
            if (e.kind === "keyword" && (!e.keyword || !VALID_KEYWORDS.has(e.keyword))) {
                add(id, `未知の keyword: ${String(e.keyword)}`)
            }
        }

        // action.type がハンドラに登録されているか（未登録なら対戦中にクラッシュする）
        const actions: { type?: unknown }[] = []
        collectActions(c.effects, actions)
        for (const a of actions) {
            if (typeof a.type !== "string") {
                add(id, "action に type が無い")
            } else if (!VALID_ACTIONS.has(a.type)) {
                add(id, `未登録の action.type: "${a.type}"（ハンドラが無いため実行時にクラッシュする）`)
            }
        }

        // --- lendSelfThisTurn（マジックの一時継続効果貸与）の検査 ---
        // TURN_EFFECT_SOURCES.md §2.2 / §4.1。どちらもエラーが出ずに「無言で壊れる」ため、
        // 実行時ではなくここで落とす
        if (actions.some((a) => a.type === "lendSelfThisTurn")) {
            checkLentEffects(c, add)
        }

        // --- costMod mode:"set"（コスト置換）の検査 ---
        checkCostSetEffects(c, add)

        // 効果テキストがあるのに effects が空 = 未構造化（エラーではないので数えない）
    }

    return issues
}

// 単体実行時のエントリポイント
function main(): void {
    const cardsPath = path.resolve(__dirname, "../data/cards.json")
    const cards = JSON.parse(fs.readFileSync(cardsPath, "utf-8")) as CardData[]
    const issues = validateCards(cards)

    console.log(`data/cards.json: ${cards.length}枚を検証`)
    console.log(`  照合対象: action ${VALID_ACTIONS.size}種 / keyword ${VALID_KEYWORDS.size}種 / kind ${VALID_KINDS.size}種`)
    if (issues.length === 0) {
        console.log("問題は見つかりませんでした ✅")
        return
    }
    console.log(`\n❌ ${issues.length}件の問題:`)
    for (const i of issues) console.log(`  [${i.cardId}] ${i.message}`)
    process.exitCode = 1
}

if (require.main === module) main()
