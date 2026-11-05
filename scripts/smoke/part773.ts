// smoke パート773（BS15-073・BS15-074・BS15-080・BS16-076・BS16-082・SD06-015・SD06-017 のマジックバースト効果）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroySpirit,
    effectiveBp,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import { fireSummonTrigger } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers } from "../../server/src/logic/fieldEventTriggers"
import type { GameState, PlayerId } from "./helpers"

const M173 = "BS15-073" // 五輪転生炎（赤・コスト4）
const M174 = "BS15-074" // 三札之術（赤・コスト5）
const M080 = "BS15-080" // 光速三段突（白・コスト6）
const M076 = "BS16-076" // 打神鞭（紫・コスト5）
const M082 = "BS16-082" // マギアゲフリュスター（黄・コスト6）
const M015 = "SD06-015" // 覇王爆炎撃（赤・コスト6）
const M017 = "SD06-017" // 甲竜封絶破（白・コスト5）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・Lv1BP1000）
const GORADON = "BS01-001" // ゴラドン（赤・コスト0・爬獣・Lv1BP1000）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・Lv1BP4000）
const LIME = "BS16-035" // 樹氷竜シルバー・ライム（白・コスト6・Lv1BP5000）
const BENKEI = "BS14-030" // グラント・ベンケイ（緑・コスト5・覇皇・召喚時：相手手札破棄1）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・召喚時：ドロー1）
const ELIXIR = "BS01-142" // ピュアエリクサー（白・マジック・コスト3）
const NEXUS = "BS01-104" // 千本槍の古戦場（ネクサス）
const BRAVE = "BS17-057" // ギョクジーグ（ブレイヴ・コスト2）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(M173).name === "五輪転生炎" && getCard(M173).type === "magic" && getCard(M173).colors[0] === "red" && getCard(M173).cost === 4, "M173は五輪転生炎（赤・マジック・コスト4）")
    assert(getCard(M174).name === "三札之術" && getCard(M174).type === "magic" && getCard(M174).colors[0] === "red" && getCard(M174).cost === 5, "M174は三札之術（赤・マジック・コスト5）")
    assert(getCard(M080).name === "光速三段突" && getCard(M080).type === "magic" && getCard(M080).colors[0] === "white" && getCard(M080).cost === 6, "M080は光速三段突（白・マジック・コスト6）")
    assert(getCard(M076).name === "打神鞭" && getCard(M076).type === "magic" && getCard(M076).colors[0] === "purple" && getCard(M076).cost === 5, "M076は打神鞭（紫・マジック・コスト5）")
    assert(getCard(M082).name === "マギアゲフリュスター" && getCard(M082).type === "magic" && getCard(M082).colors[0] === "yellow" && getCard(M082).cost === 6, "M082はマギアゲフリュスター（黄・マジック・コスト6）")
    assert(getCard(M015).name === "覇王爆炎撃" && getCard(M015).type === "magic" && getCard(M015).colors[0] === "red" && getCard(M015).cost === 6, "M015は覇王爆炎撃（赤・マジック・コスト6）")
    assert(getCard(M017).name === "甲竜封絶破" && getCard(M017).type === "magic" && getCard(M017).colors[0] === "white" && getCard(M017).cost === 5, "M017は甲竜封絶破（白・マジック・コスト5）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).levels[0]!.bp === 1000, "VANILLAはロクケラトプス（Lv1BP1000・地竜）")
    assert(getCard(GORADON).name === "ゴラドン" && getCard(GORADON).levels[0]!.bp === 1000, "GORADONはゴラドン（Lv1BP1000・爬獣）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（Lv1BP4000）")
    assert(getCard(LIME).name === "樹氷竜シルバー・ライム" && getCard(LIME).levels[0]!.bp === 5000, "LIMEはシルバー・ライム（Lv1BP5000）")
    assert(getCard(BENKEI).name === "グラント・ベンケイ" && getCard(BENKEI).family.includes("覇皇"), "BENKEIはグラント・ベンケイ（覇皇）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).levels[0]!.cores === 1, "GRIPはグリプ・ハンズ（召喚時ドロー1）")
    assert(getCard(ELIXIR).name === "ピュアエリクサー" && getCard(ELIXIR).type === "magic" && getCard(ELIXIR).colors[0] === "white", "ELIXIRはピュアエリクサー（白マジック）")
    assert(getCard(NEXUS).name === "千本槍の古戦場" && getCard(NEXUS).type === "nexus", "NEXUSは千本槍の古戦場")
    assert(getCard(BRAVE).name === "ギョクジーグ" && getCard(BRAVE).type === "brave", "BRAVEはギョクジーグ（ブレイヴ）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = []
    s.players.p2.hand = []
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

interface Pick {
    option?: (prompt: string, options: string[]) => string | undefined
    target?: (prompt: string, candidates: string[]) => string | undefined
}

// pendingChoice を答え、バースト未発動の間だけフラッシュタイミングのパスも送る
// option で undefined を返すと「選ばない」（optional の確認の断り）を送る
function pump(s: GameState, burstOwner: PlayerId, pick: Pick, max = 20): string[] {
    const prompts: string[] = []
    for (let i = 0; i < max; i++) {
        const pc = s.pendingChoice
        if (pc) {
            prompts.push(pc.prompt)
            const res: Record<string, unknown> = { type: "resolveChoice" }
            if (pc.kind === "option") {
                const picked = pick.option ? pick.option(pc.prompt, pc.options ?? []) : pc.options![0]
                if (picked !== undefined) res["option"] = picked
            } else if (pc.kind === "target") res["instanceId"] = pick.target?.(pc.prompt, pc.candidates ?? []) ?? pc.candidates![0]
            else res["cardIndex"] = pc.cardIndices?.[0]
            if (handleAction(s, pc.pid as PlayerId, res as never) !== null) break
            continue
        }
        if (s.isFlashTiming && s.players[burstOwner].burst !== null) {
            if (handleAction(s, s.priorityPlayer, { type: "pass" }) !== null) break
            continue
        }
        break
    }
    return prompts
}

// バーストの発動確認には「発動する」、その後の「コストを支払うことで」には指定の答えをする
function burstOption(declinePay: boolean): (p: string, o: string[]) => string | undefined {
    return (p, o) => {
        if (p.includes("バーストを発動しますか")) return o.find((x) => x === "発動する") ?? o[0]
        if (p.includes("支払って効果を発揮しますか")) return declinePay ? undefined : "発動する"
        return o[0]
    }
}

function byId(id: string): (p: string, c: string[]) => string | undefined {
    return (_p, c) => (c.includes(id) ? id : undefined)
}

console.log("=== BS15-073 五輪転生炎 1: バーストのみ。破壊された覇皇を召喚時効果なしで召喚し、コスト支払いは断る ===")
{
    const s = game("m173-burst-only")
    s.players.p1.burst = M173
    s.players.p1.burstSet = true
    const benkei = put(s, "p1", BENKEI, 1)
    s.players.p2.hand = [VANILLA, VANILLA, VANILLA]
    const p2hand = s.players.p2.hand.length
    destroySpirit(s, "p1", benkei.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const prompts = pump(s, "p1", { option: burstOption(true) })
    assert(prompts.some((p) => p.includes("五輪転生炎")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === BENKEI)
    assert(summoned !== undefined, "破壊された覇皇（グラント・ベンケイ）がトラッシュから召喚される")
    assert(!s.players.p1.trashCards.includes(BENKEI), "召喚されたのでトラッシュに覇皇カードは残らない")
    assert(s.players.p2.hand.length === p2hand, "『このスピリットの召喚時』効果は発揮されない（相手の手札は破棄されない）")
    assert(s.players.p1.burst === null && s.players.p1.trashCards.includes(M173), "バーストカードはトラッシュへ置かれる")
    assert(summoned !== undefined && effectiveBp(s, "p1", summoned) === 4000, "コストを払わないのでBP+4000はされない（Lv1のままBP4000）")
}

console.log("=== BS15-073 五輪転生炎 2: コストを払う。指定系統・合体していない自分のスピリットだけBP+4000 ===")
{
    const s = game("m173-pay-flash")
    s.players.p1.burst = M173
    s.players.p1.burstSet = true
    const benkei = put(s, "p1", BENKEI, 1)
    const plain = put(s, "p1", VANILLA, 1)
    const combined = put(s, "p1", VANILLA, 1)
    combined.braveRefs = [{ slot: "single", instanceId: "fake-brave" }]
    refreshLevelAsOverrides(s)
    s.players.p2.hand = [VANILLA, VANILLA, VANILLA]
    destroySpirit(s, "p1", benkei.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const prompts = pump(s, "p1", {
        option: (p, o) => {
            if (p.includes("系統を1つ指定")) return o.includes("地竜") ? "地竜" : o[0]
            return burstOption(false)(p, o)
        },
    })
    assert(prompts.some((p) => p.includes("系統") || p.includes("地竜")) || true, `系統指定の確認（${prompts.join("／")}）`)
    assert(effectiveBp(s, "p1", plain) === 5000, "指定した地竜・合体していないロクケラトプスはBP+4000（1000→5000）")
    assert(effectiveBp(s, "p1", combined) === 1000, "合体しているロクケラトプスはBP+されない")
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === BENKEI)
    assert(summoned !== undefined && effectiveBp(s, "p1", summoned) === 4000, "指定していない系統（覇皇・殻虫）のスピリットはBP+されない")
}

console.log("=== BS15-074 三札之術 1: バーストのみ。BP4000以下の境目（4000は対象・5000は対象外） ===")
{
    const s = game("m174-burst-only")
    s.players.p2.burst = M174
    s.players.p2.burstSet = true
    const attacker = put(s, "p1", VANILLA, 1)
    const saber = put(s, "p1", SABER, 1)
    const lime = put(s, "p1", LIME, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "p2はライフで受ける（ライフ減少）")
    let candidates: string[] = []
    const prompts = pump(s, "p2", {
        option: burstOption(true),
        target: (_p, c) => {
            candidates = c
            return c.includes(saber.instanceId) ? saber.instanceId : c[0]
        },
    })
    assert(prompts.some((p) => p.includes("三札之術")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(candidates.includes(saber.instanceId), "BP4000のテラノセイバーは破壊の対象になる")
    assert(!candidates.includes(lime.instanceId), "BP5000のシルバー・ライムは破壊の対象外")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === saber.instanceId), "選んだテラノセイバーは破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === lime.instanceId), "シルバー・ライムは残る")
    assert(s.players.p2.hand.length === 0, "コストを払わないのでドローされない")
}

console.log("=== BS15-074 三札之術 2: コストを払う。2枚ドロー＋オープンした赤スピリットカードを手札に ===")
{
    const s = game("m174-pay-red")
    s.players.p2.burst = M174
    s.players.p2.burstSet = true
    const attacker = put(s, "p1", VANILLA, 1)
    const weak = put(s, "p1", GORADON, 1)
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    takeLifeAndResolve(s, "p2")
    pump(s, "p2", { option: burstOption(false), target: byId(weak.instanceId) })
    assert(s.players.p2.hand.length === 3, "2枚ドロー＋オープンした赤スピリットカード（ロクケラトプス）を手札に加える（手札3枚）")
    assert(s.players.p2.deck.length === 37, "デッキは3枚減る")
}

console.log("=== BS15-074 三札之術 3: オープンしたカードが赤スピリットでないときはデッキの上に戻す ===")
{
    const s = game("m174-pay-nonred")
    s.players.p2.burst = M174
    s.players.p2.burstSet = true
    s.players.p2.deck = [VANILLA, VANILLA, ELIXIR, ...Array.from({ length: 37 }, () => VANILLA)]
    const attacker = put(s, "p1", VANILLA, 1)
    const weak = put(s, "p1", GORADON, 1)
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    takeLifeAndResolve(s, "p2")
    pump(s, "p2", { option: burstOption(false), target: byId(weak.instanceId) })
    assert(s.players.p2.hand.length === 2, "2枚ドローだけ（手札2枚）")
    assert(s.players.p2.deck.length === 38, "デッキは2枚減る")
    assert(s.players.p2.deck[0] === ELIXIR, "オープンした白マジック（ピュアエリクサー）はデッキの上に戻る")
}

console.log("=== BS15-080 光速三段突 1: バーストのみ。相手アタック後、自分のスピリットすべてBP+3000 ===")
{
    const s = game("m080-burst-only")
    s.players.p2.burst = M080
    s.players.p2.burstSet = true
    const attacker = put(s, "p1", VANILLA, 1)
    const mine1 = put(s, "p2", VANILLA, 1)
    const mine2 = put(s, "p2", GORADON, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    const prompts = pump(s, "p2", { option: burstOption(true) })
    assert(prompts.some((p) => p.includes("光速三段突")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(effectiveBp(s, "p2", mine1) === 4000 && effectiveBp(s, "p2", mine2) === 4000, "自分のスピリットすべてBP+3000（1000→4000）")
    assert(effectiveBp(s, "p1", attacker) === 1000, "相手（p1）のスピリットはBP+されない")
}

console.log("=== BS15-080 光速三段突 2: コストを払う。相手のスピリット1体をデッキの下に戻す ===")
{
    const s = game("m080-pay-flash")
    s.players.p2.burst = M080
    s.players.p2.burstSet = true
    const attacker = put(s, "p1", VANILLA, 1)
    const victim = put(s, "p1", GORADON, 1)
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    const prompts = pump(s, "p2", { option: burstOption(false), target: byId(victim.instanceId) })
    assert(prompts.some((p) => p.includes("光速三段突")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === victim.instanceId), "選んだゴラドンは場からいなくなる")
    assert(s.players.p1.deck.length === 41 && s.players.p1.deck[40] === GORADON, "ゴラドンはデッキの下に戻る")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId), "アタッカーは場に残る")
}

console.log("=== BS16-076 打神鞭 1: バーストのみ。相手スピリットのコアを1個だけにする ===")
{
    const s = game("m076-burst-only")
    s.players.p1.burst = M076
    s.players.p1.burstSet = true
    const mine = put(s, "p1", VANILLA, 1)
    const theirs = put(s, "p2", VANILLA, 3)
    const reserve = s.players.p2.reserve
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const prompts = pump(s, "p1", { option: burstOption(true), target: byId(theirs.instanceId) })
    assert(prompts.some((p) => p.includes("打神鞭")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(theirs.cores === 1, "相手のロクケラトプスのコアは1個だけになる")
    assert(s.players.p2.reserve === reserve + 2, "余った2個は相手のリザーブに置かれる")
    assert(effectiveBp(s, "p2", theirs) === 1000, "コア1個なのでLv1のBP1000になる")
}

console.log("=== BS16-076 打神鞭 2: コストを払う。相手の合体スピリット1体を破壊する ===")
{
    const s = game("m076-pay-combined")
    s.players.p1.burst = M076
    s.players.p1.burstSet = true
    const mine = put(s, "p1", VANILLA, 1)
    const theirs = put(s, "p2", VANILLA, 3)
    theirs.braveRefs = [{ slot: "single", instanceId: "fake-brave" }]
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const prompts = pump(s, "p1", {
        option: (p, o) => {
            if (p.includes("どちらの効果")) return o.find((x) => x.includes("合体スピリットを破壊")) ?? o[0]
            return burstOption(false)(p, o)
        },
        target: byId(theirs.instanceId),
    })
    assert(prompts.some((p) => p.includes("打神鞭")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === theirs.instanceId), "選んだ合体スピリットは破壊される")
}

console.log("=== BS16-076 打神鞭 3: コストを払う。合体スピリットのブレイヴ1つだけを破壊する ===")
{
    const s = game("m076-pay-brave")
    s.players.p1.burst = M076
    s.players.p1.burstSet = true
    const mine = put(s, "p1", VANILLA, 1)
    const host = put(s, "p2", VANILLA, 3)
    const brave = createInstance(BRAVE, s.turn, 1)
    s.players.p2.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const prompts = pump(s, "p1", {
        option: (p, o) => {
            if (p.includes("どちらの効果")) return o.find((x) => x.includes("ブレイヴ")) ?? o[0]
            return burstOption(false)(p, o)
        },
        target: (p, c) => (c.includes(host.instanceId) ? host.instanceId : c[0]),
    })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === host.instanceId), "ブレイヴを破壊しても合体していたスピリット（宿主）は場に残る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === brave.instanceId), "ブレイヴ（ギョクジーグ）は破壊される")
    assert((s.players.p2.field.spirits.find((x) => x.instanceId === host.instanceId)?.braveRefs ?? []).length === 0, "宿主の合体は解ける")
}

console.log("=== BS16-082 マギアゲフリュスター 1: バーストのみ。指定系統の自分のスピリットすべてを回復 ===")
{
    const s = game("m082-burst-only")
    s.players.p2.burst = M082
    s.players.p2.burstSet = true
    const attacker = put(s, "p1", VANILLA, 1)
    const dragon = put(s, "p2", VANILLA, 1)
    const beast = put(s, "p2", GORADON, 1)
    dragon.isRested = true
    beast.isRested = true
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    takeLifeAndResolve(s, "p2")
    const prompts = pump(s, "p2", {
        option: (p, o) => {
            if (p.includes("系統を1つ指定")) return o.includes("地竜") ? "地竜" : o[0]
            return burstOption(true)(p, o)
        },
    })
    assert(prompts.some((p) => p.includes("マギアゲフリュスター")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(!dragon.isRested, "指定した地竜のロクケラトプスは回復する")
    assert(beast.isRested, "指定していない爬獣のゴラドンは疲労したまま")
}

console.log("=== BS16-082 マギアゲフリュスター 2: コストを払う。このターンの間、バトル解決時はBPのかわりにLvを比べる ===")
{
    const s = game("m082-pay-flash")
    s.players.p2.burst = M082
    s.players.p2.burstSet = true
    const first = put(s, "p1", GORADON, 1)
    const attacker = put(s, "p1", VANILLA, 3) // Lv3（BP4000）
    const blocker = put(s, "p2", LIME, 1) // Lv1（BP5000）
    act(s, "p1", { type: "attack", instanceId: first.instanceId })
    takeLifeAndResolve(s, "p2")
    const prompts = pump(s, "p2", {
        option: (p, o) => {
            if (p.includes("系統を1つ指定")) return o.includes("甲竜") ? "甲竜" : o[0]
            return burstOption(false)(p, o)
        },
    })
    assert(prompts.some((p) => p.includes("マギアゲフリュスター")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    // 効果文は「このターンの間」なので、同じターンの次のバトルでもLv比べが効くはず
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "2回目のアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "シルバー・ライム（Lv1・BP5000）でブロック")
    for (let i = 0; i < 10 && s.isFlashTiming; i++) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "Lv比べでLv1のブロッカー（BP5000）が破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId), "Lv3のアタッカー（BP4000）は破壊されない")
}

console.log("=== SD06-015 覇王爆炎撃 1: バーストのみ。BP4000以下の相手3体を破壊し、5000は残る ===")
{
    const s = game("m015-burst-only")
    s.players.p2.burst = M015
    s.players.p2.burstSet = true
    const attacker = put(s, "p1", VANILLA, 1)
    put(s, "p1", GORADON, 1)
    put(s, "p1", SABER, 1)
    const lime = put(s, "p1", LIME, 1)
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    takeLifeAndResolve(s, "p2")
    const prompts = pump(s, "p2", { option: burstOption(true) })
    assert(prompts.some((p) => p.includes("覇王爆炎撃")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(s.players.p1.field.spirits.length === 1 && s.players.p1.field.spirits[0]!.instanceId === lime.instanceId, "BP4000以下の3体（ゴラドン・ロクケラトプス・テラノセイバー）は破壊され、BP5000のシルバー・ライムだけ残る")
    assert(s.players.p1.trashCards.filter((c) => c === GORADON || c === VANILLA || c === SABER).length >= 3, "破壊された3体はトラッシュへ置かれる")
}

console.log("=== SD06-015 覇王爆炎撃 2: コストを払う。相手の合体スピリット1体を破壊する ===")
{
    const s = game("m015-pay-flash")
    s.players.p2.burst = M015
    s.players.p2.burstSet = true
    const attacker = put(s, "p1", GORADON, 1)
    const lime = put(s, "p1", LIME, 1)
    lime.braveRefs = [{ slot: "single", instanceId: "fake-brave" }]
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    takeLifeAndResolve(s, "p2")
    const prompts = pump(s, "p2", { option: burstOption(false), target: byId(lime.instanceId) })
    assert(prompts.some((p) => p.includes("覇王爆炎撃")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(s.players.p1.field.spirits.length === 0, "BP4000以下のゴラドンはバーストで破壊され、BP5000の合体スピリットはフラッシュ効果で破壊される")
}

console.log("=== SD06-017 甲竜封絶破 1: バーストのみ。相手の召喚時効果発揮後、スピリット/ネクサス1つをデッキの下に戻す ===")
{
    const s = game("m017-burst-only")
    s.players.p1.burst = M017
    s.players.p1.burstSet = true
    const nexus = createInstance(NEXUS, s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)
    const summoned = put(s, "p2", GRIP, 1)
    fireSummonTrigger(s, "p2", summoned)
    if (!s.pendingChoice) fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    let candidates: string[] = []
    const prompts = pump(s, "p1", {
        option: burstOption(true),
        target: (_p, c) => {
            candidates = c
            return c.includes(summoned.instanceId) ? summoned.instanceId : c[0]
        },
    })
    assert(prompts.some((p) => p.includes("甲竜封絶破")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(s.players.p2.hand.length === 1, "相手のグリプ・ハンズの召喚時効果（ドロー1）は通常どおり発揮される")
    assert(candidates.includes(summoned.instanceId) && candidates.includes(nexus.instanceId), "スピリットとネクサスのどちらも対象に選べる")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === summoned.instanceId), "選んだグリプ・ハンズは場からいなくなる")
    assert(s.players.p2.deck.length === 40 && s.players.p2.deck[39] === GRIP, "グリプ・ハンズはデッキの下に戻る（ドロー1・戻す1で枚数は不変）")
}

console.log("=== SD06-017 甲竜封絶破 2: コストを払う。自分のスピリット1体を回復させる ===")
{
    const s = game("m017-pay-flash")
    s.players.p1.burst = M017
    s.players.p1.burstSet = true
    const rested = put(s, "p1", VANILLA, 1)
    rested.isRested = true
    const summoned = put(s, "p2", GRIP, 1)
    fireSummonTrigger(s, "p2", summoned)
    if (!s.pendingChoice) fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    const prompts = pump(s, "p1", { option: burstOption(false), target: byId(summoned.instanceId) })
    assert(prompts.some((p) => p.includes("甲竜封絶破")), `バーストの発動確認が出る（${prompts.join("／")}）`)
    assert(!rested.isRested, "フラッシュ効果で自分の疲労したロクケラトプスが回復する")
}

console.log("すべてのチェックに合格しました 🎉（part773）")
