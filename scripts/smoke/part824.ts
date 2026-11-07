// smoke パート824（BS22 赤の残り：002・004・005・006・007・008・056・074。BS22_PLAN §1・§2、BS19_PLAN §2.1 の連鎖。カードは staging にしか無いので実装前は落ちる）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ALPHA = "BS22-002" // アルファータケラトプス（赤・コスト2・地竜・Lv1/2 コア1/2 BP3000/4000）
const KOPISH = "BS22-004" // コピシュプテルス（赤・コスト3・地竜/空牙）
const PHOTON = "BS22-005" // フォトン・ドラゴン（赤・コスト4・星竜・Lv1 BP3000）
const REX = "BS22-006" // 黒剣竜レックスビート・ザウラー（赤・コスト5・地竜・Lv1/2/3 コア1/3/5）
const EDMONT = "BS22-007" // 鎧竜エドモントソード（赤・コスト5・地竜・Lv1 BP4000）
const GREAT = "BS22-008" // グレートアトラクター・ドラゴン（赤・コスト8・星竜）
const RUGOPS = "BS22-056" // 斬鎧竜ルゴプス（赤・ブレイヴ・コスト6・合体条件コスト5以上）
const DISASTER = "BS22-074" // フレイムディザスター（赤・マジック・コスト7・フラッシュ）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・Lv1 BP1000／Lv3 BP4000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・地竜・Lv1 BP3000／Lv2 BP5000・効果なし）
const LANCE = "SD17-010" // ランスモザウルス（赤・コスト5・地竜・Lv2 BP7000・効果なし）
const WOLF = "BS21-002" // ウォルフドラゴン（赤・コスト2・【強化】持ち）
const GORADON = "BS01-001" // ゴラドン（赤・爬獣・効果なし）地竜でも緑でもない
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・殻虫・Lv1 BP1000）緑シンボル用
const BOJA = "BS21-038" // ボジャノーイ（黄・コスト2・Lv1 BP2000・効果なし）
const ILL = "BS16-053" // イルルヤンカッシュ（青・コスト6・シンボル2つ・Lv1 BP5000・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const chk = (id: string, name: string, type: string, cost: number) => assert(byId(id)?.name === name && byId(id)!.type === type && byId(id)!.cost === cost && byId(id)!.colors[0] === "red", `${id}は${name}（赤・${type}・コスト${cost}）`)
    chk(ALPHA, "アルファータケラトプス", "spirit", 2)
    chk(KOPISH, "コピシュプテルス", "spirit", 3)
    chk(PHOTON, "フォトン・ドラゴン", "spirit", 4)
    chk(REX, "黒剣竜レックスビート・ザウラー", "spirit", 5)
    chk(EDMONT, "鎧竜エドモントソード", "spirit", 5)
    chk(GREAT, "グレートアトラクター・ドラゴン", "spirit", 8)
    chk(RUGOPS, "斬鎧竜ルゴプス", "brave", 6)
    chk(DISASTER, "フレイムディザスター", "magic", 7)
    assert(byId(ALPHA)!.family.includes("地竜") && byId(EDMONT)!.family.includes("地竜") && byId(REX)!.family.includes("地竜"), "002・007・006は地竜")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).family.includes("地竜") && getCard(VAN).effect === "", "VANはロクケラトプス（地竜・効果なし）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).family.includes("地竜") && getCard(STIRA).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/3000,3/5000,4/8000", "STIRAはスティラホーン（コスト5・地竜・Lv1 3000/Lv2 5000）")
    assert(getCard(LANCE).name === "ランスモザウルス" && getCard(LANCE).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/5000,3/7000,5/9000", "LANCEはランスモザウルス（Lv2 BP7000）")
    assert(getCard(WOLF).name === "ウォルフドラゴン" && getCard(WOLF).effect.includes("【強化】"), "WOLFはウォルフドラゴン（【強化】）")
    assert(getCard(BEETLE).name === "ビートビートル" && getCard(BEETLE).colors[0] === "green" && getCard(BEETLE).effect === "" && !getCard(BEETLE).family.includes("地竜"), "BEETLEはビートビートル（緑・効果なし・地竜でない）")
    assert(getCard(BOJA).name === "ボジャノーイ" && getCard(BOJA).colors[0] === "yellow" && getCard(BOJA).effect === "", "BOJAはボジャノーイ（黄・効果なし）")
    assert(getCard(ILL).name === "イルルヤンカッシュ" && getCard(ILL).symbol.length === 2 && getCard(ILL).effect === "", "ILLはイルルヤンカッシュ（シンボル2つ・効果なし）")
    assert(getCard(VAN).symbol.length === 1, "VANはシンボル1つ")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
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

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
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

// 対象の選択は picks を優先して答える。確認は先頭の選択肢
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

const alive = (s: GameState, pid: PlayerId, inst: ReturnType<typeof createInstance>) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

// 防御側が先にパスしてフラッシュ①を閉じる
function attack(s: GameState, atk: ReturnType<typeof createInstance>): void {
    assert(act(s, s.turnPlayer, { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
}

console.log("=== 002 Lv2『アタック時』【激突】：相手は可能ならば必ずブロックする。連鎖[緑]：地竜1体につきBP+1000 ===")
for (const green of [true, false]) {
    const s = game(green ? "alpha-green" : "alpha-nogreen")
    const alpha = put(s, "p1", ALPHA, 2) // Lv2 BP4000
    put(s, "p1", VAN, 1) // 地竜2体目
    if (green) put(s, "p1", BEETLE, 1) // 緑シンボル。地竜ではない
    const blocker = put(s, "p2", VAN, 1)
    attack(s, alpha)
    settle(s)
    assert(effectiveBp(s, "p1", alpha) === (green ? 6000 : 4000), green ? "緑シンボルあり：地竜2体（自身とロクケラトプス）でBP+2000（4000→6000）" : "緑シンボルが無ければBP+されない（4000のまま）")
    assert(takeLifeAndResolve(s, "p2") !== null, "【激突】：ブロックできる相手はライフで受けられない")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックはできる")
}
{
    const s = game("alpha-lv1")
    const alpha = put(s, "p1", ALPHA, 1) // Lv1：効果なし
    put(s, "p1", VAN, 1)
    put(s, "p1", BEETLE, 1)
    put(s, "p2", VAN, 1)
    attack(s, alpha)
    settle(s)
    assert(effectiveBp(s, "p1", alpha) === 3000, "Lv1は【激突】も連鎖も持たない（BP3000のまま）")
    assert(takeLifeAndResolve(s, "p2") === null, "Lv1ならブロックせずライフで受けられる")
}
{
    const s = game("alpha-noblocker")
    const alpha = put(s, "p1", ALPHA, 2)
    attack(s, alpha)
    settle(s)
    assert(takeLifeAndResolve(s, "p2") === null, "【激突】：ブロックできるスピリットがいなければライフで受けられる")
}

console.log("=== 004 『自分のメインステップ』：自分の黄のスピリットが召喚されたとき、BP3000以下の相手のスピリット1体を破壊する ===")
{
    const s = game("kopish-yellow", "main")
    put(s, "p1", KOPISH, 1)
    const weak = put(s, "p2", VAN, 1) // BP1000
    const mid = put(s, "p2", STIRA, 1) // BP3000
    const big = put(s, "p2", STIRA, 3) // Lv2 BP5000
    s.players.p1.hand = [BOJA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "黄のボジャノーイを召喚できる")
    settle(s, [mid.instanceId])
    assert(!alive(s, "p2", mid), "選んだBP3000のスピリットが破壊される")
    assert(alive(s, "p2", weak) && alive(s, "p2", big), "選ばなかったスピリットと、BP3000を超えるスピリットは残る（1体だけ）")
}
{
    const s = game("kopish-red", "main")
    put(s, "p1", KOPISH, 1)
    const weak = put(s, "p2", VAN, 1)
    s.players.p1.hand = [VAN]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "赤のロクケラトプスを召喚できる")
    settle(s)
    assert(alive(s, "p2", weak), "黄でないスピリットの召喚では破壊しない")
}
{
    const s = game("kopish-over", "main")
    put(s, "p1", KOPISH, 1)
    const big = put(s, "p2", VAN, 3) // Lv3 BP4000
    s.players.p1.hand = [BOJA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "黄のボジャノーイを召喚できる")
    settle(s)
    assert(alive(s, "p2", big), "BP3000を超える相手（4000）しかいなければ破壊しない")
}
{
    const s = game("kopish-opp", "main", "p2")
    put(s, "p1", KOPISH, 1)
    const mine = put(s, "p1", VAN, 1)
    s.players.p2.hand = [BOJA]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手が黄のボジャノーイを召喚できる")
    settle(s)
    assert(alive(s, "p1", mine), "相手の黄のスピリットの召喚では発揮しない（自分の黄・自分のメインステップのみ）")
}

console.log("=== 005 『このスピリットのバトル時』：BP3000以下の相手のスピリット1体を破壊する（アタック宣言時・ブロック時） ===")
{
    const s = game("photon-attack")
    const photon = put(s, "p1", PHOTON, 1) // Lv1 BP3000
    const weak = put(s, "p2", VAN, 1)
    const four = put(s, "p2", VAN, 3) // BP4000
    attack(s, photon)
    settle(s, [weak.instanceId])
    assert(!alive(s, "p2", weak), "アタック宣言時にBP3000以下のスピリットを破壊する")
    assert(alive(s, "p2", four), "BP4000のスピリットは破壊されない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("photon-block", "attack", "p2")
    const photon = put(s, "p1", PHOTON, 1)
    const atk = put(s, "p2", STIRA, 1) // BP3000
    const other = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", photon.instanceId) === null, "フォトン・ドラゴンでブロックできる")
    settle(s, [other.instanceId])
    assert(!alive(s, "p2", other), "ブロック時にもBP3000以下のスピリットを破壊する")
}
{
    const s = game("photon-none")
    const photon = put(s, "p1", PHOTON, 1)
    const four = put(s, "p2", VAN, 3) // BP4000
    attack(s, photon)
    settle(s)
    assert(alive(s, "p2", four), "BP3000を超える相手しかいなければ破壊しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 006 召喚時：【強化】を持つ相手のスピリット1体を破壊する ===")
{
    const s = game("rex-summon", "main")
    const wolf = put(s, "p2", WOLF, 1)
    const van = put(s, "p2", VAN, 1)
    s.players.p1.hand = [REX]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "レックスビート・ザウラーを召喚できる")
    settle(s, [van.instanceId])
    assert(!alive(s, "p2", wolf), "【強化】を持つウォルフドラゴンが破壊される")
    assert(alive(s, "p2", van), "【強化】を持たないスピリットは破壊されない（選べない）")
}
{
    const s = game("rex-nokyoka", "main")
    const van = put(s, "p2", VAN, 1)
    s.players.p1.hand = [REX]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    settle(s)
    assert(alive(s, "p2", van), "【強化】持ちがいなければ何も破壊しない")
}

console.log("=== 006【合体時】Lv2･Lv3『合体アタック時』：デッキから1枚ドロー。連鎖[緑]（合体アタック時の直下）：相手のスピリット1体を疲労させる ===")
for (const [green, cores] of [[true, 3], [false, 3], [true, 1]] as const) {
    const s = game(`rex-comb-${green}-${cores}`)
    const rex = put(s, "p1", REX, cores) // 3コア＝Lv2、1コア＝Lv1
    combine(s, "p1", rex, RUGOPS)
    if (green) put(s, "p1", BEETLE, 1)
    const foe = put(s, "p2", VAN, 1)
    const hand0 = s.players.p1.hand.length
    attack(s, rex)
    settle(s, [foe.instanceId])
    if (cores === 3) {
        assert(s.players.p1.hand.length === hand0 + 1, "Lv2の合体アタック時に1枚ドローする")
        assert(foe.isRested === green, green ? "緑シンボルあり：相手のスピリット1体が疲労する" : "緑シンボルが無ければ疲労させない")
    } else {
        assert(s.players.p1.hand.length === hand0, "Lv1の合体アタック時はドローしない")
        assert(!foe.isRested, "Lv1では連鎖の疲労も発揮しない（連鎖元が発揮されない）")
    }
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("rex-alone")
    const rex = put(s, "p1", REX, 3) // Lv2・合体していない
    const hand0 = s.players.p1.hand.length
    attack(s, rex)
    settle(s)
    assert(s.players.p1.hand.length === hand0, "合体していなければ『合体アタック時』は発揮しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 007 『アタック時』：地竜1体につき、BP4000以下の相手のスピリット1体を破壊する。連鎖[緑]：ボイドからコア1個を自分のスピリットに置く ===")
for (const [green, other] of [[false, true], [true, true], [false, false]] as const) {
    const s = game(`edmont-${green}-${other}`)
    const edmont = put(s, "p1", EDMONT, 1)
    const van = put(s, "p1", other ? VAN : GORADON, 1) // other=true：地竜2体、false：地竜は自身だけ（緑シンボルは green 側で別に置く。ここに緑を置くと連鎖が成り立つ）
    if (green) put(s, "p1", BEETLE, 1)
    const e1 = put(s, "p2", VAN, 1)
    const e2 = put(s, "p2", VAN, 1)
    const e3 = put(s, "p2", VAN, 1)
    const big = put(s, "p2", STIRA, 3) // Lv2 BP5000
    const want = other ? 2 : 1
    attack(s, edmont)
    settle(s, [e1.instanceId, e2.instanceId, e3.instanceId, van.instanceId])
    const dead = [e1, e2, e3].filter((x) => !alive(s, "p2", x)).length
    assert(dead === want, `地竜${want}体なので相手のスピリットを${want}体破壊する`)
    assert(alive(s, "p2", big), "BP4000を超える相手は破壊されない")
    const gained = [edmont, van].reduce((n, x) => n + x.cores, 0) - 2
    assert(gained === (green ? 1 : 0), green ? "緑シンボルあり：自分のスピリットにコアが1個置かれる" : "緑シンボルが無ければコアは置かれない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 008 召喚時：BP5000以下の相手のスピリット3体を破壊する ===")
{
    const s = game("great-3", "main")
    const e1 = put(s, "p2", VAN, 1)
    const e2 = put(s, "p2", VAN, 1)
    const e3 = put(s, "p2", STIRA, 3) // Lv2 BP5000
    const e4 = put(s, "p2", VAN, 1)
    const big = put(s, "p2", LANCE, 3) // Lv2 BP7000
    s.players.p1.hand = [GREAT]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グレートアトラクター・ドラゴンを召喚できる")
    settle(s, [e1.instanceId, e2.instanceId, e3.instanceId])
    assert(!alive(s, "p2", e1) && !alive(s, "p2", e2) && !alive(s, "p2", e3), "選んだBP5000以下の3体が破壊される（BP5000ちょうども含む）")
    assert(alive(s, "p2", e4), "4体目は破壊されない（3体まで）")
    assert(alive(s, "p2", big), "BP7000の相手は破壊されない")
}
{
    const s = game("great-2", "main")
    const e1 = put(s, "p2", VAN, 1)
    const e2 = put(s, "p2", VAN, 1)
    const big = put(s, "p2", LANCE, 3)
    s.players.p1.hand = [GREAT]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    settle(s)
    assert(!alive(s, "p2", e1) && !alive(s, "p2", e2), "対象が2体しかいなければその2体だけ破壊する")
    assert(alive(s, "p2", big), "BP5000を超える相手は残る")
}

console.log("=== 056 【合体時】『合体アタック時』：シンボル1つだけのスピリットにブロックされたとき、相手のライフのコア1個を相手のリザーブに置く ===")
function rugops(blockerId: string, seed: string): { lifeDelta: number; reserveDelta: number } {
    const s = game(seed)
    const host = put(s, "p1", STIRA, 1) // コスト5
    combine(s, "p1", host, RUGOPS)
    const blocker = put(s, "p2", blockerId, 1)
    const life0 = s.players.p2.life
    const reserve0 = s.players.p2.reserve
    attack(s, host)
    settle(s)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    settle(s)
    return { lifeDelta: life0 - s.players.p2.life, reserveDelta: s.players.p2.reserve - reserve0 }
}
{
    const one = rugops(VAN, "rugops-one") // シンボル1つ
    const two = rugops(ILL, "rugops-two") // シンボル2つ
    assert(one.lifeDelta === 1 && two.lifeDelta === 0, "シンボル1つのブロッカーにだけ、ライフが1つ減る（2つのときは減らない）")
    assert(one.reserveDelta - two.reserveDelta === 1, "減ったライフのコアは相手のリザーブへ（ブロッカーのコアの分を除きちょうど+1）")
}
{
    const s = game("rugops-unblocked")
    const host = put(s, "p1", STIRA, 1)
    combine(s, "p1", host, RUGOPS)
    put(s, "p2", VAN, 1)
    const life0 = s.players.p2.life
    attack(s, host)
    settle(s)
    assert(takeLifeAndResolve(s, "p2") === null, "ブロックせずライフで受ける")
    assert(life0 - s.players.p2.life === 2, "ブロックされなかったときは効果で減らず、合体スピリットのシンボル2つぶんだけ減る（5→3）")
}

console.log("=== 074 フラッシュ：BP5000以下の相手のスピリット2体を破壊する。連鎖[緑]：相手は、相手のスピリット2体を疲労させる ===")
for (const green of [true, false]) {
    const s = game(green ? "disaster-green" : "disaster-nogreen")
    const atk = put(s, "p1", VAN, 1)
    if (green) put(s, "p1", BEETLE, 1)
    const e1 = put(s, "p2", VAN, 1)
    const e2 = put(s, "p2", STIRA, 3) // Lv2 BP5000
    const e3 = put(s, "p2", VAN, 1)
    const e4 = put(s, "p2", VAN, 1)
    const big = put(s, "p2", LANCE, 3) // Lv2 BP7000
    s.players.p1.hand = [DISASTER]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュでフレイムディザスターを使用できる")
    settle(s, [e1.instanceId, e2.instanceId, e3.instanceId, e4.instanceId, big.instanceId])
    const dead = [e1, e2, e3, e4].filter((x) => !alive(s, "p2", x)).length
    assert(dead === 2, "BP5000以下の相手のスピリットがちょうど2体破壊される")
    assert(alive(s, "p2", big), "BP7000の相手は破壊されない")
    const rested = s.players.p2.field.spirits.filter((x) => x.isRested).length
    assert(rested === (green ? 2 : 0), green ? "緑シンボルあり：相手は自分のスピリット2体を疲労させる" : "緑シンボルが無ければ疲労させない")
    assert(s.players.p1.trashCards.includes(DISASTER), "使ったマジックはトラッシュへ")
}

console.log("すべてのチェックに合格しました 🎉（part824）")
