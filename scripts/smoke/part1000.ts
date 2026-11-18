// smoke パート1000（P13-02 ダーク・リブリーパー／P13-14 ダーク・ケルベロード／P13-16 聖剣の大地）
import { assert, createGame, createInstance, effectiveBp, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const REAPER = "P13-02" // ダーク・リブリーパー（紫・コスト2・Lv1 1コスト BP2000 / Lv2 3コスト BP5000）
const KERBEROAD = "P13-14" // ダーク・ケルベロード（青・Lv1 1コア BP4000 / Lv2 4コア BP7000）
const SWORD = "P13-16" // 聖剣の大地（赤白ネクサス・Lv2は2コア）
const WYARM = "BS05-005" // ワイアーム（赤・Lv1 2コア BP4000 / Lv2 3コア BP6000）
const YELLOW = "BS21-038" // ボジャノーイ（黄・バニラ。黄シンボル要員）
const RED1 = "BS01-002" // ロクケラトプス（赤・バニラ。赤シンボル要員・相手役）
const CHALICE = "BS17-063" // 黒き聖杯（紫ネクサス。疲労させる自分のネクサス役）
const HOST = "BS05-005" // 合体先（コスト4以上）
const BRAVE = "BS19-074" // 砲獣アークィドリー（白ブレイヴ・コスト4）
const HARDES = "BS01-031" // デス・ハーデス（紫・Lv1 BP4000）
const LANCE = "SD17-010" // ランスモザウルス（Lv1 BP5000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(REAPER).name === "ダーク・リブリーパー" && getCard(KERBEROAD).name === "ダーク・ケルベロード" && getCard(SWORD).name === "聖剣の大地", "対象3枚")
    assert(getCard(WYARM).levels[1]!.bp === 6000 && getCard(YELLOW).colors[0] === "yellow" && getCard(CHALICE).type === "nexus", "場面役")
}

console.log("=== P13-02 ダーク・リブリーパー：Lv2の破壊時に相手のスピリットのコア1個を相手のリザーブへ。黄シンボルありなら、ターンに1回、回復状態で残る ===")
// 相手のターン。相手のワイアーム（Lv2 BP6000）がアタックし、ダーク（BP5000）でブロックして破壊される
const blockSteps = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0]) => {
    t.act("opp", { type: "attack", instanceId: t.id("ワイアーム") })
    t.closeFlash() // アタック宣言後のフラッシュを閉じてからブロックの宣言
    t.act("me", { type: "block", instanceId: t.id("ダーク・リブリーパー") })
    t.closeFlash()
}
const oppLose1Core = ["相手.ワイアーム.疲労: false → true", "相手.ワイアーム.コア: 3 → 2", "相手.ワイアーム.Lv: 2 → 1", "相手.ワイアーム.BP: 6000 → 4000", "相手.リザーブ: 10 → 11"]
scenario({
    name: "reaper-lv2-destroyed-removes-opp-core",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: REAPER, cores: 3 }] }, opp: { spirits: [{ card: WYARM, cores: 3 }] } },
    steps: blockSteps,
    expect: [...oppLose1Core, "自分.ダーク・リブリーパー.場所: フィールド → なし", "自分.リザーブ: 10 → 13", "自分.トラッシュ: なし → ダーク・リブリーパー"],
})
scenario({
    name: "reaper-lv2-yellow-chain-stays-recovered",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: REAPER, cores: 3 }, { card: YELLOW }] }, opp: { spirits: [{ card: WYARM, cores: 3 }] } },
    steps: blockSteps,
    expect: oppLose1Core, // 黄シンボルあり：コア除去は発揮され、ダークは回復状態で残る（ブロックの疲労も戻る）
})
scenario({
    name: "reaper-lv1-no-core-removal",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: REAPER, cores: 1 }] }, opp: { spirits: [{ card: WYARM, cores: 3 }] } },
    steps: blockSteps,
    expect: ["相手.ワイアーム.疲労: false → true", "自分.ダーク・リブリーパー.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ダーク・リブリーパー"], // Lv1にはこの効果が無い
})
scenario({
    name: "reaper-lv2-soulcore-on-opp-spirit",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: REAPER, cores: 3 }] }, opp: { soulCore: "ワイアーム", spirits: [{ card: WYARM, cores: 3 }] } },
    steps: blockSteps,
    expect: [...oppLose1Core, "自分.ダーク・リブリーパー.場所: フィールド → なし", "自分.リザーブ: 10 → 13", "自分.トラッシュ: なし → ダーク・リブリーパー"], // ソウルコアを持つスピリットでも、動くのは通常コア。ソウルコアは載ったまま
})

console.log("=== P13-14 ケルベロード：【強襲：1】ネクサスを疲労させて回復。【連鎖：赤】相手は可能ならば必ずブロック ===")
scenario({
    name: "kerberoad-assault-rests-nexus-recovers",
    start: { interactive: true, me: { spirits: [{ card: KERBEROAD, cores: 4 }], nexuses: [{ card: CHALICE, cores: 0 }] }, opp: { spirits: [{ card: RED1, rested: true }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ダーク・ケルベロード") })
        t.act("me", { type: "resolveChoice", option: "発動する" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.黒き聖杯.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"], // ケルベロード自身は疲労→回復で差分なし
})
scenario({
    name: "kerberoad-assault-declined",
    start: { interactive: true, me: { spirits: [{ card: KERBEROAD, cores: 4 }], nexuses: [{ card: CHALICE, cores: 0 }] }, opp: { spirits: [{ card: RED1, rested: true }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ダーク・ケルベロード") })
        t.act("me", { type: "resolveChoice" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ダーク・ケルベロード.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "kerberoad-red-chain-must-block",
    start: { me: { spirits: [{ card: KERBEROAD, cores: 4 }, { card: RED1 }] }, opp: { spirits: [{ card: RED1, label: "ブロッカー" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ダーク・ケルベロード") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
    },
    expect: ["自分.ダーク・ケルベロード.疲労: false → true"], // 連鎖の元（強襲）が解決できなくても条件だけ満たせば発揮（Q773）
})
scenario({
    name: "kerberoad-no-red-may-take-life",
    start: { me: { spirits: [{ card: KERBEROAD, cores: 4 }] }, opp: { spirits: [{ card: RED1, label: "ブロッカー" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ダーク・ケルベロード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ダーク・ケルベロード.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== P13-16 聖剣の大地（合体スピリット絡み。場面はテンプレ形式で組む）===")
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
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function combined(s: GameState, nexusCores: number, extraOpp: string[]) {
    putNexus(s, "p1", SWORD, nexusCores)
    const host = put(s, "p1", HOST, 1)
    const brave = put(s, "p1", BRAVE, 1)
    handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(s.players.p1.field.combinedBraves.length === 1, "合体できた")
    const opps = extraOpp.map((c) => {
        const x = put(s, "p2", c, 1)
        x.isRested = true
        return x
    })
    return { host, brave, opps }
}
// Lv2『自分のアタックステップ』：合体スピリットがアタックしたとき、BP4000以下の相手のスピリット1体を破壊
{
    const s = game("sword-lv2-attack")
    const { host, opps } = combined(s, 2, [HARDES, LANCE])
    handleAction(s, "p1", { type: "nextPhase" })
    handleAction(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === opps[0]!.instanceId), "BP4000の相手スピリットが破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === opps[1]!.instanceId), "BP5000は破壊されない")
}
{
    const s = game("sword-lv1-attack")
    const { host, opps } = combined(s, 0, [HARDES])
    handleAction(s, "p1", { type: "nextPhase" })
    handleAction(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === opps[0]!.instanceId), "Lv1にはアタック時の破壊が無い")
}
// 合体していないスピリットのアタックでは発揮しない
{
    const s = game("sword-lv2-not-combined")
    putNexus(s, "p1", SWORD, 2)
    const solo = put(s, "p1", WYARM, 3)
    const target = put(s, "p2", HARDES, 1)
    target.isRested = true
    handleAction(s, "p1", { type: "nextPhase" })
    handleAction(s, "p1", { type: "attack", instanceId: solo.instanceId })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId), "合体していないスピリットのアタックでは破壊しない")
}
// Lv1･Lv2：合体スピリットが相手によって破壊されたとき、ブレイヴを残してスピリットだけ手札へ（できる＝任意）
{
    const s = game("sword-return-host")
    const { host, brave } = combined(s, 0, [])
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.phase = "attack"
    const attacker = put(s, "p2", LANCE, 5) // Lv3 BP9000。合体スピリット（ホストLv1 4000＋ブレイヴ4000）を上回る
    assert(effectiveBp(s, "p2", attacker) >= effectiveBp(s, "p1", host), "相手のアタッカーが合体スピリットより強い")
    handleAction(s, "p2", { type: "attack", instanceId: attacker.instanceId })
    while (s.isFlashTiming && s.battle) handleAction(s, s.priorityPlayer, { type: "pass" }) // フラッシュを閉じてからブロックを宣言する
    handleAction(s, "p1", { type: "block", instanceId: host.instanceId })
    for (let i = 0; i < 4 && s.pendingChoice === null; i++) handleAction(s, s.priorityPlayer, { type: "pass" })
    // 「できる」なので確認の選択待ちが出るはず。出ないなら自動で戻る実装になっている（質問欄）
    if (s.pendingChoice !== null) handleAction(s, "p1", { type: "resolveChoice", option: "発動する" })
    assert(s.players.p1.hand.includes(HOST), "ホストのスピリットだけが手札に戻る")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === brave.instanceId), "ブレイヴはスピリット状態でフィールドに残る")
}

console.log("すべてのチェックに合格しました 🎉（part1000）")
