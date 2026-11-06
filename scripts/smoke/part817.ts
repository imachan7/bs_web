// smoke パート817（BS22-070・X06・067：付与の絞り込み。BS22_PLAN §1・§2 の確定読み。3枚は staging にしか無いので実装前は落ちる）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, effectiveBp, endTurn, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const FACTORY = "BS22-070" // 水銀海に浮かぶ工場島（白紫・ネクサス・コスト5・Lvコア0/2）
const DURANZAM = "BS22-X06" // 海皇巨神デュランザム（青・コスト10・闘神・Lvコア1/4/6）
const RENZAN = "BS22-067" // 聖剣連山（赤・ネクサス・コスト5・Lvコア0/1）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・効果なし）
const MADORO = "BS17-010" // マッドーロ（紫・コスト0・効果なし）
const JINSHIN_S = "BS03-072" // 槍兵のジェフリー（青・闘神・コスト1・Lv1BP2000・効果なし）
const JINSHIN_L = "BS09-051" // 竜鎧の巨人オージアス（青・闘神・コスト5・Lv1BP4000・効果はLv2のみ）
const TARAN = "BS16-025" // タランドーズ（緑・殻人・コスト6・Lv1BP6000・効果なし）
const KARAKURI = "BS20-060" // カラクリバッタ（緑ブレイヴ・剣刃でない・コスト4・合体条件コスト4以上）
const KENJIN = "BS20-X07" // 咎人の骨剣エグゼキューショナーズ（紫ブレイヴ・剣刃・コスト5・合体条件コスト5以上）
const BELROCK = "BS18-036" // 聖地の巨獣ベルロック（白・コスト8・効果はブロック時のみ）
const RIBBON = "BS01-146" // ドリームリボン（白・マジック・フラッシュ：相手のスピリット1体を手札に戻す）
const THORN = "BS01-134" // バインディングソーン（緑・マジック・フラッシュ：相手のスピリット1体を疲労させる）
const COFFIN = "BS06-097" // ブラッディコフィン（紫・マジック・フラッシュ：疲労状態のコスト4以下のスピリット1体を破壊する）
const DRAW2 = "SD06-013" // 双翼乱舞（赤・マジック・コスト5・メイン：2枚ドロー。バーストを持つ）

console.log("=== 前提: カードの機械確認（BS22 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const f = byId(FACTORY)
    assert(f?.name === "水銀海に浮かぶ工場島" && f.type === "nexus" && f.cost === 5 && f.colors.join() === "white,purple" && f.levels.map((l) => l.cores).join("/") === "0/2", "FACTORYは工場島（白紫ネクサス・コスト5・Lvコア0/2）")
    const d = byId(DURANZAM)
    assert(d?.name === "海皇巨神デュランザム" && d.type === "spirit" && d.cost === 10 && d.family.includes("闘神") && d.levels.map((l) => l.cores).join("/") === "1/4/6", "DURANZAMはデュランザム（青・コスト10・闘神・Lvコア1/4/6）")
    assert(d!.levels[0]!.bp === 7000, "DURANZAMのLv1 BPは7000")
    const r = byId(RENZAN)
    assert(r?.name === "聖剣連山" && r.type === "nexus" && r.colors.join() === "red" && r.levels.map((l) => l.cores).join("/") === "0/1", "RENZANは聖剣連山（赤ネクサス・Lvコア0/1）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス（効果なし）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).colors.join() === "white", "BELLは白")
    assert(getCard(MADORO).name === "マッドーロ" && getCard(MADORO).colors.join() === "purple" && getCard(MADORO).cost === 0 && getCard(MADORO).effect === "", "MADOROは紫・コスト0・効果なし")
    assert(getCard(JINSHIN_S).name === "槍兵のジェフリー" && getCard(JINSHIN_S).cost === 1 && getCard(JINSHIN_S).family.includes("闘神") && getCard(JINSHIN_S).levels[0]!.bp === 2000 && getCard(JINSHIN_S).effect === "", "JINSHIN_Sは闘神・コスト1・Lv1BP2000・効果なし")
    assert(getCard(JINSHIN_L).name === "竜鎧の巨人オージアス" && getCard(JINSHIN_L).cost === 5 && getCard(JINSHIN_L).family.includes("闘神") && getCard(JINSHIN_L).levels[0]!.bp === 4000, "JINSHIN_Lは闘神・コスト5・Lv1BP4000")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && !getCard(TARAN).family.includes("闘神"), "TARANは闘神でないコスト6")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave" && getCard(KARAKURI).cost === 4 && !getCard(KARAKURI).family.includes("剣刃"), "KARAKURIは剣刃でないブレイヴ（コスト4）")
    assert(getCard(KENJIN).name === "咎人の骨剣エグゼキューショナーズ" && getCard(KENJIN).type === "brave" && getCard(KENJIN).cost === 5 && getCard(KENJIN).family.includes("剣刃"), "KENJINは剣刃のブレイヴ（コスト5）")
    assert(getCard(BELROCK).name === "聖地の巨獣ベルロック" && getCard(BELROCK).cost === 8 && getCard(BELROCK).colors.join() === "white", "BELROCKは白・コスト8")
    assert(getCard(RIBBON).name === "ドリームリボン" && getCard(RIBBON).type === "magic" && getCard(RIBBON).colors.join() === "white", "RIBBONは白マジック")
    assert(getCard(THORN).name === "バインディングソーン" && getCard(THORN).type === "magic" && getCard(THORN).colors.join() === "green", "THORNは緑マジック")
    assert(getCard(COFFIN).name === "ブラッディコフィン" && getCard(COFFIN).type === "magic" && getCard(COFFIN).colors.join() === "purple", "COFFINは紫マジック")
    assert(getCard(DRAW2).name === "双翼乱舞" && getCard(DRAW2).type === "magic" && getCard(DRAW2).effect.includes("【バースト"), "DRAW2は双翼乱舞（バースト持ちのマジック）")
}

type Inst = ReturnType<typeof createInstance>

function game(seed: string, p2Color: "blue" | "white" | "green" | "purple" | "red" = "green", p1Color: "red" | "blue" | "white" = "red"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
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

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: Inst, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

// 選択は picks を優先。確認（option）は accept が真なら「発動する」、偽なら選択肢を付けずに断る
function settle(s: GameState, picks: string[] = [], accept = true): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.cardIndices && pc.cardIndices.length > 0 && accept) {
            err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0]! })
        } else if (pc.candidates && pc.candidates.length > 0) {
            err = act(s, who, { type: "resolveChoice", instanceId: picks.find((x) => pc.candidates!.includes(x)) ?? pc.candidates[0]! })
        } else if (pc.options && pc.options.length > 0) {
            err = accept ? act(s, who, { type: "resolveChoice", option: pc.options.includes("発動する") ? "発動する" : pc.options[0]! }) : act(s, who, { type: "resolveChoice" })
        } else {
            err = act(s, who, { type: "resolveChoice" })
        }
        if (err) break
    }
}

function attack(s: GameState, inst: Inst, picks: string[] = []): void {
    assert(act(s, "p1", { type: "attack", instanceId: inst.instanceId }) === null, "アタックを宣言できる")
    settle(s, picks)
}

const has = (s: GameState, pid: PlayerId, inst: Inst) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

console.log("=== X06 Lv1･2･3：系統「闘神」の自分のスピリットすべてをBP+5000する（闘神でない・相手のは対象外） ===")
{
    const s = game("x06-bp", "blue", "blue")
    put(s, "p1", DURANZAM, 1)
    const lance = put(s, "p1", JINSHIN_S, 1)
    const van = put(s, "p1", VAN, 1)
    const oppLance = put(s, "p2", JINSHIN_S, 1)
    assert(effectiveBp(s, "p1", lance) === 7000, "自分の闘神（ジェフリー）はBP+5000（2000→7000）")
    assert(effectiveBp(s, "p1", van) === 1000, "闘神でないロクケラトプスはそのまま")
    assert(effectiveBp(s, "p2", oppLance) === 2000, "相手の闘神には効かない")
}
{
    const s = game("x06-bp-lv2", "blue", "blue")
    const d = put(s, "p1", DURANZAM, 4) // Lv2
    assert(effectiveBp(s, "p1", d) === 20000, "デュランザム自身も闘神なのでLv2 BP15000+5000")
}
{
    const s = game("x06-bp-none", "blue", "blue")
    const lance = put(s, "p1", JINSHIN_S, 1)
    assert(effectiveBp(s, "p1", lance) === 2000, "デュランザムがいなければBP+5000されない")
}

console.log("=== X06 Lv1･2･3【大粉砕】『アタック時』：Lv1につき5枚破棄し、バーストを持つカードが破棄されたら相手のスピリット1体を破壊する ===")
for (const withBurst of [true, false]) {
    const s = game(withBurst ? "x06-crush-burst" : "x06-crush-none", "red", "blue")
    s.players.p2.deck = Array.from({ length: 40 }, () => (withBurst ? DRAW2 : VAN))
    const d = put(s, "p1", DURANZAM, 1) // Lv1
    const victim = put(s, "p2", VAN, 1)
    attack(s, d, [victim.instanceId])
    assert(s.players.p2.deck.length === 35, "Lv1のデュランザムは相手のデッキを5枚破棄する")
    assert(has(s, "p2", victim) === !withBurst, withBurst ? "バーストを持つカードが破棄されたので相手のスピリット1体が破壊される" : "バーストを持つカードが無ければ破壊しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== X06 Lv2･Lv3：コスト5以上の闘神の自分の合体していないスピリットすべてに【大粉砕】を与える ===")
for (const withBurst of [true, false]) {
    const s = game(withBurst ? "x06-grant-burst" : "x06-grant-none", "red", "blue")
    s.players.p2.deck = Array.from({ length: 40 }, () => (withBurst ? DRAW2 : VAN))
    put(s, "p1", DURANZAM, 4) // Lv2
    const big = put(s, "p1", JINSHIN_L, 1) // コスト5・Lv1
    const victim = put(s, "p2", VAN, 1)
    attack(s, big, [victim.instanceId])
    assert(s.players.p2.deck.length === 35, "コスト5の闘神はアタック時に5枚破棄する（付与された【大粉砕】）")
    assert(has(s, "p2", victim) === !withBurst, withBurst ? "付与された【大粉砕】でバースト持ちが破棄されると相手のスピリット1体を破壊する" : "バースト持ちが無ければ破壊しない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("x06-grant-lv2-spirit", "red", "blue")
    s.players.p2.deck = Array.from({ length: 40 }, () => DRAW2)
    put(s, "p1", DURANZAM, 4)
    const big = put(s, "p1", JINSHIN_L, 4) // Lv2
    const victim = put(s, "p2", VAN, 1)
    attack(s, big, [victim.instanceId])
    assert(s.players.p2.deck.length === 30, "付与された【大粉砕】は付与された側のLvで数える（Lv2なら10枚）")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("x06-grant-cheap", "red", "blue")
    s.players.p2.deck = Array.from({ length: 40 }, () => DRAW2)
    put(s, "p1", DURANZAM, 4)
    const small = put(s, "p1", JINSHIN_S, 1) // コスト1
    const victim = put(s, "p2", VAN, 1)
    attack(s, small, [victim.instanceId])
    assert(s.players.p2.deck.length === 40, "コスト5未満の闘神には【大粉砕】は付かない")
    assert(has(s, "p2", victim), "破壊もしない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("x06-grant-combined", "red", "blue")
    s.players.p2.deck = Array.from({ length: 40 }, () => DRAW2)
    put(s, "p1", DURANZAM, 4)
    const big = put(s, "p1", JINSHIN_L, 1)
    combine(s, "p1", big, KARAKURI)
    const victim = put(s, "p2", VAN, 1)
    attack(s, big, [victim.instanceId])
    assert(s.players.p2.deck.length === 40, "合体しているスピリットには【大粉砕】は付かない")
    assert(has(s, "p2", victim), "破壊もしない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("x06-grant-nonfamily", "red", "blue")
    s.players.p2.deck = Array.from({ length: 40 }, () => DRAW2)
    put(s, "p1", DURANZAM, 4)
    const taran = put(s, "p1", TARAN, 1) // 闘神でないコスト6
    const victim = put(s, "p2", VAN, 1)
    attack(s, taran, [victim.instanceId])
    assert(s.players.p2.deck.length === 40, "闘神でないスピリットには【大粉砕】は付かない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("x06-grant-lv1", "red", "blue")
    s.players.p2.deck = Array.from({ length: 40 }, () => DRAW2)
    put(s, "p1", DURANZAM, 1) // Lv1：付与はLv2･Lv3のみ
    const big = put(s, "p1", JINSHIN_L, 1)
    const victim = put(s, "p2", VAN, 1)
    attack(s, big, [victim.instanceId])
    assert(s.players.p2.deck.length === 40, "デュランザムがLv1のあいだは【大粉砕】を与えない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 067 Lv1･Lv2『自分のアタックステップ』：系統「剣刃」のブレイヴと合体している自分の合体スピリットすべてをBP+3000する ===")
{
    const s = game("renzan-bp")
    const host = put(s, "p1", JINSHIN_L, 1)
    combine(s, "p1", host, KENJIN)
    const other = put(s, "p1", TARAN, 1)
    const before = effectiveBp(s, "p1", host)
    const beforeOther = effectiveBp(s, "p1", other)
    putNexus(s, "p1", RENZAN, 0) // Lv1
    assert(effectiveBp(s, "p1", host) === before + 3000, "Lv1：剣刃のブレイヴと合体した合体スピリットはBP+3000")
    assert(effectiveBp(s, "p1", other) === beforeOther, "合体していないスピリットはそのまま")
}
{
    const s = game("renzan-bp-lv2")
    const host = put(s, "p1", JINSHIN_L, 1)
    combine(s, "p1", host, KENJIN)
    const before = effectiveBp(s, "p1", host)
    putNexus(s, "p1", RENZAN, 1) // Lv2
    assert(effectiveBp(s, "p1", host) === before + 3000, "Lv2でもBP+3000（重ねて+6000にはならない）")
}
{
    const s = game("renzan-bp-notbrave")
    const host = put(s, "p1", JINSHIN_L, 1)
    combine(s, "p1", host, KARAKURI)
    const before = effectiveBp(s, "p1", host)
    putNexus(s, "p1", RENZAN, 1)
    assert(effectiveBp(s, "p1", host) === before, "剣刃でないブレイヴと合体した合体スピリットにはBP+されない")
}
{
    const s = game("renzan-bp-main")
    s.phase = "main"
    const host = put(s, "p1", JINSHIN_L, 1)
    combine(s, "p1", host, KENJIN)
    const before = effectiveBp(s, "p1", host)
    putNexus(s, "p1", RENZAN, 1)
    assert(effectiveBp(s, "p1", host) === before, "自分のアタックステップでない（メインステップ）ならBP+されない")
}
{
    const s = game("renzan-bp-opp")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const host = put(s, "p1", JINSHIN_L, 1)
    combine(s, "p1", host, KENJIN)
    const before = effectiveBp(s, "p1", host)
    putNexus(s, "p1", RENZAN, 1)
    assert(effectiveBp(s, "p1", host) === before, "相手のアタックステップではBP+されない")
}
{
    const s = game("renzan-bp-theirs")
    const theirs = put(s, "p2", JINSHIN_L, 1)
    combine(s, "p2", theirs, KENJIN)
    const before = effectiveBp(s, "p2", theirs)
    putNexus(s, "p1", RENZAN, 1)
    assert(effectiveBp(s, "p2", theirs) === before, "相手の合体スピリットにはBP+されない")
}

console.log("=== 067 Lv2：コスト13以上の自分の合体スピリットは、相手のスピリット/マジックの効果の対象になるたび手札1枚を破棄することで、その効果を受けない ===")
// 相手のドリームリボン（手札に戻す）をアタック中の自分の合体スピリットに撃たせる。アタック直後のフラッシュは防御側が先
function ribbonScene(seed: string, braveId: string, hostId: string, nexusCores: number, hand: string[], accept: boolean): { s: GameState; host: Inst } {
    const s = game(seed, "white")
    const host = put(s, "p1", hostId, 1)
    combine(s, "p1", host, braveId)
    if (nexusCores >= 0) putNexus(s, "p1", RENZAN, nexusCores)
    s.players.p1.hand = [...hand]
    s.players.p2.hand = [RIBBON]
    put(s, "p2", BELL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s, [], false) // KENJIN【合体時】『バトル時』の確認はアタック宣言の直後に出る（TIMING_CHART §2A）。断る
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "相手がフラッシュでドリームリボンを使用できる")
    settle(s, [host.instanceId], accept)
    return { s, host }
}
{
    const { s, host } = ribbonScene("renzan-imm-accept", KENJIN, BELROCK, 1, [VAN], true) // 8+5=13
    assert(has(s, "p1", host), "コスト13の合体スピリットは手札1枚を破棄してドリームリボンを受けない")
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.includes(VAN), "手札1枚が破棄される")
}
{
    const { s, host } = ribbonScene("renzan-imm-decline", KENJIN, BELROCK, 1, [VAN], false)
    assert(!has(s, "p1", host), "破棄を断ればドリームリボンを受けて手札に戻る")
    assert(s.players.p1.hand.length >= 1 && s.players.p1.hand.includes(VAN) && s.players.p1.hand.includes(BELROCK), "手札は破棄されず、戻ったホストが加わる")
}
{
    const { s, host } = ribbonScene("renzan-imm-nohand", KENJIN, BELROCK, 1, [], true)
    assert(!has(s, "p1", host), "手札が無ければ破棄できないので効果を受ける")
}
{
    const { s, host } = ribbonScene("renzan-imm-cost12", KARAKURI, BELROCK, 1, [VAN], true) // 8+4=12
    assert(!has(s, "p1", host), "コスト12の合体スピリットには効かない（効果を受ける）")
    assert(s.players.p1.hand.includes(VAN), "確認も出ず手札は破棄されない")
}
{
    const { s, host } = ribbonScene("renzan-imm-lv1", KENJIN, BELROCK, 0, [VAN], true)
    assert(!has(s, "p1", host), "ネクサスがLv1なら効果を受ける")
    assert(s.players.p1.hand.includes(VAN), "手札は破棄されない")
}
{
    const { s, host } = ribbonScene("renzan-imm-nonexus", KENJIN, BELROCK, -1, [VAN], true)
    assert(!has(s, "p1", host), "聖剣連山が無ければ効果を受ける")
}

console.log("=== 070 Lv1･Lv2『相手のターン』：相手の効果で相手の手札が増えたとき、増えたカード1枚につき相手は自分の手札1枚を破棄する ===")
{
    const s = game("factory-discard")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    s.phase = "main"
    putNexus(s, "p1", FACTORY, 0) // Lv1
    s.players.p2.hand = [DRAW2, VAN, VAN]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "相手が双翼乱舞をメインで使用できる")
    settle(s)
    assert(s.players.p2.hand.length === 2, "2枚ドローして2枚破棄する（手札2→4→2）")
    assert(s.players.p2.trashCards.filter((c) => c === VAN).length >= 2, "破棄した2枚が相手のトラッシュにある")
}
{
    const s = game("factory-draw-step")
    s.phase = "main"
    putNexus(s, "p1", FACTORY, 0)
    s.players.p2.hand = [VAN, VAN]
    endTurn(s)
    assert(s.turnPlayer === "p2", "相手のターンになった")
    assert(s.players.p2.hand.length === 3, "ドローステップのドローは効果ではないので破棄させない（2→3）")
}
{
    const s = game("factory-own-draw")
    s.phase = "main"
    putNexus(s, "p1", FACTORY, 2)
    s.players.p1.hand = [DRAW2]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "自分が双翼乱舞をメインで使用できる")
    settle(s)
    assert(s.players.p1.hand.length === 2 && s.pendingChoice === null, "自分の手札が増えても破棄しない（自分のターン・自分の効果）")
}

console.log("=== 070 Lv2：自分の紫/白のスピリットすべてに【重装甲：紫/白】を与える（相手の紫/白の効果を受けない。ほかの色の効果は受ける） ===")
// 相手のフラッシュを、アタック中の別のスピリットを挟んで自分の別のスピリットへ向ける
function armorScene(seed: string, p2Color: "white" | "purple" | "green", magic: string, targetId: string, nexusCores: number, rested = false): { s: GameState; tgt: Inst; hand: number } {
    const s = game(seed, p2Color)
    const attacker = put(s, "p1", VAN, 1)
    const tgt = put(s, "p1", targetId, 1)
    tgt.isRested = rested
    putNexus(s, "p1", FACTORY, nexusCores)
    s.players.p2.hand = [magic]
    put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックを宣言できる")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "相手がフラッシュでマジックを使用できる")
    settle(s, [tgt.instanceId])
    return { s, tgt, hand: s.players.p1.hand.length }
}
{
    const { s, tgt } = armorScene("armor-white", "white", RIBBON, BELL, 2)
    assert(has(s, "p1", tgt), "白のスピリットは相手の白マジック（ドリームリボン）を受けない")
}
{
    const { s, tgt } = armorScene("armor-purple", "purple", COFFIN, MADORO, 2, true)
    assert(has(s, "p1", tgt), "紫のスピリットは相手の紫マジック（ブラッディコフィン）を受けない")
}
{
    const { s, tgt } = armorScene("armor-other-color-source", "green", THORN, BELL, 2)
    assert(has(s, "p1", tgt) && tgt.isRested, "相手の緑の効果は白のスピリットにも効く（疲労する）")
}
{
    const { s, tgt } = armorScene("armor-other-color-spirit", "white", RIBBON, VAN, 2)
    assert(!has(s, "p1", tgt), "赤のスピリットには【重装甲】が付かず、相手の白マジックで手札に戻る")
}
{
    const { s, tgt } = armorScene("armor-lv1", "white", RIBBON, BELL, 0)
    assert(!has(s, "p1", tgt), "Lv1のあいだは【重装甲】が付かず、白のスピリットも手札に戻る")
}

console.log("すべてのチェックに合格しました 🎉（part817）")
