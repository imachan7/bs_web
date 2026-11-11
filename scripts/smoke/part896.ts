// smoke パート896（監査で確定した効果バグの期待値：SEMANTICS_AUDIT §3.27〜3.29。期待値役が効果文だけから書いた）
import { act, assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const OGRE = "BS16-007" // オーガ・ドラゴン（赤・コスト5・Lv1/2 召喚時：デッキ3枚オープン「できる」）
const BENI = "BS21-026" // 紅蟲ベニカミキラン（緑・コスト6・Lv2 お互いのアタックステップ：神速の自分のスピリットが召喚されたら回復）
const ANT = "BS02-030" // 兵隊アントマン（緑・コスト3・フラッシュ【神速】）
const FALL = "BS20-068" // 腐食する大瀑布（紫・ネクサス・Lv2で相手のBP6000以下のアタック時、相手は相手のスピリットのコア1個を置く）
const DEMON = "BS08-012" // ダークスカルデーモン（紫・Lv2 同文）
const VIZ = "BS04-034" // ヴィゾフニル（白・Lv1BP1000/Lv2BP3000・【装甲：紫】）
const GASTON = "BS12-003" // 鎧竜人ガストン（赤・Lv1BP3000・破壊時：このスピリットのBP以下の相手のスピリット/ブレイヴ1つを破壊）
const LOBSTER = "BS02-040" // ロブスターク（白・Lv1BP1000・【装甲：赤】）
const DEESHA = "BS07-013" // 魔札の占い師ディーシャ（紫・Lv2 破壊時：相手は手札1枚をデッキの上に戻す）
const TOWER = "BS12-067" // 月光集める塔（白・ネクサス・Lv1以上：自分の手札は相手のスピリット/ブレイヴ/マジックの効果を受けない）
const ORGAN = "BS14-085" // 賛美するパイプオルガン（黄・ネクサス・Lv2相手のターン：スピリット/マジックの効果で回復した赤/緑/白/青のスピリットすべてを破壊）
const CROWN = "BSC05-020" // 星空の冠（黄・ネクサス・Lv2相手のターン：同じ。ただし赤/緑/青）
const KOKASUS = "BS23-009" // コーカサストリケラ（赤+緑の多色・Lv1BP7000）
const POTION = "BS02-102" // ホワイトポーション（白・マジック・フラッシュ：自分のスピリット1体を回復）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, cost: number, color: string[], eff?: string) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type && c.cost === cost && c.colors.join() === color.join() && (eff === undefined || c.effect.includes(eff)), `${id}は${name}`)
    }
    chk(OGRE, "オーガ・ドラゴン", "spirit", 5, ["red"], "上から3枚オープンできる")
    chk(BENI, "紅蟲ベニカミキラン", "spirit", 6, ["green"], "【神速】を持つ自分のスピリット")
    chk(ANT, "兵隊アントマン", "spirit", 3, ["green"], "【神速】")
    chk(FALL, "腐食する大瀑布", "nexus", 3, ["purple"], "相手のスピリットのコア1個")
    chk(DEMON, "ダークスカルデーモン", "spirit", 3, ["purple"], "相手のスピリット上のコア1個")
    chk(VIZ, "ヴィゾフニル", "spirit", 1, ["white"], "【装甲：紫】")
    chk(GASTON, "鎧竜人ガストン", "spirit", 3, ["red"], "どちらか1つを破壊する")
    chk(LOBSTER, "ロブスターク", "spirit", 3, ["white"], "【装甲：赤】")
    chk(DEESHA, "魔札の占い師ディーシャ", "spirit", 3, ["purple"], "手札1枚を選んでデッキの上に戻す")
    chk(TOWER, "月光集める塔", "nexus", 3, ["white"], "自分の手札は相手のスピリット/ブレイヴ/マジックの効果を受けない")
    chk(ORGAN, "賛美するパイプオルガン", "nexus", 3, ["yellow"], "赤/緑/白/青のスピリットすべてを破壊する")
    chk(CROWN, "星空の冠", "nexus", 4, ["yellow"], "赤/緑/青のスピリットすべてを破壊する")
    chk(KOKASUS, "コーカサストリケラ", "spirit", 8, ["red", "green"])
    chk(POTION, "ホワイトポーション", "magic", 4, ["white"], "自分のスピリット1体を回復させる")
    chk(VAN, "ロクケラトプス", "spirit", 1, ["red"])
    assert(getCard(VIZ).levels.map((l) => l.bp).join() === "1000,3000", "VIZ のBP")
    assert(getCard(GASTON).levels[0]!.bp === 3000 && getCard(LOBSTER).levels[0]!.bp === 1000, "GASTON 3000／LOBSTER 1000")
}

function game(seed: string, phase: "main" | "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 対象の選択は picks を優先、確認は pref にあるものを答える（pref が空なら断る）
function settle(s: GameState, picks: string[] = [], pref: string[] = ["発動する"]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.includes(x)) ?? (pref.length === 0 ? undefined : o[0])
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "card") err = act(s, who, { type: "resolveChoice", cardIndex: 0 })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

console.log("=== 1. BS16-007 召喚時「オープンできる」：確認が出て、断ればデッキは動かない ===")
{
    const s = game("ogre-decline", "main")
    s.players.p1.hand = [OGRE]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "オーガ・ドラゴンを召喚")
    const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[] } | null
    assert(pc !== null && pc.kind === "option" && pc.pid === "p1" && (pc.options ?? []).includes("発動する"), "「できる」なので発動するかの確認が p1 に出る")
    settle(s, [], [])
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 0, "断ったのでデッキも手札も動かない")
    assert(s.players.p1.field.spirits.length === 1 && s.pendingChoice === null, "召喚は成立していて選択待ちも残らない")
}

console.log("=== 2. BS21-026 ベニカミキラン：自分のメインステップに神速を召喚しても回復しない／アタックステップなら回復する ===")
{
    const s = game("beni-main", "main")
    const beni = put(s, "p1", BENI, 3) // Lv2
    beni.isRested = true
    s.players.p1.hand = [ANT]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "メインステップでアントマンを召喚")
    settle(s)
    assert(beni.isRested, "メインステップは『お互いのアタックステップ』ではないので回復しない")
}
{
    const s = game("beni-attack", "attack")
    const beni = put(s, "p1", BENI, 3)
    beni.isRested = true
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [ANT]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "フラッシュでアントマンを召喚")
    settle(s)
    assert(!beni.isRested, "アタックステップの神速召喚では回復する")
}

console.log("=== 3. BS20-068 腐食する大瀑布：装甲：紫のスピリットしかいなければコアは置かれない（ダークスカルデーモンと同じ） ===")
for (const [label, src] of [["FALL", FALL], ["DEMON", DEMON]] as const) {
    const s = game(`fall-armor-${label}`, "attack", "p2")
    if (src === FALL) putNexus(s, "p1", FALL, 2)
    else put(s, "p1", DEMON, 2) // Lv2
    const viz = put(s, "p2", VIZ, 2) // Lv2 BP3000・装甲：紫（アタッカー自身も対象になりうる）
    const trashCores = s.players.p2.trashCores
    assert(act(s, "p2", { type: "attack", instanceId: viz.instanceId }) === null, `${label}: ヴィゾフニルでアタック`)
    settle(s, [viz.instanceId])
    assert(viz.cores === 2 && s.players.p2.trashCores === trashCores, `${label}: 紫の効果を受けないのでコアは置かれない`)
}
{
    const s = game("fall-mixed", "attack", "p2")
    putNexus(s, "p1", FALL, 2)
    const viz = put(s, "p2", VIZ, 2)
    const van = put(s, "p2", VAN, 2)
    const trashCores = s.players.p2.trashCores
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    settle(s, [viz.instanceId, van.instanceId])
    assert(viz.cores === 2, "装甲持ちからは置かれない")
    assert(van.cores === 1 && s.players.p2.trashCores === trashCores + 1, "装甲の無いスピリットから1個トラッシュへ")
}

console.log("=== 4. BS12-003 ガストン：相手が装甲：赤のスピリットだけなら破壊されない ===")
{
    const s = game("gaston-armor", "main")
    const g = put(s, "p1", GASTON, 1)
    const lob = put(s, "p2", LOBSTER, 1)
    destroySpirit(s, "p1", g.instanceId, "destroy")
    settle(s, [lob.instanceId])
    assert(s.players.p2.field.spirits.includes(lob), "ロブスタークは【装甲：赤】で破壊されずフィールドに残る")
}
{
    const s = game("gaston-mixed", "main")
    const g = put(s, "p1", GASTON, 1)
    const lob = put(s, "p2", LOBSTER, 1)
    const van = put(s, "p2", VAN, 1)
    destroySpirit(s, "p1", g.instanceId, "destroy")
    const cand = (s.pendingChoice as { candidates?: string[] } | null)?.candidates ?? []
    assert(!cand.includes(lob.instanceId) && cand.includes(van.instanceId), "選べる対象に装甲持ちのロブスタークは入らない")
    settle(s, [lob.instanceId, van.instanceId])
    assert(s.players.p2.field.spirits.includes(lob) && !s.players.p2.field.spirits.includes(van), "装甲の無いロクケラトプスだけが破壊される")
}

console.log("=== 5. BS07-013 ディーシャ：相手の手札を守るネクサスがあれば手札は動かない ===")
for (const withTower of [true, false]) {
    const s = game(`deesha-${withTower}`, "main")
    const d = put(s, "p1", DEESHA, 3) // Lv2
    if (withTower) putNexus(s, "p2", TOWER, 0)
    s.players.p2.hand = [VAN, LOBSTER]
    destroySpirit(s, "p1", d.instanceId, "destroy")
    settle(s)
    const p2 = s.players.p2
    if (withTower) assert(p2.hand.length === 2 && p2.deck.length === 40, "月光集める塔があれば手札はスピリットの効果を受けず、動かない")
    else assert(p2.hand.length === 1 && p2.deck.length === 41, "塔が無ければ手札1枚がデッキの上に戻る")
}

console.log("=== 6. BS14-085 パイプオルガン／BSC05-020 星空の冠：回復した多色スピリットの破壊 ===")
{
    const s = game("organ-multi", "attack", "p2")
    putNexus(s, "p1", ORGAN, 2) // Lv2
    const ko = put(s, "p2", KOKASUS, 1)
    ko.isRested = true
    const van = put(s, "p2", VAN, 1)
    s.players.p2.hand = [POTION]
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "フラッシュでホワイトポーションを使用")
    settle(s, [ko.instanceId])
    assert(!s.players.p2.field.spirits.includes(ko), "スピリットの効果…でなくマジックの効果で回復した赤緑の多色スピリットは破壊される")
    assert(s.players.p2.trashCards.filter((c) => c === KOKASUS).length === 1, "破壊は1回だけ（トラッシュにコーカサストリケラ1枚）")
}
{
    const s = game("organ-own-turn", "attack", "p1")
    putNexus(s, "p1", ORGAN, 2)
    const ko = put(s, "p1", KOKASUS, 1)
    ko.isRested = true
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [POTION]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "自分のターンのフラッシュでポーションを使用")
    settle(s, [ko.instanceId])
    assert(s.players.p1.field.spirits.includes(ko), "『相手のターン』の効果なので自分のターンの回復では破壊されない")
}
{
    const s = game("crown-multi", "attack", "p2")
    putNexus(s, "p1", CROWN, 1) // Lv2
    const ko = put(s, "p2", KOKASUS, 1)
    ko.isRested = true
    const lob = put(s, "p2", LOBSTER, 1) // 白：星空の冠の対象色（赤/緑/青）に入らない
    lob.isRested = true
    const van = put(s, "p2", VAN, 1)
    s.players.p2.hand = [POTION, POTION]
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ポーション（1枚目）を使用")
    settle(s, [ko.instanceId])
    assert(!s.players.p2.field.spirits.includes(ko) && s.players.p2.trashCards.filter((c) => c === KOKASUS).length === 1, "星空の冠でも、回復した赤緑のスピリットは1回だけ破壊される")
}
{
    const s = game("crown-white", "attack", "p2")
    putNexus(s, "p1", CROWN, 1)
    const lob = put(s, "p2", LOBSTER, 1)
    lob.isRested = true
    const van = put(s, "p2", VAN, 1)
    s.players.p2.hand = [POTION]
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "アタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "ポーションを使用")
    settle(s, [lob.instanceId])
    assert(s.players.p2.field.spirits.includes(lob) && !lob.isRested, "白のスピリットは星空の冠の対象外（回復して残る）")
}

// 7. BS15-036 ヴォルス e5 と BS15-045 スフィン・クロス e2 は現プールで到達する場面を組めないため書かない（依頼どおり）。
// 「破壊されても残る多色スピリットの残るためのコスト1回払い」も、該当する多色スピリットがプールに無いため書かない。

console.log("すべてのチェックに合格しました 🎉（part896）")
