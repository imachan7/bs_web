// 盤面の評価（段階2）。GameView だけを見る（相手の手札の中身は見ない。枚数は見てよい）。
//
// 重みは置き値。実測前の一般的な勝ち筋からの仮置きで、ai:bench の新旧対戦で調整する。
// 重みを変えるときは BOARD_WEIGHTS だけを書き換え、式はいじらない。
import type { GameView, PlayerId } from "../type"
import { currentLevel, instanceSymbolCount } from "../../../shared/rules"
import { bpScore } from "./evaluate"
import { fieldEffectTags } from "./moveTags"

// ai:bench で重みの段階を測るための倍率（ブラウザのワーカーには process が無い）
const fxScale = typeof process === "undefined" || process.env.BS_AI_FIELD_FX === undefined ? 1 : Number(process.env.BS_AI_FIELD_FX)

export const BOARD_WEIGHTS = {
    WIN: 100000, // 勝敗が決まっている局面の値（自分の勝ちが +、負けが −）
    LIFE_PER: 20, // LIFE_TABLE を超えるぶんのライフ1つあたり
    // ライフ L の価値。残りが少ないほど1点が重い（最後の1つ＝60、5→4＝12）。減ったライフのコアは相手のリザーブへ入り資源になるため、
    // 1点ずつ削るより、取り切れるときにまとめて取るほうを高く見る（ユーザーの指摘 2026-11-20、AI_OPPONENT §9.y）
    LIFE_TABLE: [0, 60, 95, 120, 138, 150] as readonly number[],
    SPIRIT_BP: 3, // スピリットのBP（千単位）1あたり
    SPIRIT_SYMBOL: 8, // スピリットのシンボル数1あたり（1回のアタックで削る数）
    SPIRIT_UNTAPPED: 6, // 回復状態（次の相手ターンのブロッカー）のスピリットへの加点
    NO_UNTAPPED_THREAT: -25, // 回復状態のスピリットが0で、相手にスピリットがいるときの減点
    NEXUS_BASE: 10, // ネクサス1つあたり
    NEXUS_PER_LEVEL: 4, // ネクサスのレベル1あたり
    FIELD_CORE: 2, // スピリット・ネクサスの上のコア1個あたり（BP・レベルの項と二重にならないよう低く）
    RESERVE_CORE: 6, // リザーブのコア1個あたり（上限なし。3＋上限8 から上げて新旧対戦が 41.9%→約51%）
    HAND_CARD: 5, // 手札1枚あたり
    HAND_CARD_CAP: 6, // 手札を数える上限
    // 場のスピリット・ネクサスが今のレベルで持つ効果1分類あたり（置き値。相手の場なら引かれる）。unknown・バトル限定は数えない
    FIELD_FX_REMOVAL: 10 * (Number.isFinite(fxScale) ? fxScale : 1),
    FIELD_FX_BUFF: 6 * (Number.isFinite(fxScale) ? fxScale : 1),
    FIELD_FX_DRAW: 10 * (Number.isFinite(fxScale) ? fxScale : 1),
    DECK_LOW_THRESHOLD: 5, // デッキ残りがこの枚数以下でデッキ切れの減点が始まる
    DECK_LOW_PER: 15, // デッキ切れまでの1枚あたりの減点
} as const

const W = BOARD_WEIGHTS

function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// 1人ぶんの盤面の価値
function sideValue(view: GameView, pid: PlayerId): number {
    const player = view.players[pid]
    const spirits = player.field.spirits
    const nexuses = player.field.nexuses

    let value = 0

    // ライフ
    const table = W.LIFE_TABLE
    const last = table.length - 1
    value += player.life <= last ? table[player.life]! : table[last]! + W.LIFE_PER * (player.life - last)

    // 場のスピリット
    let untapped = 0
    for (const inst of spirits) {
        value += W.SPIRIT_BP * bpScore(view, pid, inst)
        value += W.SPIRIT_SYMBOL * instanceSymbolCount(inst)
        if (!inst.isRested) {
            value += W.SPIRIT_UNTAPPED
            untapped++
        }
    }
    if (untapped === 0 && view.players[opponentOf(pid)].field.spirits.length > 0) {
        value += W.NO_UNTAPPED_THREAT
    }

    // ネクサス
    for (const inst of nexuses) {
        value += W.NEXUS_BASE + W.NEXUS_PER_LEVEL * currentLevel(inst).level
    }

    // 場のカードの効果の価値
    for (const inst of [...spirits, ...nexuses]) {
        const tags = fieldEffectTags(inst)
        if (tags.has("removal")) value += W.FIELD_FX_REMOVAL
        if (tags.has("buffOwn")) value += W.FIELD_FX_BUFF
        if (tags.has("draw")) value += W.FIELD_FX_DRAW
    }

    // 場のコア（スピリット・ネクサスの上）
    const fieldCores = [...spirits, ...nexuses].reduce((sum, inst) => sum + inst.cores, 0)
    value += W.FIELD_CORE * fieldCores

    // リザーブのコア・トラッシュのコアは 0
    value += W.RESERVE_CORE * player.reserve

    // 手札は枚数だけ（相手の中身は見えない。自分も釣り合わせるため枚数で揃える）
    value += W.HAND_CARD * Math.min(player.handCount, W.HAND_CARD_CAP)

    // デッキ切れの回避。通常は 0
    if (player.deckCount <= W.DECK_LOW_THRESHOLD) {
        value -= W.DECK_LOW_PER * (W.DECK_LOW_THRESHOLD - player.deckCount)
    }

    return value
}

// pid 視点の盤面の良さ（自分 − 相手）。大きいほど pid に有利
export function evaluateBoard(view: GameView, pid: PlayerId): number {
    if (view.winner !== null) return view.winner === pid ? W.WIN : -W.WIN
    return sideValue(view, pid) - sideValue(view, opponentOf(pid))
}
