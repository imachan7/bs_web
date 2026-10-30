// smoke パート689（コアを取り除けない制限の一般則。2026-10-30 ユーザー確認の6規則）
// 取り除けない＝効果・コスト・プレイヤーのコア移動のすべてで効く／対象に取ることは防がない／転召の対象にはできる
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const GA = "BS10-X01" // 幻羅星龍ガイ・アスラ（赤）
const SEFIRO = "BS13-X03" // 白羊樹神セフィロ・アリエス（緑）
const VAN = "BS01-002" // ロクケラトプス（Lv1=1コア）
const ELIM = "BS09-070" // エリミネイション（紫マジック・フラッシュ）
const DANCE = "BS04-094" // ダンスマカブル（紫マジック・フラッシュ）
const METEOR = "BS16-073" // アグレッシブレイジ（赤マジック・コスト3・フラッシュ。軽減はスピリット1体につき1）
const THORN = "BS05-060" // 茨の決戦地
const PILLAR = "BS08-059" // 聖なる柱状彫刻
const OCTANT = "BS13-065" // 八分儀の祠
const MAGE = "BS04-078" // 魔影街
const HAMP = "BS02-015" // ハンプダンプ（Lv2【呪撃】）
const ARCHER = "BS16-006" // アーチャー・ドラゴン
const KUTHULUM = "BS08-054" // 異神獣クトゥルム（【転召：コスト3以上/トラッシュ】）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[GA, "幻羅星龍ガイ・アスラ"], [SEFIRO, "白羊樹神セフィロ・アリエス"], [VAN, "ロクケラトプス"], [ELIM, "エリミネイション"],
        [DANCE, "ダンスマカブル"], [METEOR, "アグレッシブレイジ"], [THORN, "茨の決戦地"], [PILLAR, "聖なる柱状彫刻"], [OCTANT, "八分儀の祠"],
        [MAGE, "魔影街"], [HAMP, "ハンプダンプ"], [ARCHER, "アーチャー・ドラゴン"], [KUTHULUM, "異神獣クトゥルム"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
}

// 開始盤面: p1 がメインステップのターンプレイヤー。盤面は空にして自分で置く
function game(seed: string, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 10
        p.trashCores = 0
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

function flash(s: GameState, pid: PlayerId): void {
    s.isFlashTiming = true
    s.priorityPlayer = pid
}

console.log("=== A. 規則3: ガイ・アスラの持ち主の効果でも、自分のガイ・アスラのコアは払えない ===")
{
    // エリミネイション「自分のスピリット上のコア1個をトラッシュに置くことで、相手は…」。払えないので相手側は動かない
    const s = game("a-ga", [ELIM])
    const ga = put(s, "p1", GA, 3)
    const foe = put(s, "p2", VAN, 3)
    flash(s, "p1")
    act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    assert(ga.cores === 3, "A: ガイ・アスラのコアは持ち主の効果でも動かない")
    assert(foe.cores === 3, "A: 払えないので相手のスピリットのコアも動かない")
}
{
    const s = game("a-ctrl", [ELIM])
    const mine = put(s, "p1", VAN, 3)
    const foe = put(s, "p2", VAN, 3)
    flash(s, "p1")
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    assert(err === null, "A対照: 通常のスピリットなら使える")
    assert(mine.cores === 2 && foe.cores === 2, "A対照: 自分のコア1個を払い、相手のコア1個が動く")
}

{
    const s = game("a-move")
    const ga = put(s, "p1", GA, 3)
    const van = put(s, "p1", VAN, 3)
    assert(act(s, "p1", { type: "moveCore", instanceId: ga.instanceId, direction: "remove" }) !== null, "A: プレイヤーのコア移動でもガイ・アスラのコアは動かせない")
    assert(ga.cores === 3, "A: コアは動かない")
    assert(act(s, "p1", { type: "moveCore", instanceId: van.instanceId, direction: "remove" }) === null, "A対照: 通常のスピリットのコアは動かせる")
}

console.log("=== B. 規則2: 取り除けないスピリットも効果の対象には取れる（コアは動かない） ===")
{
    const s = game("b-ga", [DANCE, VAN])
    const ga = put(s, "p1", VAN, 1)
    const foe = put(s, "p2", GA, 3)
    flash(s, "p1")
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: foe.instanceId })
    assert(err === null, "B: 相手のフィールドがガイ・アスラだけでもマジックを使える")
    assert(foe.cores === 3, "B: ガイ・アスラのコアは減らない")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId), "B: ガイ・アスラは場に残る")
    void ga
}
{
    const s = game("b-ctrl", [DANCE, VAN])
    put(s, "p1", VAN, 1)
    const foe = put(s, "p2", VAN, 3)
    flash(s, "p1")
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: foe.instanceId })
    assert(err === null, "B対照: 通常のスピリットが相手のときも使える")
    assert(foe.cores < 3 || s.players.p1.hand.length === 1, "B対照: 手札を破棄した分だけ相手のコアが動く")
}

console.log("=== C. BS05-060 茨の決戦地: バトル中のスピリットのコアは支払い元にできない ===")
{
    const make = () => {
        const s = game("c", [METEOR])
        s.phase = "attack"
        put(s, "p1", THORN, 1, "nexuses") // Lv2
        const atk = put(s, "p1", VAN, 3)
        const idle = put(s, "p1", VAN, 3)
        const blk = put(s, "p2", VAN, 3)
        s.battle = { attackerInstanceId: atk.instanceId, blockerInstanceId: blk.instanceId, directed: false }
        flash(s, "p1")
        return { s, atk, idle }
    }
    const a = make()
    const rej = act(a.s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", paySources: [{ instanceId: a.atk.instanceId, count: 1 }] })
    assert(rej !== null, "C: バトル中のスピリットのコアを支払い元にすると拒否される")
    assert(a.atk.cores === 3, "C: 拒否されたのでコアは動かない")
    const b = make()
    const ok = act(b.s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", paySources: [{ instanceId: b.idle.instanceId, count: 1 }] })
    assert(ok === null, "C対照: バトルしていないスピリットからは払える")
    assert(b.idle.cores === 2, "C対照: 払った分だけ減る")
}

console.log("=== D. BS08-059 聖なる柱状彫刻: スピリットのコアは Lv1 コストより少なくならない ===")
{
    const make = (cores: number) => {
        const s = game("d", [METEOR])
        s.phase = "attack"
        put(s, "p1", PILLAR, 2, "nexuses")
        const sp = put(s, "p1", VAN, cores)
        const foe = put(s, "p2", VAN, 1)
        s.battle = { attackerInstanceId: sp.instanceId, blockerInstanceId: foe.instanceId, directed: false }
        flash(s, "p1")
        return { s, sp }
    }
    const lo = make(2) // Lv1コスト1。2個から2個払うと0になる
    assert(act(lo.s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", paySources: [{ instanceId: lo.sp.instanceId, count: 2 }] }) !== null,
        "D: Lv1コスト未満になる支払いは拒否される")
    assert(lo.sp.cores === 2, "D: 拒否されたのでコアは動かない")
    const hi = make(3) // 3個から2個払えば1個残る
    assert(act(hi.s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", paySources: [{ instanceId: hi.sp.instanceId, count: 2 }] }) === null,
        "D対照: Lv1コストを超える分なら払える")
    assert(hi.sp.cores === 1, "D対照: 1個残る")
}

console.log("=== E. 規則4: セフィロ・アリエス Lv3 でも効果のコア除去は止まるが【転召】の対象にはできる ===")
{
    const s = game("e-effect", [ELIM])
    const sef = put(s, "p1", SEFIRO, 4) // Lv3
    const foe = put(s, "p2", VAN, 3)
    flash(s, "p1")
    act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    assert(sef.cores === 4 && foe.cores === 3, "E: 効果のコア除去は止まる")
}
for (const target of ["sef", "other"] as const) {
    const s = game(`e-tensho-${target}`, [KUTHULUM])
    s.interactiveTargets = true
    const sef = put(s, "p1", SEFIRO, 4)
    const big = put(s, "p1", ARCHER, 3) // コスト5・【転召：コスト3以上】の対象
    const chosen = target === "sef" ? sef : big
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `E: 召喚できる（${err}）`)
    assert(s.pendingChoice !== null, "E: 【転召】の対象選択で止まる")
    const err2 = act(s, "p1", { type: "resolveChoice", instanceId: chosen.instanceId })
    assert(err2 === null, `E: 【転召】の対象に${target === "sef" ? "セフィロ・アリエス" : "別のスピリット"}を選べる（${err2}）`)
    assert(chosen.cores === 0, "E: 選んだスピリットのコアは全部【転召】で動く")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === KUTHULUM), "E: 異神獣クトゥルムが場に出る")
}

{
    // 対照: セフィロがいなければ【転召】できる（道具の使い方の確認）
    const s = game("e-tensho-ctrl", [KUTHULUM])
    s.interactiveTargets = true
    const big = put(s, "p1", ARCHER, 3)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "E対照: 召喚できる")
    assert(s.pendingChoice === null, "E対照: 対象が1体だけなら自動で選ばれる")
    assert(big.cores === 0, "E対照: 対象のコアが全部動く")
}

console.log("=== F. BS13-065 八分儀の祠 Lv2（働く＝相手のメインステップ。文面は『相手のスピリットのコアは相手の効果以外では取り除けない』） ===")
// 注意: 依頼文は「持ち主自身の支払いには使える」だが、文面と規則1からは「相手の効果以外」＝召喚コストの支払いも止まる
{
    const make = () => {
        const s = game("f", [], [ARCHER])
        s.turnPlayer = "p2"
        s.priorityPlayer = "p2"
        put(s, "p1", OCTANT, 3, "nexuses")
        const sp = put(s, "p2", VAN, 6)
        return { s, sp }
    }
    const a = make()
    assert(act(a.s, "p2", { type: "summon", handIndex: 0, paySources: [{ instanceId: a.sp.instanceId, count: 4 }] }) !== null,
        "F: 相手のメインステップ中、相手の召喚コストでスピリットのコアは動かせない")
    assert(a.sp.cores === 6, "F: コアは動かない")
    const b = make()
    b.s.players.p1.field.nexuses = [] // 対照: ネクサスが無ければ払える
    const err = act(b.s, "p2", { type: "summon", handIndex: 0, paySources: [{ instanceId: b.sp.instanceId, count: 4 }] })
    assert(err === null, `F対照: 祠が無ければ払える（${err}）`)
}

console.log("=== G. コストで自分のコアを払う起動能力は、取り除けない状態では発揮できない ===")
{
    const make = (withSefiro: boolean) => {
        const s = game("g")
        s.phase = "attack"
        const archer = put(s, "p1", ARCHER, 3) // Lv2: フラッシュ『このスピリットのコア2個をトラッシュに置くことで…』
        if (withSefiro) put(s, "p1", SEFIRO, 4) // Lv3: スピリットすべてのコアは【転召】以外で取り除けない
        const foe = put(s, "p2", "BS01-001", 1) // BP1000の的
        s.battle = { attackerInstanceId: archer.instanceId, blockerInstanceId: foe.instanceId, directed: false }
        flash(s, "p1")
        return { s, archer }
    }
    // effectId は <cardId>-e<番号> の命名に従った推測。対照が通らなければ ID の誤りなので実装役は直すこと
    const ctrl = make(false)
    const okErr = act(ctrl.s, "p1", { type: "activateAbility", instanceId: ctrl.archer.instanceId, effectId: `${ARCHER}-e2` })
    assert(okErr === null, `G対照: 取り除けなければ起動できる（${okErr}）`)
    assert(ctrl.archer.cores === 1, "G対照: コア2個が支払われる")
    const lim = make(true)
    assert(act(lim.s, "p1", { type: "activateAbility", instanceId: lim.archer.instanceId, effectId: `${ARCHER}-e2` }) !== null,
        "G: コアを払えないので発揮できない")
    assert(lim.archer.cores === 3, "G: コアは動かない")
}

console.log("=== H. 規則6: 魔影街のボイド置きは効果のコア除去として扱う ===")
{
    const run = (blockerId: string, blockerCores: number) => {
        const s = game("h")
        s.phase = "attack"
        put(s, "p1", MAGE, 3, "nexuses") // Lv2
        const atk = put(s, "p1", HAMP, 3) // Lv2【呪撃】
        const blk = put(s, "p2", blockerId, blockerCores)
        void blk
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "H: アタックできる")
        for (let i = 0; i < 5 && s.isFlashTiming; i++) act(s, s.priorityPlayer, { type: "pass" })
        assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "H: ブロックできる")
        for (let i = 0; i < 20 && s.battle; i++) if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
        return s
    }
    const base = 10
    const ga = run(GA, 3)
    assert(!ga.players.p2.field.spirits.some((x) => x.cardId === GA), "H: ガイ・アスラは【呪撃】で破壊される")
    assert(ga.players.p2.reserve === base + 3, `H: ガイ・アスラのコア3個は全部リザーブへ（ボイドに置かれない）: ${ga.players.p2.reserve}`)
    const van = run(ARCHER, 5) // Lv3 BP8000。ハンプダンプ(BP4000)に勝って生き残り、【呪撃】で破壊される
    assert(!van.players.p2.field.spirits.some((x) => x.cardId === ARCHER), "H対照: 通常のスピリットも破壊される")
    assert(van.players.p2.reserve === base + 4, `H対照: コア1個がボイドに置かれ、残り4個がリザーブへ: ${van.players.p2.reserve}`)
}

console.log("すべてのチェックに合格しました 🎉（part689）")
