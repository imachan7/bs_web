// smoke パート800（BS21-013・054・058：メインステップのボイド増 core 禁止・アタックステップのトラッシュ core 禁止・相手ドローでデッキ破棄・星魂アタックでコスト枚数破棄・合体時【粉砕】でコア除去。BS21_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, effectiveBp, endTurn, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BUNNY = "BS21-013" // 怪盗バット・バニーガール（紫・コスト3・夜族）
const HERA = "BS21-054" // 英傑巨人ヘラクラス（青・コスト6・闘神/星魂）
const GARGOYL = "BS21-058" // ガーゴイラス（紫・ブレイヴ・コスト4・魔影・合体条件コスト4以上）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const GATHER = "BS01-136" // ギャザーフォース（緑・マジック・コスト3・メイン：ボイドからコア1個を自分のリザーブに）
const HEAL = "BS09-078" // ヒーリングサークル（白・マジック・コスト5・メイン：ボイドからコア1個を自分のライフに）
const CARRY = "SD01-037" // キャリーコア（緑・マジック・コスト3・フラッシュ：ボイドからコア1個を自分のリザーブに）
const DOUBLE = "BS01-117" // ダブルドロー（赤・マジック・コスト4・メイン：2枚ドロー）
const MANTIS = "P014" // マンティスター（緑・コスト5・怪虫・アタック時：トラッシュからコア2個をリザーブに）
const DATAS = "BS20-050" // トライデントのデータス（青・コスト4・闘神・【粉砕】）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; colors: string[]; cost: number; family: string[]; levels: { level: number; cores: number; bp: number }[]; effect: string }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const cores = (id: string) => byId(id)?.levels.map((l) => l.cores).join("/")
    const bps = (id: string) => byId(id)?.levels.map((l) => l.bp).join("/")
    assert(byId(BUNNY)?.name === "怪盗バット・バニーガール" && byId(BUNNY)!.type === "spirit" && byId(BUNNY)!.colors[0] === "purple" && byId(BUNNY)!.cost === 3 && byId(BUNNY)!.family.includes("夜族") && cores(BUNNY) === "1/2/4" && bps(BUNNY) === "2000/3000/4000", "BUNNYは怪盗バット・バニーガール（紫・コスト3・夜族・Lvコア1/2/4・BP2000/3000/4000）")
    assert(byId(HERA)?.name === "英傑巨人ヘラクラス" && byId(HERA)!.type === "spirit" && byId(HERA)!.colors[0] === "blue" && byId(HERA)!.cost === 6 && byId(HERA)!.family.includes("星魂") && cores(HERA) === "1/3/5" && bps(HERA) === "6000/8000/10000", "HERAは英傑巨人ヘラクラス（青・コスト6・闘神/星魂・Lvコア1/3/5・BP6000/8000/10000）")
    assert(byId(GARGOYL)?.name === "ガーゴイラス" && byId(GARGOYL)!.type === "brave" && byId(GARGOYL)!.colors[0] === "purple" && byId(GARGOYL)!.cost === 4 && byId(GARGOYL)!.family.includes("魔影") && byId(GARGOYL)!.effect.includes("コスト4以上"), "GARGOYLはガーゴイラス（紫・ブレイヴ・コスト4・魔影・合体条件コスト4以上）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).effect === "", "VANはロクケラトプス（赤・コスト1・効果なし）")
    assert(getCard(GATHER).name === "ギャザーフォース" && getCard(GATHER).type === "magic" && getCard(GATHER).cost === 3 && getCard(GATHER).effect.includes("ボイドからコア1個を自分のリザーブに"), "GATHERはギャザーフォース（メイン：ボイドからリザーブに1個）")
    assert(getCard(HEAL).name === "ヒーリングサークル" && getCard(HEAL).type === "magic" && getCard(HEAL).cost === 5 && getCard(HEAL).effect.includes("ボイドからコア1個を自分のライフに"), "HEALはヒーリングサークル（メイン：ボイドからライフに1個）")
    assert(getCard(CARRY).name === "キャリーコア" && getCard(CARRY).type === "magic" && getCard(CARRY).cost === 3 && getCard(CARRY).effect.includes("フラッシュ"), "CARRYはキャリーコア（フラッシュ：ボイドからリザーブに1個）")
    assert(getCard(DOUBLE).name === "ダブルドロー" && getCard(DOUBLE).type === "magic" && getCard(DOUBLE).cost === 4 && getCard(DOUBLE).effect.includes("2枚ドロー"), "DOUBLEはダブルドロー（メイン：2枚ドロー）")
    assert(getCard(MANTIS).name === "マンティスター" && getCard(MANTIS).cost === 5 && getCard(MANTIS).family.includes("怪虫") && getCard(MANTIS).effect.includes("トラッシュから、コア2個を自分のリザーブ"), "MANTISはマンティスター（緑・コスト5・怪虫・アタック時にトラッシュからコア2個）")
    assert(getCard(DATAS).name === "トライデントのデータス" && getCard(DATAS).cost === 4 && getCard(DATAS).effect.includes("【粉砕】"), "DATASはトライデントのデータス（青・コスト4・【粉砕】）")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "blue" })
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

// 対象の選択は picks を優先して答える
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        const next = pc.kind === "target" ? (picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]) : undefined
        const err = next !== undefined
            ? act(s, who, { type: "resolveChoice", instanceId: next })
            : pc.kind === "option" ? act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" }) : act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

console.log("=== A. 013 Lv1『お互いのメインステップ』：お互い、ボイドからコアを増やせない（リザーブにもライフにも） ===")
{
    const s = game("bunny-main-own", "main")
    put(s, "p1", BUNNY, 1) // Lv1
    s.players.p1.hand = [GATHER, HEAL]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ギャザーフォースをメインで使用できる")
    settle(s)
    assert(s.players.p1.reserve === 17, "コスト3は払うがボイドからリザーブには増えない（20→17）")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ヒーリングサークルをメインで使用できる")
    settle(s)
    assert(s.players.p1.life === 5 && s.players.p1.reserve === 12, "ボイドからライフにも置けない（ライフ5のまま・コスト5だけ払う）")
}
{
    const s = game("bunny-main-opp", "main", "p2")
    put(s, "p1", BUNNY, 1) // Lv1・p1のスピリットだがお互いに効く
    s.players.p2.hand = [GATHER]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "相手もギャザーフォースをメインで使用できる")
    settle(s)
    assert(s.players.p2.reserve === 17, "相手もボイドからコアを増やせない（20→17）")
}
{
    // 境目：アタックステップなら Lv1 の効果は効かないのでボイドから置ける
    const s = game("bunny-attack-void", "attack")
    put(s, "p1", BUNNY, 1) // Lv1
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックする")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    s.players.p1.hand = [CARRY]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: van.instanceId }) === null, "フラッシュでキャリーコアを使用できる")
    settle(s, [van.instanceId])
    assert(s.players.p1.reserve === 18, "アタックステップならボイドからリザーブに置ける（コスト3を払って20-3+1=18）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
}

console.log("=== B. 013 Lv2『お互いのアタックステップ』：お互い、トラッシュのコアをフィールド/リザーブに置けない ===")
{
    const s = game("bunny-lv2-trash", "attack")
    put(s, "p1", BUNNY, 2) // Lv2
    s.players.p1.trashCores = 5
    const mantis = put(s, "p1", MANTIS, 1)
    assert(act(s, "p1", { type: "attack", instanceId: mantis.instanceId }) === null, "マンティスターでアタックする")
    settle(s)
    assert(s.players.p1.reserve === 20 && s.players.p1.trashCores === 5, "Lv2なのでトラッシュからコア2個をリザーブに置けない")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
}
{
    // 境目：Lv1 ではアタックステップのトラッシュ封じは起きない
    const s = game("bunny-lv1-trash", "attack")
    put(s, "p1", BUNNY, 1) // Lv1
    s.players.p1.trashCores = 5
    const mantis = put(s, "p1", MANTIS, 1)
    assert(act(s, "p1", { type: "attack", instanceId: mantis.instanceId }) === null, "マンティスターでアタックする")
    settle(s)
    assert(s.players.p1.reserve === 22 && s.players.p1.trashCores === 3, "Lv1なのでトラッシュからコア2個をリザーブに置ける（20→22・トラッシュ5→3）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
}

console.log("=== C. 054 Lv1：相手の効果で相手の手札が増えたら、増えた枚数だけ相手のデッキを破棄する ===")
{
    const s = game("hera-oppdraw", "main", "p2")
    put(s, "p1", HERA, 1) // Lv1
    s.players.p2.hand = [DOUBLE]
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "相手がダブルドローをメインで使用できる")
    settle(s)
    assert(s.players.p2.hand.length === 2 && s.players.p2.deck.length === 36, "2枚ドローとは別にデッキが2枚破棄される（手札2枚・デッキ40→36）")
    assert(s.players.p2.trashCards.length === 3, "破棄された2枚と使ったダブルドローがトラッシュに置かれる")
}
{
    // 境目：ドローステップのドロー（効果ではない）では破棄されない
    const s = game("hera-drawstep", "main", "p1")
    put(s, "p1", HERA, 1) // Lv1
    endTurn(s) // 相手（p2）のターンのスタート→コア→ドローステップを実際に通す
    assert(s.turnPlayer === "p2", "相手のターンになる")
    assert(s.players.p2.deck.length === 39 && s.players.p2.trashCards.length === 0, "ドローステップのドローではデッキは1枚しか減らない")
}

console.log("=== D. 054 Lv2『自分のアタックステップ』：星魂のアタックでライフを減らしたらコスト枚数破棄 ===")
{
    const s = game("hera-seikon", "attack")
    const hera = put(s, "p1", HERA, 3) // Lv2・星魂
    assert(act(s, "p1", { type: "attack", instanceId: hera.instanceId }) === null, "ヘラクラス（星魂）でアタックする")
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4 && s.players.p2.deck.length === 34, "ライフを減らしたのでコスト6枚破棄（デッキ40→34）")
}
{
    // 境目：星魂でないスピリットのアタックでは起きない
    const s = game("hera-non-seikon", "attack")
    put(s, "p1", HERA, 3) // Lv2
    const van = put(s, "p1", VAN, 1) // 地竜・星魂ではない
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプス（星魂ではない）でアタックする")
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4 && s.players.p2.deck.length === 40, "星魂でないのでデッキは破棄されない")
}

console.log("=== E. 058【合体時】『合体アタック時』：このスピリットの効果でデッキを破棄したら相手のフィールドのコア1個をリザーブへ ===")
{
    const s = game("gargoyl-combined", "attack")
    const datas = put(s, "p1", DATAS, 1) // Lv1・【粉砕】
    combine(s, "p1", datas, GARGOYL) // データスはコスト4なので合体条件を満たす
    const van = put(s, "p2", VAN, 2)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: datas.instanceId }) === null, "合体スピリットで合体アタックする")
    settle(s, [van.instanceId])
    assert(s.players.p2.deck.length === 39, "【粉砕】Lv1 で相手のデッキを1枚破棄")
    assert(van.cores === 1 && s.players.p2.reserve === reserve + 1, "破棄したので相手のフィールドのコア1個が相手のリザーブへ（2→1）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
}
{
    // 境目：合体していなければ【粉砕】で破棄してもコアは動かない
    const s = game("gargoyl-alone", "attack")
    const datas = put(s, "p1", DATAS, 1) // 合体していない
    const van = put(s, "p2", VAN, 2)
    const reserve = s.players.p2.reserve
    assert(act(s, "p1", { type: "attack", instanceId: datas.instanceId }) === null, "データス単体でアタックする")
    settle(s)
    assert(s.players.p2.deck.length === 39, "【粉砕】でデッキは1枚破棄される")
    assert(van.cores === 2 && s.players.p2.reserve === reserve, "合体していないので相手のフィールドのコアは動かない")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    takeLifeAndResolve(s, "p2")
}

console.log("すべてのチェックに合格しました 🎉（part800）")
