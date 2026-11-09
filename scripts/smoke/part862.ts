// smoke パート862（BS23 白バッチ 035・036・061。効果文だけを根拠にした期待値。BS23_PLAN §1 の Q4528・Q4531・Q4532 を含む）
// 期待値役の作。実装側の都合で期待値を直さないこと（食い違いは解釈の割れ目としてユーザーへ）
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const KUB = "BS23-035" // クラブマン-AT
const ISS = "BS23-036" // 大近衛機ISS
const PHANTOM = "BS23-061" // ファントムジェッター（ブレイヴ）
const VAN = "BS01-002"
const GUN = "BS01-074" // バーサーカー・ガン（白・コスト1・効果なし）
const OATH = "BS20-028" // 近衛機オース・ミー（白・武装・効果なし）
const RAIN = "BS23-029" // 近衛機レインジャー6号（白・武装・効果なし）
const MARI = "BS22-032" // 近衛機マリナー2号（白・武装・効果なし）
const VIKING = "BS19-036" // 近衛機バイキング1号（Lv2：BP6000以下の相手がアタックしたとき、自分のスピリット1体を回復）
const BIND = "BS01-134" // バインディングソーン（緑フラッシュ：相手のスピリット1体を疲労）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [
        [KUB, "クラブマン-AT"], [ISS, "大近衛機ISS"], [PHANTOM, "ファントムジェッター"], [VAN, "ロクケラトプス"], [GUN, "バーサーカー・ガン"],
        [OATH, "近衛機オース・ミー"], [RAIN, "近衛機レインジャー6号"], [MARI, "近衛機マリナー2号"], [VIKING, "近衛機バイキング1号"], [BIND, "バインディングソーン"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id}は${name}`)
    for (const id of [OATH, RAIN, MARI, GUN]) assert(getCard(id).effects.length === 0, `${id}は効果なし`)
    for (const id of [OATH, RAIN, MARI]) assert(getCard(id).family.includes("武装"), `${id}は武装`)
    assert(getCard(GUN).family.includes("武装") === false, "ガンは武装ではない")
    assert(getCard(KUB).levels.map((l) => `${l.cores}/${l.bp}`).join() === "1/5000,2/6000,4/8000", "035 のLv表")
    assert(getCard(ISS).levels.map((l) => `${l.cores}/${l.bp}`).join() === "1/8000,2/12000,4/16000", "036 のLv表")
    assert(getCard(MARI).levels[1]!.cores === 2 && getCard(MARI).levels[1]!.bp === 7000, "マリナーLv2は2コア7000")
}

const join = (...ids: string[]) => ids.map((i) => getCard(i).name).sort().join("、")

// 選択待ちを答え切る。prefer の個体を順に選ぶ
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

// ───────────── 035 クラブマン-AT ─────────────
console.log("=== 1. 035：相手のアタックステップ開始時、相手のスピリット1体を指定。そのステップの最初に可能なら必ずアタック ===")
const twoOpp = [{ card: VAN, label: "A" }, { card: VAN, label: "B" }]
scenario({
    name: "kub-designate-forced",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: KUB, label: "ク" }] }, opp: { spirits: twoOpp } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        assert(t.state.pendingChoice?.pid === t.me, "指定の選択は 035 の持ち主（自分）に出る")
        t.act("me", { type: "resolveChoice", option: "発動する" }) // 「指定できる」の確認が先に出る
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
        t.actRejected("opp", { type: "attack", instanceId: t.id("B") }) // 指定された A が最初にアタックするまで他は宣言できない
        t.act("opp", { type: "attack", instanceId: t.id("A") })
    },
    expect: ["相手.A.疲労: false → true"],
})
scenario({
    name: "kub-designate-declined",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: KUB, label: "ク" }] }, opp: { spirits: twoOpp } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("me", { type: "resolveChoice" }) // 「指定できる」なので指定しない
        t.act("opp", { type: "attack", instanceId: t.id("B") })
    },
    expect: ["相手.B.疲労: false → true"],
})
// 指定されたスピリットが疲労していてアタックできないなら（可能ならば）、ほかのスピリットが宣言できる
scenario({
    name: "kub-designate-rested",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: KUB, label: "ク" }] }, opp: { spirits: [{ card: VAN, label: "A", rested: true }, { card: VAN, label: "B" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("me", { type: "resolveChoice", option: "発動する" }) // 「指定できる」の確認が先に出る
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
        t.act("opp", { type: "attack", instanceId: t.id("B") })
    },
    expect: ["相手.B.疲労: false → true"],
})
scenario({
    name: "kub-own-attack-step",
    start: { turn: "me", interactive: true, me: { spirits: [{ card: KUB, label: "ク" }] }, opp: { spirits: [{ card: VAN, label: "A" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        assert(t.state.pendingChoice === null, "自分のアタックステップでは指定は出ない")
    },
    expect: [],
})

console.log("=== 2. 035：ブロック時 このターンの最初のブロックなら回復。Lv2以上は BP+5000 ===")
const oneOpp = { spirits: [{ card: VAN, label: "A" }] }
scenario({
    name: "kub-block-first",
    start: { turn: "opp", me: { spirits: [{ card: KUB, label: "ク" }] }, opp: oneOpp },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ク") })
    },
    expect: ["相手.A.疲労: false → true"], // ブロックで疲労し、最初のブロックなので回復して差分なし。Lv1 は BP も変わらない
})
// 同じターンの2回目のブロックは回復しない。1回目のバトルは 035 が勝つ（BP5000 対 1000）
scenario({
    name: "kub-block-second-by-self",
    start: { turn: "opp", me: { spirits: [{ card: KUB, label: "ク" }] }, opp: { spirits: twoOpp } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ク") })
        t.closeFlash()
        t.act("opp", { type: "attack", instanceId: t.id("B") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ク") })
        t.closeFlash()
    },
    expect: [
        "相手.A.場所: フィールド → なし", "相手.B.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.リザーブ: 10 → 12", "自分.ク.疲労: false → true",
    ],
})
// 先にほかのスピリットがブロックしていれば、035 のブロックは「最初」ではない（Q4528）
scenario({
    name: "kub-block-after-other",
    start: { turn: "opp", me: { spirits: [{ card: KUB, label: "ク" }, { card: RAIN, label: "先" }] }, opp: { spirits: twoOpp } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("先") })
        t.closeFlash()
        t.act("opp", { type: "attack", instanceId: t.id("B") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ク") })
    },
    expect: [
        "相手.A.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
        "相手.B.疲労: false → true", "自分.先.疲労: false → true", "自分.ク.疲労: false → true",
    ],
})
scenario({
    name: "kub-block-lv2-bp",
    start: { turn: "opp", me: { spirits: [{ card: KUB, cores: 2, label: "ク" }] }, opp: oneOpp },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("A") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ク") })
    },
    expect: ["相手.A.疲労: false → true", "自分.ク.BP: 6000 → 11000"],
})

// ───────────── 036 大近衛機ISS ─────────────
console.log("=== 3. 036：召喚時 「近衛機」入りの自分のスピリット1体につき相手のスピリット1体を手札に戻す（自身も数える。Q4531） ===")
const issNew = [
    "自分.大近衛機ISS.場所: なし → フィールド", "自分.大近衛機ISS.疲労: なし → false", "自分.大近衛機ISS.コア: なし → 1",
    "自分.大近衛機ISS.Lv: なし → 1", "自分.大近衛機ISS.BP: なし → 8000",
]
scenario({
    name: "iss-summon-count-two",
    // 数えるのは自身とオース・ミー（2体）。ガンは近衛機でなく、相手のオース・ミーも数えない。白シンボル2つ（オースとガン）で軽減2、コスト9→7＋Lv1コア1個
    start: {
        turn: "me", interactive: true,
        me: { hand: [ISS], reserve: 15, spirits: [{ card: OATH, label: "近衛" }, { card: GUN, label: "ガン" }] },
        opp: { spirits: [{ card: OATH, label: "敵近衛" }, { card: VAN, label: "B" }, { card: VAN, label: "C" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, ["敵近衛", "B"])
    },
    expect: [
        ...issNew, "自分.手札: 大近衛機ISS → なし", "自分.リザーブ: 15 → 7", "自分.トラッシュのコア: 0 → 7",
        "相手.敵近衛.場所: フィールド → なし", "相手.B.場所: フィールド → なし", `相手.手札: なし → ${join(OATH, VAN)}`, "相手.リザーブ: 10 → 12",
    ],
})
scenario({
    name: "iss-summon-count-self-only",
    // 白シンボルはガンの1つ：コスト9→8＋1個
    start: { turn: "me", interactive: true, me: { hand: [ISS], reserve: 15, spirits: [{ card: GUN, label: "ガン" }] }, opp: { spirits: [{ card: VAN, label: "B" }, { card: VAN, label: "C" }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, ["B"])
    },
    expect: [
        ...issNew, "自分.手札: 大近衛機ISS → なし", "自分.リザーブ: 15 → 6", "自分.トラッシュのコア: 0 → 8",
        "相手.B.場所: フィールド → なし", "相手.手札: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 4. 036：【強化】白。自分の「スピリット回復効果」の体数 +1（バイキング1号の「1体を回復」で確かめる） ===")
function vikingDefend(name: string, extra: { card: string; label: string }, picks: string[], expect: string[]) {
    scenario({
        name,
        start: {
            turn: "opp", interactive: true,
            me: { spirits: [{ card: VIKING, cores: 2, label: "バイ" }, { card: extra.card, label: extra.label, rested: true }, { card: GUN, label: "ガン", rested: true }] },
            opp: { spirits: [{ card: VAN, label: "A" }] },
        },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("A") })
            answer(t, picks)
        },
        expect: ["相手.A.疲労: false → true", ...expect],
    })
}
vikingDefend("iss-kyoka-two", { card: ISS, label: "ISS" }, ["ISS", "ガン"], ["自分.ISS.疲労: true → false", "自分.ガン.疲労: true → false"])
vikingDefend("iss-kyoka-none", { card: RAIN, label: "R" }, ["ガン"], ["自分.ガン.疲労: true → false"])

console.log("=== 5. 036：Lv2以上、ISS 以外で名前に「近衛機」入りの自分のスピリットのLv1/2/3 BP を ISS の BP と同じとして扱う（Q4532） ===")
const bpAll = (name: string, from: number, to: number) => [`自分.${name}.BP: ${from} → ${to}`]
scenario({
    name: "iss-bp-lv2-on",
    start: {
        me: { spirits: [{ card: ISS, label: "ISS" }, { card: OATH, label: "オース" }, { card: MARI, cores: 2, label: "マリ" }, { card: GUN, label: "ガン" }] },
        opp: { spirits: [{ card: OATH, label: "敵オース" }] },
    },
    steps(t) {
        t.act("me", { type: "moveCore", instanceId: t.id("ISS"), direction: "add" }) // Lv1→Lv2
    },
    expect: [
        "自分.リザーブ: 10 → 9", "自分.ISS.コア: 1 → 2", "自分.ISS.Lv: 1 → 2", ...bpAll("ISS", 8000, 12000),
        ...bpAll("オース", 2000, 12000), ...bpAll("マリ", 7000, 12000),
    ],
})
scenario({
    name: "iss-bp-lv2-off",
    start: {
        me: { spirits: [{ card: ISS, cores: 2, label: "ISS" }, { card: OATH, label: "オース" }, { card: MARI, cores: 2, label: "マリ" }] },
    },
    steps(t) {
        t.act("me", { type: "moveCore", instanceId: t.id("ISS"), direction: "remove" }) // Lv2→Lv1：効果が止まる
    },
    expect: [
        "自分.リザーブ: 10 → 11", "自分.ISS.コア: 2 → 1", "自分.ISS.Lv: 2 → 1", ...bpAll("ISS", 12000, 8000),
        ...bpAll("オース", 12000, 2000), ...bpAll("マリ", 12000, 7000),
    ],
})

// ───────────── 061 ファントムジェッター ─────────────
console.log("=== 6. 061：召喚時 このターンの間、武装の自分のスピリットすべては相手のマジックの効果を受けない（後から出た武装にも効く） ===")
// 白シンボル2つ（オース・ミーとガン）：061 はコスト3→1、レインジャー6号はコスト2→0。リザーブは 10→8→7、トラッシュのコアは +1
function phantom(name: string, target: string, protectedTarget: boolean, attacker = "オース") {
    scenario({
        name,
        start: {
            me: { hand: [PHANTOM, RAIN], spirits: [{ card: OATH, label: "オース" }, { card: GUN, label: "ガン" }] },
            opp: { hand: [BIND] },
        },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(attacker) })
            const cast = { type: "castMagic" as const, handIndex: 0, timing: "flash" as const, targetInstanceId: target === RAIN ? t.state.players[t.me].field.spirits.find((x) => x.cardId === RAIN)!.instanceId : t.id(target) }
            // 「効果を受けない」スピリットは対象に選べず、使用ごと拒否される（SEMANTICS_AUDIT §3.20。2026-10-03 ユーザー確認）
            if (protectedTarget) t.actRejected("opp", cast)
            else t.act("opp", cast)
        },
        expect: [
            `自分.手札: ${join(PHANTOM, RAIN)} → なし`, "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 1", `自分.${attacker}.疲労: false → true`,
            "自分.ファントムジェッター.場所: なし → フィールド", "自分.ファントムジェッター.疲労: なし → false", "自分.ファントムジェッター.コア: なし → 1",
            "自分.ファントムジェッター.Lv: なし → 1", "自分.ファントムジェッター.BP: なし → 2000",
            "自分.近衛機レインジャー6号.場所: なし → フィールド", "自分.近衛機レインジャー6号.疲労: なし → false", "自分.近衛機レインジャー6号.コア: なし → 1",
            "自分.近衛機レインジャー6号.Lv: なし → 1", "自分.近衛機レインジャー6号.BP: なし → 3000",
            ...(protectedTarget ? [] : ["相手.手札: バインディングソーン → なし", "相手.トラッシュ: なし → バインディングソーン", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 2", `自分.${target}.疲労: false → true`]),
        ],
    })
}
phantom("phantom-later-summoned-immune", RAIN, true)
phantom("phantom-buki-immune", "オース", true, "ガン")
phantom("phantom-nonbuki-hit", "ガン", false)

console.log("=== 7. 061：【合体時】『合体アタック時』このスピリット（ホスト）をBP+3000 ===")
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
function place(s: GameState, pid: PlayerId, card: string, cores: number) {
    const inst = createInstance(card, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
{
    const s = duel("phantom-attack")
    const host = place(s, "p1", OATH, 1)
    const other = place(s, "p1", GUN, 1)
    const brave = place(s, "p1", PHANTOM, 1)
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "前提：合体できる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "前提：アタックステップへ")
    const bpBefore = effectiveBp(s, "p1", host)
    const otherBefore = effectiveBp(s, "p1", other)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "前提：合体アタック宣言")
    assert(effectiveBp(s, "p1", host) === bpBefore + 3000, "合体アタック時にホストのBPが+3000")
    assert(effectiveBp(s, "p1", other) === otherBefore, "ほかのスピリットは変わらない")
}
{
    // 合体していない（スピリット状態の）061 のアタックでは増えない
    const s = duel("phantom-spirit-attack")
    const brave = place(s, "p1", PHANTOM, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "前提：アタックステップへ")
    const before = effectiveBp(s, "p1", brave)
    assert(act(s, "p1", { type: "attack", instanceId: brave.instanceId }) === null, "前提：スピリット状態でアタック")
    assert(effectiveBp(s, "p1", brave) === before, "スピリット状態のアタックでは+3000されない")
}

console.log("すべてのチェックに合格しました 🎉（part862）")
