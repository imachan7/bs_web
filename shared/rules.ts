// サーバー／クライアント共有のルール判定層。
//
// ここに置く関数は「盤面（Board）とカードマスタだけで答えが決まる純粋な述語」に限る。
// サーバー（GameState）とクライアント（GameView）の双方から同じ実装を呼ぶことで、
// 二重実装によるロジックのズレ（型エラーにならず実対戦でしか露見しない）を根絶する。
//
// 制約: node:fs 等の node 組み込みモジュールを import しないこと（esbuild でクライアントへバンドルするため）。
// カードマスタは shared/cardDb.ts の注入経由で参照する。
import type {
    CardData,
    CardInstance,
    Color,
    FamilyFilter,
    Keyword,
    PlayerId,
} from "../server/src/type"
import type { Board, BoardPlayer } from "./board"
import { card } from "./cardDb"

// ---- キーワード ----

// キーワードの存在と表示名を一元管理する（挙動は GameEngine / RuleValidator が hasKeyword で参照する）
export interface KeywordInfo {
    id: Keyword
    label: string
}

// キーワード効果のレジストリ。カードデータには名前だけを持たせ、挙動はエンジン側で解決する
export const KEYWORDS: Record<Keyword, KeywordInfo> = {
    soku: { id: "soku", label: "神速" },
    awaken: { id: "awaken", label: "覚醒" },
    clash: { id: "clash", label: "激突" },
    armor: { id: "armor", label: "装甲" },
    jugeki: { id: "jugeki", label: "呪撃" },
    funsai: { id: "funsai", label: "粉砕" },
    kobo: { id: "kobo", label: "光芒" },
    tensho: { id: "tensho", label: "転召" },
}

// カード静的なキーワード保持判定（一時付与・継続付与は spiritHasKeyword を使うこと）
export function hasKeyword(cardId: string, keyword: Keyword): boolean {
    return card(cardId).effects.some((e) => e.kind === "keyword" && e.keyword === keyword)
}

// ---- レベル・基本述語 ----

// 効果の levels 指定が現在のレベルで有効か（null = レベル不問）
export function effectActiveAtLevel(levels: number[] | null, level: number): boolean {
    return levels === null || levels.includes(level)
}

// カードに効果の記述を持たない（バニラ）か
export function isVanillaCard(cardData: CardData): boolean {
    return cardData.effect === ""
}

// 状態を考慮したコスト判定：カード本来のコスト ‖ 一時的に「コストとしても扱う」値（道化師クラン）
export function instHasCost(inst: CardInstance, cost: number): boolean {
    return card(inst.cardId).cost === cost || inst.tempAlsoCosts.includes(cost)
}

// 状態を考慮した色判定：master色 ‖ 一時付与された色（tempColors。アディショナルカラー） ‖
// 継続的な色置換（colorsAsContinuous。百面相のフラットフェイス）
export function instHasColor(inst: CardInstance, color: Color): boolean {
    if (card(inst.cardId).color === color) return true
    if (inst.tempColors.includes(color)) return true
    return (inst.colorsAsContinuous ?? []).includes(color)
}

// 現在のレベルとBP。levelOverrideThisTurn（このターンの上書き）または levelAsContinuous（継続置換）が
// あればそちらを優先し、無ければコア数（coresOverride があればそれ）から判定する。
// BP には tempBpBuff を加算する（レベル0＝維持コア割れの場合は加算しない）
export function currentLevel(inst: CardInstance): { level: number; bp: number } {
    const master = card(inst.cardId)
    const override = inst.levelOverrideThisTurn ?? inst.levelAsContinuous
    if (override !== undefined) {
        const lv = master.levels.find((l) => l.level === override)
        if (lv) {
            return { level: lv.level, bp: lv.bp + (lv.level > 0 ? inst.tempBpBuff : 0) }
        }
    }
    // coresOverride（クロスシザースのネクサスコア数リンク）があれば、レベル判定はそちらを使う
    const coreCount = inst.coresOverride ?? inst.cores
    let result = { level: 0, bp: 0 }
    for (const lv of master.levels) {
        if (coreCount >= lv.cores && lv.level > result.level) {
            result = { level: lv.level, bp: lv.bp }
        }
    }
    return { level: result.level, bp: result.bp + (result.level > 0 ? inst.tempBpBuff : 0) }
}

// ---- シンボル ----

// インスタンスのシンボル数：カードの静的シンボル数 + このターンの追加シンボル数（tempExtraSymbols。ダブルハート）。
// ライフダメージ計算・magicのownFieldHasMinSymbolSpirit条件・bpBuffのminSymbols対象フィルタが共用する
export function instanceSymbolCount(inst: CardInstance): number {
    return card(inst.cardId).symbol.length + (inst.tempExtraSymbols ?? 0)
}

// 軽減計算用：プレイヤーのフィールドにある指定色シンボルの数を数える。
// tempExtraSymbols（ダブルハート）は「持っているシンボルと同じ色を1つ追加」の簡略化として、
// そのインスタンスが元々colors該当のシンボルを持つ場合にのみ加算する
export function countSymbols(player: BoardPlayer, colors: Color[]): number {
    let count = 0
    const all = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of all) {
        const cardSymbols = card(inst.cardId).symbol
        let matched = false
        for (const sym of cardSymbols) {
            if (colors.includes(sym)) {
                count++
                matched = true
            }
        }
        if (matched && inst.tempExtraSymbols) count += inst.tempExtraSymbols
    }
    return count
}

// ---- 盤面の位置 ----

// 指定インスタンスがそのプレイヤーのフィールドにスピリットとして存在するか
export function isSpiritOnField(board: Board, pid: PlayerId, instanceId: string): boolean {
    return board.players[pid].field.spirits.some((s) => s.instanceId === instanceId)
}

// ---- キーワード・系統の状態判定（盤面の付与効果を考慮する） ----

// 状態を考慮したキーワード判定：カード静的 ‖ 一時付与（tempKeywords） ‖ 継続付与（keywordGrant）。
// フィールド上のスピリットを判定する箇所はすべてこちらを使う（手札の神速判定はカード静的な hasKeyword のまま）
export function spiritHasKeyword(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    if (hasKeyword(inst.cardId, keyword)) return true
    if (inst.tempKeywords.some((k) => k.keyword === keyword)) return true
    return hasContinuousKeywordGrant(board, ownerPid, inst, keyword)
}

// 継続付与（kind: "keywordGrant"）によるキーワード保持判定（暴双龍ディラノス）
export function hasContinuousKeywordGrant(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    const player = board.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "keywordGrant") continue
            if (effect.keyword !== keyword) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (
                effect.familyFilter &&
                !matchesFamilyFilter(board, ownerPid, inst, effect.familyFilter)
            ) {
                continue
            }
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) continue
            if (effect.phase && board.phase !== effect.phase) continue
            return true
        }
    }
    return false
}

// 状態を考慮した系統判定：カード静的 ‖ 継続付与（kind: "familyGrant"。ポム／尖兵）
export function spiritHasFamily(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    family: string,
): boolean {
    if (card(inst.cardId).family.includes(family)) return true
    const player = board.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "familyGrant") continue
            if (effect.family !== family) continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            if (effect.colorFilter && !instHasColor(inst, effect.colorFilter)) {
                continue
            }
            if (
                effect.costFilter !== undefined &&
                !instHasCost(inst, effect.costFilter)
            ) {
                continue
            }
            if (effect.phase && board.phase !== effect.phase) continue
            if (effect.condition) {
                const { color, count } = effect.condition.ownColorTotalAtLeast
                const total = sources.filter((s) => instHasColor(s, color)).length
                if (total < count) continue
            }
            return true
        }
    }
    return false
}

// FamilyFilter（string | string[]）共通の判定：配列指定時はいずれかの系統を持てばよい（OR）
export function matchesFamilyFilter(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    filter: FamilyFilter,
): boolean {
    if (Array.isArray(filter)) {
        return filter.some((f) => spiritHasFamily(board, ownerPid, inst, f))
    }
    return spiritHasFamily(board, ownerPid, inst, filter)
}
