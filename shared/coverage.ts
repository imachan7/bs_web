// 概念: 実行時カバレッジの計測点（npm run coverage:effects）。効果が実際に効いた所で1行呼ぶ
//
// 記録先は COV_OUT を付けて起動したときだけ server/src/logic/coverageRecorder.ts が差す。
// 差していなければ null を見て返るだけなので、対戦にもクライアントにも影響しない。
// 計測点は「走査に載った時点」ではなく「その効果固有の条件をすべて通って値・挙動に反映される時点」に置く。
// 計測点が無い kind は coverage:effects が「未計測」として名前を出す（kind 引数を grep して数える）
import type { EffectDef } from "../server/src/type"

let sink: ((line: string) => void) | null = null

export function setCoverageSink(s: ((line: string) => void) | null): void {
    sink = s
}

const eidOf = (o: unknown): string => String((o as Record<string, unknown> | null | undefined)?.["__eid"] ?? "?")

// effect は __eid が刻まれたカードデータの効果エントリ（undefined なら記録しない）。
// kind はその効果の kind と一致していなければならない（食い違いは計測側が落とす）
export function noteCoverage(effect: unknown, kind: EffectDef["kind"]): void {
    if (sink === null || effect === null || effect === undefined) return
    const actual = (effect as Record<string, unknown>)["kind"]
    if (actual !== kind) sink(`bad\t${kind}\t${String(actual)}`)
    sink("cont\t" + eidOf(effect))
}

// cardId の持つ【keyword】のエントリを記録する（level を渡すと、そのレベルで有効なエントリを選ぶ）
export function noteKeyword(effects: readonly EffectDef[], keyword: string, level?: number): void {
    if (sink === null) return
    const own = effects.filter((e) => e.kind === "keyword" && e.keyword === keyword)
    const found =
        level === undefined
            ? own[0]
            : (own.find((e) => e.kind === "keyword" && (e.levels === null || e.levels === undefined || e.levels.includes(level))) ?? own[0])
    noteCoverage(found, "keyword")
}

export function noteAction(action: { type: string }): void {
    if (sink !== null) sink(`act\t${eidOf(action)}\t${action.type}`)
}

export function noteInstance(cardId: string): void {
    if (sink !== null) sink("inst\t" + cardId)
}

// 付与先に付与元の __eid を載せ、読む側の計測点で引けるようにする（alsoCostGrant のように付与元を残さない状態用）
export function noteGrantSource(target: object, effect: unknown): void {
    if (sink !== null) (target as Record<string, unknown>)["__covGrantEid"] = eidOf(effect)
}

// kind は付与元の kind（coverage:effects が計測点のある kind として数える）
export function noteGrantedFrom(target: object, _kind: EffectDef["kind"]): void {
    if (sink !== null) sink("cont\t" + String((target as Record<string, unknown>)["__covGrantEid"] ?? "?"))
}
