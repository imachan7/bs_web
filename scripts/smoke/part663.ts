// smoke パート663（実行時カバレッジ：キーワード 28件。静的な【重装甲】と、合体ブレイヴ経由のキーワードが実際に効く場面）
// 【粉砕】【激突】などをブレイヴ経由で持つ場合の計測点は noteHeldKeyword で合体相手を含めて記録する。
// 【大粉砕】【呪滅撃】は宣言だけで、挙動は同じカードの別エントリが担う（最後の節）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS, coresForLevel } from "../../server/src/logic/GameState"
import { bofuCountFor, bravesOf, hasArmorAgainst, hasHeavyArmorAgainst, instColors, matchesBraveCondition } from "../../shared/rules"
import type { Color } from "../../server/src/type"

const COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
const V = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

function names(table: Record<string, string>): void {
    for (const [id, n] of Object.entries(table)) assert(getCard(id).name === n, `前提: ${id} は ${n}`)
}
names({
    "BS12-025": "ザニーガン", "BS12-027": "近衛機クリザンテMk-VIII", "BS12-028": "セイルフィッシュ", "BS12-030": "機人フォルセティ",
    "BS12-X04": "月光神龍ルナテック・ストライクヴルム", "BS13-030": "リーサルウェポンドラゴン", "BS13-X04": "獅機龍神ストライクヴルム・レオ",
    "BS14-035": "ラクーンガード", "BS14-042": "鉄の機人モージ", "BS15-031": "虚獣グラスベア", "BS15-035": "軍神機メガ・テュール",
    "BS16-033": "ミブロック・ザ・ワン", "BS17-029": "リトル・ビッケン", "BS17-035": "金剛戦艦ドレッドノーグ", "BS18-031": "ジェロニモンド",
    "BS12-055": "ゲッコ・グライダー", "BS10-062": "砲凰竜フェニック・キャノン", "BS10-069": "千刀鳥カクレイン", "BS10-071": "フェンリルキャノンType-B",
    "BS10-075": "オニユリン", "BS10-076": "バズーカ・アームズ", "BS11-049": "ジャンビ・オレピス", "BS11-059": "レチクル・アームズ",
    "BS10-X01": "幻羅星龍ガイ・アスラ", X007: "天地神龍ガイ・アスラ", "BS13-056": "ホーク・ブレイカー", "BS14-X02": "呪の覇王カオティック・セイメイ",
    "BS15-X06": "鉄の覇王サイゴード・ゴレム", "BS16-X03": "烈の覇王セイリュービ", [V]: "ロクケラトプス",
})

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    s.players.p1.deck = Array.from({ length: 40 }, () => V)
    s.players.p2.deck = Array.from({ length: 40 }, () => V)
    act(s, "p1", { type: "endTurn" })
    act(s, "p2", { type: "endTurn" })
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// 合体条件を満たすホスト。family 指定が無ければ vanilla / コスト条件を機械で解く
function combine(s: GameState, braveId: string, hostId?: string) {
    const hc = hostId !== undefined ? getCard(hostId) : (() => {
        const t = [getCard(braveId).braveCondition].flat()[0]!
        return ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0 && (t.vanilla === true ? c.effect === "" : c.cost >= (t.minCost ?? 0)))!
    })()
    const host = put(s, "p1", hc.cardId, hc.levels[0]!.cores)
    assert(matchesBraveCondition(s, "p1", host, braveId), `${braveId} は ${hc.name} に合体できる`)
    s.players.p1.hand = [braveId]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, `${braveId} を合体召喚`)
    assert(bravesOf(s.players.p1, host).length === 1, "合体している")
    return host
}
function weak(s: GameState, cores = 1) {
    const c = ALL_CARDS.reduce((m, x) => (x.type === "spirit" && x.levels.length > 0 && x.effect === "" && x.levels[0]!.bp < (m?.levels[0]!.bp ?? Infinity) ? x : m), undefined as (typeof ALL_CARDS)[number] | undefined)!
    return put(s, "p2", c.cardId, cores)
}
function attackWith(s: GameState, id: string): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: id }) === null, "アタック宣言")
}

console.log("=== 1. 静的な【重装甲】：載っている色の効果は受けず、載っていない色は受ける（Lv条件つきは条件未満で受ける） ===")
{
    const table: [string, Color[] | "self", number][] = [
        ["BS12-025", ["red"], 2], ["BS12-027", ["purple"], 1], ["BS12-028", ["white"], 1], ["BS12-030", ["purple", "green"], 1],
        ["BS12-X04", "self", 1], ["BS13-030", ["purple", "blue"], 1], ["BS13-X04", ["purple", "green", "white", "yellow"], 1],
        ["BS14-035", ["white"], 2], ["BS14-042", ["green", "blue"], 1], ["BS15-031", ["red", "yellow"], 2], ["BS15-035", ["red", "purple", "blue"], 2],
        ["BS17-029", ["white", "blue"], 2], ["BS17-035", ["red", "purple"], 1], ["BS18-031", ["red", "white"], 1],
    ]
    for (const [id, colors, lv] of table) {
        const s = game(`heavy-${id}`)
        const inst = put(s, "p1", id, coresForLevel(getCard(id), lv)!)
        const expected: Color[] = colors === "self" ? instColors(inst) : colors
        for (const c of COLORS) {
            assert(hasHeavyArmorAgainst(inst, [c]) === expected.includes(c), `${id} Lv${lv}：${c} の効果を${expected.includes(c) ? "受けない" : "受ける"}`)
        }
        if (lv > 1) {
            const low = put(s, "p1", id, coresForLevel(getCard(id), 1)!)
            assert(!hasHeavyArmorAgainst(low, [expected[0]!]), `${id} Lv1：Lv${lv}書きの重装甲は持たない`)
        }
    }
}

console.log("=== 2. 合体時の【重装甲】：ブレイヴ BS12-055 はホストへ、スピリット BS16-033 は合体したときだけ ===")
{
    const s = game("heavy-brave")
    const host = combine(s, "BS12-055", ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0 && c.family?.includes("神星"))!.cardId)
    assert(hasHeavyArmorAgainst(host, ["purple"]) && hasHeavyArmorAgainst(host, ["yellow"]), "合体したホストが紫/黄の効果を受けない")
    assert(!hasHeavyArmorAgainst(host, ["red"]), "紫/黄以外は受ける")
    const solo = put(s, "p1", "BS12-055", 0)
    assert(!hasHeavyArmorAgainst(solo, ["purple"]), "合体していないブレイヴ単体は持たない")
}
{
    const s = game("heavy-mibrock")
    const m = put(s, "p1", "BS16-033", coresForLevel(getCard("BS16-033"), 2)!)
    assert(!hasHeavyArmorAgainst(m, ["red"]), "合体していなければ受ける")
    s.players.p1.hand = ["BS10-062"]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: m.instanceId }) === null, "ブレイヴを合体")
    assert(["red", "white", "yellow"].every((c) => hasHeavyArmorAgainst(m, [c as Color])), "合体中のLv2は赤/白/黄の効果を受けない")
    assert(!hasHeavyArmorAgainst(m, ["blue"]), "青は受ける")
}

console.log("=== 3. 【装甲：赤/紫】BS10-071：合体したホストが持つ ===")
{
    const s = game("armor-brave")
    const host = combine(s, "BS10-071")
    assert(hasArmorAgainst(s, host, ["red"]) && hasArmorAgainst(s, host, ["purple"]), "赤/紫の効果を受けない")
    assert(!hasArmorAgainst(s, host, ["green"]), "緑は受ける")
}

console.log("=== 4. 【激突】BS10-062：合体アタックに対し、ブロックできる相手はライフで受けられない ===")
{
    const s = game("clash")
    const host = combine(s, "BS10-062")
    weak(s)
    attackWith(s, host.instanceId)
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    const err = act(s, "p2", { type: "takeLife" })
    assert(err !== null && err.includes("激突"), `ブロックできる相手はライフで受けられない（${String(err)}）`)
}

console.log("=== 5. 【暴風：2】BS10-069：ブロックされたとき相手が2体疲労 ===")
{
    const s = game("bofu")
    const host = combine(s, "BS10-069")
    assert(bofuCountFor(s, "p1", host) === 2, "暴風の指定数は2")
    const blocker = weak(s)
    const a = weak(s)
    const b = weak(s)
    attackWith(s, host.instanceId)
    act(s, "p2", { type: "pass" })
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    assert([a, b].filter((x) => x.isRested).length >= 1, "ブロックされたとき相手のスピリットが疲労する")
}

console.log("=== 6. 【聖命】BS10-075：ライフを減らしたらボイドからライフへコア1個 ===")
{
    const s = game("seimei")
    const host = combine(s, "BS10-075")
    const before = s.players.p1.life
    attackWith(s, host.instanceId)
    act(s, "p2", { type: "pass" })
    assert(takeLifeAndResolve(s, "p2") === null, "相手がライフで受ける")
    assert(s.players.p1.life === before + 1, "自分のライフにコアが1個置かれる")
}

console.log("=== 7. 【強襲：1】BS10-076：ネクサスを疲労させて、アタックで疲労したホストが回復する ===")
{
    const s = game("kyoshu")
    const host = combine(s, "BS10-076")
    const nexus = createInstance(ALL_CARDS.find((c) => c.type === "nexus")!.cardId, s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    attackWith(s, host.instanceId)
    if (s.pendingChoice) act(s, "p1", { type: "resolveChoice", option: "発動する" })
    assert(!(host.isRested as boolean), "ネクサス1つを疲労させ、ホストが回復した")
    assert(nexus.isRested === true, "ネクサスが疲労した")
}

console.log("=== 8. 【粉砕】BS11-059：合体アタックで相手のデッキをホストのLv枚破棄 ===")
{
    const s = game("funsai")
    const host = combine(s, "BS11-059")
    const lv = host.cores
    const before = s.players.p2.deck.length
    attackWith(s, host.instanceId)
    assert(s.players.p2.deck.length < before, `相手のデッキが減る（${before} → ${s.players.p2.deck.length}、ホストのコア${lv}）`)
}

console.log("=== 9. 【覚醒】BS11-049：合体中のホストへ他のスピリットからコアを移せる ===")
{
    const s = game("awaken")
    const host = combine(s, "BS11-049")
    const opener = put(s, "p1", V, 1)
    const src = put(s, "p1", V, 3)
    const before = host.cores
    attackWith(s, opener.instanceId)
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "awaken", instanceId: host.instanceId, fromInstanceId: src.instanceId, count: 1 }) === null, "覚醒できる")
    assert(host.cores === before + 1 && src.cores === 2, "コアが1個移る")
}

console.log("=== 10. 【超覚醒】BS10-X01 / X007(合体時)：コアを置くと回復する ===")
{
    const s = game("super-x01")
    const gai = put(s, "p1", "BS10-X01", 3)
    const opener = put(s, "p1", V, 1)
    const src = put(s, "p1", V, 3)
    attackWith(s, opener.instanceId)
    act(s, "p2", { type: "pass" })
    gai.isRested = true
    assert(act(s, "p1", { type: "awaken", instanceId: gai.instanceId, fromInstanceId: src.instanceId, count: 1 }) === null, "超覚醒できる")
    assert(!(gai.isRested as boolean), "コアを置いて回復した")
}
{
    const s = game("super-x007")
    const gai = put(s, "p1", "X007", 3)
    s.players.p1.hand = ["BS13-056"]
    gai.isRested = true
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: gai.instanceId }) === null, "ブレイヴを合体")
    const opener = put(s, "p1", V, 1)
    const src = put(s, "p1", V, 3)
    attackWith(s, opener.instanceId)
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "awaken", instanceId: gai.instanceId, fromInstanceId: src.instanceId, count: 1 }) === null, "合体中は超覚醒できる")
    assert(!(gai.isRested as boolean), "コアを置いて回復した")
}

console.log("=== 11. 【烈神速】BS16-X03：トラッシュのコア5個で手札から召喚 ===")
{
    const s = game("resshin")
    s.players.p1.hand = ["BS16-X03"]
    s.players.p1.trashCores = 5
    s.interactiveTargets = false
    const opener = put(s, "p1", V, 1)
    attackWith(s, opener.instanceId)
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "resshinsokuSummon", handIndex: 0 }) === null, "烈神速で召喚できる")
}

console.log("=== 12. 【大粉砕】【呪滅撃】は宣言のみ：挙動は同じカードの別エントリ（アタック時の破棄／破壊時の回復残り）が担う ===")
{
    for (const [id, kw] of [["BS15-X06", "daifunsai"], ["BS14-X02", "jumetsugeki"]] as const) {
        assert(getCard(id).effects.some((e) => e.kind === "keyword" && e.keyword === kw), `${id} は ${kw} を宣言している`)
    }
}

console.log("すべてのチェックに合格しました 🎉（part663）")
