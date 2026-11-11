// smoke パート895（コストを払う効果召喚でも置くコアの数＝Lvをプレイヤーが選ぶ。2026-11-11 ユーザー決定。実装前に落ちてよい）
// 選ぶのは支払いの時点（場に出す前）。待ち：kind="option"・effectCostPay{need,keepByOption}・options "Lv2（コア2個）"。
// 答えは resolveChoice の option（フィールドのコアを使うなら paySources も）。払う額は軽減込みの召喚コスト。
// BS12-075 は「リザーブから使用」なのでフィールドのコアは使えない。非対話は維持コア（Lv1）で出る。
import { assert, act, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const REIBU = "BS08-006" // 雷帝竜騎レイブリッツ（赤・コスト5）。主：手札の【転召】スピリットを【転召】させずに召喚できる（ターンに1回）
const HAKU = "SD02-004" // 神獣ハクタク（黄・コスト4・Lv1=1/Lv2=2/Lv3=3コア・【転召】）。赤のレイブリッツと色が違うので軽減は0
const ANDRE = "BS08-013" // アンドレアルファス（コスト3）。エンドステップ：トラッシュの「勇者」入りスピリットを召喚できる
const VOLZA = "BS07-021" // 天刃の勇者ヴォルザ（緑・コスト3・Lv1=1/Lv2=3コア）。軽減は緑シンボルが場に無いので0
const BOO = "BS12-075" // ボオーテスコール（紫マジック・コスト3）。リザーブから使って、トラッシュの【不死】スピリットを召喚
const BELD = "BS09-X36" // 魔界七将ベルドゴール（紫・コスト3・Lv1=1/Lv2=3コア・【不死】）
const GEN = "BS22-073" // ジェネレートファイア（赤マジック・コスト5・メイン：BP3000以下の相手スピリットを破壊→手札のスピリットを破壊数×1コスト払ったものとして召喚）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    const r = getCard(REIBU)
    assert(r.name === "雷帝竜騎レイブリッツ" && r.type === "spirit" && r.cost === 5, "REIBUはコスト5のスピリット")
    assert(r.effects.some((e: any) => e.id === "BS08-006-e1" && e.kind === "activated"), "REIBUは e1 が起動能力")
    const h = getCard(HAKU)
    assert(h.name === "神獣ハクタク" && h.cost === 4 && h.levels[0]!.cores === 1 && h.levels[1]!.cores === 2 && h.levels[2]!.cores === 3, "HAKUはコスト4・Lv1/2/3=1/2/3コア")
    assert(h.effects.some((e: any) => e.keyword === "tensho") && h.colors[0] === "yellow", "HAKUは【転召】持ちの黄")
    const a = getCard(ANDRE)
    assert(a.name === "アンドレアルファス" && a.type === "spirit" && a.cost === 3, "ANDREはコスト3")
    const v = getCard(VOLZA)
    assert(v.name === "天刃の勇者ヴォルザ" && v.cost === 3 && v.levels[1]!.cores === 3 && v.colors[0] === "green", "VOLZAはコスト3・Lv2=3コアの緑")
    const o = getCard(BOO)
    assert(o.name === "ボオーテスコール" && o.type === "magic" && o.cost === 3, "BOOはコスト3のマジック")
    const b = getCard(BELD)
    assert(b.name === "魔界七将ベルドゴール" && b.cost === 3 && b.levels[1]!.cores === 3 && b.effects.some((e: any) => e.keyword === "fushi"), "BELDはコスト3・Lv2=3コアの【不死】")
    const g = getCard(GEN)
    assert(g.name === "ジェネレートファイア" && g.type === "magic" && g.cost === 5, "GENはコスト5のマジック")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).levels[0]!.bp <= 3000, "ROKUはBP3000以下")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 4
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const onField = (s: GameState, cardId: string, pid: PlayerId = "p1") => s.players[pid].field.spirits.find((x) => x.cardId === cardId)

function answerOther(s: GameState, pc: any): void {
    if (pc.kind === "card") act(s, pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
    else if (pc.kind === "target") act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0] })
    else act(s, pc.pid, { type: "resolveChoice", option: pc.options?.includes("発動する") ? "発動する" : pc.options?.[0] })
}
// 置くコアの待ち（effectCostPay）が出るまで、カード選びなどの別の待ちを先頭の候補で進める
function toCorePrompt(s: GameState): any {
    let pc: any = s.pendingChoice
    for (let i = 0; i < 5 && pc && !pc.effectCostPay; i++) {
        answerOther(s, pc)
        pc = s.pendingChoice
    }
    return pc
}
// 召喚時の対象選びなど、置くコア以外の待ちを片付ける
function settle(s: GameState): void {
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
        answerOther(s, s.pendingChoice)
    }
}
// レイブリッツ（コア1）の起動能力で手札のハクタクを召喚しに行く
function reibuScene(seed: string, interactive: boolean, reserve: number, ally = false) {
    const s = game(seed, interactive)
    s.players.p1.reserve = reserve
    s.players.p1.hand = [HAKU]
    const src = put(s, "p1", REIBU, 1)
    const al = ally ? put(s, "p1", ROKU, 1) : null
    const err = act(s, "p1", { type: "activateAbility", instanceId: src.instanceId, effectId: "BS08-006-e1" })
    assert(err === null, `レイブリッツの起動能力を使える（${String(err)}）`)
    return { s, src, al }
}

console.log("=== 1. 帝竜騎：【転召】持ちを Lv2 で出す。コスト4＋置くコア2＝リザーブ6 ===")
{
    const { s } = reibuScene("reibu-lv2", true, 6)
    const pc = toCorePrompt(s)
    assert(pc?.kind === "option" && pc.effectCostPay?.pid === "p1", "置くコアの数を選ぶ待ちが出る")
    assert(pc?.effectCostPay?.need === 4, `払うのはハクタクのコスト4（${pc?.effectCostPay?.need}）`)
    assert(Array.isArray(pc?.options) && pc.options.includes("Lv1（コア1個）") && pc.options.includes("Lv2（コア2個）"), `Lv1・Lv2が選べる（${JSON.stringify(pc?.options)}）`)
    assert(onField(s, HAKU) === undefined, "選ぶ時点ではまだ場に出ていない")
    act(s, "p1", { type: "resolveChoice", option: "Lv2（コア2個）" })
    settle(s)
    assert(onField(s, HAKU)?.cores === 2, `ハクタクはコア2個（Lv2）で出る（${onField(s, HAKU)?.cores}）`)
    assert(s.players.p1.reserve === 0, `リザーブはコスト4＋コア2で0になる（${s.players.p1.reserve}）`)
    assert(!s.players.p1.hand.includes(HAKU), "手札からハクタクが消える")
}

console.log("=== 2. トラッシュから有償召喚（アンドレアルファスのエンドステップ）：Lv2 を選べる ===")
{
    const s = game("andre-lv2", true)
    s.players.p1.reserve = 6
    s.players.p1.trashCards = [VOLZA]
    put(s, "p1", ANDRE, 1)
    // ターンを終えると自分のエンドステップの「召喚できる」に入る
    act(s, "p1", { type: "endTurn" })
    for (let i = 0; i < 4 && s.pendingChoice && !(s.pendingChoice as any).effectCostPay; i++) answerOther(s, s.pendingChoice)
    const pc: any = s.pendingChoice
    assert(pc?.kind === "option" && pc.effectCostPay?.need === 3, `置くコアの待ちが出てコスト3を払う（${JSON.stringify(pc?.effectCostPay)}）`)
    assert(Array.isArray(pc?.options) && pc.options.includes("Lv2（コア3個）"), `Lv2が選べる（${JSON.stringify(pc?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "Lv2（コア3個）" })
    settle(s)
    assert(onField(s, VOLZA)?.cores === 3, `ヴォルザはコア3個で出る（${onField(s, VOLZA)?.cores}）`)
    assert(!s.players.p1.trashCards.includes(VOLZA), "トラッシュから出ている")
}

console.log("=== 3. フィールドのコアを paySources で使い、味方（コア1個）を消滅させて Lv2 で出す ===")
{
    // Lv2＝4＋2＝6。リザーブ5では足りず、味方のコア1個を足す
    const { s, al } = reibuScene("reibu-field", true, 5, true)
    const pc = toCorePrompt(s)
    assert(pc?.options?.includes("Lv2（コア2個）"), `フィールドのコアを足せばLv2も選べる（${JSON.stringify(pc?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "Lv2（コア2個）", paySources: [{ instanceId: al!.instanceId, count: 1 }] })
    settle(s)
    assert(onField(s, HAKU)?.cores === 2, `ハクタクはコア2個で出る（${onField(s, HAKU)?.cores}）`)
    assert(onField(s, ROKU) === undefined && s.players.p1.trashCards.includes(ROKU), "コアを0個にされた味方は消滅してトラッシュへ")
    assert(s.players.p1.reserve === 0, `リザーブは使い切る（${s.players.p1.reserve}）`)
}

function booScene(seed: string, reserve: number, allyCores: number) {
    const s = game(seed, true)
    s.players.p1.reserve = reserve
    s.players.p1.hand = [BOO]
    s.players.p1.trashCards = [BELD]
    const ally = allyCores > 0 ? put(s, "p1", ROKU, allyCores) : null
    const err = act(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(err === null, `ボオーテスコールを使える（${String(err)}）`)
    return { s, ally }
}

console.log("=== 4a. ボオーテスコール：リザーブだけで Lv2 まで賄えるなら Lv2 を選べる ===")
{
    // マジック3＋ベルドゴールのコスト3＋コア3＝9
    const { s } = booScene("boo-lv2", 9, 0)
    const pc = toCorePrompt(s)
    assert(pc?.effectCostPay?.need === 3 && pc.options?.includes("Lv2（コア3個）"), `置くコアの待ちにLv2がある（${JSON.stringify(pc?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "Lv2（コア3個）" })
    settle(s)
    assert(onField(s, BELD)?.cores === 3, `ベルドゴールはコア3個で出る（${onField(s, BELD)?.cores}）`)
    assert(s.players.p1.reserve === 0, `リザーブを使い切る（${s.players.p1.reserve}）`)
}

console.log("=== 4b. ボオーテスコール：リザーブがLv1ぶんしか無く、フィールドにコアがあっても Lv2 は出ない ===")
{
    // マジック3を払った残りはリザーブ4＝Lv1（3＋1）だけ。味方のコア3個を足せばLv2に届くが、使えない
    const { s } = booScene("boo-reserve-only", 7, 3)
    const pc = toCorePrompt(s)
    assert(!pc?.effectCostPay || !String(pc.options?.join()).includes("Lv2"), `Lv2は選択肢に出ない（${JSON.stringify(pc?.options)}）`)
    settle(s)
    assert(onField(s, BELD)?.cores === 1, `Lv1（コア1個）で出る（${onField(s, BELD)?.cores}）`)
    assert(onField(s, ROKU)?.cores === 3, "味方のコアは使われない")
}

console.log("=== 4c. ボオーテスコール：Lv2 が選べる場面でも、paySources を付けた答えは拒否される ===")
{
    const { s, ally } = booScene("boo-paysrc", 9, 1)
    const pc = toCorePrompt(s)
    assert(pc?.options?.includes("Lv2（コア3個）"), "Lv2が選べる")
    const err = act(s, "p1", { type: "resolveChoice", option: "Lv2（コア3個）", paySources: [{ instanceId: ally!.instanceId, count: 1 }] })
    assert(err !== null, "フィールドのコアを指定した答えは拒否される")
    assert(s.pendingChoice !== null && onField(s, ROKU)?.cores === 1, "待ちは残り、味方のコアは減らない")
}

console.log("=== 5. ジェネレートファイア：相手のスピリットを1体破壊すると、払う額が「コスト−1」になる ===")
{
    const s = game("gen", true)
    s.players.p1.reserve = 10 // マジック5＋Lv2のぶん（2＋3）
    s.players.p1.hand = [GEN, VOLZA]
    put(s, "p2", ROKU, 1)
    const err = act(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(err === null, `ジェネレートファイアを使える（${String(err)}）`)
    const pc = toCorePrompt(s)
    assert(s.players.p2.field.spirits.length === 0, "BP3000以下の相手のスピリットが破壊された")
    assert(pc?.kind === "option" && pc.effectCostPay?.need === 2, `払う額はコスト3−1＝2（${pc?.effectCostPay?.need}）`)
    assert(Array.isArray(pc?.options) && pc.options.includes("Lv2（コア3個）"), `Lv2が選べる（${JSON.stringify(pc?.options)}）`)
    act(s, "p1", { type: "resolveChoice", option: "Lv2（コア3個）" })
    settle(s)
    assert(onField(s, VOLZA)?.cores === 3, `ヴォルザはコア3個で出る（${onField(s, VOLZA)?.cores}）`)
    assert(s.players.p1.reserve === 0, `リザーブはマジック5＋2＋3で0（${s.players.p1.reserve}）`)
}

console.log("=== 6. 非対話：待ちは出ず Lv1（維持コア）で出る ===")
{
    const { s } = reibuScene("reibu-auto", false, 10)
    settle(s)
    assert(onField(s, HAKU)?.cores === 1, `コア1個（Lv1）で出る（${onField(s, HAKU)?.cores}）`)
    assert(s.pendingChoice === null, "置くコアの待ちは出ない")
    assert(s.players.p1.reserve === 5, `リザーブはコスト4＋コア1で5（${s.players.p1.reserve}）`)
}

console.log("すべてのチェックに合格しました 🎉（part895）")
