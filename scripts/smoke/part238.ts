// smoke パート238（ブレイヴ 段階2：合体・分離のエンジン処理。docs/design/BRAVE.md §5・§6）
//
// ブレイヴのカードはプールに1枚も無い（BS10以降が未取り込み）ので、
// **テスト用の合成カードを CARD_DB に登録して**進める（§9 の段6前提）。
// 合体条件はホストの実データ（系統・コスト・名前）から組み立てる＝ハードコードしない。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS, CARD_DB } from "../../server/src/logic/GameState"
import { destroySpirit, returnSpiritToHand, flushBounces, detachBravesOnLeave } from "../../server/src/logic/removal"
import { bravesOf, hostsOf, braveLevelOf, matchesBraveCondition, instBaseCost, instColors, instanceSymbolCount, countSymbols, effectiveBp, currentLevel, effectSources, instIsCombined, spiritHasKeyword, matchesTarget } from "../../shared/rules"
import type { CardData } from "../../server/src/type"

const HOST = "BS01-001" // ゴラドン（赤・コスト0・系統「爬獣」・Lv1=1コア）
const hostCard = getCard(HOST)
const HOST_FAMILY = hostCard.family[0]!
assert(HOST_FAMILY !== undefined, `テスト前提: ${HOST} は系統を持つ（${hostCard.family.join("/")}）`)

// テスト用ブレイヴ。合体状態Lv1は必ず0コア（validate-cards.ts と同じ規則）
function makeBrave(cardId: string, over: Partial<CardData> = {}): CardData {
    const c: CardData = {
        cardId, name: `テストブレイヴ${cardId}`, type: "brave", colors: ["blue"], cost: 2,
        reduction: ["blue"], family: ["機獣"],
        levels: [{ level: 1, cores: 2, bp: 2000 }, { level: 2, cores: 4, bp: 4000 }], // スピリット状態
        braveLevels: [{ level: 1, cores: 0, bp: 3000 }, { level: 2, cores: 3, bp: 5000 }], // 合体状態
        braveCondition: { family: HOST_FAMILY },
        symbol: ["blue"], flash: false, rarity: "C", limited: false, effect: "（テスト用）", effects: [],
        ...over,
    }
    CARD_DB.set(cardId, c)
    return c
}
const BRAVE = makeBrave("TEST-BRAVE-1").cardId
const BRAVE_MISMATCH = makeBrave("TEST-BRAVE-2", { braveCondition: { family: "存在しない系統" } }).cardId

function base(): GameState {
    const s = createGame("brave-stage2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function putHost(s: GameState, pid: PlayerId, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(HOST, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== §A 合体条件（系統・コスト・カード名。読点区切りはOR） ===")
{
    const s = base()
    const host = putHost(s, "p1")
    assert(matchesBraveCondition(s, "p1", host, BRAVE), "系統が一致すれば合体できる")
    assert(!matchesBraveCondition(s, "p1", host, BRAVE_MISMATCH), "系統が違えば合体できない")

    const byName = makeBrave("TEST-BRAVE-3", { braveCondition: { cardName: hostCard.name } }).cardId
    assert(matchesBraveCondition(s, "p1", host, byName), "カード名指定でも合体できる")

    const byCost = makeBrave("TEST-BRAVE-4", { braveCondition: { minCost: hostCard.cost + 1 } }).cardId
    assert(!matchesBraveCondition(s, "p1", host, byCost), `コスト${hostCard.cost + 1}以上を要求すれば合体できない`)

    const orCond = makeBrave("TEST-BRAVE-5", {
        braveCondition: [{ family: "存在しない系統" }, { cardName: hostCard.name }],
    }).cardId
    assert(matchesBraveCondition(s, "p1", host, orCond), "配列＝ORなので、どれか1つ満たせば合体できる")
}

console.log("=== §B ダイレクトブレイヴ召喚：実体は combinedBraves、維持コアは置かない ===")
{
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null,
        "ダイレクトブレイヴで召喚できる")

    assert(s.players.p1.field.spirits.length === 1, "フィールドのスピリットは1体のまま（合体スピリットは1体）")
    assert(s.players.p1.field.combinedBraves.length === 1, "ブレイヴの実体は combinedBraves にある")
    const brave = s.players.p1.field.combinedBraves[0]!
    assert(brave.cores === 0, "合体中のブレイヴはコアを持たない")
    assert((host.braveRefs ?? []).length === 1, "ホストが参照を1本持つ")
    assert(host.braveRefs![0]!.slot === "single", "通常のブレイヴは slot:\"single\"")
    // コスト2のみ消費（維持コアは置かない）
    assert(reserveBefore - s.players.p1.reserve === getCard(BRAVE).cost,
        `リザーブの減りはコスト分だけ（維持コアを置かない）：${reserveBefore - s.players.p1.reserve}`)

    assert(bravesOf(s.players.p1, host).length === 1, "bravesOf がホストからブレイヴを引ける")
    assert(hostsOf(s.players.p1, brave)[0]?.instanceId === host.instanceId, "hostsOf が逆向きに引ける")
    // 合体状態のレベルは**ホストのコア数**を braveLevels で引く（Lv1は0コアなので必ず成立する）
    assert(braveLevelOf(host, brave) === 1, "ホストのコア1個では合体状態Lv1")
    host.cores = 3
    assert(braveLevelOf(host, brave) === 2, "ホストのコア3個で合体状態Lv2")
    // ⚠️ ホストの「Lvコスト+N」はブレイヴに効かない（BRAVE.md §12 の5）
    host.levelCostBonusContinuous = 3
    assert(braveLevelOf(host, brave) === 2, "ホストのLvコスト+3はブレイヴの合体状態レベルを下げない")
}

console.log("=== §C 検証：条件を満たさない／既に合体済み／ブレイヴでない ===")
{
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE_MISMATCH, BRAVE, BRAVE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) !== null,
        "合体条件を満たさないホストには合体できない")
    assert(act(s, "p1", { type: "summon", handIndex: 1, braveTargetInstanceId: "no-such-id" }) !== null,
        "存在しないホストは指定できない")
    assert(act(s, "p1", { type: "summon", handIndex: 1, braveTargetInstanceId: host.instanceId }) === null,
        "1つ目は合体できる")
    assert(act(s, "p1", { type: "summon", handIndex: 1, braveTargetInstanceId: host.instanceId }) !== null,
        "1体のスピリットに合体できるブレイヴは1つまで")
}

console.log("=== §D 合体時の疲労合成：どちらかが疲労なら合体スピリットは疲労（§1.3） ===")
{
    const s = base()
    const host = putHost(s, "p1")
    host.isRested = true
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    assert(host.isRested === true, "疲労状態のホストに合体しても疲労のまま")
}

console.log("=== §E 分離：Lv1維持コスト以上のコアを置けば残る、置けなければ一緒にトラッシュ ===")
{
    // 残せる場合
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const need = getCard(BRAVE).levels[0]!.cores // スピリット状態のLv1維持コスト
    s.players.p1.reserve = need
    const hostCores = host.cores // 破壊されたホストのコアはリザーブへ戻る
    destroySpirit(s, "p1", host.instanceId, "destroy")
    assert(s.players.p1.field.combinedBraves.length === 0, "合体中の置き場は空になる")
    assert(s.players.p1.field.spirits.length === 1, "ブレイヴがスピリット状態で場に残る")
    assert(s.players.p1.field.spirits[0]!.cardId === BRAVE, "残ったのはブレイヴ")
    assert(s.players.p1.field.spirits[0]!.cores === need, `Lv1維持コスト（${need}個）が置かれる`)
    assert(s.players.p1.reserve === hostCores, `置いた分だけリザーブが減る（ホストのコア${hostCores}個は戻る）`)
    assert(!s.players.p1.trashCards.includes(BRAVE), "ブレイヴはトラッシュに行っていない")

    // 残せない場合
    const s2 = base()
    const host2 = putHost(s2, "p1")
    s2.players.p1.hand = [BRAVE]
    act(s2, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host2.instanceId })
    // ⚠️ ホストのコアは**先にリザーブへ戻ってから**ブレイヴに置かれる（§6.3.1）ので、
    // 「残せない」を作るにはリザーブとホストのコアの合計を維持コスト未満にする
    s2.players.p1.reserve = 0
    host2.cores = need - 1
    destroySpirit(s2, "p1", host2.instanceId, "destroy")
    assert(s2.players.p1.field.combinedBraves.length === 0, "合体中の置き場は空になる")
    assert(s2.players.p1.field.spirits.length === 0, "コアを置けないのでブレイヴは残らない")
    assert(s2.players.p1.trashCards.includes(BRAVE), "合体元と一緒にトラッシュへ置かれる")
}

console.log("=== §F 分離は破壊以外の出口でも起きる（維持コア割れ／手札へ戻る） ===")
{
    // 維持コア割れの消滅
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const need = getCard(BRAVE).levels[0]!.cores
    s.players.p1.reserve = need
    host.cores = 0
    destroySpirit(s, "p1", host.instanceId, "deplete")
    assert(s.players.p1.field.spirits[0]?.cardId === BRAVE, "維持コア割れの消滅でもブレイヴは分離して残る")

    // 手札へ戻る（バウンス）
    const s2 = base()
    const host2 = putHost(s2, "p1")
    s2.players.p1.hand = [BRAVE]
    act(s2, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host2.instanceId })
    s2.players.p1.reserve = need
    returnSpiritToHand(s2, "p1", host2)
    flushBounces(s2)
    assert(s2.players.p1.field.combinedBraves.length === 0, "手札へ戻る経路でも合体は解ける")
    assert(s2.players.p1.field.spirits[0]?.cardId === BRAVE, "ブレイヴは分離して場に残る")
}

console.log("=== §G アタック中に分離したら、ブレイヴがアタックを引き継ぐ（§6.2 の5） ===")
{
    const s = base()
    const host = putHost(s, "p1")
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const need = getCard(BRAVE).levels[0]!.cores
    s.players.p1.reserve = need
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体スピリットでアタック")
    assert(s.battle?.attackerInstanceId === host.instanceId, "アタッカーはホスト")
    destroySpirit(s, "p1", host.instanceId, "destroy")
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)
    assert(brave !== undefined, "ブレイヴは分離して場に残る")
    assert(s.battle?.attackerInstanceId === brave!.instanceId, "アタッカーがブレイヴに差し替わる（アタックは継続）")
    // 合体スピリットはアタックで疲労していたので、その状態を引き継ぐ（§1.3）
    assert(brave!.isRested === true, "アタックで疲労した状態をそのまま引き継ぐ")
}

// ---- 段階3：BP・シンボル・コスト・色の合成（BRAVE.md §3） ----
console.log("=== §H 合成：コスト・色・シンボル・BP ===")
{
    const s = base()
    const host = putHost(s, "p1", 1)
    const hostMaster = getCard(HOST)
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const braveMaster = getCard(BRAVE)

    // コスト：合体元にブレイヴのコストが**追加される**（§1.1）
    assert(instBaseCost(host) === hostMaster.cost + braveMaster.cost,
        `コストが合成される（${hostMaster.cost}+${braveMaster.cost}=${instBaseCost(host)}）`)

    // 色：混色扱いになる（§12.2）
    const colors = instColors(host)
    for (const c of [...hostMaster.colors, ...braveMaster.colors]) {
        assert(colors.includes(c), `合体スピリットは${c}を持つ（混色扱い）`)
    }

    // シンボル：**合計数ではなく色の内訳で**見る（混色軽減バグと同じ場所）
    assert(instanceSymbolCount(host) === hostMaster.symbol.length + braveMaster.symbol.length,
        "シンボル数が合成される（ライフダメージに効く）")
    for (const c of hostMaster.symbol) {
        assert(countSymbols(s.players.p1, [c]) >= 1, `軽減：ホストの${c}シンボルを数える`)
    }
    for (const c of braveMaster.symbol) {
        assert(countSymbols(s.players.p1, [c]) >= 1, `軽減：ブレイヴの${c}シンボルを数える`)
    }
    // ⚠️ 二重計上していないこと（色ごとに、持っている数ちょうど）
    assert(countSymbols(s.players.p1, ["red"]) === hostMaster.symbol.filter((c) => c === "red").length,
        "赤シンボルを二重に数えていない")
    assert(countSymbols(s.players.p1, ["blue"]) === braveMaster.symbol.filter((c) => c === "blue").length,
        "青シンボルを二重に数えていない")

    // BP：合体時BP+ が加算される。**ホストのコア数で合体状態のレベルが変わる**
    const hostBp = hostMaster.levels[0]!.bp
    assert(braveLevelOf(host, s.players.p1.field.combinedBraves[0]!) === 1, "前提：合体状態Lv1")
    assert(effectiveBp(s, "p1", host) === hostBp + braveMaster.braveLevels![0]!.bp,
        `BPが合成される（${hostBp}+${braveMaster.braveLevels![0]!.bp}）`)
    // コアを3個にすると、ホストがLv2・ブレイヴも合体状態Lv2になる
    host.cores = 3
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", host) === hostMaster.levels[1]!.bp + braveMaster.braveLevels![1]!.bp,
        "コアを増やすとホストもブレイヴもレベルが上がってBPが増える")
}

console.log("=== §I シンボル固定を受けたら固定が勝つ（ブレイヴのシンボルも含めて固定値。§12 の3） ===")
{
    const s = base()
    const host = putHost(s, "p1", 1)
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    // kind:"symbolFix" と同じ形で、青2つに固定されている状態を作る
    host.symbolsOverrideContinuous = ["blue", "blue"]
    assert(instanceSymbolCount(host) === 2, "固定値そのもの（ブレイヴぶんを足さない）")
    assert(countSymbols(s.players.p1, ["blue"]) === 2, "軽減も固定値で数える")
    assert(countSymbols(s.players.p1, ["red"]) === 0, "赤シンボルのブレイヴ／ホストでも固定色が勝つ")
}

console.log("=== §J 分離したら合成は消える ===")
{
    const s = base()
    const host = putHost(s, "p1", 1)
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    assert(host.braveComposite !== undefined, "合体中は合成値が載っている")
    s.players.p1.reserve = getCard(BRAVE).levels[0]!.cores
    destroySpirit(s, "p1", host.instanceId, "destroy")
    refreshLevelAsOverrides(s)
    const brave = s.players.p1.field.spirits.find((sp) => sp.cardId === BRAVE)!
    assert(brave.braveComposite === undefined, "分離したブレイヴ自身は合成値を持たない")
    assert(instBaseCost(brave) === getCard(BRAVE).cost, "スピリット状態のコストは自分のコストだけ")
    assert(instColors(brave).join() === getCard(BRAVE).colors.join(), "色も自分の色だけ（混色でなくなる）")
}

// ---- 段階4：【合体中】効果は effectSources に相乗りする（BRAVE.md §4） ----
console.log("=== §K 合体中ブレイヴが効果の発生源になる（レベル判定はホストのコア数で引く） ===")
{
    // 【合体中】Lv2で「自分のスピリットすべてBP+2000」を持つテスト用ブレイヴ
    const AURA = makeBrave("TEST-BRAVE-AURA", {
        effects: [{ id: "TEST-BRAVE-AURA-e1", kind: "aura", levels: [2], aura: { type: "bp", target: "ownAll", amount: 2000 } }],
    } as never).cardId

    const s = base()
    const host = putHost(s, "p1", 1)
    const ally = createInstance(HOST, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    s.players.p1.hand = [AURA]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    const brave = s.players.p1.field.combinedBraves[0]!

    // ⚠️ 合体中のブレイヴはコアを持たないので、素の levels を引くと Lv0 になって効果が無言で消える
    assert(brave.braveCombined === true, "合体中の目印が載っている")
    assert(currentLevel(brave).level === 1, "ホストのコア1個 → 合体状態Lv1（コア0でも Lv0 にならない）")
    const allyBase = getCard(HOST).levels[0]!.bp
    assert(effectiveBp(s, "p1", ally) === allyBase, "Lv1ではオーラが発揮されない（levels:[2] のため）")

    host.cores = 3
    refreshLevelAsOverrides(s)
    assert(currentLevel(brave).level === 2, "ホストのコアを3個にすると合体状態Lv2")
    assert(effectSources(s, "p1").some((x) => x.instanceId === brave.instanceId),
        "合体中ブレイヴが effectSources に含まれる")
    assert(effectiveBp(s, "p1", ally) === allyBase + 2000, "【合体中】Lv2のオーラが味方に効く")

    // ⚠️ ホストが「持つ効果すべては発揮されない」を受けたら、合体中ブレイヴの効果も止まる（§12 の1）
    host.effectsDisabledContinuous = true
    assert(!effectSources(s, "p1").some((x) => x.instanceId === brave.instanceId),
        "ホストの効果が止まっていれば、合体中ブレイヴも発生源から外れる")
    assert(effectiveBp(s, "p1", ally) === allyBase, "オーラも止まる")
    delete host.effectsDisabledContinuous

    // 分離したら合体状態の目印が外れ、スピリット状態のレベル表に戻る
    s.players.p1.reserve = getCard(AURA).levels[0]!.cores
    destroySpirit(s, "p1", host.instanceId, "destroy")
    refreshLevelAsOverrides(s)
    const separated = s.players.p1.field.spirits.find((sp) => sp.cardId === AURA)!
    assert(separated.braveCombined === undefined, "分離したら合体中の目印が外れる")
    assert(separated.coresOverride === undefined, "ホストのコア数の写しも消える")
    assert(currentLevel(separated).level === 1, "スピリット状態のレベル表で判定される")
}

// ---- 【合体時】のゲート（BRAVE.md §12.3。2026-08-25 ユーザー確認） ----
//
// BS10 の実データでは【合体時】効果が**ブレイヴ側にもホストのスピリット側にもある**。
// 発生源はどちらも既に effectSources にいるので、必要なのは
// 「合体しているときだけ発揮する」という発揮条件（whileCombined）。
//
// 『このスピリットの**合体アタック時**』も同じ形で表す
// （＝ブレイヴが付いているときだけ発揮する『アタック時』）。
console.log("=== §L 【合体時】：ホストのスピリットが持つ効果は、合体しているときだけ発揮する ===")
{
    // 合体しているときだけ味方をBP+2000する、というホスト側の効果を持つテスト用スピリット
    const HOSTCARD = "TEST-HOST-COMBINED"
    CARD_DB.set(HOSTCARD, {
        ...getCard(HOST), cardId: HOSTCARD, name: "テストホスト（合体時オーラ）",
        effects: [{ id: `${HOSTCARD}-e1`, kind: "aura", levels: null, whileCombined: true, aura: { type: "bp", target: "ownAll", amount: 2000 } }],
    } as never)

    const s = base()
    const host = createInstance(HOSTCARD, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    const ally = createInstance(HOST, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    refreshLevelAsOverrides(s)

    const allyBase = getCard(HOST).levels[0]!.bp
    assert(!instIsCombined(host), "まだ合体していない")
    assert(effectiveBp(s, "p1", ally) === allyBase, "合体していないので【合体時】のオーラは発揮されない")

    s.players.p1.hand = [BRAVE]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null,
        "ブレイヴを合体させる")
    assert(instIsCombined(host), "合体した")
    assert(effectiveBp(s, "p1", ally) === allyBase + 2000, "合体したので【合体時】のオーラが発揮される")

    // 分離したら止まる
    s.players.p1.reserve = getCard(BRAVE).levels[0]!.cores
    const brave = s.players.p1.field.combinedBraves[0]!
    detachBravesOnLeave(s, "p1", host)
    refreshLevelAsOverrides(s)
    assert(!instIsCombined(host), "分離した")
    assert(effectiveBp(s, "p1", ally) === allyBase, "分離したら【合体時】のオーラは止まる")
    assert(brave.cardId === BRAVE, "ブレイヴは場に残っている（前提）")
}

console.log("=== §M 【合体時】：ブレイヴ側のキーワードと誘発も、合体しているときだけ ===")
{
    // 【合体時】【激突】を持つテスト用ブレイヴ（BS10-062 と同じ形）
    const KW = makeBrave("TEST-BRAVE-KW", {
        effects: [{ id: "TEST-BRAVE-KW-e1", kind: "keyword", keyword: "clash", levels: null, whileCombined: true }],
    } as never).cardId

    const s = base()
    const host = putHost(s, "p1")
    // まずスピリット状態で場に出す（＝合体していないブレイヴ）
    const alone = createInstance(KW, s.turn, getCard(KW).levels[0]!.cores)
    s.players.p1.field.spirits.push(alone)
    refreshLevelAsOverrides(s)
    assert(!spiritHasKeyword(s, "p1", alone, "clash"),
        "スピリット状態のブレイヴは【合体時】【激突】を持たない")

    // 合体させる
    s.players.p1.hand = [KW]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null,
        "同じカードを合体させる")
    const combined = s.players.p1.field.combinedBraves[0]!
    assert(spiritHasKeyword(s, "p1", combined, "clash"),
        "合体中のブレイヴは【合体時】【激突】を持つ")
}

// ---- BS10 の絞り込み軸（BRAVE.md）----
console.log("=== §N 対象の絞り込み：合体スピリット／合体していない／スピリット状態のブレイヴ ===")
{
    const s = base()
    const host = putHost(s, "p1")        // これから合体させる
    const plain = putHost(s, "p1")       // 合体しない普通のスピリット
    // スピリット状態のブレイヴ（合体せず場に出ているブレイヴ）
    const alone = createInstance(BRAVE, s.turn, getCard(BRAVE).levels[0]!.cores)
    s.players.p1.field.spirits.push(alone)
    s.players.p1.hand = [BRAVE]
    act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    refreshLevelAsOverrides(s)

    const match = (inst: ReturnType<typeof createInstance>, f: Parameters<typeof matchesTarget>[3]) =>
        matchesTarget(s, "p1", inst, f)

    assert(match(host, { combined: true }), "合体スピリットは combined:true に当たる")
    assert(!match(plain, { combined: true }), "合体していないスピリットは当たらない")
    assert(!match(alone, { combined: true }), "スピリット状態のブレイヴも合体していないので当たらない")

    assert(match(plain, { combined: false }), "combined:false は合体していないスピリットに当たる")
    assert(match(alone, { combined: false }), "スピリット状態のブレイヴにも当たる")
    assert(!match(host, { combined: false }), "合体スピリットには当たらない")

    assert(match(alone, { braveInSpiritState: true }), "スピリット状態のブレイヴだけに当たる")
    assert(!match(plain, { braveInSpiritState: true }), "普通のスピリットには当たらない")
    assert(!match(host, { braveInSpiritState: true }), "合体スピリット（ホストはスピリット）にも当たらない")
}

console.log("=== §O 合体条件「効果の記述を持たない」 ===")
{
    const VANILLA_COND = makeBrave("TEST-BRAVE-VANILLA", { braveCondition: { vanilla: true } }).cardId
    const s = base()
    // ゴラドン（BS01-001）は効果テキストが空＝バニラ
    const vanillaHost = putHost(s, "p1")
    assert(getCard(HOST).effect === "", `テスト前提: ${HOST} は効果の記述を持たない`)
    assert(matchesBraveCondition(s, "p1", vanillaHost, VANILLA_COND), "バニラのスピリットには合体できる")

    // 効果を持つスピリットを1枚引いてくる（カードデータから機械的に選ぶ）
    const withEffect = ALL_CARDS.find((c) => c.type === "spirit" && c.effect !== "" && c.levels.length > 0)!
    const inst = createInstance(withEffect.cardId, s.turn, withEffect.levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    assert(!matchesBraveCondition(s, "p1", inst, VANILLA_COND),
        `効果を持つスピリット（${withEffect.name}）には合体できない`)

    // 継続付与の「バニラとしても扱う」（BS04スイッチヒッター）も見る
    inst.treatedAsVanillaContinuous = true
    assert(matchesBraveCondition(s, "p1", inst, VANILLA_COND),
        "「バニラとしても扱う」を受けていれば合体できる（instIsVanilla を通している）")
}
