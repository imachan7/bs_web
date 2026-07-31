// smoke パート77（「このターンの間」継続効果化 フェーズ2＝オーラ以外の3枚・回帰）
//
// フェーズ1（part76）は BP オーラ（aura.lentOnly）だったが、こちらは走査点が3つとも別:
//   - BS02-060 道化師クラン   : kind:"alsoCostGrant" → CardInstance.alsoCostsContinuous → instHasCost
//   - BS03-058 妖精ティングリー: kind:"colorAs"(target:"ownAll") → colorsAsContinuous → instHasColor
//   - BS02-064 音鳥クルーク    : kind:"familyGrant"(familyFromChoice) → spiritHasFamily が effectSources を走査
// いずれも lendSelfThisTurn（仮想発生源）＋ lentOnly:true の貸与で、
// 「効果の後に召喚したスピリットにも乗る」「発生源が破壊されても持続する」「翌ターンには消える」を固定する。
//
// クルークの旧実装は CardInstance.tempFamilies へ書き込んでいたが、**その配列を読む述語が1つも無く**
// （spiritHasFamily はカード静的な系統と familyGrant しか見ていなかった）、系統付与が実際には
// ゲームに一切影響していなかった。移行に合わせて tempFamilies は廃止した。
import {
    act,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    refreshLevelAsOverrides,
    spiritHasFamily,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { endTurn, runTurnStart } from "../../server/src/logic/PhaseManager"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import { instHasColor, instHasCost } from "../../shared/rules"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s) // 実戦では handleAction の事後フックが呼ぶ
    return inst
}

console.log("=== BS02-060 道化師クラン：コスト2扱いは継続効果（後から場に出たスピリットにも乗る） ===")
{
    const s = setup("clan-continuous-test")
    const clan = put(s, "p1", "BS02-060", 3) // 道化師クラン Lv2（黄・コスト3）
    const piyon = put(s, "p1", "BS02-049", 1) // ピヨン（黄・コスト0）
    put(s, "p1", "BS02-051", 1) // チュンポポ（黄・コスト1）→ 黄3体で条件成立

    runTurnStart(s) // 自分のスタートステップ：条件成立 → lendSelfThisTurn

    assert(instHasCost(clan, 2), "クラン自身もコスト2として扱われる")
    assert(instHasCost(piyon, 2), "場にいたピヨンもコスト2として扱われる")

    const later = put(s, "p1", "BS02-049", 1) // 効果の**後**に場に出たピヨン
    assert(instHasCost(later, 2), "効果の後に場に出たスピリットにもコスト2扱いが乗る")

    destroySpirit(s, "p1", clan.instanceId)
    refreshLevelAsOverrides(s)
    assert(instHasCost(piyon, 2), "クランが破壊されてもそのターンはコスト2扱いが持続する")
    const afterDestroy = put(s, "p1", "BS02-049", 1)
    assert(instHasCost(afterDestroy, 2), "破壊後に場に出たスピリットにも乗る（発生源は仮想発生源）")

    assert(!instHasCost(piyon, 3), "無関係なコストまで一致するようにはならない")
    endTurn(s)
    assert(!instHasCost(piyon, 2), "ターンが変わると貸与が消え、コスト2扱いも消える")
}

console.log("--- 黄が3つ未満のターンは発火せず、コスト2扱いは乗らない ---")
{
    const s = setup("clan-condition-test")
    const clan = put(s, "p1", "BS02-060", 3)
    put(s, "p1", "BS01-001", 1) // ゴラドン（赤）→ 黄はクランのみ＝1つ

    runTurnStart(s)

    assert(!instHasCost(clan, 2), "条件不成立のターンは自身にもコスト2扱いが乗らない")
    assert(s.players.p1.turnVirtualInstances.length === 0, "条件不成立なら仮想発生源も積まれない")
}

console.log("=== BS03-058 妖精ティングリー：黄扱いは継続効果（破壊されてもそのターンは持続） ===")
{
    const s = setup("tingley-continuous-test")
    const tingley = put(s, "p1", "BS03-058", 1) // 妖精ティングリー Lv1
    const goradon = put(s, "p1", "BS01-001", 1) // ゴラドン（赤）

    fireTrigger(s, "p1", tingley, "onSummon")
    refreshLevelAsOverrides(s)
    assert(instHasColor(goradon, "yellow"), "召喚時点で場にいた赤スピリットが黄としても扱われる")

    destroySpirit(s, "p1", tingley.instanceId)
    refreshLevelAsOverrides(s)
    assert(instHasColor(goradon, "yellow"), "ティングリーが破壊されてもそのターンは黄扱いが持続する")

    const later = put(s, "p1", "BS02-001", 1) // リザドエッジ（赤）を破壊後に召喚
    assert(instHasColor(later, "yellow"), "破壊後に場に出た赤スピリットも黄として扱われる")
    assert(!instHasColor(later, "blue"), "与えていない色まで付くことはない")

    assert(
        !s.players.p2.field.spirits.some((sp) => instHasColor(sp, "yellow")),
        "相手のスピリットには乗らない",
    )
    endTurn(s)
    assert(!instHasColor(goradon, "yellow"), "ターンが変わると黄扱いは消える")
}

console.log("=== BS02-064 音鳥クルーク：選んだ系統の付与は継続効果（後から出た「歌鳥」にも乗る） ===")
{
    const s = setup("kuruku-continuous-test")
    const kuruku = put(s, "p1", "BS02-064", 1) // 音鳥クルーク Lv1（歌鳥）
    const piyon = put(s, "p1", "BS02-049", 1) // ピヨン（歌鳥）
    const goradon = put(s, "p1", "BS01-001", 1) // ゴラドン（爬獣＝歌鳥ではない）

    runTurnStart(s)
    assert(s.pendingChoice !== null, "スタートステップで系統選択のpendingChoiceが立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "機人" }) === null, "系統「機人」を選ぶ")

    assert(spiritHasFamily(s, "p1", kuruku, "機人"), "クルーク自身（歌鳥）に系統が乗る")
    assert(spiritHasFamily(s, "p1", piyon, "機人"), "場にいた歌鳥にも系統が乗る")
    assert(!spiritHasFamily(s, "p1", goradon, "機人"), "歌鳥を持たないスピリットには乗らない")

    const later = put(s, "p1", "BS02-051", 1) // チュンポポ（歌鳥）を選択の**後**に召喚
    assert(spiritHasFamily(s, "p1", later, "機人"), "選択の後に場に出た歌鳥にも系統が乗る")

    destroySpirit(s, "p1", kuruku.instanceId)
    refreshLevelAsOverrides(s)
    assert(spiritHasFamily(s, "p1", piyon, "機人"), "クルークが破壊されてもそのターンは持続する")
    assert(spiritHasFamily(s, "p1", piyon, "歌鳥"), "元々の系統も当然そのまま持つ")

    endTurn(s)
    assert(!spiritHasFamily(s, "p1", piyon, "機人"), "ターンが変わると付与系統は消える")
}

console.log("--- 「歌鳥」を選んでも spiritHasFamily は自己再帰しない（familyFilter はカード静的な系統で判定） ---")
{
    const s = setup("kuruku-recursion-test")
    put(s, "p1", "BS02-064", 1)
    const goradon = put(s, "p1", "BS01-001", 1) // 歌鳥を持たない

    runTurnStart(s)
    assert(act(s, "p1", { type: "resolveChoice", option: "歌鳥" }) === null, "系統「歌鳥」自体を選ぶ")
    assert(!spiritHasFamily(s, "p1", goradon, "歌鳥"), "歌鳥を持たないスピリットは対象外のまま（無限再帰もしない）")
}
