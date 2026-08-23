// smoke パート231（「Aすることで、Bする」は任意効果。発動するかを聞く。2026-08-23 ユーザー確定）
//
// COST_MODEL.md §1 は「A と B の両方が完全に解決できる場合にだけ発揮できる、**任意発揮**の効果」と
// 定めているが、発動確認（optional）が付いていないカードが4枚残っていた。
// 付いていないと、コストを払うかどうかをプレイヤーが決められないまま自動で払ってしまう。
//
//   BS04-022 王蛇ケツァルカトル        手札を好きな枚数破棄することで、コアを置く
//   BS04-061 戦闘獣ジャッカー          このスピリット上のコアすべてを置くことで、ネクサスを戻す
//   BS05-047 ブロンズ・ゴレム          コア1個をトラッシュに置くことで、ネクサスを戻す
//   BS08-045 勇者フェニックスペンタン  デッキの上に戻すことで、このスピリットは回復する
//
// 仕組みは既存の optional（requestActivationConfirm＝kind:"option" / confirm:true）に載せる。
// 発動確認は handleAction を直接呼んで応答する（helpers.act は対話モードで先に消化してしまうため）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HERO = "BS08-045" // 勇者フェニックスペンタン：Lv2『アタック時』ペンタン1体をデッキの上に戻すことで回復
const MATE = "BS02-058" // ペンタン（カード名に「ペンタン」を含む＝コストの候補）

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// 勇者フェニックスペンタンを Lv2（3コア）で置き、コストにできるペンタンを1体並べてアタックさせる
function setup(name: string, interactive: boolean): { s: GameState; hero: string; mate: string } {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    const hero = putSpirit(s, "p1", HERO, 3)
    const mate = putSpirit(s, "p1", MATE, 1)
    assert(handleAction(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    return { s, hero, mate }
}

const deckTop = (s: GameState): string | undefined => s.players.p1.deck[0]
const onField = (s: GameState, id: string): boolean =>
    s.players.p1.field.spirits.some((sp) => sp.instanceId === id)

console.log("=== アタック時に「発動しますか？」を聞く ===")
{
    const { s, hero } = setup("hero-confirm-asked", true)
    assert(handleAction(s, "p1", { type: "attack", instanceId: hero }) === null, "アタック宣言")
    assert(!!s.pendingChoice, "発動確認が出る")
    assert(s.pendingChoice!.confirm === true, "確認（confirm）の選択待ちである")
    assert(
        s.pendingChoice!.prompt.includes("発動しますか"),
        `プロンプトが発動確認（実際は「${s.pendingChoice!.prompt}」）`,
    )
}

console.log("=== 断ったら、コストも払わず効果も起きない ===")
{
    const { s, hero, mate } = setup("hero-confirm-declined", true)
    const before = deckTop(s)
    assert(handleAction(s, "p1", { type: "attack", instanceId: hero }) === null, "アタック宣言")
    // option を省略した resolveChoice ＝ スキップ（optional のときだけ許される）
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "発動しないことを選ぶ")
    assert(onField(s, mate), "コストのペンタンは場に残る")
    assert(deckTop(s) === before, "デッキの上も変わらない")
    assert(
        s.players.p1.field.spirits.find((sp) => sp.instanceId === hero)!.isRested,
        "アタックで疲労したまま（回復していない）",
    )
}

console.log("=== 承諾したら、コストを払って回復する ===")
{
    const { s, hero, mate } = setup("hero-confirm-accepted", true)
    assert(handleAction(s, "p1", { type: "attack", instanceId: hero }) === null, "アタック宣言")
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(!onField(s, mate), "コストのペンタンが場を離れた")
    assert(deckTop(s) === MATE, "ペンタンがデッキの上に戻った")
    assert(
        !s.players.p1.field.spirits.find((sp) => sp.instanceId === hero)!.isRested,
        "勇者フェニックスペンタンが回復した",
    )
}

console.log("=== 非対話（テスト・自動解決）では従来どおり自動で発動する ===")
{
    const { s, hero, mate } = setup("hero-auto", false)
    assert(handleAction(s, "p1", { type: "attack", instanceId: hero }) === null, "アタック宣言")
    assert(!s.pendingChoice, "確認は出ない")
    assert(!onField(s, mate), "コストは自動で払われる")
    assert(
        !s.players.p1.field.spirits.find((sp) => sp.instanceId === hero)!.isRested,
        "回復している",
    )
}

console.log("=== 4枚とも optional が付いている（カードデータは型検査の対象外なので明示的に見る） ===")
{
    for (const [cardId, effectId] of [
        ["BS04-022", "BS04-022-e2"],
        ["BS04-061", "BS04-061-e1"],
        ["BS05-047", "BS05-047-e2"],
        ["BS08-045", "BS08-045-e2"],
    ] as const) {
        const e = getCard(cardId).effects.find((x) => x.id === effectId)
        assert(e !== undefined, `${cardId} ${effectId} が存在する`)
        assert(
            "optional" in e! && e.optional === true,
            `${cardId} ${effectId} は optional:true（「〜することで」は任意効果）`,
        )
    }
}

// ---- コストとして疲労させるスピリットも選べる（2026-08-23 ユーザー要望。COST_MODEL.md §2）----
//
// 巨神機トールLv1-3『アタック時』は「系統：「武装」を持つ自分のスピリット1体を疲労させることで、
// このスピリットをBP+(疲労させたスピリットのBP)」。**どれを疲労させるかで増加量が変わる**のに、
// 実効BP最大が自動で選ばれていた（＝常に最大化。プレイヤーは温存を選べなかった）。

const THOR = "BS02-X07" // 巨神機トール：Lv1=1コア
const ARM_BIG = "BS03-041" // 機人アスク（武装）：Lv1 BP4000
const ARM_SMALL = "BS05-029" // 機人エムブラ（武装）：Lv1 BP2000

console.log("=== 疲労させるスピリットを選べる（選んだ方のBPだけ増える） ===")
{
    const s = createGame("thor-choose-sacrifice", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = true
    const thor = putSpirit(s, "p1", THOR, 1)
    const big = putSpirit(s, "p1", ARM_BIG, 2) // Lv1 BP4000
    const small = putSpirit(s, "p1", ARM_SMALL, 1) // Lv1 BP2000
    assert(handleAction(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(handleAction(s, "p1", { type: "attack", instanceId: thor }) === null, "アタック宣言")

    // まず発動確認（optional:true）に答えてから、犠牲の選択が出る
    assert(s.pendingChoice?.confirm === true, "発動確認が先に出る")
    assert(handleAction(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(!!s.pendingChoice, "疲労させるスピリットの選択待ちになる")
    assert(
        s.pendingChoice!.candidates.includes(big) && s.pendingChoice!.candidates.includes(small),
        "武装の2体がどちらも候補",
    )

    // 自動選択なら BP4000 の方が選ばれる。あえて BP2000 の方を選ぶ
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: small }) === null, "BPの低い方を選ぶ")
    assert(s.players.p1.field.spirits.find((sp) => sp.instanceId === small)!.isRested, "選んだ方が疲労した")
    assert(!s.players.p1.field.spirits.find((sp) => sp.instanceId === big)!.isRested, "選ばなかった方は回復状態のまま")
    const buffed = s.players.p1.field.spirits.find((sp) => sp.instanceId === thor)!.tempBpBuff
    assert(buffed === 2000, `選んだスピリットのBP分だけ増える（実際は${buffed}）`)
}

console.log("=== 非対話では従来どおり実効BP最大を疲労させる ===")
{
    const s = createGame("thor-auto-sacrifice", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = false
    const thor = putSpirit(s, "p1", THOR, 1)
    const big = putSpirit(s, "p1", ARM_BIG, 2)
    const small = putSpirit(s, "p1", ARM_SMALL, 1)
    assert(handleAction(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(handleAction(s, "p1", { type: "attack", instanceId: thor }) === null, "アタック宣言")
    assert(!s.pendingChoice, "確認も選択も出ない")
    assert(s.players.p1.field.spirits.find((sp) => sp.instanceId === big)!.isRested, "BP最大が疲労した")
    assert(!s.players.p1.field.spirits.find((sp) => sp.instanceId === small)!.isRested, "BPの低い方は回復状態")
}
