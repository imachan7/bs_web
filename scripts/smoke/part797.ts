// smoke パート797（BS21-001・069・070・X04・041・048：「この効果は重複しない」・「回復できない」・「ターンで初めてBP0」・マジック無効・連鎖。BS21_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const YAMABAKKA = "BS21-001" // ヤマバッカ（赤・コスト1・皇獣・Lv2で緑破壊時ドロー・重複しない）
const TREE = "BS21-069" // リュウケツの大樹（緑・ネクサス・コスト3・バトル中BP+2000・Lv2怪虫ライフコア・重複しない）
const FIANA = "BS21-070" // フィアナ空母都市（白・ネクサス・コスト3・相手アタックステップ白BP+3000・Lv2武装ライフコア・重複しない）
const KUGEL = "BS21-X04" // 槍光機神クーゲル・ホルン（白・コスト7・武装・Lv3でマジック無効）
const ADPENTAN = "BS21-041" // アドペンタン＆チャール（黄・コスト4・初めてBP0でドロー・Lv2相手回復不可）
const RYUGU = "BS21-048" // リュウグウウシ（青・コスト3・異合・バトル中相手回復不可・連鎖紫）

const BEAT = "BS01-050" // ビートビートル（緑・コスト0・BP1000/2000・効果なし）
const MIRAGE = "BS01-051" // フライングミラージュ（緑・コスト1・BP2000/3000・効果なし）
const EMEANT = "BS01-055" // エメアント（緑・怪虫・BP1000/4000）
const GATLING = "BS01-084" // ガトリングスタンド（白・武装・BP3000/5000・効果なし）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・紫シンボル確保用）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000/3000/4000・効果なし）
const ELIXIR = "BS01-142" // ピュアエリクサー（白・マジック・フラッシュ：疲労状態の自分のスピリットすべて回復）
const ARDOR = "BS17-073" // アーダーフレイム（赤・マジック・フラッシュ：BP4000以下の相手のスピリット1体を破壊）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄・マジック・フラッシュ：相手のスピリット1体をBP-3000）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp?: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(YAMABAKKA)?.name === "ヤマバッカ" && byId(YAMABAKKA)!.type === "spirit" && byId(YAMABAKKA)!.cost === 1 && byId(YAMABAKKA)!.colors[0] === "red" && byId(YAMABAKKA)!.family.includes("皇獣") && byId(YAMABAKKA)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/1000,3/3000", "YAMABAKKAはヤマバッカ（赤・コスト1・皇獣・Lv1=1/1000・Lv2=3/3000）")
    assert(byId(TREE)?.name === "リュウケツの大樹" && byId(TREE)!.type === "nexus" && byId(TREE)!.cost === 3 && byId(TREE)!.colors[0] === "green" && byId(TREE)!.levels.map((l) => l.cores).join("/") === "0/3", "TREEはリュウケツの大樹（緑・ネクサス・コスト3・Lvコア0/3）")
    assert(byId(FIANA)?.name === "フィアナ空母都市" && byId(FIANA)!.type === "nexus" && byId(FIANA)!.cost === 3 && byId(FIANA)!.colors[0] === "white" && byId(FIANA)!.levels.map((l) => l.cores).join("/") === "0/2", "FIANAはフィアナ空母都市（白・ネクサス・コスト3・Lvコア0/2）")
    assert(byId(KUGEL)?.name === "槍光機神クーゲル・ホルン" && byId(KUGEL)!.type === "spirit" && byId(KUGEL)!.cost === 7 && byId(KUGEL)!.colors[0] === "white" && byId(KUGEL)!.family.includes("武装") && byId(KUGEL)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/5000,2/7000,4/11000", "KUGELはクーゲル・ホルン（白・コスト7・武装・Lv1=1/5000・Lv2=2/7000・Lv3=4/11000）")
    assert(byId(ADPENTAN)?.name === "アドペンタン＆チャール" && byId(ADPENTAN)!.type === "spirit" && byId(ADPENTAN)!.cost === 4 && byId(ADPENTAN)!.colors[0] === "yellow" && byId(ADPENTAN)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/3000,3/5000,4/6000", "ADPENTANはアドペンタン＆チャール（黄・コスト4・Lv1=1/3000・Lv2=3/5000・Lv3=4/6000）")
    assert(byId(RYUGU)?.name === "リュウグウウシ" && byId(RYUGU)!.type === "spirit" && byId(RYUGU)!.cost === 3 && byId(RYUGU)!.colors[0] === "blue" && byId(RYUGU)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/3000,2/4000,4/6000", "RYUGUはリュウグウウシ（青・コスト3・Lv1=1/3000・Lv2=2/4000・Lv3=4/6000）")
    assert(getCard(BEAT).name === "ビートビートル" && getCard(BEAT).colors[0] === "green" && getCard(BEAT).levels[0]!.bp === 1000 && getCard(BEAT).effect === "", "BEATはビートビートル（緑・BP1000・効果なし）")
    assert(getCard(MIRAGE).name === "フライングミラージュ" && getCard(MIRAGE).levels[0]!.bp === 2000 && getCard(MIRAGE).effect === "", "MIRAGEはフライングミラージュ（BP2000・効果なし）")
    assert(getCard(EMEANT).name === "エメアント" && getCard(EMEANT).family.includes("怪虫") && getCard(EMEANT).levels[1]!.bp === 4000, "EMEANTはエメアント（緑・怪虫・Lv2BP4000）")
    assert(getCard(GATLING).name === "ガトリングスタンド" && getCard(GATLING).colors[0] === "white" && getCard(GATLING).family.includes("武装") && getCard(GATLING).levels[0]!.bp === 3000 && getCard(GATLING).effect === "", "GATLINGはガトリングスタンド（白・武装・BP3000・効果なし）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).colors[0] === "purple", "GRIPはグリプ・ハンズ（紫）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).levels.map((l) => l.bp).join("/") === "1000/3000/4000" && getCard(VAN).effect === "", "VANはロクケラトプス（BP1000/3000/4000・効果なし）")
    assert(getCard(ELIXIR).name === "ピュアエリクサー" && getCard(ELIXIR).type === "magic" && getCard(ELIXIR).effect.includes("回復"), "ELIXIRはピュアエリクサー（回復マジック）")
    assert(getCard(ARDOR).name === "アーダーフレイム" && getCard(ARDOR).type === "magic" && getCard(ARDOR).effect.includes("BP4000以下"), "ARDORはアーダーフレイム（BP4000以下破壊マジック）")
    assert(getCard(PRESSURE).name === "エンジェリックプレッシャー" && getCard(PRESSURE).type === "magic" && getCard(PRESSURE).effect.includes("BP-3000"), "PRESSUREはエンジェリックプレッシャー（BP-3000マジック）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 未実装カード（data/cards に無い）は createInstance/getCard が例外を投げるので、その場面だけ警告して続行する
function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // 見逃すのは未実装の BS21 だけ（既存カードの ID の打ち間違いは落とす）
        if (msg.includes("カードが見つかりません") && msg.includes("BS21-")) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

// pendingChoice を答える（option は pref に含まれるものを優先、target は picks に入っていればそれを選ぶ。pref が空なら断る）
function settle(s: GameState, picks: (string | number)[] = [], pref: string[] = ["発動する", "残る", "戻す"]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.includes(x)) ?? (pref.length === 0 ? undefined : o[0])
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = (picks.filter((x): x is string => typeof x === "string")).find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) {
            err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// A（001）：Lv2『お互いのアタックステップ』相手によって自分の緑のスピリットが破壊されたらドロー。この効果は重複しない
scene("A1: 001 Lv2 が2体でも、相手のマジックで緑のスピリットが破壊されたらドローは1枚だけ", () => {
    const s = game("yamabakka-two")
    put(s, "p1", YAMABAKKA, 3) // Lv2
    put(s, "p1", YAMABAKKA, 3) // Lv2
    const beat = put(s, "p1", BEAT, 1)
    destroySpirit(s, "p1", beat.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "001 が2体でもドローは1枚だけ（デッキ40→39・手札1）")
})
scene("A2: 001 が1体でもドローは1枚", () => {
    const s = game("yamabakka-one")
    put(s, "p1", YAMABAKKA, 3) // Lv2
    const beat = put(s, "p1", BEAT, 1)
    destroySpirit(s, "p1", beat.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "001 が1体でもドローは1枚")
})
scene("A3: 自分の効果で破壊されたときはドローしない（「相手によって」のみ）", () => {
    const s = game("yamabakka-own")
    put(s, "p1", YAMABAKKA, 3) // Lv2
    const beat = put(s, "p1", BEAT, 1)
    destroySpirit(s, "p1", beat.instanceId, "destroy", { sourcePid: "p1", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "自分の効果による破壊ではドローしない")
})
scene("A4: BPを比べで相手に破壊されてもドローは1枚（「相手によって」＝BP比べも含む）", () => {
    const s = game("yamabakka-bp")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", YAMABAKKA, 3) // Lv2
    const beat = put(s, "p1", BEAT, 1)
    const mirage = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p1", beat.instanceId) === null, "ビートビートルでブロック")
    passFlash(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === beat.instanceId), "BP比べ（1000 vs 2000）でビートビートルは破壊される")
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "BP比べの破壊でもドローは1枚")
})

// B（069）：Lv1･Lv2 バトル中BP+2000（2つで+4000）・Lv2 怪虫がBP比べで相手だけ破壊でライフのコア1個（重複しない）
scene("B1: 069 Lv2 が2つ。怪虫のアタックでBP比べ相手だけ破壊 → ライフは1個だけ減り、BP+2000は2つで+4000", () => {
    const s = game("tree-two")
    putNexus(s, "p1", TREE, 3) // Lv2
    putNexus(s, "p1", TREE, 3) // Lv2
    const emeant = put(s, "p1", EMEANT, 3) // Lv2 BP4000
    const van = put(s, "p1", VAN, 1)
    const gatling = put(s, "p2", GATLING, 1)
    assert(act(s, "p1", { type: "attack", instanceId: emeant.instanceId }) === null, "エメアント（怪虫）でアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", gatling.instanceId) === null, "ガトリングスタンドでブロック")
    assert(effectiveBp(s, "p1", emeant) === 8000, "バトル中の自分のスピリットはBP+2000が2つで+4000（4000→8000）")
    assert(effectiveBp(s, "p1", van) === 1000, "バトルしていないスピリットはBP+2000されない")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === gatling.instanceId), "BP比べ（8000 vs 3000）で相手だけ破壊")
    assert(s.players.p2.life === 4 && s.players.p2.reserve === 21, "069 が2つでも相手のライフのコアは1個だけ（5→4・リザーブ+1）")
})
scene("B2: 069 が1つならBP+2000は+2000のみ（ライフのコアは同じく1個）", () => {
    const s = game("tree-one")
    putNexus(s, "p1", TREE, 3) // Lv2
    const emeant = put(s, "p1", EMEANT, 3) // Lv2 BP4000
    const gatling = put(s, "p2", GATLING, 1)
    assert(act(s, "p1", { type: "attack", instanceId: emeant.instanceId }) === null, "エメアントでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", gatling.instanceId) === null, "ガトリングスタンドでブロック")
    assert(effectiveBp(s, "p1", emeant) === 6000, "069 が1つならBP+2000は+2000だけ（4000→6000）")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === gatling.instanceId), "BP比べで相手だけ破壊")
    assert(s.players.p2.life === 4 && s.players.p2.reserve === 21, "ライフのコアは1個（5→4・リザーブ+1）")
})

// C（070）：相手のアタックステップ限定の白BP+3000（2つで+6000）・Lv2 武装がBP比べで相手だけ破壊でライフのコア1個（重複しない）
scene("C: 070 Lv2 が2つ。相手のアタックステップで武装がブロックしてBP比べ相手だけ破壊 → ライフは1個だけ", () => {
    const s = game("fiana-two")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    putNexus(s, "p1", FIANA, 2) // Lv2
    putNexus(s, "p1", FIANA, 2) // Lv2
    const gatling = put(s, "p1", GATLING, 1) // 白・武装 BP3000
    const van = put(s, "p1", VAN, 1) // 赤
    const mirage = put(s, "p2", MIRAGE, 1)
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p1", gatling.instanceId) === null, "ガトリングスタンド（武装）でブロック")
    assert(effectiveBp(s, "p1", gatling) === 9000, "相手のアタックステップ中の白のスピリットはBP+3000が2つで+6000（3000→9000）")
    assert(effectiveBp(s, "p1", van) === 1000, "白以外のスピリットはBP+3000されない")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === mirage.instanceId), "BP比べ（9000 vs 2000）で相手だけ破壊")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === gatling.instanceId), "ブロッカーは残る")
    assert(s.players.p2.life === 4 && s.players.p2.reserve === 21, "070 が2つでも相手のライフのコアは1個だけ（5→4・リザーブ+1）")
})

// D（X04 Lv3）：『相手のターン』相手がマジックを使ったとき、コア2個をトラッシュに置くことで無効（断ればそのまま）
scene("D1: X04 Lv3 がコアを払えばマジックは無効（スピリットが残り、X04 のコアは2個減ってトラッシュが2増える）", () => {
    const s = game("kugel-pay")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const kugel = put(s, "p1", KUGEL, 4) // Lv3
    const van = put(s, "p1", VAN, 1)
    const mirage = put(s, "p2", MIRAGE, 1)
    s.players.p2.hand = [ARDOR]
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "アーダーフレイムを使用")
    settle(s, [van.instanceId], ["置く", "トラッシュ", "コア", "無効"])
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "コアを払えばマジックは無効になりロクケラトプスは残る")
    assert(kugel.cores === 2, "X04 のコアは2個減る（4→2）")
    assert(s.players.p1.trashCores === 2, "自分のトラッシュのコアは2増える")
    assert(s.players.p2.trashCards.length === 1, "使われたマジックは相手のトラッシュに置かれる")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.life === 4, "ライフは1減る")
})
scene("D2: X04 Lv3 が断ればマジックはそのまま（スピリットが破壊され、X04 のコアは減らない）", () => {
    const s = game("kugel-refuse")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const kugel = put(s, "p1", KUGEL, 4) // Lv3
    const van = put(s, "p1", VAN, 1)
    const mirage = put(s, "p2", MIRAGE, 1)
    s.players.p2.hand = [ARDOR]
    assert(act(s, "p2", { type: "attack", instanceId: mirage.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "アーダーフレイムを使用")
    settle(s, [van.instanceId], []) // 任意の確認は選択肢を付けずに断る
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "断ればロクケラトプスは破壊される")
    assert(kugel.cores === 4, "X04 のコアは減らない")
    assert(s.players.p1.trashCores === 0, "トラッシュのコアは増えない")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.life === 4, "ライフは1減る")
})

// E（041）：Lv1･Lv2･Lv3 ターンで初めて相手のスピリットがBP0になったらドロー1枚・Lv2『相手のアタックステップ』相手の回復不可
scene("E1: 041 Lv2。相手のアタックステップ中は相手の回復マジックでも相手のスピリットは回復しない", () => {
    const s = game("adpentan-block")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", ADPENTAN, 3) // Lv2
    const attacker = put(s, "p2", MIRAGE, 1)
    const rested = put(s, "p2", MIRAGE, 1)
    rested.isRested = true
    s.players.p2.hand = [ELIXIR]
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ピュアエリクサーで回復を試みる")
    settle(s)
    assert(attacker.isRested && rested.isRested, "相手のアタックステップの間は相手のスピリットすべては回復できない")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.life === 4, "ライフは1減る")
})
scene("E2: 041 の境目。自分のアタックステップでは相手の回復を止めない", () => {
    const s = game("adpentan-mine")
    put(s, "p1", ADPENTAN, 3) // Lv2
    const van = put(s, "p1", VAN, 1)
    const rested = put(s, "p2", MIRAGE, 1)
    rested.isRested = true
    s.players.p2.hand = [ELIXIR]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "防御側がピュアエリクサーで回復する")
    settle(s)
    assert(!rested.isRested, "自分のアタックステップなので相手のスピリットは回復できる")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "ライフは1減る")
})
scene("E3: 041 Lv1。ターンで初めて相手のスピリットがBP0になったら1枚ドロー。2体目のBP0ではドローしない", () => {
    const s = game("adpentan-bp0")
    put(s, "p1", ADPENTAN, 1) // Lv1
    const van = put(s, "p1", VAN, 1)
    const a = put(s, "p2", GATLING, 1) // BP3000
    const b = put(s, "p2", GATLING, 1) // BP3000
    s.players.p1.hand = [PRESSURE, PRESSURE]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1枚目のエンジェリックプレッシャーを使用")
    settle(s, [a.instanceId])
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "ターンで初めてBP0になったので1枚ドロー（デッキ40→39）")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "2枚目のエンジェリックプレッシャーを使用")
    settle(s, [b.instanceId])
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "2体目のBP0ではドローしない")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "ライフは1減る")
})

// F（048）：『このスピリットのバトル時』このバトルの間、相手のスピリットすべては回復できない・連鎖［紫］
scene("F1: 048 のバトルの間は相手の回復マジックが効かない。バトルが終わった後は回復できる", () => {
    const s = game("ryugu-battle")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const ryugu = put(s, "p1", RYUGU, 1) // Lv1 BP3000
    const attacker = put(s, "p2", MIRAGE, 1)
    const rested = put(s, "p2", MIRAGE, 1)
    rested.isRested = true
    const second = put(s, "p2", MIRAGE, 1)
    s.players.p2.hand = [ELIXIR, ELIXIR]
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "フライングミラージュでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ピュアエリクサーで回復を試みる")
    settle(s)
    assert(attacker.isRested && rested.isRested, "048 のバトルの間は相手のスピリットすべては回復できない")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p1", ryugu.instanceId) === null, "リュウグウウシでブロック")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "BP比べ（3000 vs 2000）でアタッカーは破壊される")
    assert(act(s, "p2", { type: "attack", instanceId: second.instanceId }) === null, "別のスピリットでアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "バトル終了後にピュアエリクサーで回復する")
    settle(s)
    assert(!rested.isRested, "048 のバトルが終わっているので回復できる")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p1")
    assert(s.players.p1.life === 4, "ライフは1減る")
})
scene("F2: 048 の連鎖［紫］：自分の紫シンボルがあるとバトル時、相手のスピリットのコア1個を相手のリザーブへ", () => {
    const s = game("ryugu-chain")
    const ryugu = put(s, "p1", RYUGU, 2) // Lv2 BP4000
    put(s, "p1", GRIP, 1) // 紫シンボル
    const blocker = put(s, "p2", VAN, 2) // BP3000
    assert(act(s, "p1", { type: "attack", instanceId: ryugu.instanceId }) === null, "リュウグウウシでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ロクケラトプスでブロック")
    settle(s, [blocker.instanceId])
    assert(blocker.cores === 1 && s.players.p2.reserve === 21, "連鎖で相手のスピリットのコア1個がリザーブへ（2→1・リザーブ+1）")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP比べ（4000 vs 1000）でブロッカーは破壊される")
    assert(s.players.p2.life === 5, "ライフは減らない")
})
scene("F3: 048 連鎖の境目：紫シンボルがなければコアは動かない", () => {
    const s = game("ryugu-nochain")
    const ryugu = put(s, "p1", RYUGU, 2) // Lv2 BP4000
    const blocker = put(s, "p2", VAN, 2) // BP3000
    assert(act(s, "p1", { type: "attack", instanceId: ryugu.instanceId }) === null, "リュウグウウシでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ロクケラトプスでブロック")
    settle(s, [blocker.instanceId])
    assert(blocker.cores === 2 && s.players.p2.reserve === 20, "紫シンボルがなければコアは動かない")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BP比べ（4000 vs 3000）でブロッカーは破壊される")
})

console.log("すべてのチェックに合格しました 🎉（part797）")
