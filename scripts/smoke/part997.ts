// smoke パート997（P13-04 ダーク・スノパルド／P13-09 ハンマブレイク：【連鎖】の条件あり・なしと、効果文だけから決めた期待値）
import { assert, createGame, createInstance, effectiveBp, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const SNOW = "P13-04" // ダーク・スノパルド（白・コスト4・Lv1コスト1・Lv1/Lv2 BP3000/5000）
const HAMMER = "P13-09" // ハンマブレイク（赤ブレイヴ・コスト3）
const GREEN = "BS17-019" // テリムック（緑・コスト0・バニラ。緑シンボル要員）
const HEAVY = "BS05-031" // 銃騎士ヘビーバレル（白・Lv1コスト2・Lv1 BP4000）
const BERSERK = "BS01-074" // バーサーカー・ガン（白・Lv1コスト1・BP1000）
const REMOVE = "BS17-075" // ストラングルフォッグ（紫マジック・フラッシュ：相手のスピリットのコア1個を相手のリザーブへ）
const BOOST = "BS20-073" // パワーブースト（赤マジック・フラッシュ：自分のスピリット1体をBP+3000）
const BLUE1 = "BS17-046" // オリクス盗賊団（青・コスト1・バニラ。青シンボル要員）
const RED1 = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SNOW).name === "ダーク・スノパルド" && getCard(SNOW).levels[0]!.cores === 1, "SNOWはLv1コスト1")
    assert(getCard(HEAVY).name === "銃騎士ヘビーバレル" && getCard(HEAVY).levels[0]!.cores === 2, "HEAVYはLv1コスト2")
    assert(getCard(BERSERK).name === "バーサーカー・ガン" && getCard(BERSERK).levels[0]!.cores === 1, "BERSERKはLv1コスト1")
    assert(getCard(GREEN).name === "テリムック" && getCard(GREEN).colors[0] === "green", "GREENは緑")
    assert(getCard(REMOVE).name === "ストラングルフォッグ" && getCard(BOOST).name === "パワーブースト", "マジック2枚")
}

// 相手（ターンプレイヤー）が自分のスピリットのコアを1個リザーブへ置くマジックを使う場面。SNOW は相手側に置く（「スピリットすべて」は両陣営に効く）
const castLines = ["相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4", "相手.手札: ストラングルフォッグ → なし", "相手.トラッシュ: なし → ストラングルフォッグ"]
const castSteps = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0]) => {
    t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    t.closeFlash()
}

scenario({
    name: "snow-chain-green-1core-spirit-stays",
    start: { turn: "opp", opp: { hand: [REMOVE], spirits: [{ card: SNOW }, { card: GREEN }] }, me: { spirits: [{ card: BERSERK }] } },
    steps: castSteps,
    expect: castLines, // 緑シンボルあり：Lv1コスト1のスピリットはコア1個から減らず、0個で消滅もしない
})
scenario({
    name: "snow-chain-green-lv1cost2-stays",
    start: { turn: "opp", opp: { hand: [REMOVE], spirits: [{ card: SNOW }, { card: GREEN }] }, me: { spirits: [{ card: HEAVY, cores: 2 }] } },
    steps: castSteps,
    expect: castLines, // Lv1コスト2のスピリットは2個から減らない
})
scenario({
    name: "snow-no-green-core-removed",
    start: { turn: "opp", opp: { hand: [REMOVE], spirits: [{ card: SNOW }] }, me: { spirits: [{ card: HEAVY, cores: 2 }] } },
    steps: castSteps,
    expect: [...castLines, "自分.銃騎士ヘビーバレル.コア: 2 → 1", "自分.リザーブ: 10 → 11"], // 緑シンボルなし：連鎖は発揮されず通常どおり減る
})
scenario({
    name: "snow-no-green-1core-destroyed",
    start: { turn: "opp", opp: { hand: [REMOVE], spirits: [{ card: SNOW }] }, me: { spirits: [{ card: BERSERK }] } },
    steps: castSteps,
    expect: [...castLines, "自分.バーサーカー・ガン.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン"], // コア0個で消滅
})
scenario({
    name: "snow-green-soulcore-spirit-stays",
    start: { turn: "opp", opp: { hand: [REMOVE], spirits: [{ card: SNOW }, { card: GREEN }] }, me: { soulCore: "銃騎士ヘビーバレル", spirits: [{ card: HEAVY, cores: 2 }] } },
    steps: castSteps,
    expect: castLines, // ソウルコアあり：2個（ソウルコア含む）から減らない
})
scenario({
    name: "snow-no-green-soulcore-normal-core-moves",
    start: { turn: "opp", opp: { hand: [REMOVE], spirits: [{ card: SNOW }] }, me: { soulCore: "銃騎士ヘビーバレル", spirits: [{ card: HEAVY, cores: 2 }] } },
    steps: castSteps,
    expect: [...castLines, "自分.銃騎士ヘビーバレル.コア: 2 → 1", "自分.リザーブ: 10 → 11"], // ソウルコアは動かず通常コアだけがリザーブへ（ソウルコアの行は変わらない）
})

// 1節目：BP4000以下のスピリットのアタックではお互いのライフが減らない（連鎖と無関係）
scenario({
    name: "snow-attack-bp4000-no-life-loss",
    start: { me: { spirits: [{ card: SNOW }, { card: HEAVY, cores: 2 }] }, opp: { spirits: [{ card: BERSERK, rested: true }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("銃騎士ヘビーバレル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.銃騎士ヘビーバレル.疲労: false → true"], // ライフもリザーブも動かない
})
scenario({
    name: "snow-attack-bp5000-life-loss",
    start: { me: { spirits: [{ card: SNOW }, { card: "SD17-010" }] }, opp: { spirits: [{ card: BERSERK, rested: true }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランスモザウルス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ランスモザウルス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"], // BP5000は対象外
})

console.log("=== P13-09 ハンマブレイク：青シンボルがあるとき、このターン相手の「BPを+する」効果は発揮されない ===")
function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => RED1)
    s.players.p2.deck = Array.from({ length: 40 }, () => RED1)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// 自分のターンに p1 がブレイヴを召喚し、p2 がフラッシュで自分のスピリットをBP+3000する。解決まで優先権を渡し合う
function hammerThenOppBoost(seed: string, ownBlue: boolean) {
    const s = game(seed)
    put(s, "p1", ownBlue ? BLUE1 : RED1, 2)
    const target = put(s, "p2", RED1)
    s.players.p1.hand = [HAMMER]
    s.players.p2.hand = [BOOST]
    const before = effectiveBp(s, "p2", target)
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    handleAction(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: target.instanceId })
    for (let i = 0; i < 4 && s.pendingChoice === null; i++) handleAction(s, s.priorityPlayer, { type: "pass" })
    return { s, target, before }
}
{
    const { s, target, before } = hammerThenOppBoost("p13-09-blue", true)
    assert(effectiveBp(s, "p2", target) === before, "青シンボルあり：相手のパワーブーストのBP+は発揮されない")
}
{
    const { s, target, before } = hammerThenOppBoost("p13-09-noblue", false)
    assert(effectiveBp(s, "p2", target) === before + 3000, "青シンボルなし（連鎖不成立）：相手のBP+は通常どおり効く")
}

console.log("すべてのチェックに合格しました 🎉（part997）")
