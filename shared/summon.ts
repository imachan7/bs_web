// 召喚まわりの共有ルール判定層。
//
// shared/rules.ts と shared/cost.ts の**両方**に依存する判定をここに置く。
// （cost.ts は rules.ts を import しているので、rules.ts 側から effectiveCost を呼ぶと循環参照になる。
//  依存が一方向になるよう、両者を使う判定は下流のこのファイルへ分ける）
//
// 制約は rules.ts と同じ: node 組み込みモジュールを import しないこと（クライアントへバンドルするため）。
import type { PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { card } from "./cardDb"
import { effectiveCost } from "./cost"
import { isFlashLockedFor, minLevelCores } from "./rules"

// ---- 入れ替え召喚（kind:"battleSwapSummon"。BS07ブラックカラカロッサム） ----

// 手札のこのスピリットカードを、フラッシュ中のバトルで
// 「バトルしている自分の[substituteName]1体を手札に戻す」ことを**追加コスト**として、
// 疲労状態で召喚しバトルを引き継ぐ。効果文に「コストを支払わずに」が無いので**召喚コストは通常どおり必要**。
export interface BattleSwapSummonOption {
    effectId: string
    substituteName: string // 手札に戻す対象のカード名（[カード名]表記なので完全一致）
    substituteInstanceIds: string[] // 入れ替え元に指定できる自分のスピリット（バトル参加中・名前一致）
    cost: number // 軽減後の召喚コスト
    placeCores: number // 召喚時に置く維持コア（最小レベルぶん）
    totalCores: number // cost + placeCores。UI はこの数を支払い元選択の必要数として使う
}

// 判定の本体。**サーバー（RuleValidator.validateSummon）とクライアントUIの唯一の判定元**。
// substituteInstanceId を渡すとその個体で検証し、省略すると「入れ替え元になれる個体を全部集める」。
// 戻り値は失敗理由（string）か成功時のオプション。
// なお支払い元（paySources）の妥当性はここでは見ない——リザーブ／フィールドのコア配分は
// サーバー専用の検証（validatePaySources）が持つため。ここが返す totalCores がその必要数になる
export function battleSwapSummonCheck(
    board: Board,
    pid: PlayerId,
    handIndex: number,
    substituteInstanceId?: string,
): BattleSwapSummonOption | string {
    const cardId = board.players[pid].hand?.[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const cardData = card(cardId)
    if (cardData.type !== "spirit") return "スピリットカードではありません"
    const swap = cardData.effects.find((e) => e.kind === "battleSwapSummon")
    if (!swap || swap.kind !== "battleSwapSummon") return "このカードは入れ替え召喚できません"
    const battle = board.battle
    if (!board.isFlashTiming || !battle) return "フラッシュタイミングではありません"
    if (pid !== board.priorityPlayer) return "現在フラッシュの優先権がありません"
    if (isFlashLockedFor(board, pid)) return "効果により、フラッシュで手札のカードを使用できません"

    const spirits = board.players[pid].field.spirits
    // バトルに参加している自分のスピリット（アタッカー or ブロッカー）で、かつ名前が完全一致するもの。
    // [カード名]表記は完全一致（reviveOnDestroy.requireOwnFieldHasName と同じ扱い）。
    // 部分一致にすると "カラカロッサム" が[ブラックカラカロッサム]自身にも一致してしまう
    const inBattle = (instanceId: string): boolean =>
        battle.attackerInstanceId === instanceId || battle.blockerInstanceId === instanceId
    const eligible = spirits.filter(
        (s) => inBattle(s.instanceId) && card(s.cardId).name === swap.substituteName,
    )
    if (substituteInstanceId !== undefined) {
        const substitute = spirits.find((s) => s.instanceId === substituteInstanceId)
        if (!substitute) return "入れ替え元のスピリットが見つかりません"
        if (!inBattle(substituteInstanceId)) return "入れ替え元のスピリットはバトルに参加していません"
        if (card(substitute.cardId).name !== swap.substituteName) {
            return `入れ替え元は[${swap.substituteName}]である必要があります`
        }
    } else if (eligible.length === 0) {
        return "入れ替え元にできるスピリットがバトルに参加していません"
    }

    // コストは**入れ替え元がまだ場にいる時点**で数える（軽減シンボルは召喚宣言時の盤面で決まる）。
    // GameEngine.doBattleSwapSummon も手札に戻す前に effectiveCost を呼んでおり、順序が一致している
    const cost = effectiveCost(board, pid, cardData)
    const placeCores = minLevelCores(cardData)
    return {
        effectId: swap.id,
        substituteName: swap.substituteName,
        substituteInstanceIds:
            substituteInstanceId !== undefined ? [substituteInstanceId] : eligible.map((s) => s.instanceId),
        cost,
        placeCores,
        totalCores: cost + placeCores,
    }
}

// UI向け：手札の handIndex 枚目がいま入れ替え召喚できるなら、その選択肢を返す（できなければ null）。
// クライアントは substituteInstanceIds から入れ替え元を選ばせ、
// `{ type: "summon", handIndex, substituteInstanceId, paySources }` を送る。
// **コアが足りるかはここでは判定しない**（totalCores を返すので、支払い元選択UIの必要数に使うこと）。
// 送信後にコア不足ならサーバーがエラー文字列を返す
export function canBattleSwapSummon(
    board: Board,
    pid: PlayerId,
    handIndex: number,
): BattleSwapSummonOption | null {
    const result = battleSwapSummonCheck(board, pid, handIndex)
    return typeof result === "string" ? null : result
}
