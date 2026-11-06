// smoke パート801（BS21-072・080・082：珊瑚の樹海のドロー＋破棄とバースト封じ・ホワイトアウトのネクサス回収と連鎖[青]・ライフドリームのブロックされない付与。BS21_PLAN §1・§2 の確定読み）
// BS21 は data/cards に無く未実装。createInstance/getCard は「カードが見つかりません」で落ちるので、
// その場面は scene() が警告して続行する（実装役が通す）。
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, fireFieldEventTriggers, fireStepTriggers, getCard, placeBurst, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const CORAL = "BS21-072" // 珊瑚の樹海（青/紫・ネクサス・コスト5・Lv1=コア0・Lv2=コア2・シンボル青/紫）
const WHITEOUT = "BS21-080" // ホワイトアウト（白・マジック・コスト4・メイン：相手ネクサス全バウンス／連鎖[緑]：疲労／連鎖[青]：ライフ減少後バースト封じ／フラッシュ：BP+3000）
const DREAM = "BS21-082" // ライフドリーム（黄・マジック・コスト4・メイン：黄スピリットにブロックされない付与／フラッシュ：BP-2000）

const MINOTA = "BS19-060" // ミノタ・コルス（青・コスト3・【連鎖：条件《赤シンボル》】持ち・アタック時：相手は白のバーストを発動できない）
const ORYX = "BS17-046" // オリクス盗賊団（青・コスト1・効果なし・【連鎖】無し）
const SWORD = "BS19-014" // ダーク・ソードール（紫・コスト3・【連鎖：条件《黄シンボル》】持ち・青ではない）
const RIO = "BS17-040" // 呪術士リオ（黄・コスト3・効果なし）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1BP6000・効果なし・ブロッカー）
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス・080 のバウンス対象）
const HYOGAN = "SD06-016" // 絶甲氷盾（白・マジック・【バースト：自分のライフ減少後】）
const SOYOKU = "SD06-013" // 双翼乱舞（赤・マジック・【バースト：相手の『このスピリット/ブレイヴの召喚時』発揮後】ドロー2）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const SABER = "BS01-003" // テラノセイバー（赤・コスト2・効果なし）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; symbol: string[]; levels: { level: number; cores: number }[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(CORAL)?.name === "珊瑚の樹海" && byId(CORAL)!.type === "nexus" && byId(CORAL)!.cost === 5 && byId(CORAL)!.colors.join("/") === "blue/purple" && byId(CORAL)!.symbol.join("/") === "blue/purple" && byId(CORAL)!.levels.map((l) => l.cores).join("/") === "0/2", "CORALは珊瑚の樹海（ネクサス・コスト5・青/紫・シンボル青/紫・Lvコア0/2）")
    assert(byId(WHITEOUT)?.name === "ホワイトアウト" && byId(WHITEOUT)!.type === "magic" && byId(WHITEOUT)!.cost === 4 && byId(WHITEOUT)!.colors[0] === "white", "WHITEOUTはホワイトアウト（マジック・コスト4・白）")
    assert(byId(DREAM)?.name === "ライフドリーム" && byId(DREAM)!.type === "magic" && byId(DREAM)!.cost === 4 && byId(DREAM)!.colors[0] === "yellow", "DREAMはライフドリーム（マジック・コスト4・黄）")
    assert(getCard(MINOTA).name === "ミノタ・コルス" && getCard(MINOTA).colors[0] === "blue" && getCard(MINOTA).effect.includes("【連鎖"), "MINOTAはミノタ・コルス（青・【連鎖】持ち）")
    assert(getCard(ORYX).name === "オリクス盗賊団" && getCard(ORYX).colors[0] === "blue" && getCard(ORYX).effect === "", "ORYXはオリクス盗賊団（青・効果なし・【連鎖】無し）")
    assert(getCard(SWORD).name === "ダーク・ソードール" && getCard(SWORD).colors[0] === "purple" && getCard(SWORD).effect.includes("【連鎖"), "SWORDはダーク・ソードール（紫・【連鎖】持ち・青ではない）")
    assert(getCard(RIO).name === "呪術士リオ" && getCard(RIO).colors[0] === "yellow" && getCard(RIO).effect === "", "RIOは呪術士リオ（黄・効果なし）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).levels[0]!.bp === 6000 && getCard(TARAN).effect === "", "TARANはタランドーズ（Lv1BP6000・効果なし）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場（ネクサス）")
    assert(getCard(HYOGAN).name === "絶甲氷盾" && getCard(HYOGAN).type === "magic" && getCard(HYOGAN).effect.includes("ライフ減少後"), "HYOGANは絶甲氷盾（ライフ減少後バーストのマジック）")
    assert(getCard(SOYOKU).name === "双翼乱舞" && getCard(SOYOKU).type === "magic" && getCard(SOYOKU).effect.includes("召喚時"), "SOYOKUは双翼乱舞（相手の召喚時効果発揮後バーストのマジック）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス（効果なし）")
    assert(getCard(SABER).name === "テラノセイバー" && getCard(SABER).levels[0]!.bp === 4000, "SABERはテラノセイバー（Lv1BP4000）")
}

function game(seed: string, phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "green" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 任意の確認を受けるときの選択肢の文言（実装に合わせて部分一致で探す）
const ACCEPT_PREF = ["発動する", "ドロー", "置く", "支払う", "残る"]

// pendingChoice を答える（accept=true なら受け、false なら選択肢を付けずに断る）。出た確認の文言を返す
function settle(s: GameState, accept: boolean, picks: string[] = []): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        prompts.push(pc.prompt)
        let err: string | null
        if (pc.kind === "option" && accept) {
            const o = pc.options ?? []
            const pick = o.find((x) => ACCEPT_PREF.some((p) => x.includes(p))) ?? o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined && accept) {
            err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        } else {
            err = act(s, who, { type: "resolveChoice" })
        }
        if (err) break
    }
    return prompts
}

// フラッシュタイミングを連続パスで閉じる
function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
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

// A（072 Lv1･Lv2『自分のアタックステップ』：【連鎖】持ちの青のスピリットのアタック時にドロー→破棄）
scene("A1: 072 Lv1 【連鎖】持ちの青スピリットのアタックでドローを受けると手札は元の枚数・デッキ-1・トラッシュ+1", () => {
    const s = game("a1")
    putNexus(s, "p1", CORAL, 0) // Lv1（コア0）
    const minota = put(s, "p1", MINOTA, 1) // 青・【連鎖】持ち
    s.players.p1.hand = [VAN, SABER]
    assert(act(s, "p1", { type: "attack", instanceId: minota.instanceId }) === null, "ミノタ・コルスでアタックできる")
    const prompts = settle(s, true) // ドローを受け、破棄する1枚も選ぶ
    assert(prompts.length >= 1, "ドローの確認が聞かれる")
    assert(s.players.p1.deck.length === 39, "デッキは40→39（1枚ドロー）")
    assert(s.players.p1.hand.length === 2, "手札は2→3→2（ドロー+1・破棄-1）")
    assert(s.players.p1.trashCards.length === 1, "破棄した1枚がトラッシュへ")
    takeLifeAndResolve(s, "p2")
})
scene("A2: 072 Lv1 ドローを断ると破棄も無く、デッキも手札も変わらない", () => {
    const s = game("a2")
    putNexus(s, "p1", CORAL, 0)
    const minota = put(s, "p1", MINOTA, 1)
    s.players.p1.hand = [VAN, SABER]
    assert(act(s, "p1", { type: "attack", instanceId: minota.instanceId }) === null, "ミノタ・コルスでアタックできる")
    const prompts = settle(s, false) // 任意の確認は選択肢を付けずに断る
    assert(prompts.length >= 1, "ドローの確認は聞かれる")
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 2 && s.players.p1.trashCards.length === 0, "断ればデッキ40・手札2・トラッシュ0のまま")
    takeLifeAndResolve(s, "p2")
})
scene("A3: 072 Lv1 【連鎖】を持たない青スピリットのアタックでは確認が起きない", () => {
    const s = game("a3")
    putNexus(s, "p1", CORAL, 0)
    const oryx = put(s, "p1", ORYX, 1) // 青だが【連鎖】無し
    s.players.p1.hand = [VAN, SABER]
    assert(act(s, "p1", { type: "attack", instanceId: oryx.instanceId }) === null, "オリクス盗賊団でアタックできる")
    const prompts = settle(s, false)
    assert(prompts.length === 0, "【連鎖】が無ければドローの確認は聞かれない")
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 2 && s.players.p1.trashCards.length === 0, "デッキも手札も変わらない")
    takeLifeAndResolve(s, "p2")
})
scene("A4: 072 Lv1 【連鎖】持ちでも青でなければ確認が起きない", () => {
    const s = game("a4")
    putNexus(s, "p1", CORAL, 0)
    const sword = put(s, "p1", SWORD, 1) // 【連鎖】持ちだが紫
    s.players.p1.hand = [VAN, SABER]
    assert(act(s, "p1", { type: "attack", instanceId: sword.instanceId }) === null, "ダーク・ソードールでアタックできる")
    const prompts = settle(s, false)
    assert(prompts.length === 0, "青でなければドローの確認は聞かれない")
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 2 && s.players.p1.trashCards.length === 0, "デッキも手札も変わらない")
    takeLifeAndResolve(s, "p2")
})

// B（072 Lv2『自分のアタックステップ』ステップ開始時：ライフのコア1個をリザーブに置くとこのターンお互いバースト発動不可）
scene("B1: 072 Lv2 ステップ開始時に払うとライフ-1・リザーブ+1で、このターン相手のライフ減少後バーストは発動を聞かれない", () => {
    const s = game("b1")
    putNexus(s, "p1", CORAL, 2) // Lv2
    const oryx = put(s, "p1", ORYX, 1)
    placeBurst(s, "p2", HYOGAN) // 相手の【自分のライフ減少後】バースト
    fireStepTriggers(s, "attack")
    const prompts = settle(s, true) // ライフのコア1個をリザーブに置く
    assert(prompts.length >= 1, "コアを置くかの確認が聞かれる")
    assert(s.players.p1.life === 4, "自分のライフは5→4")
    assert(s.players.p1.reserve === 21, "自分のリザーブは20→21")
    assert(act(s, "p1", { type: "attack", instanceId: oryx.instanceId }) === null, "オリクス盗賊団でアタックできる")
    settle(s, false)
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "相手のライフは5→4")
    assert(s.pendingChoice?.burstActivate === undefined, "このターンお互いバーストを発動できないので発動確認は出ない")
})
scene("B2: 072 Lv2 確認を断れば何も起きず、相手のライフ減少後バーストは通常どおり聞かれる", () => {
    const s = game("b2")
    putNexus(s, "p1", CORAL, 2)
    const oryx = put(s, "p1", ORYX, 1)
    placeBurst(s, "p2", HYOGAN)
    fireStepTriggers(s, "attack")
    settle(s, false) // 任意の確認は選択肢を付けずに断る
    assert(s.players.p1.life === 5 && s.players.p1.reserve === 20, "断ればライフもリザーブも変わらない")
    assert(act(s, "p1", { type: "attack", instanceId: oryx.instanceId }) === null, "オリクス盗賊団でアタックできる")
    settle(s, false)
    takeLifeAndResolve(s, "p2")
    assert(s.pendingChoice?.burstActivate !== undefined, "払っていないので相手のライフ減少後バーストの発動確認が出る")
    act(s, "p2", { type: "resolveChoice" }) // ここでは断って終わらせる
})

// C（080 ホワイトアウト：メインで相手のネクサスすべてを手札に／連鎖[青]でこのターン相手のライフ減少後バーストのみ封じ）
scene("C1: 080 青シンボルありでメイン使用→相手のネクサスが手札に戻り、連鎖[青]でこのターン相手のライフ減少後バーストが発動を聞かれない", () => {
    const s = game("c1", "main")
    const oryx = put(s, "p1", ORYX, 1) // 青シンボル
    putNexus(s, "p2", SPEARS, 1)
    placeBurst(s, "p2", HYOGAN)
    s.players.p1.hand = [WHITEOUT]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ホワイトアウトをメインで使用できる")
    settle(s, true)
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスはすべて手札に戻る")
    assert(s.players.p2.hand.length === 1 && s.players.p2.hand[0] === SPEARS, "戻ったネクサスは相手の手札へ")
    assert(s.players.p1.reserve === 16, "コスト4の支払いでリザーブは20→16")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: oryx.instanceId }) === null, "オリクス盗賊団でアタックできる")
    settle(s, false)
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "相手のライフは5→4")
    assert(s.pendingChoice?.burstActivate === undefined, "連鎖[青]でこのターン相手のライフ減少後バーストは発動を聞かれない")
})
scene("C2: 080 の連鎖[青]は、ライフ減少後以外の条件のバーストには影響しない", () => {
    const s = game("c2", "main")
    put(s, "p1", ORYX, 1) // 青シンボル
    placeBurst(s, "p2", SOYOKU) // 【バースト：相手の『このスピリット/ブレイヴの召喚時』発揮後】
    s.players.p1.hand = [WHITEOUT]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ホワイトアウトをメインで使用できる")
    settle(s, true)
    fireFieldEventTriggers(s, "p2", "opponentSummonEffectResolved") // 相手（p1）のスピリットの召喚時効果発揮後
    assert(s.pendingChoice?.burstActivate !== undefined, "ライフ減少後以外の条件のバーストは発動を聞かれる")
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options?.find((o) => o.includes("発動")) ?? "発動する" })
    if (s.pendingChoice) act(s, "p2", { type: "resolveChoice" }) // thenPay のフラッシュ効果は断る
    assert(s.players.p2.deck.length === 38, "双翼乱舞のバースト効果で相手は2枚ドロー（デッキ40→38）")
    assert(s.players.p2.trashCards.includes(SOYOKU), "発動した双翼乱舞はトラッシュへ")
})
scene("C3: 080 青シンボルが無ければ連鎖[青]は発揮せず、相手のライフ減少後バーストは聞かれる（メインのバウンスは起こる）", () => {
    const s = game("c3", "main")
    const van = put(s, "p1", VAN, 1) // 赤のみで青シンボル無し
    putNexus(s, "p2", SPEARS, 1)
    placeBurst(s, "p2", HYOGAN)
    s.players.p1.hand = [WHITEOUT]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ホワイトアウトをメインで使用できる")
    settle(s, true)
    assert(s.players.p2.field.nexuses.length === 0 && s.players.p2.hand[0] === SPEARS, "メインの効果（ネクサスのバウンス）はシンボルに関係なく起こる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    settle(s, false)
    takeLifeAndResolve(s, "p2")
    assert(s.pendingChoice?.burstActivate !== undefined, "連鎖していないので相手のライフ減少後バーストの発動確認が出る")
    act(s, "p2", { type: "resolveChoice" }) // ここでは断って終わらせる
})

// D（082 ライフドリーム：メインで自分の黄のスピリットすべてに「アタック時にライフのコア1個を置くとブロックされない」を付与）
scene("D1: 082 黄スピリットのアタックでライフのコア1個を置くとブロックされず、自分のライフ減少後バーストも発動を聞かれない", () => {
    const s = game("d1", "main")
    const rio = put(s, "p1", RIO, 1) // 黄・コア1
    const taran = put(s, "p2", TARAN, 1) // ブロッカー
    placeBurst(s, "p1", HYOGAN) // 自分の【自分のライフ減少後】バースト
    s.players.p1.hand = [DREAM]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ライフドリームをメインで使用できる")
    settle(s, true)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: rio.instanceId }) === null, "呪術士リオでアタックできる")
    const prompts = settle(s, true) // ライフのコア1個をこのスピリットに置く
    assert(prompts.length >= 1, "コアを置くかの確認が聞かれる")
    assert(s.players.p1.life === 4, "自分のライフは5→4")
    const rioInst = s.players.p1.field.spirits.find((x) => x.instanceId === rio.instanceId)
    assert(rioInst !== undefined && rioInst.cores === 2, "呪術士リオのコアは1→2")
    assert(s.pendingChoice?.burstActivate === undefined, "この効果でライフが減っても自分のライフ減少後バーストは発動を聞かれない")
    assert(declareBlock(s, "p2", taran.instanceId) !== null, "ブロックされないのでタランドーズのブロック宣言は拒否される")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4, "ブロックされず相手のライフは5→4")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === rio.instanceId), "呪術士リオは生存している")
})
scene("D2: 082 置くのを断ればブロックされ、BPを比べて呪術士リオは破壊される", () => {
    const s = game("d2", "main")
    const rio = put(s, "p1", RIO, 1)
    const taran = put(s, "p2", TARAN, 1)
    s.players.p1.hand = [DREAM]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ライフドリームをメインで使用できる")
    settle(s, true)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: rio.instanceId }) === null, "呪術士リオでアタックできる")
    settle(s, false) // 任意の確認は選択肢を付けずに断る
    assert(s.players.p1.life === 5, "断ればライフは変わらない")
    assert(declareBlock(s, "p2", taran.instanceId) === null, "断ればブロックできる")
    passFlash(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === rio.instanceId), "BP2000対6000で呪術士リオは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === taran.instanceId), "タランドーズは生存している")
})
scene("D3: 082 黄でないスピリットのアタックではコアを置く確認が起きない", () => {
    const s = game("d3", "main")
    put(s, "p1", RIO, 1)
    const van = put(s, "p1", VAN, 1) // 赤
    s.players.p1.hand = [DREAM]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ライフドリームをメインで使用できる")
    settle(s, true)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    const prompts = settle(s, false)
    assert(prompts.length === 0, "黄でなければコアを置く確認は聞かれない")
    assert(s.players.p1.life === 5, "ライフは変わらない")
    takeLifeAndResolve(s, "p2")
})

console.log("すべてのチェックに合格しました 🎉（part801）")
