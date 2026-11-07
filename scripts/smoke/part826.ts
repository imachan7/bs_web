// smoke パート826（BS22 緑の残り：019 ゲニン・スズメ・021 チューニン・ツバメ・023 メガ・ネウラー・025 風剣使ムラマサ・059 オオトキ凧・060 ハサミサボテン・X13-03 神帝マッハホウオウガ。BS22_PLAN §1・§2、BS19_PLAN §2.1。実装前に書いた期待値テスト）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const GENIN = "BS22-019" // ゲニン・スズメ（緑・コスト1・爪鳥・Lvコア1/3）
const TSUBAME = "BS22-021" // チューニン・ツバメ（緑・コスト3・爪鳥・Lvコア1/3）
const MEGA = "BS22-023" // メガ・ネウラー（緑・コスト3・怪虫・フラッシュ【神速】）
const MURAMASA = "BS22-025" // 風剣使ムラマサ（緑・コスト5・剣使/爪鳥・Lvコア1/3/5）
const KITE = "BS22-059" // オオトキ凧（緑・ブレイヴ・コスト4）
const CACTUS = "BS22-060" // ハサミサボテン（緑・ブレイヴ・コスト4・連鎖黄）
const MACH = "X13-03" // 神帝マッハホウオウガ（緑・コスト5・フラッシュ【神速】・Lvコア1/3/6）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const RAINY = "BS07-001" // レイニードル（赤・コスト1・BP1000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・BP3000・効果なし）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000・効果なし）
const CHUN = "BS02-051" // チュンポポ（黄・コスト1・BP1000・効果なし）
const PIXY = "BS17-021" // ピクシーファルコ（緑・コスト2・爪鳥・Lv1 BP2000）
const VICTO = "BS19-018" // ヴィクトローラー（紫・コスト4・召喚時 相手のスピリットのコア1個をリザーブへ）
const KARAKURI = "BS20-060" // カラクリバッタ（緑・ブレイヴ・合体条件コスト4以上）

console.log("=== 前提: カードの機械確認（BS22・BS20 は staging にしか無い） ===")
{
    const staging = [...JSON.parse(readFileSync("data/staging/BS22.json", "utf8")), ...JSON.parse(readFileSync("data/staging/BS20.json", "utf8"))] as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { cores: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const lv = (id: string) => byId(id)!.levels.map((l) => l.cores).join("/")
    assert(byId(GENIN)?.name === "ゲニン・スズメ" && byId(GENIN)!.cost === 1 && lv(GENIN) === "1/3", "GENINはゲニン・スズメ（コスト1・Lvコア1/3）")
    assert(byId(TSUBAME)?.name === "チューニン・ツバメ" && byId(TSUBAME)!.cost === 3 && lv(TSUBAME) === "1/3", "TSUBAMEはチューニン・ツバメ（コスト3・Lvコア1/3）")
    assert(byId(MEGA)?.name === "メガ・ネウラー" && byId(MEGA)!.cost === 3 && byId(MEGA)!.colors.join() === "green", "MEGAはメガ・ネウラー（緑・コスト3）")
    assert(byId(MURAMASA)?.name === "風剣使ムラマサ" && byId(MURAMASA)!.cost === 5 && lv(MURAMASA) === "1/3/5" && byId(MURAMASA)!.family.includes("爪鳥"), "MURAMASAは風剣使ムラマサ（爪鳥・コスト5・Lvコア1/3/5）")
    assert(byId(KITE)?.name === "オオトキ凧" && byId(KITE)!.type === "brave" && byId(KITE)!.cost === 4, "KITEはオオトキ凧（ブレイヴ・コスト4）")
    assert(byId(CACTUS)?.name === "ハサミサボテン" && byId(CACTUS)!.type === "brave" && byId(CACTUS)!.cost === 4, "CACTUSはハサミサボテン（ブレイヴ・コスト4）")
    assert(byId(MACH)?.name === "神帝マッハホウオウガ" && byId(MACH)!.cost === 5 && lv(MACH) === "1/3/6", "MACHは神帝マッハホウオウガ（コスト5・Lvコア1/3/6）")
    assert(byId(KARAKURI)?.name === "カラクリバッタ" && byId(KARAKURI)!.type === "brave" && byId(KARAKURI)!.cost === 4, "KARAKURIはカラクリバッタ（ブレイヴ・コスト4）")
    for (const [id, n] of [[VAN, "ロクケラトプス"], [RAINY, "レイニードル"], [BELL, "デュアルキャノン・ベル"], [TARAN, "タランドーズ"], [CHUN, "チュンポポ"], [PIXY, "ピクシーファルコ"], [VICTO, "ヴィクトローラー"]] as const) {
        assert(getCard(id).name === n, `${id}は${n}`)
    }
    for (const id of [VAN, RAINY, BELL, TARAN, CHUN]) assert(getCard(id).effect === "", `${id}は効果なし`)
    assert(getCard(CHUN).colors[0] === "yellow" && getCard(BELL).colors[0] === "white" && getCard(VAN).colors[0] === "red" && getCard(TARAN).colors[0] === "green", "チュンポポ黄・ベル白・ロクケラトプス赤・タランドーズ緑")
    assert(getCard(PIXY).family.includes("爪鳥") && getCard(PIXY).levels[0]!.bp === 2000 && !getCard(VAN).family.includes("爪鳥"), "ピクシーファルコは爪鳥・BP2000、ロクケラトプスは爪鳥でない")
    assert(getCard(TARAN).cost === 6 && getCard(BELL).cost === 4 && getCard(VAN).cost === 1, "タランドーズ6・ベル4・ロクケラトプス1")
}

function game(seed: string, opts: { phase?: "main" | "attack"; turnPlayer?: PlayerId; p2?: "red" | "purple" } = {}): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: opts.p2 ?? "red" })
    s.turn = 3
    s.turnPlayer = opts.turnPlayer ?? "p1"
    s.priorityPlayer = s.turnPlayer
    s.phase = opts.phase ?? "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

const onField = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)
type Pc = { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }

// 対象は picks を優先。任意の確認（「発動する」）は decline でなければ受ける。モード選択は mode 番目の選択肢
function settle(s: GameState, picks: string[] = [], decline = false, mode = 0): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as unknown as Pc
        const who = pc.pid ?? "p1"
        const hit = picks.find((x) => (pc.candidates ?? []).includes(x))
        let err: string | null
        if (pc.kind === "target" && hit !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: hit })
        else if (pc.kind === "option" && (pc.options ?? []).includes("発動する")) err = decline ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: "発動する" })
        else if (decline) err = act(s, who, { type: "resolveChoice" })
        else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[mode] ?? "" })
        else if (pc.kind === "target" && pc.candidates?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

function flash(s: GameState, pid: PlayerId): void {
    s.isFlashTiming = true
    s.priorityPlayer = pid
}

// ════════ 019 ゲニン・スズメ ════════
console.log("=== 019 Lv1･Lv2『このスピリットの破壊時』：相手のスピリット2体を、相手が疲労させる（選ぶのは相手。ちょうど2体） ===")
for (const cores of [1, 3]) {
    const s = game(`genin-${cores}`)
    const genin = put(s, "p1", GENIN, cores)
    const a = put(s, "p2", VAN), b = put(s, "p2", RAINY), c = put(s, "p2", BELL)
    destroySpirit(s, "p1", genin.instanceId)
    assert((s.pendingChoice as unknown as Pc | null)?.pid === "p2", `Lv${cores === 1 ? 1 : 2}：疲労させるスピリットを選ぶのは相手（p2）`)
    settle(s, [a.instanceId, c.instanceId])
    assert(!onField(s, "p1", genin), `Lv${cores === 1 ? 1 : 2}：選択の解決後、ゲニン・スズメは破壊されている`)
    assert(a.isRested && c.isRested && !b.isRested, `Lv${cores === 1 ? 1 : 2}：相手が選んだ2体だけが疲労し、選ばれなかった1体は疲労しない`)
}
{
    const s = game("genin-one")
    const genin = put(s, "p1", GENIN, 1)
    const a = put(s, "p2", VAN)
    destroySpirit(s, "p1", genin.instanceId)
    settle(s)
    assert(a.isRested, "相手のスピリットが1体なら、その1体が疲労する")
}
{
    const s = game("genin-opp")
    const genin = put(s, "p2", GENIN, 1)
    const a = put(s, "p1", VAN), b = put(s, "p1", RAINY), c = put(s, "p1", BELL)
    destroySpirit(s, "p2", genin.instanceId)
    assert((s.pendingChoice as unknown as Pc | null)?.pid === "p1", "相手のゲニン・スズメが破壊されたとき、選ぶのは自分（p1）")
    settle(s, [b.instanceId, c.instanceId])
    assert(!a.isRested && b.isRested && c.isRested, "相手側のゲニン・スズメでも同じ（自分のスピリットを自分が2体選んで疲労）")
}
{
    const s = game("genin-other")
    put(s, "p1", GENIN, 1)
    const van = put(s, "p1", VAN)
    const a = put(s, "p2", RAINY)
    destroySpirit(s, "p1", van.instanceId)
    settle(s)
    assert(!s.pendingChoice && !a.isRested, "ほかのスピリットが破壊されても、ゲニン・スズメの効果は発揮しない")
}

// ════════ 021 チューニン・ツバメ ════════
console.log("=== 021 Lv1･Lv2：相手は、このスピリットのコアを取り除くことができない（ヴィクトローラーの召喚時で確かめる） ===")
for (const [cores, pickTsu] of [[2, true], [3, true], [2, false], [3, false]] as const) {
    const lvl = cores === 2 ? 1 : 2
    const s = game(`tsubame-core-${cores}-${pickTsu}`, { phase: "main", turnPlayer: "p2", p2: "purple" })
    const tsu = put(s, "p1", TSUBAME, cores)
    const van = put(s, "p1", VAN, 2)
    s.players["p2"].hand = [VICTO]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, `Lv${lvl}：相手がヴィクトローラーを召喚できる`)
    settle(s, [pickTsu ? tsu.instanceId : van.instanceId])
    if (pickTsu) assert(tsu.cores === cores && van.cores === 2, `Lv${lvl}：ツバメを選んでもコアは取り除かれない（${cores}個のまま）`)
    else assert(tsu.cores === cores && van.cores === 1, `Lv${lvl}：ほかのスピリット（ロクケラトプス）からは取り除ける（2→1）`)
}
{
    const s = game("tsubame-core-alone", { phase: "main", turnPlayer: "p2", p2: "purple" })
    const tsu = put(s, "p1", TSUBAME, 3)
    s.players["p2"].hand = [VICTO]
    const reserve = s.players.p1.reserve
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がヴィクトローラーを召喚できる")
    settle(s)
    assert(tsu.cores === 3 && s.players.p1.reserve === reserve, "選べるスピリットがツバメだけなら何も取り除かれない")
}

console.log("=== 021 Lv2【強化】・025【強化】：自分の「相手への疲労効果」の体数を+1体（019 の破壊時で確かめる。重なる。相手のツバメでは増えない） ===")
for (const [label, setup, expected] of [
    ["強化なし", [], 2],
    ["ツバメ Lv2", [[TSUBAME, 3]], 3],
    ["ツバメ Lv1（【強化】はLv2のみ）", [[TSUBAME, 1]], 2],
    ["ムラマサ Lv1", [[MURAMASA, 1]], 3],
    ["ツバメ Lv2＋ムラマサ（重なる）", [[TSUBAME, 3], [MURAMASA, 1]], 4],
] as const) {
    const s = game(`kyoka-${label}`)
    const genin = put(s, "p1", GENIN, 1)
    for (const [id, c] of setup) put(s, "p1", id, c)
    const foes = [VAN, RAINY, BELL, TARAN, CHUN].map((id) => put(s, "p2", id))
    destroySpirit(s, "p1", genin.instanceId)
    settle(s, foes.map((f) => f.instanceId))
    assert(foes.filter((f) => f.isRested).length === expected, `${label}：疲労するのは${expected}体`)
}
{
    const s = game("kyoka-opp")
    const genin = put(s, "p1", GENIN, 1)
    put(s, "p2", TSUBAME, 3)
    const foes = [VAN, RAINY, BELL, TARAN].map((id) => put(s, "p2", id))
    destroySpirit(s, "p1", genin.instanceId)
    settle(s, foes.map((f) => f.instanceId))
    assert(foes.filter((f) => f.isRested).length === 2, "相手のツバメの【強化】は自分の疲労効果に足されない（2体のまま）")
}

// ════════ 023 メガ・ネウラー・X13-03（【神速】）════════
console.log("=== 023 Lv1･Lv2･Lv3『このスピリットの召喚時』：ボイドからコア1個を自分の赤/白のスピリットに置く ===")
{
    const s = game("mega-main", { phase: "main" })
    const van = put(s, "p1", VAN, 2), bell = put(s, "p1", BELL, 2), taran = put(s, "p1", TARAN, 2)
    s.players.p1.hand = [MEGA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "メインステップでメガ・ネウラーを召喚できる")
    const mega = s.players.p1.field.spirits.find((x) => x.cardId === MEGA)!
    const pc = s.pendingChoice as unknown as Pc | null
    assert(!!pc && (pc.candidates ?? []).includes(van.instanceId) && (pc.candidates ?? []).includes(bell.instanceId), "置く先に赤のロクケラトプスと白のベルが選べる")
    assert(!!pc && !(pc.candidates ?? []).includes(taran.instanceId) && !(pc.candidates ?? []).includes(mega.instanceId), "緑のタランドーズとメガ・ネウラー自身（緑）は選べない")
    settle(s, [bell.instanceId])
    assert(bell.cores === 3 && van.cores === 2 && taran.cores === 2, "選んだ白のベルだけにコアが1個増える（2→3）")
}
{
    const s = game("mega-green-only", { phase: "main" })
    const taran = put(s, "p1", TARAN, 2)
    s.players.p1.hand = [MEGA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "メガ・ネウラーを召喚できる")
    settle(s)
    assert(taran.cores === 2, "赤/白のスピリットがいなければ、緑のスピリットにはコアを置かない")
}

console.log("=== 023・X13-03 フラッシュ【神速】：フラッシュで手札から召喚でき、召喚コストと上に置くコアはリザーブから払う（既存スピリットのコアは使わない） ===")
for (const [id, label] of [[MEGA, "メガ・ネウラー"], [MACH, "神帝マッハホウオウガ"]] as const) {
    const s = game(`soku-${id}`)
    const van = put(s, "p1", VAN, 2), bell = put(s, "p1", BELL, 2)
    s.players.p1.hand = [id]
    flash(s, "p1")
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${label}をフラッシュ【神速】で召喚できる`)
    const me = s.players.p1.field.spirits.find((x) => x.cardId === id)
    assert(!!me && me.cores >= 1, `${label}が場に出て、コアが乗っている`)
    settle(s, [van.instanceId])
    assert(s.players.p1.reserve < reserve, `${label}：コストと上に置くコアはリザーブから払う`)
    assert(bell.cores === 2 && van.cores === (id === MEGA ? 3 : 2), `${label}：既存スピリットのコアは払いに使われない（メガ・ネウラーの召喚時の1個だけ増える）`)
}
for (const id of [MEGA, MACH]) {
    const s = game(`soku-no-${id}`)
    put(s, "p1", VAN, 2)
    s.players.p1.hand = [id]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) !== null, `${id}：フラッシュタイミングでなければアタックステップに召喚できない`)
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === id), `${id}：場に出ていない`)
}

// ════════ 025 風剣使ムラマサ ════════
console.log("=== 025【合体時】Lv2･Lv3『自分のアタックステップ』：爪鳥の自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く ===")
// 相手の VAN は 1 コアなので、破壊されると相手のリザーブ +1。ライフのコアが動けばさらに +1
function muraBattle(label: string, o: { cores: number; combined: boolean; attacker: "pixy" | "van" | "mura"; blocker: "van" | "pixy" }, lifeMoves: boolean): void {
    const s = game(`mura-${label}`)
    const mura = put(s, "p1", MURAMASA, o.cores)
    if (o.combined) combine(s, "p1", mura, KARAKURI)
    const atk = o.attacker === "mura" ? mura : put(s, "p1", o.attacker === "pixy" ? PIXY : VAN, o.attacker === "pixy" ? 1 : 2) // 非爪鳥のロクケラトプスは Lv2（BP3000）で勝たせる
    const blk = put(s, "p2", o.blocker === "van" ? VAN : PIXY, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, `${label}：アタックできる`)
    settle(s)
    assert(declareBlock(s, "p2", blk.instanceId) === null, `${label}：ブロックできる`)
    passFlash(s)
    settle(s)
    const foeDestroyed = !onField(s, "p2", blk)
    assert(foeDestroyed, `${label}：ブロッカーは破壊された`)
    assert(s.players.p2.life === (lifeMoves ? 4 : 5), lifeMoves ? `${label}：相手のライフのコアが1個減る（5→4）` : `${label}：相手のライフは減らない`)
    assert(s.players.p2.reserve === 20 + 1 + (lifeMoves ? 1 : 0), lifeMoves ? `${label}：相手のリザーブは破壊されたコア1個＋ライフのコア1個で+2` : `${label}：相手のリザーブは破壊されたコア1個だけ+1`)
}
muraBattle("lv2-pixy", { cores: 3, combined: true, attacker: "pixy", blocker: "van" }, true)
muraBattle("lv3-pixy", { cores: 5, combined: true, attacker: "pixy", blocker: "van" }, true)
muraBattle("lv2-self", { cores: 3, combined: true, attacker: "mura", blocker: "van" }, true)
muraBattle("lv1", { cores: 1, combined: true, attacker: "pixy", blocker: "van" }, false)
muraBattle("not-combined", { cores: 3, combined: false, attacker: "pixy", blocker: "van" }, false)
{
    // 爪鳥でないロクケラトプス（BP3000は Lv2 のとき）ではなく Lv1 BP1000 が負ける場面ではなく、勝つ場面：相手のブロッカーを BP1000 のロクケラトプス、アタッカーを非爪鳥にする
    muraBattle("not-family-win", { cores: 3, combined: true, attacker: "van", blocker: "van" }, false)
}
{
    const s = game("mura-draw")
    const mura = put(s, "p1", MURAMASA, 3)
    combine(s, "p1", mura, KARAKURI)
    const atk = put(s, "p1", PIXY, 1)
    const blk = put(s, "p2", PIXY, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "相打ち：アタックできる")
    settle(s)
    assert(declareBlock(s, "p2", blk.instanceId) === null, "相打ち：ブロックできる")
    passFlash(s)
    settle(s)
    assert(!onField(s, "p1", atk) && !onField(s, "p2", blk), "相打ち：BP2000どうしで両方破壊された")
    assert(s.players.p2.life === 5, "相打ちは「相手のスピリットだけ」を破壊していないので、相手のライフのコアは動かない")
}

// ════════ 059 オオトキ凧 ════════
console.log("=== 059 Lv1『このブレイヴの召喚時』：コスト4以下の相手のスピリット2体を疲労させる。または、相手の合体スピリット1体を疲労させる ===")
{
    const s = game("kite-mode0", { phase: "main" })
    const van = put(s, "p2", VAN), rainy = put(s, "p2", RAINY), bell = put(s, "p2", BELL), taran = put(s, "p2", TARAN)
    s.players.p1.hand = [KITE]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "オオトキ凧を召喚できる")
    if ((s.pendingChoice as unknown as Pc | null)?.kind === "option") act(s, "p1", { type: "resolveChoice", option: (s.pendingChoice as unknown as Pc).options?.[0] ?? "" })
    const pc = s.pendingChoice as unknown as Pc | null
    assert(!!pc && !(pc.candidates ?? []).includes(taran.instanceId), "コスト6のタランドーズは疲労させる対象に選べない")
    settle(s, [van.instanceId, bell.instanceId])
    assert(van.isRested && bell.isRested && !rainy.isRested && !taran.isRested, "選んだコスト4以下の2体（ロクケラトプス・ベル）だけが疲労する")
}
{
    const s = game("kite-mode0-big", { phase: "main" })
    const taran = put(s, "p2", TARAN)
    s.players.p1.hand = [KITE]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "オオトキ凧を召喚できる")
    settle(s)
    assert(!taran.isRested, "コスト4以下の相手のスピリットがいなければ、コスト6のスピリットは疲労しない")
}
{
    const s = game("kite-mode1", { phase: "main" })
    const host = put(s, "p2", TARAN)
    combine(s, "p2", host, KARAKURI)
    const bell = put(s, "p2", BELL), van = put(s, "p2", VAN)
    s.players.p1.hand = [KITE]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "オオトキ凧を召喚できる")
    settle(s, [host.instanceId], false, 1)
    assert(host.isRested, "『または』の側：相手の合体スピリット1体が疲労する（コスト6でも対象）")
    assert(!bell.isRested && !van.isRested, "『または』の側：合体していないスピリットは疲労しない")
}

// ════════ 060 ハサミサボテン ════════
console.log("=== 060【合体時】『合体アタック時』：アタックで相手のライフを減らしたとき、ボイドからコア1個を自分のリザーブに置く。連鎖[黄]：さらにボイドからコア1個を自分のライフに置く ===")
function cactusAttack(label: string, o: { combined: boolean; yellow: boolean; blocked: boolean }, reserveGain: number, lifeGain: number): void {
    const s = game(`cactus-${label}`)
    const host = put(s, "p1", TARAN, 1)
    if (o.combined) combine(s, "p1", host, CACTUS)
    if (o.yellow) put(s, "p1", CHUN, 1)
    const symbols = o.combined ? 3 : 2
    const blk = o.blocked ? put(s, "p2", VAN, 1) : null
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, `${label}：アタックできる`)
    settle(s)
    if (blk) {
        assert(declareBlock(s, "p2", blk.instanceId) === null, `${label}：ブロックできる`)
        passFlash(s)
    } else {
        assert(takeLifeAndResolve(s, "p2") === null, `${label}：相手がライフで受ける`)
    }
    settle(s)
    assert(s.players.p2.life === (o.blocked ? 5 : 5 - symbols), `${label}：相手のライフは${o.blocked ? "減らない" : `5→${5 - symbols}（タランドーズのシンボル2つ＋合体したブレイヴの緑1つ）`}`)
    assert(s.players.p1.reserve === 20 + reserveGain, `${label}：自分のリザーブ +${reserveGain}`)
    assert(s.players.p1.life === 5 + lifeGain, `${label}：自分のライフ +${lifeGain}`)
}
cactusAttack("combined", { combined: true, yellow: false, blocked: false }, 1, 0)
cactusAttack("combined-yellow", { combined: true, yellow: true, blocked: false }, 1, 1)
cactusAttack("alone", { combined: false, yellow: true, blocked: false }, 0, 0)
cactusAttack("blocked", { combined: true, yellow: true, blocked: true }, 0, 0)

// ════════ X13-03 神帝マッハホウオウガ ════════
console.log("=== X13-03 Lv2･Lv3『このスピリットのアタック時』：相手のスピリット1体を疲労させる（Lv1 は起きない） ===")
for (const [cores, fires] of [[1, false], [3, true], [6, true]] as const) {
    const s = game(`mach-exhaust-${cores}`)
    const mach = put(s, "p1", MACH, cores)
    const a = put(s, "p2", VAN), b = put(s, "p2", RAINY, 1, true)
    assert(act(s, "p1", { type: "attack", instanceId: mach.instanceId }) === null, `コア${cores}：アタックできる`)
    settle(s, [a.instanceId])
    assert(a.isRested === fires, fires ? `コア${cores}：選んだ相手のスピリット1体が疲労する` : `コア${cores}（Lv1）：相手のスピリットは疲労しない`)
    assert(b.isRested, `コア${cores}：疲労状態のほうは疲労状態のまま`)
}

console.log("=== X13-03 Lv3『アタック時』：ターンに1回、リザーブのコア1個をボイドに置くことで、このスピリットは回復する ===")
function machLv3(label: string, o: { cores: number; reserve: number; decline?: boolean }): { s: GameState; mach: ReturnType<typeof createInstance> } {
    const s = game(`mach-${label}`)
    s.players.p1.reserve = o.reserve
    const mach = put(s, "p1", MACH, o.cores)
    const a = put(s, "p2", VAN), b = put(s, "p2", RAINY, 1, true)
    assert(act(s, "p1", { type: "attack", instanceId: mach.instanceId }) === null, `${label}：アタックできる`)
    settle(s, [a.instanceId], !!o.decline)
    return { s, mach }
}
{
    const { s, mach } = machLv3("pay", { cores: 6, reserve: 20 })
    assert(mach.isRested === false, "払えば（Lv3）このスピリットは回復する")
    assert(s.players.p1.reserve === 19, "リザーブのコア1個がボイドへ（20→19）")
    assert(s.players.p1.trashCores === 0, "コアはトラッシュでなくボイドへ")
}
{
    const { s, mach } = machLv3("decline", { cores: 6, reserve: 20, decline: true })
    assert(mach.isRested === true && s.players.p1.reserve === 20, "断れば回復せず、リザーブも減らない")
}
{
    const { s, mach } = machLv3("no-reserve", { cores: 6, reserve: 0 })
    assert(mach.isRested === true && s.players.p1.reserve === 0, "リザーブにコアが無ければ払えず、回復しない")
}
{
    const { s, mach } = machLv3("lv2", { cores: 3, reserve: 20 })
    assert(mach.isRested === true && s.players.p1.reserve === 20, "Lv2 には回復の効果が無い（疲労したまま・リザーブも減らない）")
}
{
    const { s, mach } = machLv3("once", { cores: 6, reserve: 20 })
    assert(mach.isRested === false, "1回目：回復した")
    assert(takeLifeAndResolve(s, "p2") === null, "1回目：相手がライフで受ける")
    settle(s)
    assert(act(s, "p1", { type: "attack", instanceId: mach.instanceId }) === null, "回復したので同じターンにもう1度アタックできる")
    settle(s)
    assert(mach.isRested === true && s.players.p1.reserve === 19, "2回目：ターンに1回なので回復しない（リザーブも19のまま）")
}

console.log("すべてのチェックに合格しました 🎉（part826）")
