// smoke パート266（BS10-019 土星神龍クロノ・ボロスの【合体時】Lv2･Lv3『破壊時』。2026-08-29）
//
// 効果文：「相手は、相手のフィールド/リザーブ/トラッシュに残るコアを合計5個以下になるようにボイドに置く。
//           その後、自分は、自分の…を合計5個以下になるようにボイドに置く」
//
// 新設した機構:
//   - action:"coresDownToLimit"（server/src/logic/actions/cores.ts）：limit（残す合計の上限）と
//     sides（["opponent","own"]＝相手→その後 自分）。取り先の候補作り・1個取り・非対話の自動順は
//     opponentCoresToVoidByTotal（ブラッディレイン）と**共通のヘルパー**を使う
//     （coreSourcesOf / takeOneCoreToVoid / autoTakeCoresToVoid / totalCoresOf）
//   - 誰が選ぶかは CHOOSER_RULES §1（それぞれの持ち主）。requestChoice の chooserPid で差し替える
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・効果文を機械検証してから使う。
import { act, assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const CHRONO = "BS10-019" // 土星神龍クロノ・ボロス
const VANILLA = "BS01-002" // ロクケラトプス（バニラ＝耐性で邪魔しない）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const c = getCard(CHRONO)
    assert(c.name === "土星神龍クロノ・ボロス" && c.type === "spirit", "BS10-019は土星神龍クロノ・ボロス（スピリット）")
    assert(c.effect.includes("【合体時】") && c.effect.includes("合計5個以下"), "効果文が【合体時】と「合計5個以下」を含む")
    assert(c.levels[1]!.cores === 3 && c.levels[2]!.cores === 6, "Lv2は3コア・Lv3は6コア")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effect === "", "BS01-002はロクケラトプス（バニラ）")
}

function totalOf(s: GameState, pid: PlayerId): number {
    const p = s.players[pid]
    return (
        p.reserve +
        p.trashCores +
        p.field.spirits.reduce((n, x) => n + x.cores, 0) +
        p.field.nexuses.reduce((n, x) => n + x.cores, 0)
    )
}

// 両者にコアを積んだ場を作る。combined=true のときクロノ・ボロスにブレイヴを合体させる
function setup(seed: string, opts: { interactive?: boolean; cores?: number; combined?: boolean } = {}): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = opts.interactive ?? false
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.field.spirits = []
        p.field.nexuses = []
        p.reserve = 5
        p.trashCores = 3
        p.field.spirits.push(createInstance(VANILLA, s.turn, 4))
    }
    const host = createInstance(CHRONO, s.turn, opts.cores ?? 3) // 既定は Lv2
    if (opts.combined) {
        // 合体しているブレイヴの実体は combinedBraves に置き、ホストからは braveRefs で指す（BRAVE.md §2.3）
        const brave = createInstance(VANILLA, s.turn, 0)
        brave.braveCombined = true
        s.players.p1.field.combinedBraves.push(brave)
        host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    }
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)
    return s
}

console.log("=== 非対話：相手→自分の順に、それぞれ合計5個以下になる ===")
{
    const s = setup("chrono-auto")
    const src = s.players.p1.field.spirits[1]!
    assert(totalOf(s, "p1") === 15 && totalOf(s, "p2") === 12, "前提：p1は15個（5+3+4+3）・p2は12個")

    resolveAction(s, "p1", src, { type: "coresDownToLimit", limit: 5, sides: ["opponent", "own"] })

    assert(s.pendingChoice === null, "非対話では選択待ちにならない")
    assert(totalOf(s, "p2") <= 5, "相手のコア合計が5個以下になる")
    assert(totalOf(s, "p1") <= 5, "その後、自分のコア合計も5個以下になる")
    // 12→5 の7個は リザーブ5個＋トラッシュ2個 で足りるので、フィールドには手を付けない
    assert(s.players.p2.reserve === 0 && s.players.p2.trashCores === 1, "自動順はリザーブ→トラッシュから先に取る")
    assert(s.players.p2.field.spirits[0]!.cores === 4, "ゾーンで足りるならフィールドのコアは減らない")
}

console.log("=== 既に5個以下の側は減らないが、もう一方は処理される ===")
{
    const s = setup("chrono-already-under")
    const src = s.players.p1.field.spirits[1]!
    s.players.p2.reserve = 1
    s.players.p2.trashCores = 0
    s.players.p2.field.spirits[0]!.cores = 2
    assert(totalOf(s, "p2") === 3, "前提：p2は3個（上限以下）")

    resolveAction(s, "p1", src, { type: "coresDownToLimit", limit: 5, sides: ["opponent", "own"] })

    assert(totalOf(s, "p2") === 3, "上限以下の側は1個も減らない")
    assert(totalOf(s, "p1") <= 5, "もう一方（自分）は上限まで減る＝片方で止まらない")
}

console.log("=== 対話：取り先は1個ずつ**コアを失う側**が選ぶ（相手→自分で選択者が入れ替わる） ===")
{
    const s = setup("chrono-chooser", { interactive: true })
    const src = s.players.p1.field.spirits[1]!
    resolveAction(s, "p1", src, { type: "coresDownToLimit", limit: 5, sides: ["opponent", "own"] })

    assert(s.pendingChoice?.kind === "option", "選択肢固定式（ゾーンとフィールドの個体を並べる）")
    assert(s.pendingChoice?.pid === "p2", "1段目を選ぶのはコアを失う側（p2）")
    assert(s.pendingChoice?.actorPid === "p1", "解決は発生源の持ち主（p1）の効果として行う")
    const opts = s.pendingChoice?.options ?? []
    assert(opts.includes("リザーブ") && opts.includes("トラッシュ") && opts.includes("ロクケラトプス"), "ゾーンとフィールドの個体が候補に出る")

    assert(act(s, "p1", { type: "resolveChoice", option: "リザーブ" }) !== null, "発生源の持ち主は1段目を選べない")

    // p2 は 12 → 5 なので7回選ぶ。毎回フィールドの個体を優先して選んでも構わない
    let guard = 0
    while (s.pendingChoice?.pid === "p2" && guard++ < 20) {
        const choices = s.pendingChoice?.options ?? []
        const pick = choices.includes("ロクケラトプス") ? "ロクケラトプス" : choices[0]!
        assert(act(s, "p2", { type: "resolveChoice", option: pick }) === null, "p2が取り先を選べる")
    }
    assert(totalOf(s, "p2") === 5, "相手側はちょうど5個で止まる（取りすぎない）")

    assert(s.pendingChoice !== null && s.pendingChoice?.pid === "p1", "その後、2段目は自分（p1）が選ぶ")
    guard = 0
    while (s.pendingChoice !== null && guard++ < 20) {
        const choices = s.pendingChoice?.options ?? []
        assert(act(s, "p1", { type: "resolveChoice", option: choices[0]! }) === null, "p1が取り先を選べる")
    }
    assert(totalOf(s, "p1") === 5, "自分側もちょうど5個で止まる")
    assert(s.pendingChoice === null, "両方が終われば選択待ちは残らない")
}

console.log("=== 対話：合計がちょうど上限の側には選択を求めない（境界） ===")
{
    const s = setup("chrono-exact-limit", { interactive: true })
    const src = s.players.p1.field.spirits[1]!
    s.players.p2.reserve = 1
    s.players.p2.trashCores = 0
    s.players.p2.field.spirits[0]!.cores = 4
    assert(totalOf(s, "p2") === 5, "前提：p2はちょうど5個")

    resolveAction(s, "p1", src, { type: "coresDownToLimit", limit: 5, sides: ["opponent", "own"] })

    assert(s.pendingChoice?.pid === "p1", "ちょうど上限の相手には聞かず、いきなり2段目（自分）の選択になる")
    assert(totalOf(s, "p2") === 5, "ちょうど上限の側のコアは1個も減らない")
}

console.log("=== 誘発：【合体時】Lv2以上で『破壊時』に発揮する ===")
{
    const s = setup("chrono-trigger", { cores: 3, combined: true })
    const src = s.players.p1.field.spirits[1]!
    destroySpirit(s, "p1", src.instanceId)
    assert(totalOf(s, "p2") <= 5, "合体中のLv2なら相手のコアが5個以下まで減る")
    assert(totalOf(s, "p1") <= 5, "自分のコアも5個以下まで減る")
}

console.log("=== 誘発の絞り込み：合体していなければ発揮しない ===")
{
    const s = setup("chrono-not-combined", { cores: 3, combined: false })
    const src = s.players.p1.field.spirits[1]!
    const beforeP2 = totalOf(s, "p2")
    destroySpirit(s, "p1", src.instanceId)
    assert(totalOf(s, "p2") === beforeP2, "合体していなければ相手のコアは1個も減らない（【合体時】のゲート）")
}

console.log("=== 誘発の絞り込み：合体していてもLv1では発揮しない ===")
{
    const s = setup("chrono-lv1", { cores: 1, combined: true })
    const src = s.players.p1.field.spirits[1]!
    const beforeP2 = totalOf(s, "p2")
    destroySpirit(s, "p1", src.instanceId)
    assert(totalOf(s, "p2") === beforeP2, "Lv1では相手のコアは1個も減らない（levels:[2,3]のゲート）")
}
