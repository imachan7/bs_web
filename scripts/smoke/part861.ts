// smoke パート861（BS23 白バッチ 028・030・033・034。効果文だけを根拠にした期待値。BS23_PLAN §1 の Q4524〜Q4526 を含む）
// 期待値役の作。実装側の都合で期待値を直さないこと（食い違いは解釈の割れ目としてユーザーへ）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"

const ANAGU = "BS23-028"
const MACK = "BS23-030"
const MINO = "BS23-033"
const NEGA = "BS23-034"
const ISS = "BS23-036"
const VAN = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000）
const GUN = "BS01-074" // バーサーカー・ガン（白・コスト1・効果なし）
const MAD = "BS17-010" // マッドーロ（紫・効果なし）
const TERI = "BS17-019" // テリムック（緑・効果なし）
const HARI = "BS21-020" // ハリモグリ（緑・効果なし・Lv2 3コア BP6000）
const DEATH = "BS01-031" // デス・ハーデス（紫・効果なし・Lv2 4コア BP7000）
const BRAVE = "BS23-063" // 光輪剣エンジェルハイロゥ（剣刃・合体条件コスト4以上・合体後の効果なし）
const NEX = ["BS06-089", "BS11-072", "BS14-085"] // 効果が今回の場面に触れないネクサス

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string, string][] = [
        [ANAGU, "アナグパンツァー", "spirit"], [MACK, "砲撃機士マックリヤ", "spirit"], [MINO, "機甲剣聖ミノタウロス", "spirit"],
        [NEGA, "ネガ・テュポーン", "spirit"], [ISS, "大近衛機ISS", "spirit"], [VAN, "ロクケラトプス", "spirit"],
        [GUN, "バーサーカー・ガン", "spirit"], [MAD, "マッドーロ", "spirit"], [TERI, "テリムック", "spirit"],
        [HARI, "ハリモグリ", "spirit"], [DEATH, "デス・ハーデス", "spirit"], [BRAVE, "光輪剣エンジェルハイロゥ", "brave"],
        [NEX[0]!, "鎖縛の武舞台", "nexus"], [NEX[1]!, "未完成の古代戦艦：船尾", "nexus"], [NEX[2]!, "賛美するパイプオルガン", "nexus"],
    ]
    for (const [id, name, type] of names) assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}`)
    assert(getCard(VAN).cost === 1 && getCard(GUN).cost === 1, "VAN・GUNはコスト1")
    assert(getCard(GUN).colors.join() === "white" && getCard(MAD).colors.join() === "purple" && getCard(TERI).colors.join() === "green", "GUN白・MAD紫・TERI緑")
    assert(getCard(HARI).levels.find((l) => l.level === 2)?.bp === 6000 && getCard(DEATH).levels.find((l) => l.level === 2)?.bp === 7000, "HARI Lv2=6000／DEATH Lv2=7000")
    assert(getCard(ANAGU).levels[0]!.bp === 2000 && getCard(NEGA).levels[0]!.bp === 5000, "アナグ Lv1 2000／ネガ Lv1 5000")
}

const join = (...ids: string[]) => ids.map((i) => getCard(i).name).sort().join("、")

// ───────────── 028 アナグパンツァー ─────────────
// 防御側の自分が 028 でブロックする。ブロック宣言後のフラッシュを閉じずに盤面を見る
function anaguBlock(name: string, mine: { card: string; label: string }[], opp: { card: string; label: string }[], expect: string[], soul = false) {
    scenario({
        name,
        start: {
            turn: "opp",
            me: { spirits: [{ card: ANAGU, label: "アナグ" }, ...mine.map((m) => ({ card: m.card, label: m.label }))], ...(soul ? { soulCore: "リザーブ" } : {}) },
            opp: { spirits: [{ card: VAN, label: "攻" }, ...opp.map((m) => ({ card: m.card, label: m.label }))] },
        },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("攻") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("アナグ") })
        },
        expect: ["相手.攻.疲労: false → true", "自分.アナグ.疲労: false → true", ...expect],
    })
}

console.log("=== 1. 028：ブロック時 BP+3000。紫と緑のシンボルがあれば連鎖で両方 ===")
const drew = ["自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39"]
const core = ["自分.アナグ.コア: 1 → 2", "自分.アナグ.Lv: 1 → 2"]
anaguBlock("anagu-both", [{ card: MAD, label: "紫" }, { card: TERI, label: "緑" }], [], [...drew, ...core, "自分.アナグ.BP: 2000 → 6000"])
anaguBlock("anagu-purple", [{ card: MAD, label: "紫" }], [], [...drew, "自分.アナグ.BP: 2000 → 5000"])
anaguBlock("anagu-green", [{ card: TERI, label: "緑" }], [], [...core, "自分.アナグ.BP: 2000 → 6000"])
// ソウルコアはボイドから置くコアに関係しない（SOULCORE §1）
anaguBlock("anagu-green-soul", [{ card: TERI, label: "緑" }], [], [...core, "自分.アナグ.BP: 2000 → 6000"], true)
// 相手の紫/緑シンボルは数えない
anaguBlock("anagu-none", [], [{ card: MAD, label: "相紫" }, { card: TERI, label: "相緑" }], ["自分.アナグ.BP: 2000 → 5000"])

// ───────────── 030 マックリヤ ─────────────
console.log("=== 2. 030：Lv2 フラッシュ。疲労してアタックしている合体していない相手を手札に戻す ===")
function mackCase(name: string, cores: number, rested: boolean, expect: string[], ok: boolean) {
    scenario({
        name,
        start: { turn: "opp", me: { spirits: [{ card: MACK, cores, rested, label: "マ" }] }, opp: { spirits: [{ card: VAN, label: "攻" }] } },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("攻") })
            const action = { type: "activateAbility", instanceId: t.id("マ"), effectId: "BS23-030-e1" } as const
            if (ok) t.act("me", action)
            else t.actRejected("me", action)
        },
        expect,
    })
}
mackCase("mack-ok", 2, false, ["自分.マ.疲労: false → true", "相手.攻.場所: フィールド → なし", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"], true)
mackCase("mack-lv1", 1, false, ["相手.攻.疲労: false → true"], false)
mackCase("mack-rested", 2, true, ["相手.攻.疲労: false → true"], false)
scenario({
    name: "mack-own-attack",
    start: { me: { spirits: [{ card: MACK, cores: 2, label: "マ" }, { card: VAN, label: "自攻" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自攻") })
        t.actRejected("me", { type: "activateAbility", instanceId: t.id("マ"), effectId: "BS23-030-e1" })
    },
    expect: ["自分.自攻.疲労: false → true"],
})

// 合体しているアタッカーは対象外。プレイ中の状態を直接組む（合体は combineBrave の結果が実装依存なので assert だけ見る）
function duel(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        s.players[pid].reserve = 10
        s.players[pid].deck = Array.from({ length: 40 }, () => VAN)
        s.players[pid].hand = []
    }
    return s
}
function place(s: GameState, pid: PlayerId, card: string, cores: number, rested = false) {
    const inst = createInstance(card, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function turnOf(s: GameState, pid: PlayerId) {
    s.turnPlayer = pid
    s.priorityPlayer = pid
    s.phase = "main"
}

console.log("=== 3. 030：合体しているアタッカーは戻せない（対照は 2 の mack-ok） ===")
{
    const s = duel("mack-combined")
    turnOf(s, "p2")
    const mack = place(s, "p1", MACK, 2)
    const host = place(s, "p2", "BS20-028", 1) // 近衛機オース・ミー（武装）。ブレイヴの合体条件に使う
    const brave = place(s, "p2", "BS23-061", 1) // ファントムジェッター（合体条件：武装）
    assert(act(s, "p2", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "前提：相手が合体できる")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "前提：相手がアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: host.instanceId }) === null, "前提：合体スピリットがアタック")
    const err = act(s, "p1", { type: "activateAbility", instanceId: mack.instanceId, effectId: "BS23-030-e1" })
    assert(err !== null, "合体しているアタッカーには起動できない")
    assert(!s.players.p1.field.spirits.some((x) => x.isRested && x.instanceId === mack.instanceId), "マックリヤは疲労していない")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === host.instanceId) && s.players.p2.hand.length === 0, "相手のホストは場に残り、手札は増えない")
}

// ───────────── 033 ミノタウロス（【合体時】Lv2 アタック時のみ） ─────────────
console.log("=== 4. 033：【合体時】Lv2『アタック時』BP6000以下の相手のスピリット1体を手札に戻す ===")
function minoAttack(seed: string, opts: { hostCores: number; combine: boolean; targets: { card: string; cores: number }[] }) {
    const s = duel(seed)
    turnOf(s, "p1")
    const host = place(s, "p1", MINO, opts.hostCores)
    if (opts.combine) {
        const brave = place(s, "p1", BRAVE, 1)
        assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, `${seed}：合体できる`)
    }
    for (const x of opts.targets) place(s, "p2", x.card, x.cores)
    assert(act(s, "p1", { type: "nextPhase" }) === null, `${seed}：アタックステップへ`)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, `${seed}：アタック宣言`)
    return s
}
const onField = (s: GameState, pid: PlayerId, card: string) => s.players[pid].field.spirits.some((x) => x.cardId === card)
{
    const s = minoAttack("mino-lv2-6000", { hostCores: 3, combine: true, targets: [{ card: HARI, cores: 3 }, { card: DEATH, cores: 4 }] })
    assert(!onField(s, "p2", HARI) && s.players.p2.hand.includes(HARI), "BP6000のハリモグリは手札に戻る（以下）")
    assert(onField(s, "p2", DEATH), "BP7000のデス・ハーデスは戻らない")
}
{
    const s = minoAttack("mino-lv2-7000only", { hostCores: 3, combine: true, targets: [{ card: DEATH, cores: 4 }] })
    assert(onField(s, "p2", DEATH) && s.players.p2.hand.length === 0, "BP7000だけなら何も戻らない")
}
{
    const s = minoAttack("mino-lv1", { hostCores: 1, combine: true, targets: [{ card: HARI, cores: 3 }] })
    assert(onField(s, "p2", HARI) && s.players.p2.hand.length === 0, "Lv1 の合体では発揮しない")
}
{
    const s = minoAttack("mino-nocombine", { hostCores: 3, combine: false, targets: [{ card: HARI, cores: 3 }] })
    assert(onField(s, "p2", HARI) && s.players.p2.hand.length === 0, "合体していなければ発揮しない")
}

// ───────────── 034 ネガ・テュポーン ─────────────
console.log("=== 5. 034：召喚時 相手のネクサス3つを手札に戻す。連鎖［紫］でドロー（Lv2 から自身も紫） ===")
const nexusBounce = [
    "相手.N1.場所: ネクサス → なし", "相手.N2.場所: ネクサス → なし", "相手.N3.場所: ネクサス → なし",
    `相手.手札: なし → ${join(...NEX)}`,
]
const newNega = (cores: number, bp: number, lv: number) => [
    "自分.ネガ・テュポーン.場所: なし → フィールド", "自分.ネガ・テュポーン.疲労: なし → false", `自分.ネガ・テュポーン.コア: なし → ${cores}`,
    `自分.ネガ・テュポーン.Lv: なし → ${lv}`, `自分.ネガ・テュポーン.BP: なし → ${bp}`,
]
function negaSummon(name: string, mine: string[], level: number | undefined, expect: string[], withNexus: boolean) {
    scenario({
        name,
        start: {
            me: { hand: [NEGA], reserve: 15, spirits: mine.map((c, i) => ({ card: c, label: `脇${i}` })), nexuses: [{ card: NEX[0]!, cores: 0, label: "自N" }] },
            opp: { nexuses: withNexus ? NEX.map((c, i) => ({ card: c, cores: 0, label: `N${i + 1}` })) : [] },
        },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0, ...(level ? { level } : {}) })
        },
        expect,
    })
}
// 白シンボル1つで軽減1（コスト5→4）、Lv1 の維持コア1個：リザーブ 15→10、トラッシュのコア +4
const pay4 = ["自分.リザーブ: 15 → 10", "自分.トラッシュのコア: 0 → 4"]
// 紫シンボルも軽減に使えるので、紫の脇役がいるときも 5→4
negaSummon("nega-summon-purple", [MAD], undefined, [...pay4, ...newNega(1, 5000, 1), ...nexusBounce, "自分.手札: ネガ・テュポーン → ロクケラトプス", "自分.デッキ枚数: 40 → 39"], true)
negaSummon("nega-summon-nopurple", [GUN], undefined, [...pay4, ...newNega(1, 5000, 1), ...nexusBounce, "自分.手札: ネガ・テュポーン → なし"], true)
// Lv2 で召喚：コア3個。自身が紫としても扱われるので連鎖が出る。軽減は白シンボル1つ（GUN）：15→15-4-3=8
negaSummon("nega-summon-lv2", [GUN], 2, ["自分.リザーブ: 15 → 8", "自分.トラッシュのコア: 0 → 4", ...newNega(3, 6000, 2), "自分.手札: ネガ・テュポーン → ロクケラトプス", "自分.デッキ枚数: 40 → 39"], false)

console.log("=== 6. 034：相手のアタック時 ボイドから紫のスピリットへコア1個、自身は回復 ===")
function negaDefend(name: string, me: { spirits: { card: string; label: string; cores?: number; rested?: boolean }[]; soulCore?: string }, expect: string[]) {
    scenario({
        name,
        start: { turn: "opp", me: { spirits: me.spirits, ...(me.soulCore ? { soulCore: me.soulCore } : {}) }, opp: { spirits: [{ card: VAN, label: "攻" }] } },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("攻") })
        },
        expect: ["相手.攻.疲労: false → true", ...expect],
    })
}
const nega1 = { card: NEGA, label: "ネガ", rested: true }
negaDefend("nega-attack-step", { spirits: [nega1, { card: MAD, label: "紫" }] }, ["自分.紫.コア: 1 → 2", "自分.ネガ.疲労: true → false"])
negaDefend("nega-attack-step-soul", { spirits: [nega1, { card: MAD, label: "紫" }], soulCore: "リザーブ" }, ["自分.紫.コア: 1 → 2", "自分.ネガ.疲労: true → false"])
// Lv2 の自身は紫でもあるので、紫のスピリットが自身だけならコアは自身へ（3→4 で Lv3）
negaDefend("nega-attack-step-lv2", { spirits: [{ card: NEGA, label: "ネガ", cores: 3, rested: true }] }, [
    "自分.ネガ.コア: 3 → 4", "自分.ネガ.Lv: 2 → 3", "自分.ネガ.BP: 6000 → 7000", "自分.ネガ.疲労: true → false",
])
// 紫のスピリットがいなければコアは置けない。回復は条件が無いので起きると読む（同時の「置き、回復する」。質問1）
negaDefend("nega-attack-step-nopurple", { spirits: [nega1] }, ["自分.ネガ.疲労: true → false"])
// 白の【強化】（ISS）があっても「このスピリットは回復する」は1体のまま（Q762）。ISS は疲労のまま
negaDefend("nega-attack-step-iss", { spirits: [nega1, { card: MAD, label: "紫" }, { card: ISS, label: "ISS", rested: true }] }, ["自分.紫.コア: 1 → 2", "自分.ネガ.疲労: true → false"])
scenario({
    name: "nega-own-attack",
    start: { me: { spirits: [{ card: NEGA, label: "ネガ", rested: true }, { card: MAD, label: "紫" }] }, opp: { spirits: [{ card: VAN }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("紫") })
    },
    expect: ["自分.紫.疲労: false → true"],
})

console.log("すべてのチェックに合格しました 🎉（part861）")
