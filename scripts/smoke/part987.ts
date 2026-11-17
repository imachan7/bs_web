// smoke パート987（ぐるみパンダ BS21-063【合体時】「このスピリットが相手によって破壊されたとき、ボイドからコア1個を自分のライフに置く」。
// 相手の効果・バトルによる破壊でライフが増え、自分の効果・ブレイヴだけの破壊では増えないことを確かめる）
import { act, assert, effectiveBp, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameAction, GameState } from "./helpers"

const PANDA = "BS21-063" // ぐるみパンダ（黄ブレイヴ・コスト4以上のスピリットに合体）
const HOST = "BS01-013" // タウロスナイト（赤・コスト4・BP3000。合体スピリット）
const ENEMY = "BS17-026" // ジャドバルジャー（緑・コスト5・BP7000。バトルでホストを破壊する相手のスピリット）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(PANDA).name === "ぐるみパンダ" && getCard(PANDA).type === "brave" && getCard(PANDA).cost === 4, "PANDAはコスト4のブレイヴ")
    assert(getCard(HOST).name === "タウロスナイト" && getCard(HOST).type === "spirit" && getCard(HOST).cost === 4, "HOSTはコスト4のスピリット")
    assert(getCard(ENEMY).name === "ジャドバルジャー" && getCard(ENEMY).type === "spirit", "ENEMYはスピリット")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function build(seed: string, withEnemy: boolean): { s: GameState; host: ReturnType<typeof createInstance>; enemy: ReturnType<typeof createInstance> | null } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.players.p1.life = 5
    s.players.p2.life = 5
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)

    const host = createInstance(HOST, s.turn - 1, 1)
    s.players.p1.field.spirits.push(host)
    const brave = createInstance(PANDA, s.turn - 1, 0)
    brave.braveCombined = true
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]

    let enemy: ReturnType<typeof createInstance> | null = null
    if (withEnemy) {
        enemy = createInstance(ENEMY, s.turn - 1, 1)
        enemy.isRested = false // 疲労状態で召喚されるカードだが、ブロックさせるため起こしておく
        s.players.p2.field.spirits.push(enemy)
    }
    refreshLevelAsOverrides(s)
    return { s, host, enemy }
}

// 選択待ちが出たら先頭の候補で答え続ける（順番・対象の選択は今回の確かめ先ではない）
function settle(s: GameState): string[] {
    const trace: string[] = []
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        trace.push(`${pc.pid}:${pc.kind}:${pc.prompt}[${(pc.options ?? []).join("|")}]`)
        // 任意の選択（ブレイヴを残すか）は「残さない」＝スキップで答える。ホストと一緒に破壊される側を確かめる
        const a: GameAction = pc.optional
            ? { type: "resolveChoice" }
            : pc.kind === "target"
                ? { type: "resolveChoice", instanceId: pc.candidates[0]! }
                : pc.kind === "card"
                  ? { type: "resolveChoice", cardIndex: pc.cardIndices?.[0] ?? 0 }
                  : { type: "resolveChoice", option: pc.options?.[0] ?? "" }
        const err = act(s, pc.pid, a)
        assert(err === null, `選択への応答が通る（拒否: ${err}）`)
    }
    return trace
}

console.log("=== 1. 相手の効果で合体スピリットごと破壊 → 自分のライフ +1 ===")
{
    const { s } = build("panda-1", false)
    resolveAction(s, "p2", null, { type: "destroy", count: 1, all: true } as never, undefined, undefined, "magic")
    const trace = settle(s)
    assert(s.players.p1.field.spirits.length === 0, "ホストのタウロスナイトが破壊された")
    assert(s.players.p1.life === 6, `ぐるみパンダの効果でライフが 5 → 6（現在 ${s.players.p1.life}。経過: ${trace.join(" / ")}）`)
}

console.log("=== 2. 相手のスピリットとのバトルで破壊 → 自分のライフ +1 ===")
{
    const { s, host, enemy } = build("panda-2", true)
    s.phase = "attack"
    const err = act(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(err === null, `ホストでアタックできる（拒否: ${err}）`)
    // アタックのフラッシュの優先権を渡しながら、ブロック宣言の段まで進める
    let blockErr: string | null = "未実行"
    for (let i = 0; i < 4 && blockErr !== null; i++) {
        blockErr = act(s, "p2", { type: "block", instanceId: enemy!.instanceId })
        if (blockErr !== null) act(s, s.priorityPlayer ?? "p1", { type: "pass" })
    }
    assert(blockErr === null, `相手のスピリットでブロックできる（拒否: ${blockErr}）`)
    // ブロック後のバトルは優先権の受け渡し（pass）で進む。選択待ちが出たら settle で答える
    const trace: string[] = []
    for (let i = 0; i < 8 && s.players.p1.field.spirits.length > 0; i++) {
        trace.push(...settle(s))
        if (s.players.p1.field.spirits.length === 0) break
        const pe = act(s, s.priorityPlayer ?? "p1", { type: "pass" })
        trace.push(`pass:${s.priorityPlayer}:${s.phase}:${pe}`)
    }
    assert(s.players.p1.field.spirits.length === 0, `バトルでホストのタウロスナイトが破壊された（経過: ${trace.join(" / ")}）`)
    assert(s.players.p1.life === 6, `相手のスピリットとのバトルで破壊されたのでライフ 5 → 6（現在 ${s.players.p1.life}。経過: ${trace.join(" / ")}）`)
}

console.log("=== 3. 自分の効果で合体スピリットを破壊 → ライフは増えない ===")
{
    const { s } = build("panda-3", false)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, all: true, side: "own" } as never, undefined, undefined, "magic")
    const trace = settle(s)
    assert(s.players.p1.field.spirits.length === 0, "自分の効果でホストが破壊された（前提）")
    assert(s.players.p1.life === 5, `自分の効果による破壊ではライフ据え置き 5（現在 ${s.players.p1.life}。経過: ${trace.join(" / ")}）`)
}

console.log("=== 4. 相手の効果でブレイヴだけを破壊 → ライフは増えない ===")
{
    const { s } = build("panda-4", false)
    resolveAction(s, "p2", null, { type: "destroyBrave", allHosts: true } as never, undefined, undefined, "magic")
    const trace = settle(s)
    assert(s.players.p1.field.combinedBraves.length === 0, "ブレイヴのぐるみパンダだけが破壊された（前提）")
    assert(s.players.p1.field.spirits.length === 1, "ホストのタウロスナイトは場に残った")
    assert(s.players.p1.life === 5, `「このスピリット」は破壊されていないのでライフ据え置き 5（現在 ${s.players.p1.life}。経過: ${trace.join(" / ")}）`)
}

console.log("すべてのチェックに合格しました 🎉（part987）")
