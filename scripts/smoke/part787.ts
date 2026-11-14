// smoke パート787（BS20-X04 黒天狐ネガ・ナインテイル：コスト6以上の白が相手によって破壊されたときの手札からのコスト不払い召喚・Lv2バトル時のBP合計までの手札戻し・連鎖[緑]バースト封じ/[黄]ブロックされない）
import { isTrashWaiting } from "../../shared/rules/waiting"
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, getCard, lockedFor, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X04 = "BS20-X04" // 黒天狐ネガ・ナインテイル（白・コスト7・Lvコア1/3/4・BP6000/8000/12000）
const LIME = "BS16-035" // 樹氷竜シルバー・ライム（白・コスト6・効果なし）破壊されるコスト6以上の白
const SCOAL = "SD01-025" // 鎧装獣スコール（白・コスト5・効果なし）境目用のコスト5の白
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・効果なし・Lv1BP6000/Lv2BP8000）コスト6の白でない／BP6000／相手のアタッカー
const BELL = "BS01-089" // デュアルキャノン・ベル（白・効果なし・Lv1BP3000）戻されるBP3000
const ANTMAN = "BS05-024" // 用心棒アントマン（緑・効果なし・Lv1BP5000）戻されるBP5000
const MIRAGE = "BS01-051" // フライングミラージュ（緑・効果なし）緑のシンボル
const DOROTHY = "BS04-046" // 妖精ドロシー（黄・効果なし）黄のシンボル
const M173 = "BS15-073" // 五輪転生炎（赤・マジック・バースト持ち）相手にセットするバースト
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as {
        cardId: string; name: string; type: string; colors: string[]; cost: number; family: string[]
        levels: { level: number; cores: number; bp: number }[]; symbol: string[]
    }[]
    const x04 = staging.find((c) => c.cardId === X04)
    assert(x04?.name === "黒天狐ネガ・ナインテイル" && x04.type === "spirit" && x04.colors[0] === "white" && x04.cost === 7, "X04は黒天狐ネガ・ナインテイル（白・スピリット・コスト7）")
    assert(x04?.levels.map((l) => l.cores).join("/") === "1/3/4" && x04.levels.map((l) => l.bp).join("/") === "6000/8000/12000", "X04のLvコアは1/3/4・BPは6000/8000/12000")
    assert(x04?.family.join("/") === "機獣" && x04.symbol.join("/") === "white", "X04の系統は機獣・シンボルは白")
    assert(getCard(LIME).name === "樹氷竜シルバー・ライム" && getCard(LIME).colors[0] === "white" && getCard(LIME).cost === 6 && getCard(LIME).effect === "", "LIMEはシルバー・ライム（白・コスト6・効果なし）")
    assert(getCard(SCOAL).name === "鎧装獣スコール" && getCard(SCOAL).colors[0] === "white" && getCard(SCOAL).cost === 5 && getCard(SCOAL).effect === "", "SCOALはスコール（白・コスト5・効果なし）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).colors[0] === "green" && getCard(TARAN).cost === 6 && getCard(TARAN).effect === "", "TARANはタランドーズ（緑・コスト6・効果なし）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).levels[0]!.bp === 3000 && getCard(BELL).effect === "", "BELLはベル（効果なし・BP3000）")
    assert(getCard(ANTMAN).name === "用心棒アントマン" && getCard(ANTMAN).levels[0]!.bp === 5000 && getCard(ANTMAN).effect === "", "ANTMANはアントマン（効果なし・BP5000）")
    assert(getCard(MIRAGE).name === "フライングミラージュ" && getCard(MIRAGE).colors[0] === "green" && getCard(MIRAGE).effect === "", "MIRAGEはフライングミラージュ（緑・効果なし）")
    assert(getCard(DOROTHY).name === "妖精ドロシー" && getCard(DOROTHY).colors[0] === "yellow" && getCard(DOROTHY).effect === "", "DOROTHYはドロシー（黄・効果なし）")
    assert(getCard(M173).name === "五輪転生炎" && getCard(M173).type === "magic" && (getCard(M173).effect ?? "").includes("【バースト"), "M173は五輪転生炎（バースト持ちのマジック）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはロクケラトプス（コスト1）")
}

function game(seed: string, turnPlayer: PlayerId): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.burstSet = false
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VANILLA)
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

// pendingChoice を答える。option は「召喚する/発動する」を優先、target は picks に入っていればそれを選び、無ければ選ばずに確定する
function settle(s: GameState, picks: string[] = []): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; prompt?: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        if (pc.prompt) prompts.push(pc.prompt)
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.find((x) => x.includes("召喚") || x === "発動する") ?? o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x))
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
    return prompts
}

// pendingChoice を全部読んで、X04 の召喚確認が出ていないことを確かめる
function noSummonPrompt(s: GameState): boolean {
    return settle(s).every((p) => !p.includes("召喚"))
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

console.log("=== A. 手札から召喚：コスト6以上の白がBPを比べ相手に破壊されたとき、X04 をコストを支払わずに召喚できる ===")
{
    const s = game("a", "p2")
    const lime = put(s, "p1", LIME, 1) // 白・コスト6・BP5000
    const attacker = put(s, "p2", TARAN, 3) // Lv2 BP8000
    s.players.p1.hand = [X04]
    const reserve = s.players.p1.reserve
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のアタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側もパスする")
    assert(act(s, "p1", { type: "block", instanceId: lime.instanceId }) === null, "シルバー・ライムでブロックする")
    assert(act(s, "p1", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュウィンドウ：攻撃側パス")
    const limePending = s.players.p1.field.spirits.find((x) => x.instanceId === lime.instanceId)
    assert(isTrashWaiting(limePending), "召喚確認が出た時点でシルバー・ライムは破壊待機（まだフィールドにいる）")
    const prompts = settle(s)
    assert(prompts.some((p) => p.includes("召喚")), `手札のX04の召喚確認が出る（${prompts.join("/")}）`)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === lime.instanceId) && s.players.p1.trashCards.includes(LIME), "確認に答えて解決し終えるとシルバー・ライムはトラッシュへ行く")
    const x04 = s.players.p1.field.spirits.find((x) => x.cardId === X04)
    assert(x04 !== undefined, "確認に答えるとX04が場にいる")
    assert(!s.players.p1.hand.includes(X04), "X04は手札から無くなる")
    assert((x04?.cores ?? 0) >= 1, "召喚されたX04には維持コアが置かれる")
    assert(s.players.p1.reserve <= reserve, "コスト7は支払われない（リザーブは減らない）")
}

console.log("=== B. 境目：コスト5の白・コスト6の白でない・自分の効果での破壊では確認が出ない ===")
{
    const s = game("b1", "p2")
    const scoal = put(s, "p1", SCOAL, 2) // 白・コスト5・BP4000
    const attacker = put(s, "p2", TARAN, 3) // Lv2 BP8000
    s.players.p1.hand = [X04]
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のアタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null && act(s, "p2", { type: "pass" }) === null, "フラッシュは双方パス")
    assert(act(s, "p1", { type: "block", instanceId: scoal.instanceId }) === null, "スコールでブロックする")
    assert(act(s, "p1", { type: "pass" }) === null && act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュも双方パス")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === scoal.instanceId), "コスト5の白は破壊される")
    assert(noSummonPrompt(s), "コスト5の白の破壊ではX04の召喚確認は出ない")
    assert(s.players.p1.hand.includes(X04) && !s.players.p1.field.spirits.some((x) => x.cardId === X04), "X04は手札に残ったまま")
}
{
    const s = game("b2", "p2")
    const taran = put(s, "p1", TARAN, 1) // 緑・コスト6・BP6000（白でない）
    const attacker = put(s, "p2", TARAN, 3) // Lv2 BP8000
    s.players.p1.hand = [X04]
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のアタック宣言")
    assert(act(s, "p1", { type: "pass" }) === null && act(s, "p2", { type: "pass" }) === null, "フラッシュは双方パス")
    assert(act(s, "p1", { type: "block", instanceId: taran.instanceId }) === null, "タランドーズでブロックする")
    assert(act(s, "p1", { type: "pass" }) === null && act(s, "p2", { type: "pass" }) === null, "ブロック後のフラッシュも双方パス")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === taran.instanceId), "コスト6の白でないスピリットは破壊される")
    assert(noSummonPrompt(s), "白でないスピリットの破壊ではX04の召喚確認は出ない")
    assert(s.players.p1.hand.includes(X04) && !s.players.p1.field.spirits.some((x) => x.cardId === X04), "X04は手札に残ったまま")
}
{
    const s = game("b3", "p1")
    const lime = put(s, "p1", LIME, 1) // 白・コスト6
    s.players.p1.hand = [X04]
    destroySpirit(s, "p1", lime.instanceId, "destroy") // 自分の効果での破壊
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === lime.instanceId), "自分の効果でシルバー・ライムは破壊される")
    assert(noSummonPrompt(s), "自分の効果での破壊ではX04の召喚確認は出ない")
    assert(s.players.p1.hand.includes(X04) && !s.players.p1.field.spirits.some((x) => x.cardId === X04), "X04は手札に残ったまま")
}

console.log("=== C. Lv2バトル時：BP合計（X04のBP8000）まで相手のスピリットを好きなだけ手札に戻す。BP6000は上限を超えるので一緒に戻せない ===")
{
    const s = game("c", "p1")
    const x04 = put(s, "p1", X04, 3) // Lv2 BP8000
    const bell = put(s, "p2", BELL, 1) // BP3000
    const antman = put(s, "p2", ANTMAN, 1) // BP5000
    const taran = put(s, "p2", TARAN, 1) // BP6000
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "X04でアタックできる")
    // アタック宣言の中でバトル時の効果が解決する。BP3000とBP5000（合計8000）を選び、BP6000は選ばない
    settle(s, [bell.instanceId, antman.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bell.instanceId), "BP3000のベルは手札に戻る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === antman.instanceId), "BP5000のアントマンは手札に戻る")
    assert(s.players.p2.hand.filter((c) => c === BELL || c === ANTMAN).length === 2, "戻った2体は相手の手札に加わる")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === taran.instanceId), "BP6000のタランドーズは合計が上限を超えるので場に残る")
    assert(s.players.p2.trashCards.length === 0, "手札に戻るだけで破壊されない")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュは防御側から双方パス")
    takeLifeAndResolve(s, "p2")
}

console.log("=== D. 連鎖：[緑]そのアタックの間相手はバーストを発動できない。[黄]相手のスピリットからブロックされない。シンボルが無ければどちらも効かない ===")
{
    const s = game("d1", "p1")
    const x04 = put(s, "p1", X04, 3) // Lv2
    put(s, "p1", MIRAGE, 1) // 緑のシンボル
    s.players.p2.burst = M173
    s.players.p2.burstSet = true
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "X04でアタックできる")
    settle(s)
    assert(lockedFor(s, "p2", "burst"), "緑のシンボルがあるのでそのアタックの間、相手はバーストを発動できない")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("d1n", "p1")
    const x04 = put(s, "p1", X04, 3) // Lv2
    s.players.p2.burst = M173
    s.players.p2.burstSet = true
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "X04でアタックできる")
    settle(s)
    assert(!lockedFor(s, "p2", "burst"), "緑のシンボルが無ければ相手はバーストを発動できる")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("d2", "p1")
    const x04 = put(s, "p1", X04, 3) // Lv2
    put(s, "p1", DOROTHY, 1) // 黄のシンボル
    const blocker = put(s, "p2", TARAN, 1) // BP6000
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "X04でアタックできる")
    settle(s) // バトル時の戻しは0体で確定する
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュは防御側から双方パス")
    assert(declareBlock(s, "p2", blocker.instanceId) !== null, "黄のシンボルがあるので相手のスピリットはX04をブロックできない")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロック拒否なのでタランドーズは疲労しないまま残る")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("d2n", "p1")
    const x04 = put(s, "p1", X04, 3) // Lv2
    const blocker = put(s, "p2", TARAN, 1) // BP6000
    assert(act(s, "p1", { type: "attack", instanceId: x04.instanceId }) === null, "X04でアタックできる")
    settle(s) // バトル時の戻しは0体で確定する
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュは防御側から双方パス")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "黄のシンボルが無ければ相手のスピリットはX04をブロックできる")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "BPを比べでタランドーズは破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === x04.instanceId), "X04は破壊されずに残る")
}

console.log("すべてのチェックに合格しました 🎉（part787）")
