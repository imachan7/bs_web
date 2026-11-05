// smoke パート778（BS11-056・BS11-057・BS12-056・BS13-050・BS13-055・BS14-067・BS14-071・BS15-057・BS15-058・BS16-057：白/黄/赤/緑ブレイヴの【合体時】・キーワード・手札召喚効果）
import {
    act,
    answerPayConfirm,
    assert,
    createGame,
    createInstance,
    declareBlock,
    effectiveBp,
    getCard,
    placeBurst,
    refreshLevelAsOverrides,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const POLA = "BS11-056" // 極星剣機ポーラ・キャリバー（白・ブレイヴ・コスト5・動器）
const BATA = "BS11-057" // バタホルン（黄・ブレイヴ・コスト4・道玩）
const JET = "BS12-056" // ジェット・レイ（白・ブレイヴ・コスト5・武装/空魚）
const SHINE = "BS13-050" // 輝竜シャイン・ブレイザー（赤・ブレイヴ・コスト5・星竜/機竜）
const SHIELD = "BS13-055" // 重装合体シールド・ドラゴンMk-II（白・ブレイヴ・コスト4・甲竜）
const RAGIAN = "BS14-067" // ラギアン（赤・ブレイヴ・コスト4・機竜/地竜）
const TRUMP = "BS14-071" // トランプン（黄・ブレイヴ・コスト4・四道/小玩）
const OWL = "BS15-057" // カメン・フクロウ（緑・ブレイヴ・コスト4・爪鳥/機獣）
const CAMEL = "BS15-058" // ダブル・キャメル（白・ブレイヴ・コスト4・機獣）
const KOTETSU = "BS16-057" // コテツ・ティーガー（緑・ブレイヴ・コスト5・剣獣/機獣）
// 脇役
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1BP1000・バニラ）
const HYDRA = "BS02-023" // 双蛇ヒュドラム（紫・コスト6・Lv1BP4000・バニラ：合体条件コスト5以上を満たす）
const JUGON = "BS03-042" // 海獣ジューゴン（白・コスト4・Lv1BP3000/Lv3(4コア)BP8000・バニラ：合体条件コスト4以上を満たす）
const VAJURA = "BS17-007" // ヴァジュランガ（赤・コスト6・Lv2(3コア)BP10000・バニラ）
const CANDEL = "BS06-055" // コットン・キャンデル（黄・コスト4・Lv1BP4000・バニラ）
const HERCULES = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・Lv1BP4000・バニラ）
const NEXUS = "BS11-072" // 未完成の古代戦艦：船尾（青・ネクサス・コスト3・Lv1：お互いボイドからライフにコアを置けない）
const POWER = "BS01-135" // パワーオーラ（緑・マジック・コスト3・フラッシュ：ドロー1＋自分のスピリットすべてBP+1000）
const BINDING = "BS01-134" // バインディングソーン（緑・マジック・コスト2・フラッシュ：相手のスピリット1体を疲労させる）
const DREAM = "BS01-146" // ドリームリボン（白・マジック・コスト4・フラッシュ：相手のスピリット1体を手札に戻す）
const FLAMEGUST = "BS09-069" // フレイムガスト（赤・マジック・コスト6・フラッシュ：BP6000以下の相手のスピリット1体を破壊する）
const GINGA = "BS11-045" // MCギンガー（青・コスト5・アタック時：相手のデッキ1枚破棄し、そのコストの相手のスピリット1体を破壊する）
const ANDRA = "BS06-024" // 冥騎士アンドラー（紫・コスト7・アタック時：コアが2個以下の相手のスピリット1体を破壊する）

console.log("=== 前提: カードの機械確認 ===")
{
    const braves: [string, string, string, number, string][] = [
        [POLA, "極星剣機ポーラ・キャリバー", "white", 5, "動器"],
        [BATA, "バタホルン", "yellow", 4, "道玩"],
        [JET, "ジェット・レイ", "white", 5, "武装"],
        [SHINE, "輝竜シャイン・ブレイザー", "red", 5, "星竜"],
        [SHIELD, "重装合体シールド・ドラゴンMk-II", "white", 4, "甲竜"],
        [RAGIAN, "ラギアン", "red", 4, "機竜"],
        [TRUMP, "トランプン", "yellow", 4, "四道"],
        [OWL, "カメン・フクロウ", "green", 4, "爪鳥"],
        [CAMEL, "ダブル・キャメル", "white", 4, "機獣"],
        [KOTETSU, "コテツ・ティーガー", "green", 5, "剣獣"],
    ]
    for (const [id, name, color, cost, fam] of braves) {
        assert(getCard(id).name === name && getCard(id).type === "brave", `${id}は${name}（ブレイヴ）`)
        assert(getCard(id).colors?.[0] === color && getCard(id).cost === cost, `${id}は${color}・コスト${cost}`)
        assert((getCard(id).family ?? []).includes(fam), `${id}の系統は${fam}`)
    }
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).levels[0]!.bp === 1000, "VANはロクケラトプス（コスト1・BP1000）")
    assert(getCard(HYDRA).name === "双蛇ヒュドラム" && getCard(HYDRA).cost === 6 && getCard(HYDRA).levels[0]!.bp === 4000 && (getCard(HYDRA).effects ?? []).length === 0, "HYDRAは双蛇ヒュドラム（コスト6・BP4000・バニラ）")
    assert(getCard(JUGON).name === "海獣ジューゴン" && getCard(JUGON).cost === 4 && getCard(JUGON).levels[0]!.bp === 3000 && getCard(JUGON).levels[2]!.bp === 8000, "JUGONは海獣ジューゴン（コスト4・BP3000/8000）")
    assert(getCard(VAJURA).name === "ヴァジュランガ" && getCard(VAJURA).cost === 6 && getCard(VAJURA).levels[1]!.bp === 10000, "VAJURAはヴァジュランガ（コスト6・Lv2BP10000）")
    assert(getCard(CANDEL).name === "コットン・キャンデル" && getCard(CANDEL).cost === 4 && getCard(CANDEL).levels[0]!.bp === 4000, "CANDELはコットン・キャンデル（コスト4・BP4000）")
    assert(getCard(HERCULES).name === "ヘラクレス・ジオ" && getCard(HERCULES).cost === 3 && getCard(HERCULES).levels[0]!.bp === 4000, "HERCULESはヘラクレス・ジオ（コスト3・BP4000）")
    assert(getCard(NEXUS).name === "未完成の古代戦艦：船尾" && getCard(NEXUS).type === "nexus", "NEXUSは未完成の古代戦艦：船尾（ネクサス）")
    assert(getCard(POWER).name === "パワーオーラ" && getCard(POWER).type === "magic" && getCard(POWER).colors?.[0] === "green", "POWERはパワーオーラ（緑マジック）")
    assert(getCard(BINDING).name === "バインディングソーン" && getCard(BINDING).type === "magic" && getCard(BINDING).colors?.[0] === "green", "BINDINGはバインディングソーン（緑マジック）")
    assert(getCard(DREAM).name === "ドリームリボン" && getCard(DREAM).type === "magic" && getCard(DREAM).colors?.[0] === "white", "DREAMはドリームリボン（白マジック）")
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).type === "magic" && getCard(FLAMEGUST).colors?.[0] === "red", "FLAMEGUSTはフレイムガスト（赤マジック）")
    assert(getCard(GINGA).name === "MCギンガー" && getCard(GINGA).type === "spirit" && getCard(GINGA).cost === 5, "GINGAはMCギンガー（コスト5）")
    assert(getCard(ANDRA).name === "冥騎士アンドラー" && getCard(ANDRA).type === "spirit" && getCard(ANDRA).cost === 7 && getCard(ANDRA).colors?.[0] === "purple", "ANDRAは冥騎士アンドラー（紫・コスト7）")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = interactive
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

// ブレイヴを合体状態で置く（合体条件を満たすホストに braveRefs で紐付ける）
function combine(s: GameState, braveCardId: string, host: ReturnType<typeof createInstance>): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

// ブレイヴをスピリット状態で置く（合体していない）
function braveSpirit(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    return put(s, pid, cardId, 1)
}

// pendingChoice を答える（option は「発動する」「召喚する」を優先、target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.includes("発動する") ? "発動する" : o.includes("召喚する") ? "召喚する" : o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// バトルが片付くまで優先権をパスし続ける（選択待ちは settle で答える）
function finishBattle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 16; i++) {
        if (s.pendingChoice) settle(s, picks)
        else if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
    settle(s, picks)
}

// 自分がアタックし、相手がブロックする（ブロッカーがいれば）
function attackAndBlock(s: GameState, attacker: ReturnType<typeof createInstance>, blocker: ReturnType<typeof createInstance> | null, picks: string[] = []): void {
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックできる")
    settle(s, picks)
    if (blocker) assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックを宣言できる")
    finishBattle(s, picks)
}

// 相手がアタックし、自分がブロックする（ブロッカーがいなければライフで受ける）
function oppAttack(s: GameState, attacker: ReturnType<typeof createInstance>, blocker: ReturnType<typeof createInstance> | null, picks: string[] = []): void {
    s.phase = "attack"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手がアタックできる")
    settle(s, picks)
    if (blocker) {
        assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブロックを宣言できる")
        finishBattle(s, picks)
    } else {
        assert(takeLifeAndResolve(s, "p1") === null, "ライフで受けられる")
        settle(s, picks)
    }
}

// フラッシュタイミングでマジックを唱える（優先権が無ければ1回だけ譲り受ける）
function flashCast(s: GameState, pid: PlayerId, cardId: string, picks: string[] = []): void {
    const hand = s.players[pid].hand
    const idx = hand.indexOf(cardId)
    assert(idx >= 0, `${cardId}が手札にある`)
    let err = act(s, pid, { type: "castMagic", handIndex: idx })
    for (let i = 0; i < 2 && err !== null && err.includes("優先権"); i++) {
        act(s, s.priorityPlayer, { type: "pass" })
        err = act(s, pid, { type: "castMagic", handIndex: idx })
    }
    assert(err === null, `マジックを唱えられる（${err}）`)
    settle(s, picks)
}

// フラッシュタイミングで優先権が必要な行動（覚醒・神速など）。優先権が無ければ1回だけ譲り受ける
function flashAct(s: GameState, pid: PlayerId, action: Record<string, unknown>): string | null {
    let err = act(s, pid, action as never)
    for (let i = 0; i < 2 && err !== null && err.includes("優先権"); i++) {
        act(s, s.priorityPlayer, { type: "pass" })
        err = act(s, pid, action as never)
    }
    return err
}

const onField = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

console.log("=== 1. BS11-056 ポーラ・キャリバー【合体時】ブロック時：BP比べで破壊したとき相手のスピリット/ブレイヴ/ネクサス1つを手札に戻す ===")
{
    // 合体時：ブロックで相手スピリットだけを破壊 → 相手のスピリット1つを手札に戻す
    const s = game("pola-combined", true)
    const host = put(s, "p1", HYDRA, 1)
    combine(s, POLA, host)
    const attacker = put(s, "p2", VAN, 1)
    const foe = put(s, "p2", CANDEL, 1)
    s.players.p2.field.nexuses.push(createInstance(NEXUS, s.turn, 0))
    oppAttack(s, attacker, host, [foe.instanceId])
    assert(!onField(s, "p2", attacker), "1: アタッカー（BP1000）は破壊される")
    assert(!onField(s, "p2", foe) && s.players.p2.hand.includes(CANDEL), "1: 破壊したとき、相手のスピリット1つ（コットン・キャンデル）が手札に戻る")
    assert(s.players.p2.field.nexuses.length === 1, "1: 戻していない相手のネクサスは場に残る")
    assert(!s.players.p2.trashCards.includes(CANDEL), "1: 戻したスピリットはトラッシュに行かない")
}
{
    // スピリット状態（合体していない）：ブロックで破壊しても手札に戻さない
    const s = game("pola-spirit", true)
    const brave = braveSpirit(s, "p1", POLA)
    const attacker = put(s, "p2", VAN, 1)
    const foe = put(s, "p2", CANDEL, 1)
    s.players.p2.field.nexuses.push(createInstance(NEXUS, s.turn, 0))
    oppAttack(s, attacker, brave)
    assert(!onField(s, "p2", attacker), "2: アタッカーは破壊される")
    assert(onField(s, "p2", foe) && s.players.p2.hand.length === 0 && s.players.p2.field.nexuses.length === 1, "2: 合体していないので何も手札に戻らない")
}

console.log("=== 2. BS11-057 バタホルン：Lv1『召喚時』コスト4/6/8の相手スピリットはブロックできない／【合体時】【光芒】バトルで使ったマジックが手札に戻る ===")
{
    // 召喚時：このターン、コスト4の相手スピリットはブロックできず、コスト3はブロックできる
    const s = game("bata-summon")
    s.phase = "main"
    s.players.p1.hand = [BATA]
    const myAttacker = put(s, "p1", HYDRA, 1)
    const c4 = put(s, "p2", CANDEL, 1)
    const c3 = put(s, "p2", HERCULES, 1)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "3: バタホルンを召喚できる")
    answerPayConfirm(s, "p1")
    settle(s)
    assert(onField(s, "p1", s.players.p1.field.spirits.find((x) => x.cardId === BATA)!), "3: バタホルンはスピリット状態で場にある")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: myAttacker.instanceId }) === null, "3: アタックできる")
    settle(s)
    assert(declareBlock(s, "p2", c4.instanceId) !== null, "3: コスト4の相手スピリットはブロックできない")
    assert(declareBlock(s, "p2", c3.instanceId) === null, "3: コスト3の相手スピリットはブロックできる")
    finishBattle(s)
}
{
    // 【合体時】【光芒】：合体アタックしたバトルで使ったマジックはバトル終了時に手札に戻る
    const s = game("bata-kobo", true)
    const host = put(s, "p1", HYDRA, 1)
    combine(s, BATA, host)
    s.players.p1.hand = [POWER]
    const blocker = put(s, "p2", VAN, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "4: 合体スピリットでアタックできる")
    flashCast(s, "p1", POWER)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "4: ブロックを宣言できる")
    finishBattle(s)
    assert(!onField(s, "p2", blocker), "4: ブロッカー（BP1000）は破壊される")
    assert(s.players.p1.hand.includes(POWER), "4: バトルで使ったマジック（パワーオーラ）は手札に戻る")
    assert(!s.players.p1.trashCards.includes(POWER), "4: 使ったマジックはトラッシュに行かない")
}
{
    // スピリット状態（合体していない）：バトルで使ったマジックはトラッシュに行く
    const s = game("bata-spirit")
    const brave = braveSpirit(s, "p1", BATA)
    const myAttacker = put(s, "p1", HYDRA, 1)
    s.players.p1.hand = [POWER]
    const blocker = put(s, "p2", VAN, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: myAttacker.instanceId }) === null, "5: アタックできる")
    flashCast(s, "p1", POWER)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "5: ブロックを宣言できる")
    finishBattle(s)
    assert(s.players.p1.trashCards.includes(POWER) && !s.players.p1.hand.includes(POWER), "5: 合体していないのでマジックはトラッシュに行ったまま")
    assert(onField(s, "p1", brave), "5: スピリット状態のバタホルンは場に残る")
}

console.log("=== 3. BS12-056 ジェット・レイ：ライフが3以下になったときコスト不払いで召喚／【合体時】ブロック時：相手2体を疲労させる ===")
{
    // 相手のスピリットのアタックでライフ4→3：コストを支払わずに手札から召喚できる
    const s = game("jet-free", true)
    s.players.p1.life = 4
    s.players.p1.hand = [JET]
    const attacker = put(s, "p2", VAN, 1)
    s.phase = "attack"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "6: 相手がアタックできる")
    assert(takeLifeAndResolve(s, "p1") === null, "6: ライフで受けられる")
    assert(s.pendingChoice !== null && s.pendingChoice!.pid === "p1", "6: 召喚するかの確認が立つ（選ぶのは手札の持ち主）")
    assert(act(s, "p1", { type: "resolveChoice", option: "召喚する" }) === null, "6: 「召喚する」を選べる")
    settle(s)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === JET), "6: ジェット・レイが場に出る")
    assert(!s.players.p1.hand.includes(JET), "6: 手札からは無くなる")
    assert(s.players.p1.life === 3, "6: ライフは3")
    assert(s.players.p1.trashCores === 0, "6: コスト5は支払っていない（トラッシュにコアが無い）")
}
{
    // ライフ5→4（3以下でない）：召喚の確認は出ない
    const s = game("jet-over3", true)
    s.players.p1.life = 5
    s.players.p1.hand = [JET]
    const attacker = put(s, "p2", VAN, 1)
    s.phase = "attack"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "7: 相手がアタックできる")
    assert(takeLifeAndResolve(s, "p1") === null, "7: ライフで受けられる")
    settle(s)
    assert(s.players.p1.life === 4, "7: ライフは4")
    assert(s.players.p1.hand.includes(JET) && !s.players.p1.field.spirits.some((x) => x.cardId === JET), "7: ライフが3以下でないので召喚されず手札に残る")
}
{
    // 【合体時】ブロック時：相手のスピリット2体を疲労させる
    const s = game("jet-block", true)
    const host = put(s, "p1", HYDRA, 1)
    combine(s, JET, host)
    const attacker = put(s, "p2", VAN, 1)
    const foe1 = put(s, "p2", CANDEL, 1)
    const foe2 = put(s, "p2", HERCULES, 1)
    oppAttack(s, attacker, host, [foe1.instanceId, foe2.instanceId])
    assert(!onField(s, "p2", attacker), "8: アタッカー（BP1000）は破壊される")
    assert(foe1.isRested === true && foe2.isRested === true, "8: ブロックしたとき、相手のスピリット2体が疲労する")
}
{
    // スピリット状態（合体していない）：ブロックしても2体を疲労させない
    const s = game("jet-block-spirit")
    const brave = braveSpirit(s, "p1", JET)
    const attacker = put(s, "p2", VAN, 1)
    const foe1 = put(s, "p2", CANDEL, 1)
    const foe2 = put(s, "p2", HERCULES, 1)
    oppAttack(s, attacker, brave)
    assert(!onField(s, "p2", attacker), "9: アタッカーは破壊される")
    assert(foe1.isRested === false && foe2.isRested === false, "9: 合体していないので相手のスピリットは疲労しない")
}

console.log("=== 4. BS13-050 シャイン・ブレイザー【合体時】合体アタック時：BP8000以上を破壊したとき相手のライフのコア1個をリザーブへ ===")
{
    // BP8000のブロッカーを破壊 → 相手のライフのコア1個がリザーブに移る
    const s = game("shine-8000")
    const host = put(s, "p1", VAJURA, 3)
    combine(s, SHINE, host)
    const blocker = put(s, "p2", JUGON, 4) // Lv3 BP8000
    attackAndBlock(s, host, blocker)
    assert(!onField(s, "p2", blocker), "10: BP8000のブロッカーは破壊される")
    // 破壊されたブロッカーのコア4個もリザーブに戻るので、リザーブは 20+4+1
    assert(s.players.p2.life === 4 && s.players.p2.reserve === 25, "10: 破壊したスピリット1体につき、相手のライフのコア1個がリザーブに置かれる")
}
{
    // BP8000未満のブロッカーを破壊してもライフのコアは動かない
    const s = game("shine-4000")
    const host = put(s, "p1", VAJURA, 3)
    combine(s, SHINE, host)
    const blocker = put(s, "p2", CANDEL, 1) // BP4000
    attackAndBlock(s, host, blocker)
    assert(!onField(s, "p2", blocker), "11: BP4000のブロッカーは破壊される")
    // 破壊されたブロッカーのコア1個ぶんだけリザーブは増えるが、ライフは減らない
    assert(s.players.p2.life === 5 && s.players.p2.reserve === 21, "11: BP8000未満なのでライフのコアは動かない")
}
{
    // スピリット状態（合体していない）：破壊してもライフのコアは動かない
    const s = game("shine-spirit")
    const brave = braveSpirit(s, "p1", SHINE)
    const blocker = put(s, "p2", VAN, 1)
    attackAndBlock(s, brave, blocker)
    assert(!onField(s, "p2", blocker), "12: ブロッカー（BP1000）は破壊される")
    assert(s.players.p2.life === 5 && s.players.p2.reserve === 21, "12: 合体していないのでライフのコアは動かない")
}

console.log("=== 5. BS13-055 シールド・ドラゴンMk-II：Lv1『召喚時』相手のネクサス1つをデッキの上に戻す／【合体時】【重装甲：緑/白/黄】 ===")
{
    // 召喚時：相手のネクサス1つをデッキの上に戻す
    const s = game("mk2-summon", true)
    s.phase = "main"
    s.players.p1.hand = [SHIELD]
    const nexus = createInstance(NEXUS, s.turn, 0)
    s.players.p2.field.nexuses.push(nexus)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "13: Mk-IIを召喚できる")
    answerPayConfirm(s, "p1")
    settle(s, [nexus.instanceId])
    assert(s.players.p2.field.nexuses.length === 0, "13: 相手のネクサスは場から無くなる")
    assert(s.players.p2.deck[0] === NEXUS && s.players.p2.deck.length === 41, "13: 相手のネクサスはデッキの上に戻る")
    assert(!s.players.p2.hand.includes(NEXUS) && !s.players.p2.trashCards.includes(NEXUS), "13: 手札にもトラッシュにも行かない")
}
{
    // 召喚時：相手のネクサスが無ければデッキは変わらない
    const s = game("mk2-summon-none")
    s.phase = "main"
    s.players.p1.hand = [SHIELD]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "14: Mk-IIを召喚できる")
    answerPayConfirm(s, "p1")
    settle(s)
    assert(s.players.p2.deck.length === 40 && s.players.p2.deck[0] === VAN, "14: 相手のネクサスが無いのでデッキの上は変わらない")
}
{
    // 【重装甲：緑/白/黄】相手の緑のマジックの効果（疲労）を受けない
    const s = game("mk2-green", true)
    const host = put(s, "p1", JUGON, 1)
    combine(s, SHIELD, host)
    const attacker = put(s, "p1", VAN, 1)
    s.players.p2.hand = [BINDING]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "15: アタックできる")
    flashCast(s, "p2", BINDING, [host.instanceId])
    assert(takeLifeAndResolve(s, "p2") === null, "15: ライフで受けられる")
    settle(s)
    assert(host.isRested === false, "15: 相手の緑のマジックでも疲労しない")
    assert(s.players.p2.trashCards.includes(BINDING), "15: マジックのコストは通常どおり支払われる")
}
{
    // 【重装甲：緑/白/黄】指定外の赤のマジックの効果（破壊）は受ける
    const s = game("mk2-red", true)
    const host = put(s, "p1", JUGON, 1) // 合体BP 3000+3000=6000
    combine(s, SHIELD, host)
    const attacker = put(s, "p1", VAN, 1)
    s.players.p2.hand = [FLAMEGUST]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "16: アタックできる")
    flashCast(s, "p2", FLAMEGUST, [host.instanceId])
    assert(takeLifeAndResolve(s, "p2") === null, "16: ライフで受けられる")
    settle(s)
    assert(!onField(s, "p1", host) && s.players.p1.trashCards.includes(JUGON), "16: 指定外の赤のマジック（BP6000以下破壊）で破壊される")
}
{
    // スピリット状態（合体していない）：重装甲は無く、緑のマジックで疲労する
    const s = game("mk2-spirit", true)
    const brave = braveSpirit(s, "p1", SHIELD)
    const attacker = put(s, "p1", VAN, 1)
    s.players.p2.hand = [BINDING]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "17: アタックできる")
    flashCast(s, "p2", BINDING, [brave.instanceId])
    assert(takeLifeAndResolve(s, "p2") === null, "17: ライフで受けられる")
    settle(s)
    assert(brave.isRested === true, "17: 合体していないので緑のマジックで疲労する")
}

console.log("=== 6. BS14-067 ラギアン【合体時】フラッシュ【覚醒】：自分のスピリットのコアをこのスピリットに置ける ===")
{
    // 合体時：フラッシュタイミングで自分の他のスピリットからコアを移せる
    const s = game("ragian-combined")
    const host = put(s, "p1", HYDRA, 1)
    combine(s, RAGIAN, host)
    const source = put(s, "p1", VAN, 2)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "18: 合体スピリットでアタックできる")
    assert(flashAct(s, "p1", { type: "awaken", instanceId: host.instanceId, fromInstanceId: source.instanceId, count: 1 }) === null, "18: 【覚醒】で他のスピリットからコアを移せる")
    assert(source.cores === 1 && host.cores === 2, "18: コアが1個移っている")
    assert(takeLifeAndResolve(s, "p2") === null, "18: ライフで受けられる")
    settle(s)
}
{
    // スピリット状態（合体していない）：【覚醒】ではコアを移せない
    const s = game("ragian-spirit")
    const brave = braveSpirit(s, "p1", RAGIAN)
    const source = put(s, "p1", VAN, 2)
    const attacker = put(s, "p1", HYDRA, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "19: アタックできる")
    assert(flashAct(s, "p1", { type: "awaken", instanceId: brave.instanceId, fromInstanceId: source.instanceId, count: 1 }) !== null, "19: 合体していないので【覚醒】は使えない")
    assert(source.cores === 2 && brave.cores === 1, "19: コアは動かない")
    assert(takeLifeAndResolve(s, "p2") === null, "19: ライフで受けられる")
    settle(s)
}

console.log("=== 7. BS14-071 トランプン【合体時】：相手のスピリットの効果で破壊されたとき疲労状態で場に残る ===")
{
    // 合体時：相手のスピリットの効果で破壊されても疲労状態で自分のフィールドに残る
    const s = game("trump-combined")
    const host = put(s, "p1", JUGON, 1) // コア1個 → アンドラーの効果（コア2個以下が対象）で破壊される
    combine(s, TRUMP, host)
    const attacker = put(s, "p2", ANDRA, 1)
    s.phase = "attack"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "20: 相手（冥騎士アンドラー）がアタックできる")
    settle(s)
    assert(onField(s, "p1", host) && host.isRested === true, "20: 相手のスピリットの効果で破壊されたが疲労状態で自分のフィールドに残る")
    assert(!s.players.p1.trashCards.includes(JUGON) && !s.players.p1.trashCards.includes(TRUMP), "20: トラッシュに行っていない")
    assert(takeLifeAndResolve(s, "p1") === null, "20: ライフで受けられる")
    settle(s)
}
{
    // 境目：相手のマジックの効果で破壊されたときは【合体時】の効果は発揮しない（効果文は「相手のスピリットの効果で破壊されたとき」）
    const s = game("trump-magic")
    const host = put(s, "p1", JUGON, 1) // 合体BP 3000+3000=6000 → フレイムガスト（BP6000以下）の対象
    combine(s, TRUMP, host)
    const brave = s.players.p1.field.combinedBraves[s.players.p1.field.combinedBraves.length - 1]!
    const attacker = put(s, "p2", VAN, 1)
    s.players.p2.hand = [FLAMEGUST]
    s.phase = "attack"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "20: 相手がアタックできる")
    flashCast(s, "p2", FLAMEGUST, [host.instanceId])
    assert(takeLifeAndResolve(s, "p1") === null, "20: ライフで受けられる")
    settle(s)
    assert(!onField(s, "p1", host) && s.players.p1.trashCards.includes(JUGON), "20: ホスト（ジュゴン）は破壊されてトラッシュに行くので【合体時】の効果は発揮しない")
    assert(onField(s, "p1", brave) && !s.players.p1.trashCards.includes(TRUMP), "20: トランプンはブレイヴの一般則でスピリット状態として場に残る")
    assert(!s.players.p1.field.combinedBraves.some((x) => x.instanceId === brave.instanceId), "20: トランプンは合体していない")
}
{
    // 合体していないホスト：相手のスピリットの効果で破壊されたらトラッシュに行く
    const s = game("trump-plain")
    const host = put(s, "p1", JUGON, 1)
    s.players.p1.deck[0] = CANDEL
    const attacker = put(s, "p2", GINGA, 1)
    s.phase = "attack"
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "21: 相手がアタックできる")
    settle(s)
    assert(!onField(s, "p1", host) && s.players.p1.trashCards.includes(JUGON), "21: トランプンを合体させていないので破壊されてトラッシュに行く")
    assert(takeLifeAndResolve(s, "p1") === null, "21: ライフで受けられる")
    settle(s)
}

console.log("=== 8. BS15-057 カメン・フクロウ【合体時】『破壊時』：バースト1つを破棄することで回復状態で場に残る ===")
{
    // 合体時：破壊時に自分のバーストを破棄して回復状態で残る
    const s = game("owl-burst", true)
    placeBurst(s, "p1", POWER)
    const host = put(s, "p1", JUGON, 1) // 合体BP 3000+3000=6000
    combine(s, OWL, host)
    const blocker = put(s, "p2", JUGON, 4) // BP8000
    attackAndBlock(s, host, blocker)
    assert(onField(s, "p1", host) && host.isRested === false, "22: バーストを破棄して回復状態で自分のフィールドに残る")
    assert(s.players.p1.burst === null && s.players.p1.trashCards.includes(POWER), "22: 自分のバースト1つが破棄される")
    assert(onField(s, "p2", blocker), "22: ブロッカーは場に残る")
}
{
    // バーストが無ければ破壊される
    const s = game("owl-noburst")
    const host = put(s, "p1", JUGON, 1)
    combine(s, OWL, host)
    const blocker = put(s, "p2", JUGON, 4)
    attackAndBlock(s, host, blocker)
    assert(!onField(s, "p1", host) && s.players.p1.trashCards.includes(JUGON), "23: 破棄するバーストが無いので通常どおり破壊される")
}

console.log("=== 9. BS15-058 ダブル・キャメル【合体時】【重装甲：緑/黄】：緑/黄の効果を受けず、指定外の白は受ける ===")
{
    // 相手の緑のマジック（疲労）を受けない
    const s = game("camel-green", true)
    const host = put(s, "p1", JUGON, 1)
    combine(s, CAMEL, host)
    const attacker = put(s, "p1", VAN, 1)
    s.players.p2.hand = [BINDING]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "24: アタックできる")
    flashCast(s, "p2", BINDING, [host.instanceId])
    assert(takeLifeAndResolve(s, "p2") === null, "24: ライフで受けられる")
    settle(s)
    assert(host.isRested === false, "24: 相手の緑のマジックでも疲労しない")
}
{
    // 指定外の白のマジック（手札に戻す）は受ける
    const s = game("camel-white", true)
    const host = put(s, "p1", JUGON, 1)
    combine(s, CAMEL, host)
    const attacker = put(s, "p1", VAN, 1)
    s.players.p2.hand = [DREAM]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "25: アタックできる")
    flashCast(s, "p2", DREAM, [host.instanceId])
    assert(takeLifeAndResolve(s, "p2") === null, "25: ライフで受けられる")
    settle(s)
    assert(!onField(s, "p1", host), "25: 指定外の白のマジックで合体スピリットは場から離れる")
    // 合体スピリットが手札に戻るとき、スピリットカードは手札に戻り、ブレイヴはスピリット状態でフィールドに残る
    assert(s.players.p1.hand.includes(JUGON), "25: ホスト（海獣ジューゴン）は手札に戻る")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === CAMEL) && s.players.p1.field.combinedBraves.length === 0, "25: ブレイヴ（ダブル・キャメル）はスピリット状態でフィールドに残る")
}
{
    // スピリット状態（合体していない）：緑のマジックで疲労する
    const s = game("camel-spirit", true)
    const brave = braveSpirit(s, "p1", CAMEL)
    const attacker = put(s, "p1", VAN, 1)
    s.players.p2.hand = [BINDING]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "26: アタックできる")
    flashCast(s, "p2", BINDING, [brave.instanceId])
    assert(takeLifeAndResolve(s, "p2") === null, "26: ライフで受けられる")
    settle(s)
    assert(brave.isRested === true, "26: 合体していないので緑のマジックで疲労する")
}

console.log("=== 10. BS16-057 コテツ・ティーガー：フラッシュ【神速】でフラッシュタイミングに召喚できる／【合体時】バトル時：破壊したとき相手のライフのコア1個をリザーブへ ===")
{
    // 【神速】：フラッシュタイミングで手札から召喚できる
    const s = game("kotetsu-shinsoku")
    const attacker = put(s, "p1", VAN, 1)
    s.players.p1.hand = [KOTETSU]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "27: アタックできる")
    assert(flashAct(s, "p1", { type: "summon", handIndex: 0 }) === null, "27: フラッシュタイミングに【神速】で召喚できる")
    answerPayConfirm(s, "p1")
    settle(s)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === KOTETSU), "27: コテツ・ティーガーが場に出る")
    assert(!s.players.p1.hand.includes(KOTETSU), "27: 手札からは無くなる")
    assert(takeLifeAndResolve(s, "p2") === null, "27: ライフで受けられる")
    settle(s)
}
{
    // 【神速】を持たないブレイヴ（バタホルン）はフラッシュタイミングに召喚できない
    const s = game("kotetsu-noshinsoku")
    const attacker = put(s, "p1", VAN, 1)
    s.players.p1.hand = [BATA]
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "28: アタックできる")
    assert(flashAct(s, "p1", { type: "summon", handIndex: 0 }) !== null, "28: 【神速】がないのでフラッシュタイミングに召喚できない")
    assert(s.players.p1.hand.includes(BATA), "28: 手札に残ったまま")
    assert(takeLifeAndResolve(s, "p2") === null, "28: ライフで受けられる")
    settle(s)
}
{
    // 【合体時】バトル時：BP比べで破壊したとき相手のライフのコア1個をリザーブに置く
    const s = game("kotetsu-combined")
    const host = put(s, "p1", HYDRA, 1)
    combine(s, KOTETSU, host)
    const blocker = put(s, "p2", VAN, 1)
    attackAndBlock(s, host, blocker)
    assert(!onField(s, "p2", blocker), "29: ブロッカー（BP1000）は破壊される")
    // 破壊されたブロッカーのコア1個＋ライフから移ったコア1個で、リザーブは 20+1+1
    assert(s.players.p2.life === 4 && s.players.p2.reserve === 22, "29: 破壊したとき相手のライフのコア1個がリザーブに置かれる")
}
{
    // 合体していないホストのバトルではライフのコアは動かない
    const s = game("kotetsu-plain")
    const host = put(s, "p1", HYDRA, 1)
    const blocker = put(s, "p2", VAN, 1)
    attackAndBlock(s, host, blocker)
    assert(!onField(s, "p2", blocker), "30: ブロッカーは破壊される")
    assert(s.players.p2.life === 5 && s.players.p2.reserve === 21, "30: 合体していないのでライフのコアは動かない")
}

console.log("すべてのチェックに合格しました 🎉（part778）")
