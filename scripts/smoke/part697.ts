// smoke パート697（ライフ・フィールド・リザーブにコアを置けない制限と「〜することで」のコスト。公式 Q3721・Q22432・Q22409・Q20150・Q24967）
// 規則1：「〜することで」のコストは、その後の効果を完全に行えるときだけ払える（行えないなら払わず、効果も起きない）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, answerPayConfirm } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const OFIEL = "BS16-045" // オリンピアの天使長オフィエル（黄スピリット。召喚時：バーストを破棄することでライフが5になるようボイドからコアを置く）
const STERN = "BS11-072" // 未完成の古代戦艦：船尾（お互い、ボイドからライフにコアを置けない）
const TOWER = "BS18-063" // 魂の海塔（お互い、スピリット/ブレイヴの効果でボイドからコアを増やすことができない）
const CUP = "BS17-063" // 黒き聖杯（相手の効果では相手はボイド/トラッシュからコアをターンに1個までしか置けない）
const SEIRYU = "BS16-X03" // 烈の覇王セイリュービ（フラッシュ【烈神速】）
const MONGOKU = "BS10-056" // 蒼天大聖モンゴクウ（お互い、コアステップ以外でボイドからフィールド/リザーブにコアを置けない）
const LOVEN = "BS15-030" // 愛の女神ロヴン（Lv2 相手に破壊されたとき、リザーブにコアを置く。その後、手札に戻る）
const SHIYU = "BS13-058" // シユウ（ブレイヴ。合体時アタック時：デッキ5枚破棄することで、ライフにコアを置く）
const MUGEN = "BS14-107" // 夢幻祈祷（黄マジック。バースト：ライフにコアを置く。その後コストを支払うことで、フラッシュ効果を発揮）
const COFFIN = "BS01-131" // ダークコフィン（紫メイン：疲労状態のスピリット1体を破壊）
const FLAME = "BS01-121" // フレイムダンス（赤フラッシュ：BP4000以下のスピリット1体を破壊）
const VAN = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[OFIEL, "オリンピアの天使長オフィエル"], [STERN, "未完成の古代戦艦：船尾"], [TOWER, "魂の海塔"],
        [CUP, "黒き聖杯"], [SEIRYU, "烈の覇王セイリュービ"], [MONGOKU, "蒼天大聖モンゴクウ"], [LOVEN, "愛の女神ロヴン"],
        [SHIYU, "シユウ"], [MUGEN, "夢幻祈祷"], [COFFIN, "ダークコフィン"], [FLAME, "フレイムダンス"], [VAN, "ロクケラトプス"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
}

function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 3
        p.burst = null
        p.hand = [...(pid === "p1" ? p1Hand : p2Hand)]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, kind: "spirits" | "nexuses" = "spirits") {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field[kind].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 選択待ちが残っていれば「発動する」か先頭の選択肢で閉じる
function settle(s: GameState, pid: PlayerId): void {
    for (let i = 0; i < 8 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as any
        const opts: string[] = pc.options ?? []
        const err = act(s, pc.pid ?? pid, opts.length ? { type: "resolveChoice", option: opts.includes("発動する") ? "発動する" : opts[0] } : { type: "pass" } as any)
        if (err) break
    }
}

console.log("=== A. 規則2（Q3721）: 船尾があるとき、オフィエルはバーストを破棄できない ===")
for (const stern of [true, false]) {
    const s = game(`a-${stern}`, "p1", [OFIEL])
    s.players.p1.burst = MUGEN
    if (stern) put(s, "p2", STERN, 0, "nexuses")
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `A: オフィエルを召喚できる（${err}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    assert(s.players.p1.burst === (stern ? MUGEN : null), stern ? "A: ライフに置けないのでバーストは破棄されない" : "A対照: バーストを破棄する")
    assert(s.players.p1.life === (stern ? 3 : 5), `A: ライフ（${s.players.p1.life}）`)
}

console.log("=== B. 規則3（Q22432）: 魂の海塔はボイドからライフに置くことも止める。バーストも破棄できない ===")
for (const tower of [true, false]) {
    const s = game(`b-${tower}`, "p1", [OFIEL])
    s.players.p1.burst = MUGEN
    if (tower) put(s, "p2", TOWER, 0, "nexuses")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "B: 召喚")
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    assert(s.players.p1.burst === (tower ? MUGEN : null), tower ? "B: バーストは破棄されない" : "B対照: バーストを破棄する")
    assert(s.players.p1.life === (tower ? 3 : 5), `B: ライフ（${s.players.p1.life}）`)
}

console.log("=== C. 規則4（Q22409）: 黒き聖杯があるとき、セイリュービの【烈神速】は使えない ===")
for (const cup of [true, false]) {
    const s = game(`c-${cup}`, "p1", [SEIRYU])
    s.players.p1.trashCores = 5
    if (cup) put(s, "p2", CUP, 0, "nexuses")
    s.phase = "attack"
    const atk = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "C: アタックできる")
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const err = act(s, "p1", { type: "resshinsokuSummon", handIndex: 0 })
    if (cup) {
        assert(err !== null, "C: 聖杯があるので【烈神速】は拒否される")
        assert(s.players.p1.hand.includes(SEIRYU), "C: セイリュービは手札に残る")
        assert(s.players.p1.trashCores === 5, "C: トラッシュのコアは動かない")
    } else {
        assert(err === null, `C対照: 聖杯が無ければ【烈神速】を使える（${err}）`)
    }
}

console.log("=== D. 規則5: モンゴクウはロヴンのリザーブにコアを置く部分を止める ===")
// 「その後、手札に戻る」は CONJUNCTION.md の「その後」＝前後関係で、前半が不完全でも後半は行う、と読んだ
for (const mongo of [true, false]) {
    const s = game(`d-${mongo}`, "p2", [], [COFFIN])
    if (mongo) put(s, "p2", MONGOKU, 3)
    const lv = put(s, "p1", LOVEN, 2)
    lv.isRested = true
    s.players.p1.reserve = 5
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: lv.instanceId }) === null, "D: コフィンで破壊")
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    // 破壊されたロヴンのコア2個はリザーブへ戻るので、5+2=7 が基準。ボイドからの1個が置かれれば8
    assert(s.players.p1.reserve === (mongo ? 7 : 8), `D: リザーブ（${s.players.p1.reserve}）`)
    assert(s.players.p1.hand.includes(LOVEN), "D: ロヴンは手札に戻る")
}

console.log("=== E. 規則6（Q20150）: 船尾があるとき、シユウの合体時はデッキの破棄もライフに置くこともできない ===")
for (const stern of [true, false]) {
    const s = game(`e-${stern}`, "p1", [SHIYU])
    if (stern) put(s, "p2", STERN, 0, "nexuses")
    const host = put(s, "p1", OFIEL, 3)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "E: シユウを召喚")
    settle(s, "p1")
    const brave = s.players.p1.field.spirits.find(x => x.cardId === SHIYU)
    assert(!!brave, "E: シユウが場にいる")
    if (!brave) continue
    s.players.p1.life = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VAN)
    const ce = act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId })
    assert(ce === null, `E: 合体できる（${ce}）`)
    s.phase = "attack"
    host.isRested = false
    const ae = act(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(ae === null, `E: アタックできる（${ae}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    assert(s.players.p1.deck.length === (stern ? 40 : 35), `E: デッキの枚数（${s.players.p1.deck.length}）`)
    assert(s.players.p1.life === (stern ? 3 : 4), `E: ライフ（${s.players.p1.life}）`)
}

console.log("=== F. 規則7（Q24967）: 船尾があっても夢幻祈祷のフラッシュ効果は発揮できる ===")
for (const stern of [true, false]) {
    const s = game(`f-${stern}`, "p2", [], [FLAME])
    s.players.p1.burst = MUGEN
    if (stern) put(s, "p2", STERN, 0, "nexuses")
    const mine = put(s, "p1", VAN, 1)
    s.phase = "attack"
    const atk = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "F: p2 がアタック")
    atk.isRested = false // フラッシュ効果の対象「アタックしている回復状態の相手のスピリット」を用意する
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    const e = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mine.instanceId })
    assert(e === null, `F: フレイムダンスで破壊（${e}）`)
    settle(s, "p1")
    assert(!s.players.p2.field.spirits.some(x => x.instanceId === atk.instanceId) || false, "F: アタック中のスピリットが夢幻祈祷のフラッシュ効果で破壊される")
    assert(s.players.p1.life === (stern ? 3 : 4), `F: ライフ（${s.players.p1.life}）`)
}

console.log("すべてのチェックに合格しました 🎉（part697）")
