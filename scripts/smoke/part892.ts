// smoke パート892（効果による召喚・配置でも置くコアの数＝Lvをプレイヤーが選ぶ。2026-11-11 ユーザー決定。実装前に落ちてよい）
// 規則：選ぶのは支払いの時点（場に出す前）。選べるのは「コスト＋置くコア」を賄えるLvだけ。
// 支払い元はリザーブとフィールドのコア（味方を0個にして消滅させてもよい）。非対話は維持コア（Lv1）だけ置く。
// 選択の形：pendingChoice.kind="option"・effectCostPay{need,keep,keepByOption}・options "コア3個（Lv2）"。答えは resolveChoice の option（＋paySources）。
// 【不死】は無償ではなくコストを払う召喚なので「コスト＋置くコア」で数える（BS09-X36 はコスト3・軽減は紫シンボルが場に無いので0）
import { assert, act, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const BELD = "BS09-X36" // 魔界七将ベルドゴール（紫・コスト3・Lv1=1コア/Lv2=3コア・Lv3なし）
const VICTIM = "BS10-007" // デュアルド（赤・コスト5・バニラ・Lv1 BP5000）。【不死：コスト4/5】の引き金
const BOSS = "BS10-028" // マタンゴル（緑・コスト5・バニラ・Lv1 BP6000）。相手のアタッカー
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const IBAN = "BS01-005" // アイバーン（赤・コスト2・バニラ）。ベルドゴールの召喚時で壊される疲労した相手
const HELL = "BS19-101" // ヘルズバースディ（黄マジック・コスト4・メイン：トラッシュのコスト5以下のスピリットを無償召喚）
const REPAIR = "BS04-113" // ネクサスリペアー（青マジック・コスト4・メイン：トラッシュのネクサスを無償配置）
const GATE = "BS15-064" // 冥府へ続く魔門（紫ネクサス・コスト4・Lv1=0コア/Lv2=2コア）

console.log("=== 前提: カードの機械確認 ===")
{
    const b = getCard(BELD)
    assert(b.name === "魔界七将ベルドゴール" && b.type === "spirit" && b.cost === 3 && b.levels.length === 2 && b.levels[0]!.cores === 1 && b.levels[1]!.cores === 3, "BELDはコスト3・Lv1=1/Lv2=3コア（Lv3なし）")
    assert(b.effects.some((e: any) => e.keyword === "fushi"), "BELDは【不死】持ち")
    assert(getCard(VICTIM).name === "デュアルド" && getCard(VICTIM).cost === 5 && getCard(VICTIM).levels[0]!.bp === 5000, "VICTIMはコスト5・BP5000")
    assert(getCard(BOSS).name === "マタンゴル" && getCard(BOSS).levels[0]!.bp === 6000, "BOSSはBP6000")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(IBAN).name === "アイバーン" && getCard(IBAN).cost === 2, "ROKU・IBAN")
    assert(getCard(HELL).name === "ヘルズバースディ" && getCard(HELL).type === "magic" && getCard(HELL).cost === 4, "HELLはコスト4のマジック")
    assert(getCard(REPAIR).name === "ネクサスリペアー" && getCard(REPAIR).type === "magic" && getCard(REPAIR).cost === 4, "REPAIRはコスト4のマジック")
    const g = getCard(GATE)
    assert(g.name === "冥府へ続く魔門" && g.type === "nexus" && g.levels[0]!.cores === 0 && g.levels[1]!.cores === 2, "GATEはLv1=0/Lv2=2コアのネクサス")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 4
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false) {
    const inst = createInstance(cardId, 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const chosen = (s: GameState, cardId: string, pid: PlayerId = "p1") => s.players[pid].field.spirits.find((x) => x.cardId === cardId)

// 相手のアタックでコスト5の VICTIM が破壊され、トラッシュの BELD を【不死】で召喚する場面を、支払い待ちが出るところまで進める
function fushiScene(seed: string, interactive: boolean, reserve: number, withAlly: boolean) {
    const s = game(seed, interactive)
    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p1.reserve = reserve
    s.players.p1.trashCards = [BELD]
    const victim = put(s, "p1", VICTIM, 1)
    const ally = withAlly ? put(s, "p1", ROKU, 1) : null
    const boss = put(s, "p2", BOSS, 1)
    const target = put(s, "p2", IBAN, 1, true)
    act(s, "p2", { type: "nextPhase" })
    act(s, "p2", { type: "attack", instanceId: boss.instanceId })
    for (let i = 0; i < 3 && s.isFlashTiming; i++) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p1", { type: "block", instanceId: victim.instanceId })
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle && !s.pendingChoice; i++) act(s, s.priorityPlayer, { type: "pass" })
    return { s, victim, ally, target }
}
// 【不死】の「召喚する」確認に答えて、支払い（置くコア）の選択待ちまで進める
function confirmFushi(s: GameState): void {
    const pc: any = s.pendingChoice
    assert(pc?.pid === "p1" && pc.kind === "option" && String(pc.prompt).includes("不死"), `【不死】の確認が出る（${pc?.prompt ?? "なし"}）`)
    const yes = pc.options.find((o: string) => o.includes("召喚"))
    act(s, "p1", { type: "resolveChoice", option: yes })
}
// 破壊の対象選びなど、置くコア以外の待ちを片付ける
function settle(s: GameState): void {
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
        const pc: any = s.pendingChoice
        if (pc.kind === "target") act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else act(s, pc.pid, { type: "resolveChoice", option: pc.options?.[0] })
    }
}

console.log("=== 1a. 【不死】対話：Lv1/Lv2 を選ぶ待ちが出て、Lv2 を選ぶとコア3個で出て召喚時が発揮される ===")
{
    // コスト3＋Lv2の3コア＝6。リザーブ6で足りる
    const { s, target } = fushiScene("fushi-lv2", true, 6, false)
    confirmFushi(s)
    const pc: any = s.pendingChoice
    assert(pc?.kind === "option" && pc.effectCostPay?.pid === "p1", "置くコアの数（Lv）を選ぶ待ち（effectCostPay）が出る")
    assert(JSON.stringify(pc.options) === JSON.stringify(["コア1個（Lv1）", "コア2個（Lv1）", "コア3個（Lv2）", "コア4個（Lv2）"]), `Lv の境目に限らず1〜4個を選べる（2026-11-12 ユーザー指摘）（${JSON.stringify(pc?.options)}）`)
    assert(JSON.stringify(pc.effectCostPay.keepByOption) === JSON.stringify([1, 2, 3, 4]), "keepByOption は [1, 2, 3, 4]")
    assert(pc.effectCostPay.need === 3 && pc.effectCostPay.keep === 1, "need はコスト3、keep は最小の1")
    assert(chosen(s, BELD) === undefined, "選ぶ時点ではまだ場に出ていない")
    act(s, "p1", { type: "resolveChoice", option: "コア3個（Lv2）" })
    settle(s)
    const b = chosen(s, BELD)
    assert(b?.cores === 3, `ベルドゴールはコア3個（Lv2）で出る（${b?.cores}）`)
    assert(!s.players.p1.trashCards.includes(BELD), "トラッシュからベルドゴールが消える")
    assert(chosen(s, IBAN, "p2") === undefined && s.players.p2.trashCards.includes(IBAN), "召喚時：疲労したコスト4以下の相手（アイバーン）が破壊される")
    assert(chosen(s, BOSS, "p2") !== undefined, "コスト5のマタンゴルは対象外で残る")
    void target
}

console.log("=== 1b. 【不死】対話：Lv1 を選ぶとコア1個で出る（Lv1も召喚時が発揮される） ===")
{
    const { s } = fushiScene("fushi-lv1", true, 6, false)
    confirmFushi(s)
    act(s, "p1", { type: "resolveChoice", option: "コア1個（Lv1）" })
    settle(s)
    assert(chosen(s, BELD)?.cores === 1, `コア1個で出る（${chosen(s, BELD)?.cores}）`)
    assert(chosen(s, IBAN, "p2") === undefined, "Lv1でも召喚時が発揮される")
}

console.log("=== 1c. 【不死】対話：リザーブが足りないとき味方（コア1個）のコアを paySources で使い、消滅させて Lv2 で出す ===")
{
    // 必要6（コスト3＋コア3）。リザーブ5＋ロクケラトプスの1。リザーブだけでは Lv2 に届かない
    const { s, ally } = fushiScene("fushi-field", true, 5, true)
    confirmFushi(s)
    const pc: any = s.pendingChoice
    assert(pc?.options?.includes("コア3個（Lv2）"), "フィールドのコアを足せばLv2も選べる")
    act(s, "p1", { type: "resolveChoice", option: "コア3個（Lv2）", paySources: [{ instanceId: ally!.instanceId, count: 1 }] })
    settle(s)
    assert(chosen(s, BELD)?.cores === 3, `ベルドゴールはコア3個で出る（${chosen(s, BELD)?.cores}）`)
    assert(chosen(s, ROKU) === undefined && s.players.p1.trashCards.includes(ROKU), "コアを0個にされた味方は消滅してトラッシュへ")
}

console.log("=== 1d. 【不死】非対話：維持コア（Lv1）だけ置いて出る ===")
{
    const { s } = fushiScene("fushi-auto", false, 10, false)
    assert(s.pendingChoice === null, "非対話なら待ちは出ない")
    const b = chosen(s, BELD)
    assert(b?.cores === 1, `コア1個（Lv1）で出る（${b?.cores}）`)
    assert(chosen(s, IBAN, "p2") === undefined, "召喚時は発揮される")
}

console.log("=== 4. 選べるLvが1つ：リザーブがLv1ぶんしか無くフィールドにも余りが無い → 待ちは立たずLv1で出る ===")
{
    // 必要はLv1でコスト3＋1＝4。リザーブ4、破壊待機の VICTIM のコア1を足しても5で、Lv2の6に届かない
    const { s } = fushiScene("fushi-only-lv1", true, 4, false)
    confirmFushi(s)
    const pc: any = s.pendingChoice
    assert(!pc?.effectCostPay || !String(pc.options?.join()).includes("Lv2"), "Lv2を含む置くコアの選択は出ない")
    settle(s)
    assert(chosen(s, BELD)?.cores === 1, `Lv1（コア1個）で出る（${chosen(s, BELD)?.cores}）`)
}

// 効果で召喚するマジックを自分のメインで使う。対話なら置くコアの選択待ちが出る
console.log("=== 2. トラッシュから無償召喚（ヘルズバースディ）：Lv2 を選べてコア3個で出る ===")
{
    const s = game("free-summon", true)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [HELL]
    s.players.p1.trashCards = [BELD] // コスト3のスピリット（「召喚時は発揮されない」の但し書きがあるので効果は出ない）
    const r = handleAction(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(!r, `マジックを使える（${String(r)}）`)
    // 候補が1枚でも、選択の順序は「何を出すか → 置くコア」のどちらかで待ちが出る。置くコアの待ちが出るまで進める
    let pc: any = s.pendingChoice
    for (let i = 0; i < 4 && pc && !pc.effectCostPay; i++) {
        if (pc.kind === "target") act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else act(s, pc.pid, { type: "resolveChoice", option: pc.options?.[0] })
        pc = s.pendingChoice
    }
    assert(pc?.effectCostPay?.pid === "p1" && pc.kind === "option", "置くコアの数を選ぶ待ちが出る")
    assert(pc?.effectCostPay?.need === 0, `無償召喚なので need は0（${pc?.effectCostPay?.need}）`)
    assert(JSON.stringify(pc?.options) === JSON.stringify(["コア1個（Lv1）", "コア2個（Lv1）", "コア3個（Lv2）", "コア4個（Lv2）", "コア5個（Lv2）", "コア6個（Lv2）"]), `1〜6個が並ぶ（${JSON.stringify(pc?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "コア3個（Lv2）" })
    settle(s)
    assert(chosen(s, BELD)?.cores === 3, `コア3個で出る（${chosen(s, BELD)?.cores}）`)
    assert(!s.players.p1.trashCards.includes(BELD), "トラッシュから出ている")
}

console.log("=== 3. ネクサスの無償配置（ネクサスリペアー）：Lv2 を選べてコア2個で置かれる ===")
{
    const s = game("free-nexus", true)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [REPAIR]
    s.players.p1.trashCards = [GATE]
    const r = handleAction(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(!r, `マジックを使える（${String(r)}）`)
    let pc: any = s.pendingChoice
    for (let i = 0; i < 4 && pc && !pc.effectCostPay; i++) {
        if (pc.kind === "target") act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else act(s, pc.pid, { type: "resolveChoice", option: pc.options?.[0] })
        pc = s.pendingChoice
    }
    assert(pc?.effectCostPay?.pid === "p1" && pc.kind === "option", "置くコアの数を選ぶ待ちが出る")
    assert(JSON.stringify(pc?.options) === JSON.stringify(["コア0個（Lv1）", "コア1個（Lv1）", "コア2個（Lv2）", "コア3個（Lv2）", "コア4個（Lv2）", "コア5個（Lv2）", "コア6個（Lv2）"]), `0〜6個が並ぶ（${JSON.stringify(pc?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "コア2個（Lv2）" })
    settle(s)
    const n = s.players.p1.field.nexuses.find((x) => x.cardId === GATE)
    assert(n?.cores === 2, `ネクサスにコア2個が置かれる（${n?.cores}）`)
}

console.log("すべてのチェックに合格しました 🎉（part892）")
