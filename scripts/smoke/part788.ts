// smoke パート788（BS20-072 海の主の大口・BS20-X06 森羅龍樹リーフ・シードラ：コスト2以下のアタック禁止・アタック時効果発揮のコア支払い・バーストの色制限・アタック中のマジック使用禁止・連鎖）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, getCard, handleAction, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const N072 = "BS20-072" // 海の主の大口（青・ネクサス・コスト4・Lvコア0/1）
const X06 = "BS20-X06" // 森羅龍樹リーフ・シードラ（青・コスト7・Lvコア1/4/6）
const BAI = "BS01-034" // バイ・パイソン（紫・コスト3・Lv1『このスピリットのアタック時』ドロー1）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const BENKEI = "BS14-030" // グラント・ベンケイ（緑・コスト5）緑シンボル要員
const ELIXIR = "BS01-142" // ピュアエリクサー（白・マジック・コスト3・フラッシュ）
const RAISIN = "BS14-114" // 雷神轟招来（青・マジック・バースト：自分のライフ減少後）
const REKKO = "BS14-092" // 烈光閃刃（赤・マジック・バースト：自分のライフ減少後）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; symbol: string[]; levels: { level: number; cores: number }[] }[]
    const n072 = staging.find((c) => c.cardId === N072)
    const x06 = staging.find((c) => c.cardId === X06)
    assert(n072?.name === "海の主の大口" && n072.type === "nexus" && n072.cost === 4 && n072.colors[0] === "blue", "N072は海の主の大口（青・ネクサス・コスト4）")
    assert(n072?.levels.map((l) => l.cores).join("/") === "0/1" && n072.symbol.join(",") === "blue", "N072のLvコアは0/1・シンボルは青1")
    assert(x06?.name === "森羅龍樹リーフ・シードラ" && x06.type === "spirit" && x06.cost === 7 && x06.colors[0] === "blue", "X06は森羅龍樹リーフ・シードラ（青・スピリット・コスト7）")
    assert(x06?.levels.map((l) => l.cores).join("/") === "1/4/6" && x06.symbol.length === 2, "X06のLvコアは1/4/6・シンボルは青2")
    assert(getCard(BAI).name === "バイ・パイソン" && getCard(BAI).cost === 3 && (getCard(BAI).effect ?? "").includes("アタック時"), "BAIはバイ・パイソン（コスト3・アタック時ドロー1）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).cost === 2, "SABERはテラノセイバー（コスト2）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1, "VANはロクケラトプス（コスト1）")
    assert(getCard(BENKEI).name === "グラント・ベンケイ" && getCard(BENKEI).colors[0] === "green", "BENKEIはグラント・ベンケイ（緑）")
    assert(getCard(ELIXIR).name === "ピュアエリクサー" && getCard(ELIXIR).type === "magic", "ELIXIRはピュアエリクサー（白マジック）")
    assert(getCard(RAISIN).name === "雷神轟招来" && getCard(RAISIN).type === "magic" && getCard(RAISIN).colors[0] === "blue" && (getCard(RAISIN).effect ?? "").includes("ライフ減少後"), "RAISINは雷神轟招来（青マジック・ライフ減少後バースト）")
    assert(getCard(REKKO).name === "烈光閃刃" && getCard(REKKO).type === "magic" && getCard(REKKO).colors[0] === "red" && (getCard(REKKO).effect ?? "").includes("ライフ減少後"), "REKKOは烈光閃刃（赤マジック・ライフ減少後バースト）")
}

function game(seed: string, turnPlayer: PlayerId): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 10
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// pendingChoice を1つ答える（「支払って効果を発揮しますか」は declinePay のとき断る）
function settleStep(s: GameState, declinePay: boolean): string | null {
    const pc = s.pendingChoice as { pid: PlayerId; kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
    if (!pc) return "pendingChoice が無い"
    const res: Record<string, unknown> = { type: "resolveChoice" }
    if (pc.kind === "option") {
        const o = pc.options ?? []
        if (declinePay && pc.prompt.includes("支払")) {
            // option を送らない＝断る
        } else {
            res["option"] = o.includes("発動する") ? "発動する" : (o[0] ?? "")
        }
    } else if (pc.kind === "target") res["instanceId"] = pc.candidates?.[0]
    else res["cardIndex"] = pc.cardIndices?.[0]
    return handleAction(s, pc.pid, res as never)
}

// pendingChoice を答えきり、フラッシュタイミングが開いていればパスで閉じる。出た確認の文言を返す
function drain(s: GameState, declinePay = false): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 30; i++) {
        const pc = s.pendingChoice as { prompt: string } | null
        if (pc) {
            prompts.push(pc.prompt)
            if (settleStep(s, declinePay) !== null) break
            continue
        }
        if (s.isFlashTiming && s.battle) {
            if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
            continue
        }
        break
    }
    return prompts
}

// 072 Lv2 の「リザーブのコア1個をトラッシュに置くか」の確認に答える（pay=true で払う）
function payPrompt(s: GameState, pay: boolean): string {
    const pc = s.pendingChoice as { pid: PlayerId; kind: string; prompt: string; options?: string[] } | null
    assert(pc !== null && pc.pid === "p2", "払う確認はアタックした側（p2）に聞かれる")
    if (pc === null) return ""
    assert(pc.kind === "option" && (pc.options ?? []).length >= 2, "払う／払わないの選択肢が出る")
    assert(pc.prompt.includes("コア"), `確認の文言にコアへの言及がある（${pc.prompt}）`)
    const o = pc.options ?? []
    const payOpt = o.find((x) => x.includes("置く")) ?? o[0]!
    const pick = pay ? payOpt : (o.find((x) => x !== payOpt) ?? o[0]!)
    assert(act(s, "p2", { type: "resolveChoice", option: pick }) === null, "払う確認に答える")
    return pc.prompt
}

console.log("=== A. 072 Lv2・払う：相手のアタック時効果より先に払う確認→払えば効果は発揮される ===")
{
    const s = game("a", "p2")
    putNexus(s, "p1", N072, 1) // Lv2
    const atk = put(s, "p2", BAI, 1) // コスト3・アタック時ドロー1
    s.players.p2.reserve = 5
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "コスト3のスピリットでアタックできる")
    payPrompt(s, true)
    assert(s.players.p2.reserve === 4 && s.players.p2.trashCores === 1, "払うと相手のリザーブ-1・トラッシュ+1")
    assert(s.players.p2.hand.length === 1 && s.players.p2.deck.length === 39, "アタック時効果（ドロー1）は発揮される")
    takeLifeAndResolve(s, "p1")
    drain(s)
    assert(s.players.p1.life === 4, "アタック自体は有効なのでライフで受ける")
}

console.log("=== B. 072 Lv2・払わない：そのアタックの間、アタック時効果は発揮されない ===")
{
    const s = game("b", "p2")
    putNexus(s, "p1", N072, 1) // Lv2
    const atk = put(s, "p2", BAI, 1)
    s.players.p2.reserve = 5
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言はできる")
    payPrompt(s, false)
    assert(s.players.p2.reserve === 5 && s.players.p2.trashCores === 0, "払わないのでリザーブもトラッシュも変わらない")
    assert(s.players.p2.hand.length === 0 && s.players.p2.deck.length === 40, "アタック時効果（ドロー1）は発揮されない")
    takeLifeAndResolve(s, "p1")
    drain(s)
    assert(s.players.p1.life === 4, "アタックは続くのでライフで受ける")
}

console.log("=== C. 072 Lv2・払えない：相手のリザーブが0なら確認なしで発揮されない ===")
{
    const s = game("c", "p2")
    putNexus(s, "p1", N072, 1) // Lv2
    const atk = put(s, "p2", BAI, 1)
    s.players.p2.reserve = 0
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "リザーブ0でもアタック宣言はできる")
    assert(s.pendingChoice === null, "払えないので確認は出ない")
    assert(s.players.p2.hand.length === 0 && s.players.p2.deck.length === 40, "アタック時効果（ドロー1）は発揮されない")
    takeLifeAndResolve(s, "p1")
    drain(s)
    assert(s.players.p1.life === 4, "アタックは続くのでライフで受ける")
}

console.log("=== D. 072 Lv1：コスト2以下のスピリットは自分・相手のどちらのアタックステップでもアタックできない ===")
{
    const s = game("d1", "p1")
    putNexus(s, "p1", N072, 0) // Lv1
    const saber = put(s, "p1", SABER, 1) // コスト2
    const van = put(s, "p1", VAN, 1) // コスト1
    const bai = put(s, "p1", BAI, 1) // コスト3
    assert(act(s, "p1", { type: "attack", instanceId: saber.instanceId }) !== null, "自分のコスト2のスピリットはアタックできない")
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) !== null, "自分のコスト1のスピリットもアタックできない")
    assert(act(s, "p1", { type: "attack", instanceId: bai.instanceId }) === null, "コスト3のスピリットはアタックできる")
    takeLifeAndResolve(s, "p2")
    drain(s)
}
{
    const s = game("d2", "p2")
    putNexus(s, "p1", N072, 0) // Lv1（持ち主は p1）
    const saber = put(s, "p2", SABER, 1) // コスト2
    assert(act(s, "p2", { type: "attack", instanceId: saber.instanceId }) !== null, "相手（p2）のコスト2のスピリットもアタックできない")
}

console.log("=== E. X06 Lv1：相手は自分のフィールドのシンボルと同じ色のバーストしか発動できない ===")
{
    const s = game("e1", "p1")
    const x06 = put(s, "p1", X06, 1) // Lv1
    put(s, "p2", VAN, 1) // p2 の場は赤シンボルのみ
    s.players.p2.burst = RAISIN // 青のマジックバースト
    s.players.p2.burstSet = true
    const atk = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    takeLifeAndResolve(s, "p2")
    const prompts = drain(s, true)
    assert(!prompts.some((p) => p.includes("バースト")), `赤シンボルしかない相手の青バーストは発動確認が出ない（${prompts.join("／")}）`)
    assert(s.players.p2.burst === RAISIN, "青のバーストは伏せたまま残る")
}
{
    const s = game("e2", "p1")
    const x06 = put(s, "p1", X06, 1) // Lv1
    put(s, "p2", VAN, 1) // p2 の場は赤シンボルのみ
    s.players.p2.burst = REKKO // 赤のマジックバースト
    s.players.p2.burstSet = true
    const atk = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    takeLifeAndResolve(s, "p2")
    const prompts = drain(s, true)
    assert(prompts.some((p) => p.includes("烈光閃刃")), `赤のバーストは発動確認が出る（${prompts.join("／")}）`)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === atk.instanceId), "発動されたバーストでBP1000のロクケラトプスは破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === x06.instanceId), "BP6000のX06は残る")
    assert(s.players.p2.burst === null, "発動したバーストは消費される")
}

console.log("=== F. X06 Lv2『アタック時』：そのアタックの間、相手はマジックカードを使用できない ===")
{
    const s = game("f1", "p1")
    const x06 = put(s, "p1", X06, 4) // Lv2
    s.players.p2.hand = [ELIXIR]
    s.players.p2.reserve = 10
    assert(act(s, "p1", { type: "attack", instanceId: x06.instanceId }) === null, "X06でアタック宣言")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) !== null, "Lv2のX06のアタック中は相手はマジックを使用できない")
    assert(s.players.p2.hand.length === 1, "マジックは手札に残ったまま")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパスする")
    takeLifeAndResolve(s, "p2")
    drain(s)
}
{
    const s = game("f2", "p1")
    const x06 = put(s, "p1", X06, 1) // Lv1（『アタック時』のマジック禁止はLv2から）
    s.players.p2.hand = [ELIXIR]
    s.players.p2.reserve = 10
    assert(act(s, "p1", { type: "attack", instanceId: x06.instanceId }) === null, "X06でアタック宣言")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "Lv1のアタック中なら相手はマジックを使用できる")
    assert(s.players.p2.hand.length === 0, "マジックは使用済み")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側がパスする")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側もパスする")
    takeLifeAndResolve(s, "p2")
    drain(s)
}

console.log("=== G. X06 連鎖（緑シンボル）：BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア2個をリザーブへ ===")
{
    const s = game("g1", "p1")
    const x06 = put(s, "p1", X06, 4) // Lv2 BP10000
    put(s, "p1", BENKEI, 1) // 自分の緑シンボル
    const blocker = put(s, "p2", VAN, 1) // BP1000
    assert(act(s, "p1", { type: "attack", instanceId: x06.instanceId }) === null, "X06でアタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側もパスする")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "BP1000のスピリットでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュ：攻撃側パス")
    drain(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP負けしたブロッカーだけが破壊される")
    assert(s.players.p2.life === 3, "連鎖で相手のライフは2つ減る（ブロックされているので通常のライフ減少は無い）")
    assert(s.players.p2.reserve === 13, "ライフのコア2個がリザーブへ（破壊されたブロッカーのコア1個も戻る）")
}
{
    const s = game("g2", "p1")
    const x06 = put(s, "p1", X06, 4) // Lv2（緑シンボルは無し）
    const blocker = put(s, "p2", VAN, 1) // BP1000
    assert(act(s, "p1", { type: "attack", instanceId: x06.instanceId }) === null, "X06でアタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "BP1000のスピリットでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュ：防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュ：攻撃側パス")
    drain(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP負けしたブロッカーは破壊される")
    assert(s.players.p2.life === 5, "緑シンボルが無ければ連鎖は起きない")
    assert(s.players.p2.reserve === 11, "増えるのは破壊されたブロッカーのコア1個だけ")
}

console.log("すべてのチェックに合格しました 🎉（part788）")
