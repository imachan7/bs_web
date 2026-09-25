// シンボルの数と色（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）

import type {
    CardInstance,
    Color,
} from "../../server/src/type"
import type { BoardPlayer } from "../board"
import { card } from "../cardDb"

// ---- シンボル ----

// シンボルを固定する効果（「シンボルを◯つにする」＝symbolFix・期間つきの symbolSet・召喚の軽減の間だけの置き換え）を
// 受けた個体は固定値だけを持つ。追加・失う・ブレイヴのシンボルは効かない（公式のルール改定で「シンボル2つに固定する」へ
// 表記変更。固定の後に1つ加えても2つのまま。2026-09-25 ユーザー確認。BRAVE.md §12 の3 もこの一般則の1例）。
// 複数の固定が重なったときは期間つき＞継続の順で1つだけ見る（発揮順は見ていない）
function fixedSymbolsOf(inst: CardInstance, forSummon: boolean): Color[] | undefined {
    return (forSummon ? inst.symbolsForSummonReduction : undefined) ?? inst.timedSymbolsOverride ?? inst.symbolsOverrideContinuous
}

// 個体が持つシンボルの色の列。timedSymbolLoss（指定色を1つ失う）は持っている色だけ減る（持たなければ無変化）。
// ダブルハートの timedExtraSymbols は色を持たない数だけの加算なので、呼び出し側で足す
function symbolsOf(inst: CardInstance, forSummon = false): { symbols: Color[]; fixed: boolean } {
    const fixed = fixedSymbolsOf(inst, forSummon)
    if (fixed) return { symbols: [...fixed], fixed: true }
    // 合体しているブレイヴのシンボルが加わる（BRAVE.md §3）。混色でも合成するだけ（§12.2）
    const symbols = [
        ...card(inst.cardId).symbol,
        ...(inst.braveComposite?.symbols ?? []),
        ...(inst.symbolsAddedContinuous ?? []),
        ...(inst.extraSymbolsPermanent ?? []),
        ...(inst.battleSymbolsAdded ?? []),
    ]
    for (const c of inst.timedSymbolLoss ?? []) {
        const idx = symbols.indexOf(c)
        if (idx >= 0) symbols.splice(idx, 1)
    }
    return { symbols, fixed: false }
}

// インスタンスのシンボル数。ライフダメージ計算・シンボル数の条件・比較が共用する
export function instanceSymbolCount(inst: CardInstance): number {
    const { symbols, fixed } = symbolsOf(inst)
    return symbols.length + (fixed ? 0 : inst.timedExtraSymbols ?? 0)
}

// 軽減計算用：プレイヤーのフィールドにある指定色シンボルの数を数える。
// timedExtraSymbols（ダブルハート）は「持っているシンボルと同じ色を1つ追加」の簡略化として、
// そのインスタンスが元々colors該当のシンボルを持つ場合にのみ加算する
// forSummon: スピリット召喚の軽減計算から呼ばれたか。true のときだけ
// symbolsForSummonReduction（BS11-039 天使ティアエル＝召喚の軽減の間だけ黄3つ）を使う
export function countSymbols(player: BoardPlayer, colors: Color[], forSummon = false): number {
    let count = 0
    const all = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of all) {
        // **バウンス待機中のカードのシンボルは軽減に使えない**（バトスピ Wiki「バウンスについて」）。
        // 破壊待機中は使えるので、そこだけ扱いが違う
        if (inst.pendingBounce) continue
        // 消滅待機中も同じく使えない（破壊待機は使える）
        if (inst.pendingDestruction && inst.pendingVanish) continue
        // colorlessThisBattle（器S）：色とシンボルを無いものとして扱う個体は軽減の数からまるごと飛ばす
        // （BS13-011/015/052。docs/design/BS13_PLAN.md §1 #10）
        if (inst.colorlessThisBattle) continue
        const { symbols: cardSymbols, fixed } = symbolsOf(inst, forSummon)
        // 「このスピリットは◯色のスピリットとしても扱う」（colorAs / timedColors）を持つ個体は、
        // **そのシンボルを付与色のシンボルとしても数える**（2026-08-20 ユーザー確認）。
        // 元の色を失うわけではないので、緑1シンボルの個体が白としても扱われるなら
        // 「緑シンボル1つ」としても「白シンボル1つ」としても数える（置き換えではない）
        const grantedColors = [...inst.timedColors, ...(inst.colorsAsContinuous ?? [])]
        const grantedMatches = grantedColors.some((c) => colors.includes(c))
        let matched = false
        for (const sym of cardSymbols) {
            if (colors.includes(sym) || grantedMatches) {
                count++
                matched = true
            }
        }
        if (matched && !fixed && inst.timedExtraSymbols) count += inst.timedExtraSymbols
    }
    return count
}

// 軽減計算用：トラッシュにあるカードのシンボル数（BS10-092／BS10-X05）。
// フィールドと違い個体（CardInstance）ではなくカードIDの列なので、カード静的な symbol だけで数える
export function countTrashSymbols(player: BoardPlayer, colors: Color[]): number {
    let count = 0
    for (const cardId of player.trashCards) {
        for (const sym of card(cardId).symbol) {
            if (colors.includes(sym)) count++
        }
    }
    return count
}

// 手札の枚数（内容は隠匿されても枚数は公開情報）。BoardPlayer.handCountがあればそれを使い、
// 無ければhand.length（サーバー内部のPlayerStateは常に実配列）にフォールバックする
export function handSizeOf(player: BoardPlayer): number {
    return player.handCount ?? player.hand?.length ?? 0
}
