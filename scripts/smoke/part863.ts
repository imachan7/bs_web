// smoke パート863（BS23 白バッチ 070・079・080・X04。効果文だけを根拠にした期待値。BS23_PLAN §1 の Q22550・Q22551・Q4601〜Q4606 を含む）
// 期待値役の作。実装側の都合で期待値を直さないこと（食い違いは解釈の割れ目としてユーザーへ）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const ROCKET = "BS23-070" // ロケットシティ（ネクサス）
const SWORD = "BS23-079" // カウンターソード
const BACK = "BS23-080" // バックアタック
const X04 = "BS23-X04" // 双銃機神ディルム・ダイナ
const NEGA = "BS23-034"
const VAN = "BS01-002"
const GUN = "BS01-074" // 白・効果なし
const OATH = "BS20-028" // 近衛機オース・ミー（白・武装・効果なし）
const MAD = "BS17-010" // 紫・効果なし
const TERI = "BS17-019" // 緑・効果なし
const MINO = "BS23-033" // 機甲剣聖ミノタウロス（白・剣使）
const GENE = "BS21-033" // 近衛機ジェネシルド（白。【強化】白）
const WALK = "BS11-031" // ワルキューレ・ミスト（Lv2：相手のスピリットがアタックしたとき、相手のスピリット1体を疲労）
const BIND = "BS01-134" // バインディングソーン（緑）
const RIBBON = "BS01-146" // ドリームリボン（白：相手のスピリット1体を手札に戻す）
const BONE = "BS01-035" // ボーン・グラディエイター（アタック時、緑のスピリットからブロックされない）
const BLADE = "BS14-092" // 烈光閃刃（バースト）
const HARBIG = "BS21-004" // ハービッグ・ワイバーン（赤・コスト3・【強化】赤）
const SOLB = "BS23-062" // 極光剣ソルブレイカー（白のブレイヴ・合体条件コスト3以上）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [
        [ROCKET, "ロケットシティ"], [SWORD, "カウンターソード"], [BACK, "バックアタック"], [X04, "双銃機神ディルム・ダイナ"], [NEGA, "ネガ・テュポーン"],
        [VAN, "ロクケラトプス"], [GUN, "バーサーカー・ガン"], [OATH, "近衛機オース・ミー"], [MAD, "マッドーロ"], [TERI, "テリムック"], [MINO, "機甲剣聖ミノタウロス"],
        [GENE, "近衛機ジェネシルド"], [WALK, "ワルキューレ・ミスト"], [BIND, "バインディングソーン"], [RIBBON, "ドリームリボン"], [BONE, "ボーン・グラディエイター"],
        [BLADE, "烈光閃刃"], [HARBIG, "ハービッグ・ワイバーン"], [SOLB, "極光剣ソルブレイカー"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id}は${name}`)
    assert(getCard(MINO).family.includes("剣使") && getCard(OATH).family.includes("武装") && getCard(X04).family.includes("武装"), "剣使・武装の系統")
    assert(getCard(HARBIG).cost === 3 && getCard(SOLB).colors.join() === "white" && getCard(SOLB).type === "brave", "HARBIGコスト3／SOLBは白のブレイヴ")
    assert(getCard(ROCKET).levels.map((l) => l.cores).join() === "0,1", "ロケットシティは Lv1=0コア・Lv2=1コア")
    assert(getCard(X04).levels.map((l) => `${l.cores}/${l.bp}`).join() === "1/5000,2/6000,4/8000", "X04 のLv表")
}

function answer(t: ScenarioCtx, prefer: string[]): void {
    const used = new Set<string>()
    for (let i = 0; t.state.pendingChoice; i++) {
        if (i > 12) throw new Error("選択待ちが終わらない")
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "option") {
            const opts = pc.options ?? []
            t.act(side, { type: "resolveChoice", option: opts.find((o) => o.includes("発動")) ?? opts[0]! })
            continue
        }
        const want = prefer.map((l) => { try { return t.id(l) } catch { return undefined } }).find((id) => id !== undefined && pc.candidates.includes(id) && !used.has(id))
        const pick = want ?? pc.candidates[0]!
        used.add(pick)
        t.act(side, { type: "resolveChoice", instanceId: pick })
    }
}

// ───────────── 070 ロケットシティ ─────────────
console.log("=== 1. 070：お互いのアタックステップ、【強化】を持たないスピリットすべては回復できない（自分のも。Q22550） ===")
function rocketBlocks(name: string, nexusSide: "me" | "opp", soul = false) {
    const nexus = { nexuses: [{ card: ROCKET, cores: 0, label: "ロケット" }] }
    scenario({
        name,
        start: {
            turn: "opp",
            me: { spirits: [{ card: NEGA, label: "ネガ", rested: true }, { card: MAD, label: "紫" }], ...(nexusSide === "me" ? nexus : {}), ...(soul ? { soulCore: "リザーブ" } : {}) },
            opp: { spirits: [{ card: VAN, label: "攻" }], ...(nexusSide === "opp" ? nexus : {}) },
        },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("攻") })
        },
        // 034 のコア配置は起きるが、回復だけが止まる
        expect: ["相手.攻.疲労: false → true", "自分.紫.コア: 1 → 2"],
    })
}
rocketBlocks("rocket-blocks-own-nexus", "me")
rocketBlocks("rocket-blocks-opp-nexus", "opp")
rocketBlocks("rocket-blocks-soul", "me", true)

console.log("=== 2. 070：Lv2『相手のアタックステップ』相手がアタックしたとき【強化】を持つ自分の白のスピリット1体を回復 ===")
function rocketRecover(name: string, o: { turn: "me" | "opp"; nexusCores: number; nexusSide: "me" | "opp" }, expect: string[]) {
    const nexus = { nexuses: [{ card: ROCKET, cores: o.nexusCores, label: "ロケット" }] }
    const owner = { spirits: [{ card: GENE, label: "ジェネ", rested: true }, { card: GUN, label: "ガン", rested: true }] } // 白の【強化】持ち／持たない
    const attacker = { spirits: [{ card: VAN, label: "攻" }] }
    // nexusSide のスピリットが白の強化持ち。アタックは反対側
    scenario({
        name,
        start: {
            turn: o.turn,
            me: { ...(o.nexusSide === "me" ? { ...owner, ...nexus } : attacker) },
            opp: { ...(o.nexusSide === "opp" ? { ...owner, ...nexus } : attacker) },
        },
        steps(t) {
            const atk = o.nexusSide === "me" ? "opp" : "me"
            t.act(atk, { type: "nextPhase" })
            t.act(atk, { type: "attack", instanceId: t.id("攻") })
        },
        expect,
    })
}
const atkLine = (side: string) => `${side}.攻.疲労: false → true`
rocketRecover("rocket-lv2-recover", { turn: "opp", nexusCores: 1, nexusSide: "me" }, [atkLine("相手"), "自分.ジェネ.疲労: true → false"])
rocketRecover("rocket-lv2-recover-oppside", { turn: "me", nexusCores: 1, nexusSide: "opp" }, [atkLine("自分"), "相手.ジェネ.疲労: true → false"])
rocketRecover("rocket-lv1-norecover", { turn: "opp", nexusCores: 0, nexusSide: "me" }, [atkLine("相手")])
// 自分のスピリットがアタックしたときは回復しない（「相手のスピリットがアタックしたとき」）
scenario({
    name: "rocket-lv2-own-attack",
    start: { me: { spirits: [{ card: GENE, label: "ジェネ", rested: true }, { card: VAN, label: "自攻" }], nexuses: [{ card: ROCKET, cores: 1, label: "ロケット" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("自攻") })
    },
    expect: ["自分.自攻.疲労: false → true"],
})

console.log("=== 3. 070：アタックステップ以外（相手のリフレッシュステップ）には効かない ===")
scenario({
    name: "rocket-refresh-step-unaffected",
    start: { me: { nexuses: [{ card: ROCKET, cores: 1, label: "ロケット" }] }, opp: { spirits: [{ card: VAN, label: "休", rested: true }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
    },
    expect: ["相手.休.疲労: true → false", "相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"],
})

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
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    return s
}
function place(s: GameState, pid: PlayerId, card: string, cores: number, rested = false) {
    const inst = createInstance(card, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 4. 070：白のブレイヴが合体していれば、紫など白以外の【強化】持ちも白として回復できる（Q22551） ===")
function rocketBrave(seed: string, combine: boolean): boolean {
    const s = duel(seed)
    const nexus = createInstance(ROCKET, s.turn - 1, 1)
    s.players.p1.field.nexuses.push(nexus)
    const host = place(s, "p1", HARBIG, 1) // 赤の【強化】持ち。白のブレイヴが合体すれば白としても扱う
    if (combine) {
        const brave = place(s, "p1", SOLB, 1)
        assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, `${seed}：合体できる`)
    }
    host.isRested = true
    place(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "endTurn" }) === null, `${seed}：自分のターンを終える`)
    assert(act(s, "p2", { type: "nextPhase" }) === null, `${seed}：相手がアタックステップへ`)
    const atk = s.players.p2.field.spirits[0]!
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, `${seed}：相手がアタック`)
    return host.isRested
}
assert(rocketBrave("rocket-brave-combined", true) === false, "白のブレイヴが合体した赤の【強化】持ちは回復する")
assert(rocketBrave("rocket-brave-alone", false) === true, "合体していない赤の【強化】持ちは白でないので回復しない")

// ───────────── 079 カウンターソード ─────────────
console.log("=== 5. 079：自分のスピリット1体はこのターン相手のスピリットの効果を受けない。剣使なら疲労状態でもブロックできる ===")
// 白シンボル2つ（ミノタウロスとガン）で軽減2：コスト4→2
const swordPaid2 = ["自分.手札: カウンターソード → なし", "自分.トラッシュ: なし → カウンターソード", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2"]
scenario({
    name: "sword-kenshi-blocks-rested",
    start: {
        turn: "opp",
        me: { hand: [SWORD], spirits: [{ card: MINO, label: "ミノ", rested: true }, { card: GUN, label: "ガン" }] },
        opp: { spirits: [{ card: VAN, label: "攻" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ミノ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ミノ") })
    },
    expect: [...swordPaid2, "相手.攻.疲労: false → true"],
})
// 剣使でない（ガン）を指定しても疲労状態のブロックはできない。コストは白シンボル1つ（ガン）で 4→3
scenario({
    name: "sword-nonkenshi-cannot-block-rested",
    start: {
        turn: "opp",
        me: { hand: [SWORD], spirits: [{ card: GUN, label: "ガン", rested: true }] },
        opp: { spirits: [{ card: VAN, label: "攻" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ガン") })
        t.closeFlash()
        t.actRejected("me", { type: "block", instanceId: t.id("ガン") })
    },
    expect: ["自分.手札: カウンターソード → なし", "自分.トラッシュ: なし → カウンターソード", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3", "相手.攻.疲労: false → true"],
})
// 指定したスピリットだけが相手のスピリットの効果を受けない。ワルキューレの疲労（相手のスピリットがアタックしたとき）は守が対象にならない
function swordImmune(name: string, cast: boolean) {
    scenario({
        name,
        start: {
            interactive: true,
            me: { hand: cast ? [SWORD] : [], spirits: [{ card: VAN, label: "攻手" }, { card: GUN, label: "守" }] },
            opp: { spirits: [{ card: WALK, cores: 3, label: "ワル" }] },
        },
        steps(t) {
            if (cast) t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("守") })
            if (cast) answer(t, ["守"]) // interactive なので「1体を指定する」の選択が出る
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("攻手") })
            const pc = t.state.pendingChoice
            if (pc) assert(cast ? !pc.candidates.includes(t.id("守")) : pc.candidates.includes(t.id("守")), cast ? "守は疲労の対象に出ない" : "対照：守は対象に出る")
            answer(t, cast ? ["攻手"] : ["守"])
        },
        expect: [
            "自分.攻手.疲労: false → true",
            ...(cast ? ["自分.手札: カウンターソード → なし", "自分.トラッシュ: なし → カウンターソード", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3"] : ["自分.守.疲労: false → true"]),
        ],
    })
}
swordImmune("sword-immune-from-spirit-effect", true)
swordImmune("sword-control-no-cast", false)

// ───────────── 080 バックアタック ─────────────
console.log("=== 6. 080：相手のスピリット1体を手札に戻す。連鎖［紫］疲労状態のコスト7以下の相手のスピリット1体を破壊 ===")
// 白シンボルはガン1つ：コスト5→4
const backPaid = ["自分.手札: バックアタック → なし", "自分.トラッシュ: なし → バックアタック", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"]
function backMain(name: string, mine: { card: string; label: string }[], bRested: boolean, expect: string[]) {
    scenario({
        name,
        start: {
            me: { hand: [BACK], spirits: mine },
            opp: { spirits: [{ card: VAN, label: "A" }, { card: VAN, label: "B", rested: bRested }] },
        },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("A") })
        },
        expect: [...backPaid, "相手.A.場所: フィールド → なし", "相手.手札: なし → ロクケラトプス", ...expect],
    })
}
const gun = { card: GUN, label: "ガン" }
const bBounced = ["相手.リザーブ: 10 → 11"]
backMain("back-purple-destroys-rested", [gun, { card: MAD, label: "紫" }], true, [
    "相手.B.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 12",
])
backMain("back-purple-needs-rested", [gun, { card: MAD, label: "紫" }], false, bBounced)
backMain("back-no-purple", [gun], true, bBounced)

console.log("=== 7. 080：連鎖［緑］このバトルの間、相手はバーストを発動できない ===")
function burstGame(seed: string, withGreen: boolean): GameState {
    const s = duel(seed)
    s.players.p2.burst = BLADE
    s.players.p2.burstSet = true
    s.players.p1.hand = [BACK]
    place(s, "p1", GUN, 1)
    if (withGreen) place(s, "p1", TERI, 1)
    place(s, "p2", VAN, 1)
    const gun = s.players.p1.field.spirits[0]!
    assert(act(s, "p1", { type: "nextPhase" }) === null, `${seed}：アタックステップへ`)
    assert(act(s, "p1", { type: "attack", instanceId: gun.instanceId }) === null, `${seed}：アタック`)
    const target = s.players.p2.field.spirits[0]!
    if (s.priorityPlayer !== "p1") act(s, s.priorityPlayer, { type: "pass" })
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: target.instanceId }) === null, `${seed}：080 を使える`)
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p2", { type: "takeLife" })
    return s
}
{
    const s = burstGame("back-green", true)
    assert(s.players.p2.burst === BLADE && s.pendingChoice === null, "緑シンボルがあれば、相手のバーストは発動されず伏せたまま")
    assert(s.players.p2.life === 4, "ライフは減る")
    const c = burstGame("back-nogreen", false)
    assert(c.players.p2.burst !== BLADE || c.pendingChoice !== null, "対照：緑シンボルが無ければ、バーストは発動できる（確認が出るか使われる）")
}

// ───────────── X04 双銃機神ディルム・ダイナ ─────────────
console.log("=== 8. X04：【重装甲：赤/緑/青】相手の緑のマジックの効果を受けない。白は受ける ===")
function x04Magic(name: string, magic: string, cost: number, expect: string[] | null) {
    scenario({
        name,
        start: { turn: "opp", me: { spirits: [{ card: X04, label: "X" }] }, opp: { hand: [magic] } },
        steps(t) {
            const cast = { type: "castMagic" as const, handIndex: 0, timing: "flash" as const, targetInstanceId: t.id("X") }
            // null＝【重装甲】で対象に選べず、使用ごと拒否される（SEMANTICS_AUDIT §3.20）
            if (expect === null) t.actRejected("opp", cast)
            else t.act("opp", cast)
        },
        expect: expect === null ? [] : [`相手.手札: ${getCard(magic).name} → なし`, `相手.トラッシュ: なし → ${getCard(magic).name}`, `相手.リザーブ: 10 → ${10 - cost}`, `相手.トラッシュのコア: 0 → ${cost}`, ...expect],
    })
}
x04Magic("x04-armor-green-magic", BIND, 2, null)
x04Magic("x04-white-magic-hits", RIBBON, 4, ["自分.X.場所: フィールド → なし", "自分.手札: なし → 双銃機神ディルム・ダイナ", "自分.リザーブ: 10 → 11"])

console.log("=== 9. X04：フラッシュ『相手のアタックステップ』武装の自分のスピリット1体を疲労させることで「ブロックされない」効果を持つ相手のスピリット1体を破壊（自身を疲労させてもよい。Q4601） ===")
const x04Flash = { type: "activateAbility", effectId: "BS23-X04-e2" } as const
const boneDies = ["相手.攻.場所: フィールド → なし", "相手.トラッシュ: なし → ボーン・グラディエイター", "相手.リザーブ: 10 → 11"]
function x04Defend(name: string, o: { mine: { card: string; label: string; rested?: boolean }[]; attacker: string; interactive?: boolean; xRested?: boolean }, steps: (t: ScenarioCtx) => void, expect: string[]) {
    scenario({
        name,
        start: { turn: "opp", interactive: o.interactive ?? false, me: { spirits: [{ card: X04, label: "X", rested: o.xRested ?? false }, ...o.mine] }, opp: { spirits: [{ card: o.attacker, label: "攻" }] } },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("攻") })
            steps(t)
        },
        expect,
    })
}
x04Defend("x04-flash-other-armed", { mine: [{ card: OATH, label: "オース" }], attacker: BONE, interactive: true }, (t) => {
    t.act("me", { ...x04Flash, instanceId: t.id("X") })
    answer(t, ["オース"])
}, [...boneDies, "自分.オース.疲労: false → true"])
x04Defend("x04-flash-self-cost", { mine: [], attacker: BONE }, (t) => {
    t.act("me", { ...x04Flash, instanceId: t.id("X") })
}, [...boneDies, "自分.X.疲労: false → true"])
x04Defend("x04-flash-no-unblockable", { mine: [{ card: OATH, label: "オース" }], attacker: VAN }, (t) => {
    t.actRejected("me", { ...x04Flash, instanceId: t.id("X") })
}, ["相手.攻.疲労: false → true"])
x04Defend("x04-flash-nothing-to-pay", { mine: [{ card: GUN, label: "ガン" }], attacker: BONE, xRested: true }, (t) => {
    // 武装は X04 だけで、それが疲労していれば払えない
    t.actRejected("me", { ...x04Flash, instanceId: t.id("X") })
}, ["相手.攻.疲労: false → true"])

console.log("=== 10. X04：Lv2･Lv3『アタック時』相手のバースト1つを破棄することで自分のスピリット1体を回復 ===")
function x04Attack(name: string, o: { cores: number; burst: boolean; oppNexus?: boolean }, expect: string[]) {
    scenario({
        name,
        start: {
            interactive: true,
            me: { spirits: [{ card: X04, cores: o.cores, label: "X" }, { card: GUN, label: "ガン", rested: true }] },
            opp: { ...(o.burst ? { burst: BLADE } : {}), ...(o.oppNexus ? { nexuses: [{ card: ROCKET, cores: 0, label: "ロケット" }] } : {}) },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("X") })
            answer(t, ["ガン"])
        },
        expect: ["自分.X.疲労: false → true", ...expect],
    })
}
x04Attack("x04-attack-lv2-burst", { cores: 2, burst: true }, ["自分.ガン.疲労: true → false", "相手.バースト: 烈光閃刃 → なし", "相手.トラッシュ: なし → 烈光閃刃"])
x04Attack("x04-attack-lv1", { cores: 1, burst: true }, [])
x04Attack("x04-attack-no-burst", { cores: 2, burst: false }, [])
// 回復できなければバーストも破棄できない（Q4606）。ロケットシティ（【強化】なしは回復できない）があれば、X04 もガンも回復できない
x04Attack("x04-attack-cannot-refresh", { cores: 2, burst: true, oppNexus: true }, [])

console.log("すべてのチェックに合格しました 🎉（part863）")
