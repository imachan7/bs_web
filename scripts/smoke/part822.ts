// smoke パート822（BS22 B10：X08・X05・031・071。BS22_PLAN §1・§2、BS19_PLAN §2.1 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, effectiveCost, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X08 = "BS22-X08" // 夢幻の天剣トワイライト・ファンタジア（黄・ブレイヴ・コスト5）
const X05 = "BS22-X05" // 凶神獣カオス・ペガサロス（黄・コスト7・Lvコア1/2/3）
const SILI = "BS22-031" // 水晶竜シリマナイト（白・コスト4・Lvコア1/2/4）
const ROSE = "BS22-071" // 朱に染まる薔薇園（黄赤・ネクサス・Lvコア0/1）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1BP3000・効果なし）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・BP4000・効果なし）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・BP6000・効果なし）
const LEO = "BS16-043" // スペードビースト・レオ（黄・コスト6・シンボル2つ・効果なし）
const GATEAU = "BS21-040" // ガトーブレパス（黄・コスト3・【聖命】）
const ROM = "BS02-059" // ロム（黄・コスト3・効果なし）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・軽減青3）
const FLAMEGUST = "BS09-069" // フレイムガスト（赤・マジック・フラッシュ：BP6000以下の相手のスピリット1体を破壊）
const HAZE = "BS19-102" // パープルヘイズ（紫・マジック・フラッシュ：相手のスピリット1体のコア1個をリザーブへ）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ）

console.log("=== 前提: カードの機械確認 ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; colors: string[]; cost: number; symbol: string[]; levels: { cores: number }[] }[]
    const by = (id: string) => staging.find((c) => c.cardId === id)
    assert(by(X08)?.name === "夢幻の天剣トワイライト・ファンタジア" && by(X08)!.type === "brave" && by(X08)!.cost === 5 && by(X08)!.colors.join() === "yellow", "X08は黄のブレイヴ・コスト5")
    assert(by(X05)?.name === "凶神獣カオス・ペガサロス" && by(X05)!.type === "spirit" && by(X05)!.levels.map((l) => l.cores).join("/") === "1/2/3", "X05は黄のスピリット（Lvコア1/2/3）")
    assert(by(SILI)?.name === "水晶竜シリマナイト" && by(SILI)!.colors.join() === "white" && by(SILI)!.levels.map((l) => l.cores).join("/") === "1/2/4", "031は白のスピリット（Lvコア1/2/4）")
    assert(by(ROSE)?.name === "朱に染まる薔薇園" && by(ROSE)!.type === "nexus" && by(ROSE)!.colors.join() === "yellow,red" && by(ROSE)!.levels.map((l) => l.cores).join("/") === "0/1", "071は黄赤のネクサス（Lvコア0/1）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "" && getCard(VAN).colors.join() === "red", "VANは赤のバニラ")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).cost === 5 && getCard(STIRA).colors.join() === "red", "STIRAは赤・コスト5")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).type === "spirit", "SABERはテラノセイバー")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).levels[0]!.bp === 6000, "TARANはBP6000")
    assert(getCard(LEO).name === "スペードビースト・レオ" && getCard(LEO).symbol.length === 2 && getCard(LEO).effect === "", "LEOはシンボル2つの効果なし")
    assert(getCard(GATEAU).name === "ガトーブレパス" && getCard(GATEAU).effect.includes("【聖命】"), "GATEAUは【聖命】")
    assert(getCard(ROM).name === "ロム" && getCard(ROM).colors.join() === "yellow" && getCard(ROM).effect === "", "ROMは黄のバニラ")
    assert(getCard(ARNOLD).name === "ディープ・アーノルド" && getCard(ARNOLD).colors.join() === "blue" && getCard(ARNOLD).cost === 4, "ARNOLDは青・コスト4")
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).colors.join() === "red", "FLAMEGUSTは赤のマジック")
    assert(getCard(HAZE).name === "パープルヘイズ" && getCard(HAZE).colors.join() === "purple", "HAZEは紫のマジック")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave", "KARAKURIはブレイヴ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

type Answer = "accept" | "decline"
// target は picks 優先。確認は accept＝先頭の選択肢、decline＝選択肢を付けずに応答
function settle(s: GameState, answer: Answer = "accept", picks: string[] = []): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (answer === "decline") err = act(s, who, { type: "resolveChoice" })
        else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// 防御側が先にパス→攻撃側パス→ブロックせずライフで受ける
function unblocked(s: GameState, attacker: PlayerId, defender: PlayerId, answer: Answer = "accept"): void {
    settle(s, answer)
    assert(act(s, defender, { type: "pass" }) === null, "アタック直後は防御側が先にパス")
    assert(act(s, attacker, { type: "pass" }) === null, "攻撃側もパス")
    settle(s, answer)
    takeLifeAndResolve(s, defender)
    settle(s, answer)
}

console.log("=== 031 Lv1-3：お互いのライフは、ターンごとに、シンボル2つ以上のスピリット1体から1しか減らない ===")
{
    const s = game("sili-opp-double")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", SILI, 1)
    const leo = put(s, "p2", LEO, 1)
    assert(act(s, "p2", { type: "attack", instanceId: leo.instanceId }) === null, "相手のレオ（シンボル2つ）でアタック")
    unblocked(s, "p2", "p1")
    assert(s.players.p1.life === 4, `シンボル2つのスピリットでも自分のライフは1しか減らない（${s.players.p1.life}）`)
}
{
    const s = game("sili-none")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const leo = put(s, "p2", LEO, 1)
    assert(act(s, "p2", { type: "attack", instanceId: leo.instanceId }) === null, "031がいないときのレオでアタック")
    unblocked(s, "p2", "p1")
    assert(s.players.p1.life === 3, `031がいなければシンボル2つぶんの2減る（${s.players.p1.life}）`)
}
{
    const s = game("sili-own-double")
    put(s, "p1", SILI, 1)
    const leo = put(s, "p1", LEO, 1)
    assert(act(s, "p1", { type: "attack", instanceId: leo.instanceId }) === null, "自分のレオでアタック")
    unblocked(s, "p1", "p2")
    assert(s.players.p2.life === 4, `お互いのライフなので相手のライフも1しか減らない（${s.players.p2.life}）`)
}
{
    const s = game("sili-two-spirits")
    put(s, "p1", SILI, 1)
    const leo1 = put(s, "p1", LEO, 1)
    const leo2 = put(s, "p1", LEO, 1)
    assert(act(s, "p1", { type: "attack", instanceId: leo1.instanceId }) === null, "1体目でアタック")
    unblocked(s, "p1", "p2")
    assert(act(s, "p1", { type: "attack", instanceId: leo2.instanceId }) === null, "2体目でアタック")
    unblocked(s, "p1", "p2")
    assert(s.players.p2.life === 3, `別のスピリットからはそれぞれ1減る（${s.players.p2.life}）`)
}
{
    const s = game("sili-single-symbol")
    put(s, "p1", SILI, 1)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "シンボル1つのVANでアタック")
    unblocked(s, "p1", "p2")
    assert(s.players.p2.life === 4, "シンボル1つのスピリットは通常どおり1減る")
}

console.log("=== 031 Lv1-3【重装甲：赤/緑/白】：相手の赤/緑/白の効果を受けない（ほかの色は受ける） ===")
{
    const s = game("sili-armor-red")
    const sili = put(s, "p1", SILI, 1) // Lv1・BP4000
    const atk = put(s, "p2", SABER, 1)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [FLAMEGUST]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック（フラッシュタイミングを作る）")
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" } as never)
    settle(s, "accept", [sili.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === sili.instanceId), "赤のマジックでは031は破壊されない")
}
{
    const s = game("sili-armor-purple")
    const sili = put(s, "p1", SILI, 3) // Lv2
    const atk = put(s, "p2", SABER, 1)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [HAZE]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    act(s, "p1", { type: "pass" })
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" } as never) === null, "紫のマジックを使える")
    settle(s, "accept", [sili.instanceId])
    assert(sili.cores === 2, `紫の効果は受ける（コア3→${sili.cores}）`)
}

console.log("=== 031 Lv2-3：自分の合体していないスピリットすべてに【重装甲：赤/緑/白】を与える（Lv1は与えない・合体中は与えない） ===")
for (const [label, siliCores, expectAlive] of [["Lv2", 2, true], ["Lv1", 1, false]] as const) {
    const s = game(`sili-grant-${label}`)
    put(s, "p1", SILI, siliCores)
    const van = put(s, "p1", VAN, 1)
    const atk = put(s, "p2", SABER, 1)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [FLAMEGUST]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" } as never)
    settle(s, "accept", [van.instanceId])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId) === expectAlive, `031が${label}のとき、味方のVANは赤のマジックで${expectAlive ? "破壊されない" : "破壊される"}`)
}
{
    const s = game("sili-grant-combined")
    put(s, "p1", SILI, 2)
    const van = put(s, "p1", VAN, 1)
    combine(s, "p1", van, KARAKURI)
    const atk = put(s, "p2", SABER, 1)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.players.p2.hand = [FLAMEGUST]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    act(s, "p1", { type: "pass" })
    act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" } as never)
    settle(s, "accept", [van.instanceId])
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "合体しているスピリットには与えないので破壊される")
}

console.log("=== X05 Lv3『自分のアタックステップ』：【聖命】で自分のライフが増えるかわりに、相手のライフのコア1個を相手のトラッシュに置ける ===")
{
    const s = game("x05-accept")
    const x05 = put(s, "p1", X05, 3) // Lv3・【聖命】あり
    assert(act(s, "p1", { type: "attack", instanceId: x05.instanceId }) === null, "X05でアタック")
    unblocked(s, "p1", "p2", "accept")
    assert(s.players.p2.life === 3, `アタックで1・置き換えで1、相手のライフは5→3（${s.players.p2.life}）`)
    assert(s.players.p2.trashCores === 1, `相手のライフのコアが相手のトラッシュへ（${s.players.p2.trashCores}）`)
    assert(s.players.p1.life === 5, `置き換えたので自分のライフは増えない（${s.players.p1.life}）`)
}
{
    const s = game("x05-decline")
    const x05 = put(s, "p1", X05, 3)
    assert(act(s, "p1", { type: "attack", instanceId: x05.instanceId }) === null, "X05でアタック")
    unblocked(s, "p1", "p2", "decline")
    assert(s.players.p2.life === 4 && s.players.p2.trashCores === 0, `「置ける」なので断ればアタックの1だけ（${s.players.p2.life}）`)
    assert(s.players.p1.life === 6, `断れば通常の【聖命】で自分のライフが増える（${s.players.p1.life}）`)
}
{
    const s = game("x05-blocked")
    const x05 = put(s, "p1", X05, 3)
    const blocker = put(s, "p2", TARAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: x05.instanceId }) === null, "X05でアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックされる")
    settle(s, "accept")
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
    settle(s, "accept")
    assert(s.players.p2.life === 5 && s.players.p2.trashCores === 0 && s.players.p1.life === 5, "ブロックされてライフを減らしていないので【聖命】は働かず置き換えも起きない")
}

console.log("=== X05 Lv1-2：自分の【聖命】すべてに効く（ほかのスピリットの【聖命】も置き換える）／相手の【聖命】は置き換えない ===")
{
    const s = game("x05-other-seimei")
    put(s, "p1", X05, 1) // Lv1
    const g = put(s, "p1", GATEAU, 1)
    assert(act(s, "p1", { type: "attack", instanceId: g.instanceId }) === null, "ガトーブレパスでアタック")
    unblocked(s, "p1", "p2", "accept")
    assert(s.players.p2.life === 3 && s.players.p2.trashCores === 1 && s.players.p1.life === 5, `自分のガトーブレパスの【聖命】も置き換わる（相手${s.players.p2.life}・自分${s.players.p1.life}）`)
}
{
    const s = game("x05-opp-seimei")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", X05, 3)
    const g = put(s, "p2", GATEAU, 1)
    assert(act(s, "p2", { type: "attack", instanceId: g.instanceId }) === null, "相手のガトーブレパスでアタック")
    unblocked(s, "p2", "p1", "accept")
    assert(s.players.p2.life === 6 && s.players.p1.life === 4 && s.players.p1.trashCores === 0, `相手の【聖命】は置き換えない（相手${s.players.p2.life}・自分${s.players.p1.life}）`)
}

console.log("=== X05 Lv3【連鎖：条件《赤シンボル》】[赤]：トラッシュのスピリットカード1枚を手札に戻す ===")
for (const [label, withRed, answer] of [["赤シンボルあり・置き換える", true, "accept"], ["赤シンボルあり・置き換えを断る", true, "decline"], ["赤シンボルなし", false, "accept"]] as const) {
    const s = game(`x05-chain-${label}`)
    const x05 = put(s, "p1", X05, 3)
    if (withRed) put(s, "p1", VAN, 1)
    s.players.p1.trashCards = [SABER]
    assert(act(s, "p1", { type: "attack", instanceId: x05.instanceId }) === null, "X05でアタック")
    unblocked(s, "p1", "p2", answer)
    assert(s.players.p1.hand.includes(SABER) === withRed, `${label}：トラッシュのスピリットは${withRed ? "手札に戻る（連鎖元を置き換えても連鎖は出る）" : "戻らない"}`)
    assert(s.players.p1.trashCards.includes(SABER) === !withRed, `${label}：トラッシュの枚数`)
}
{
    const s = game("x05-chain-nospirit")
    const x05 = put(s, "p1", X05, 3)
    put(s, "p1", VAN, 1)
    s.players.p1.trashCards = [FLAMEGUST]
    assert(act(s, "p1", { type: "attack", instanceId: x05.instanceId }) === null, "X05でアタック")
    unblocked(s, "p1", "p2", "accept")
    assert(!s.players.p1.hand.includes(FLAMEGUST), "スピリットカードでなければ戻さない")
}

console.log("=== X08 Lv1『このブレイヴの召喚時』：ライフが5以下のとき、リザーブのコア1個を自分のライフに置ける ===")
for (const [label, life, answer, expectLife] of [["ライフ5・置く", 5, "accept", 6], ["ライフ5・断る", 5, "decline", 5], ["ライフ6", 6, "accept", 6]] as const) {
    const s = game(`x08-summon-${label}`)
    s.phase = "main"
    s.players.p1.life = life
    s.players.p1.hand = [X08]
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "X08を召喚できる")
    settle(s, answer)
    assert(s.players.p1.life === expectLife, `${label}：ライフ${life}→${expectLife}（${s.players.p1.life}）`)
    const lifeUp = expectLife - life
    assert(s.players.p1.reserve === reserve - 5 - 1 - lifeUp, `${label}：召喚コスト5・Lv1のコア1個に加えて置いたぶんだけリザーブが減る（${s.players.p1.reserve}）`)
}

console.log("=== X08【合体中】『アタック時』：ブロックされたら回復／ブロックされなかったらボイドからコア1個をライフに ===")
{
    const s = game("x08-blocked")
    const host = put(s, "p1", STIRA, 3) // コスト5・Lv2
    combine(s, "p1", host, X08)
    const blocker = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    settle(s, "accept")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックされる")
    settle(s, "accept")
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
    settle(s, "accept")
    assert(!host.isRested, "ブロックされたので回復する")
    assert(s.players.p1.life === 5, `ブロックされたのでライフは増えない（${s.players.p1.life}）`)
}
{
    const s = game("x08-unblocked")
    const host = put(s, "p1", STIRA, 3)
    combine(s, "p1", host, X08)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    unblocked(s, "p1", "p2")
    assert(s.players.p1.life === 6, `ブロックされなかったのでボイドからコア1個が自分のライフへ（${s.players.p1.life}）`)
    assert(host.isRested, "ブロックされていないので回復しない")
    assert(s.players.p2.life === 3, "合体スピリットはシンボル2つなのでアタックで2減る")
}
{
    const s = game("x08-alone")
    const host = put(s, "p1", STIRA, 3) // 合体していない
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体していないスピリットでアタック")
    unblocked(s, "p1", "p2")
    assert(s.players.p1.life === 5, "合体していなければライフは増えない")
}

console.log("=== 071 Lv1-2『自分のアタックステップ』：自分のライフが増えたとき、デッキから1枚ドロー ===")
{
    const s = game("rose-draw")
    putNexus(s, "p1", ROSE, 0) // Lv1
    const g = put(s, "p1", GATEAU, 1)
    const deck = s.players.p1.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: g.instanceId }) === null, "ガトーブレパスでアタック")
    unblocked(s, "p1", "p2")
    assert(s.players.p1.life === 6, "【聖命】で自分のライフが増える")
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === deck - 1, `アタックステップ中にライフが増えたので1枚ドロー（手札${s.players.p1.hand.length}）`)
}
{
    const s = game("rose-nonexus")
    const g = put(s, "p1", GATEAU, 1)
    assert(act(s, "p1", { type: "attack", instanceId: g.instanceId }) === null, "ガトーブレパスでアタック")
    unblocked(s, "p1", "p2")
    assert(s.players.p1.life === 6 && s.players.p1.hand.length === 0, "ネクサスが無ければドローしない")
}
{
    const s = game("rose-main")
    s.phase = "main"
    putNexus(s, "p1", ROSE, 0)
    s.players.p1.hand = [X08]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "X08を召喚")
    settle(s, "accept")
    assert(s.players.p1.life === 6, "メインステップでもライフは増える")
    assert(s.players.p1.hand.length === 0, "メインステップなのでドローしない")
}
{
    const s = game("rose-opp")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    putNexus(s, "p1", ROSE, 0)
    const g = put(s, "p2", GATEAU, 1)
    assert(act(s, "p2", { type: "attack", instanceId: g.instanceId }) === null, "相手のガトーブレパスでアタック")
    unblocked(s, "p2", "p1")
    assert(s.players.p2.life === 6, "相手のライフが増える")
    assert(s.players.p1.hand.length === 0 && s.players.p2.hand.length === 0, "相手のライフが増えても、相手のターンでも、071の持ち主はドローしない")
}

console.log("=== 071 Lv2『自分のメインステップ』：手札の赤のスピリット/ブレイヴの軽減シンボルすべてを黄としても扱う ===")
for (const [label, cores, phase, expected] of [["Lv2・メイン", 1, "main", 1], ["Lv1", 0, "main", 3], ["Lv2・アタックステップ", 1, "attack", 3]] as const) {
    const s = game(`rose-cost-${label}`)
    s.phase = phase
    putNexus(s, "p1", ROSE, cores)
    put(s, "p1", ROM, 1)
    put(s, "p1", ROM, 1)
    put(s, "p1", VAN, 1)
    const cost = effectiveCost(s, "p1", getCard(STIRA))
    assert(cost === expected, `${label}：場の赤2（VAN・071）＋黄3（ロム2体・071）。コスト5の赤スピリット（軽減赤4）は${expected}（${cost}）`)
}
{
    const s = game("rose-cost-blue")
    s.phase = "main"
    putNexus(s, "p1", ROSE, 1)
    put(s, "p1", ROM, 1)
    put(s, "p1", ROM, 1)
    put(s, "p1", VAN, 1)
    assert(effectiveCost(s, "p1", getCard(ARNOLD)) === 4, "赤でない手札（青）の軽減は黄としても扱わない")
}
{
    const s = game("rose-cost-opp")
    s.phase = "main"
    putNexus(s, "p1", ROSE, 1)
    put(s, "p2", ROM, 1)
    put(s, "p2", ROM, 1)
    put(s, "p2", VAN, 1)
    assert(effectiveCost(s, "p2", getCard(STIRA)) === 4, "相手の手札には効かない")
}

{
    // 1つの軽減シンボルは場のシンボル1つで1回だけ（Q22532・Q22533）。071 だけの場は赤1・黄1
    const s = game("rose-cost-once")
    s.phase = "main"
    putNexus(s, "p1", ROSE, 1)
    assert(effectiveCost(s, "p1", getCard("BS01-008")) === 2, "軽減赤1のコスト3は、場の赤と黄で二重に数えず2")
    assert(effectiveCost(s, "p1", getCard("BS03-005")) === 1, "軽減赤2のコスト3は、場の赤1＋黄1を赤として数えて1")
    s.players.p1.field.nexuses[0]!.cores = 0
    refreshLevelAsOverrides(s)
    assert(effectiveCost(s, "p1", getCard("BS03-005")) === 2, "Lv1 なら黄は赤として扱わず、場の赤1だけで2")
}

console.log("すべてのチェックに合格しました 🎉（part822）")
