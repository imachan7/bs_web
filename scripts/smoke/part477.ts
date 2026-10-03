// smoke パート477（BS12 未発火の効果節：効果文だけから書いた期待値。実装は見ていない）
// 自分=p1 の向きだけで走らせる（mirror なし）。盤面の変化の全行一致ではなく、効果文が決める事実だけを assert する
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    effectiveBp,
    getCard,
    endTurn,
    refreshLevelAsOverrides,
    runTurnStart,
    spiritHasFamily,
    takeLifeAndResolve,
} from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ）
const DEMON = "BS01-031" // デス・ハーデス（紫・コスト3・BP4000 Lv1）
const PIGEON = "BS06-013" // ピジョンヘディレス（紫・コスト0・無魔・バニラ）
const MIRAGE = "BS01-051" // フライングミラージュ（緑・殻虫・バニラ）
const BEAR = "BS10-033" // ノーザンベアード（白・コスト3・巨獣/星魂）
const PIYON = "BS04-048" // ダークピヨン（黄・歌鳥・バニラ）
const ZON = "BS04-006" // 骸竜ゾン・サウル（赤・コスト3・自分の紫スピリットBP+1000）
const GEPA = "BS10-064" // 骸戦車ゲパルバート（紫ブレイヴ・コスト3・シンボルなし・合体条件=効果の記述を持たない）
const FENRIR = "BS10-071" // フェンリルキャノンType-B（白ブレイヴ・コスト4・合体条件=コスト4以上）
const ENEMY2 = "BS04-010" // 雷帝エール・クレル（赤・コスト6・シンボル2つ）
const NAUMAN = "BS15-X04" // 機獣要塞ナウマンガルド（白・Lv2 BP12000）
const GREEN_REST = "BS01-134" // バインディングソーン（緑マジック・フラッシュ：相手のスピリット1体を疲労）
const GREEN_DRAW = "BS01-132" // ストームドロー（緑マジック・メイン：3枚ドロー→2枚破棄）
const BLUE_DRAW = "SD02-017" // ストロングドロー（青マジック・同上）
const WILD = "BS01-133" // ワイルドパワー（緑マジック・フラッシュ：BP+2000）

const UNI = "BS12-005"
const ARUDI = "BS12-006"
const MARS = "BS12-007"
const VERIAM = "BS12-014"
const HADES = "BS12-015"
const NOBU = "BS12-024"
const MASA = "BS12-X03"
const FORSETI = "BS12-030"
const GA = "BS12-016"
const SNOTRA = "BS12-029"
const PENTAN = "BS12-034"
const NATA = "BS12-046"
const SHOGO = "BS12-059"
const HARP = "BS12-081"
const HYDRA = "BS12-057"
const N061 = "BS12-061"
const N064 = "BS12-064"
const N066 = "BS12-066"
const N062 = "BS12-062"

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string) => assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    chk(VAN, "ロクケラトプス", "spirit")
    chk(DEMON, "デス・ハーデス", "spirit")
    chk(PIGEON, "ピジョンヘディレス", "spirit")
    chk(MIRAGE, "フライングミラージュ", "spirit")
    chk(BEAR, "ノーザンベアード", "spirit")
    chk(PIYON, "ダークピヨン", "spirit")
    chk(ZON, "骸竜ゾン・サウル", "spirit")
    chk(GEPA, "骸戦車ゲパルバート", "brave")
    chk(FENRIR, "フェンリルキャノンType-B", "brave")
    chk(ENEMY2, "雷帝エール・クレル", "spirit")
    chk(NAUMAN, "機獣要塞ナウマンガルド", "spirit")
    chk(GREEN_REST, "バインディングソーン", "magic")
    chk(GREEN_DRAW, "ストームドロー", "magic")
    chk(BLUE_DRAW, "ストロングドロー", "magic")
    chk(WILD, "ワイルドパワー", "magic")
    chk(UNI, "星角獣ユニゴーント", "spirit")
    chk(ARUDI, "竜拳士アルディ・バロン", "spirit")
    chk(MARS, "炎星神龍マルス・ドラグーン", "spirit")
    chk(VERIAM, "骸騎士ヴェリアム", "spirit")
    chk(HADES, "冥王神龍クロノ・ハデス", "spirit")
    chk(NOBU, "木星魔龍ノブナガード・ゼクスト", "spirit")
    chk(MASA, "独眼武神マンティクス・マサムネ", "spirit")
    chk(FORSETI, "機人フォルセティ", "spirit")
    chk(GA, "骸巨人ギ・ガッシャ", "spirit")
    chk(SNOTRA, "氷の淑女スノトラ", "spirit")
    chk(PENTAN, "天文学者ペンタン", "spirit")
    chk(NATA, "ナタ・ゴレム", "spirit")
    chk(SHOGO, "ショゴルス", "brave")
    chk(HARP, "メロディアスハープ", "magic")
    chk(HYDRA, "ハイドランディア", "brave")
    chk(N061, "剣の誕生地", "nexus")
    chk(N064, "偶像の館", "nexus")
    chk(N066, "巨木の門", "nexus")
    chk(N062, "白煙の大山脈", "nexus")
    assert(getCard(PIGEON).family.includes("無魔") && getCard(BEAR).family.includes("星魂") && getCard(PIYON).family.includes("歌鳥"), "脇役の系統")
    assert(getCard(MIRAGE).family.includes("殻虫") && getCard(ZON).family.includes("無魔") === true, "脇役の系統2")
}

// ---------- 最小のハーネス（自分=p1／相手=p2。開始盤面だけ直接組み、あとは act で進める） ----------
interface Opts {
    turn?: PlayerId
    phase?: "main" | "attack"
    interactive?: boolean
}
function game(seed: string, o: Opts = {}): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = o.turn ?? "p1"
    s.priorityPlayer = s.turnPlayer
    s.phase = o.phase ?? "main"
    s.interactiveTargets = o.interactive ?? false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 10
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
    }
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false): CardInstance {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    if (getCard(cardId).type === "nexus") s.players[pid].field.nexuses.push(inst)
    else s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const lvOf = (i: CardInstance) => currentLevel(i).level
const onField = (s: GameState, pid: PlayerId, inst: CardInstance) =>
    [...s.players[pid].field.spirits, ...s.players[pid].field.nexuses, ...s.players[pid].field.combinedBraves].some((x) => x.instanceId === inst.instanceId)
const countName = (list: string[], cardId: string) => list.filter((c) => c === cardId).length
const must = (s: GameState, pid: PlayerId, a: GameAction, label: string) => {
    const err = act(s, pid, a)
    assert(err === null, `${label}${err === null ? "" : `（拒否: ${err}）`}`)
}

// 選択待ちを答えていく。確認（「発動する」を含む option）は d.confirm に従って押し、押した回数を数える
interface Drv {
    confirm: boolean
    confirms: number
    asked: string[]
    pick?: ((s: GameState) => string | undefined) | undefined
}
const drv = (confirm = true, pick?: Drv["pick"]): Drv => ({ confirm, confirms: 0, asked: [], pick })
function settle(s: GameState, d: Drv): void {
    for (let guard = 0; s.pendingChoice && guard < 25; guard++) {
        const pc = s.pendingChoice
        d.asked.push(`${pc.pid}:${pc.kind}:${pc.prompt}:${JSON.stringify(pc.options ?? [])}`)
        if (pc.kind === "option") {
            const opts = pc.options ?? []
            const isConfirm = opts.includes("発動する") || pc.confirm === true || pc.magicNegate !== undefined
            if (isConfirm) {
                d.confirms++
                if (d.confirm) must(s, pc.pid, { type: "resolveChoice", option: opts[0]! }, `確認に ${opts[0]}`)
                else must(s, pc.pid, { type: "resolveChoice" }, "確認を断る（スキップ）")
            } else must(s, pc.pid, { type: "resolveChoice", option: d.confirm ? opts[0]! : opts[opts.length - 1]! }, "option選択（断る側は最後の選択肢）")
        } else if (pc.kind === "card") {
            const idx = pc.cardIndices?.[0] ?? 0
            const err = act(s, pc.pid, { type: "resolveChoice", cardIndex: idx })
            if (err) {
                console.log(`  （カード選択に答えられない ${err}）`)
                return
            }
        } else {
            const id = d.pick?.(s) ?? pc.candidates?.[0]
            if (id === undefined) {
                console.log(`  （未対応の選択待ち kind=${pc.kind} prompt=${pc.prompt} keys=${Object.keys(pc).join(",")}）`)
                return
            }
            const err = act(s, pc.pid, { type: "resolveChoice", instanceId: id })
            if (err) {
                console.log(`  （選択に答えられない kind=${pc.kind} ${err}）`)
                return
            }
        }
    }
}
function closeFlash(s: GameState): void {
    for (let g = 0; s.isFlashTiming && s.battle && g < 10; g++) {
        const err = act(s, s.priorityPlayer, { type: "pass" })
        if (err) break
    }
}
// アタック宣言→（ブロック or ライフ受け）→バトル終了まで。blocker 省略＝ライフで受ける
function attackFlow(s: GameState, atk: PlayerId, attackerId: string, d: Drv, blockerId?: string): void {
    const def: PlayerId = atk === "p1" ? "p2" : "p1"
    must(s, atk, { type: "attack", instanceId: attackerId }, "アタック宣言")
    settle(s, d)
    closeFlash(s)
    settle(s, d)
    if (s.battle && !s.pendingChoice) {
        const err = blockerId ? declareBlock(s, def, blockerId) : takeLifeAndResolve(s, def)
        assert(err === null, `${blockerId ? "ブロック" : "ライフ受け"}の宣言${err === null ? "" : `（拒否: ${err}）`}`)
        settle(s, d)
        closeFlash(s)
        settle(s, d)
    }
}
function combine(s: GameState, pid: PlayerId, brave: CardInstance, host: CardInstance): void {
    const i = s.players[pid].field.spirits.indexOf(brave)
    assert(i >= 0, "合体させるブレイヴは場のスピリット状態にいる")
    must(s, pid, { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }, `${getCard(brave.cardId).name}を${getCard(host.cardId).name}に合体`)
}
function putBrave(s: GameState, pid: PlayerId, cardId: string, cores = 1): CardInstance {
    return put(s, pid, cardId, cores)
}
const toAttack = (s: GameState, pid: PlayerId) => must(s, pid, { type: "nextPhase" }, "アタックステップへ")

// ============ BS12-005 星角獣ユニゴーント ============
console.log("=== 1. ユニゴーント e1：相手に破壊されたら、手札のブレイヴをコストなしでスピリット状態で召喚できる ===")
{
    // 相手(p2)のデス・ハーデスのアタックを、ロクケラトプスでブロックして破壊される
    const mk = (hand: string[], uniCores: number, interactive: boolean) => {
        const s = game("uni1", { turn: "p2", phase: "attack", interactive })
        const uni = put(s, "p1", UNI, uniCores)
        const vic = put(s, "p1", VAN, 1)
        const atk = put(s, "p2", DEMON, 1)
        s.players.p1.hand = hand
        return { s, uni, vic, atk }
    }
    {
        const { s, vic, atk } = mk([SHOGO], 1, true)
        const d = drv(true)
        attackFlow(s, "p2", atk.instanceId, d, vic.instanceId)
        assert(!onField(s, "p1", vic), "1-1 ブロックしたロクケラトプスは破壊された")
        assert(d.confirms === 1, `1-1 確認は1回（実際 ${d.confirms}）`)
        assert(s.players.p1.hand.length === 0, "1-1 ブレイヴが手札から出た")
        const br = s.players.p1.field.spirits.find((x) => x.cardId === SHOGO)
        assert(br !== undefined, "1-1 ショゴルスがスピリット状態でフィールドにいる")
        assert(s.players.p1.deck.length === 40, "1-1 Lv1ではドローしない（デッキ40枚のまま）")
    }
    {
        const { s, vic, atk } = mk([SHOGO], 1, true)
        const d = drv(false)
        attackFlow(s, "p2", atk.instanceId, d, vic.instanceId)
        assert(d.confirms === 1, `1-2 確認は1回（実際 ${d.confirms}）`)
        assert(s.players.p1.hand.length === 1 && !s.players.p1.field.spirits.some((x) => x.cardId === SHOGO), "1-2 断ったので手札のまま")
    }
    {
        const { s, vic, atk } = mk([VAN], 1, true)
        const d = drv(true)
        attackFlow(s, "p2", atk.instanceId, d, vic.instanceId)
        assert(d.confirms === 0, `1-3 手札にブレイヴが無いなら確認を出さない（実際 ${d.confirms}）`)
        assert(s.players.p1.hand.length === 1, "1-3 手札は変わらない")
    }
    {
        // 自分が破壊したのは相手のスピリット：誘発しない
        const s = game("uni1-opp", { turn: "p1", phase: "attack", interactive: true })
        put(s, "p1", UNI, 1)
        const mine = put(s, "p1", DEMON, 1)
        const theirs = put(s, "p2", VAN, 1)
        s.players.p1.hand = [SHOGO]
        const d = drv(true)
        attackFlow(s, "p1", mine.instanceId, d, theirs.instanceId)
        assert(!onField(s, "p2", theirs), "1-4 相手のブロッカーが破壊された")
        assert(d.confirms === 0 && s.players.p1.hand.length === 1, `1-4 相手のスピリットの破壊では出ない（確認 ${d.confirms} 回）`)
    }
}
console.log("=== 2. ユニゴーント e2（Lv2･3）：この効果でブレイヴが召喚されたら1枚ドロー ===")
{
    const run = (uniCores: number) => {
        const s = game("uni2", { turn: "p2", phase: "attack", interactive: true })
        put(s, "p1", UNI, uniCores)
        const vic = put(s, "p1", VAN, 1)
        const atk = put(s, "p2", DEMON, 1)
        s.players.p1.hand = [SHOGO]
        const d = drv(true)
        attackFlow(s, "p2", atk.instanceId, d, vic.instanceId)
        return { s, d }
    }
    const lv2 = run(3)
    assert(lv2.s.players.p1.field.spirits.some((x) => x.cardId === SHOGO), "2-1 Lv2：ブレイヴが召喚された")
    assert(lv2.s.players.p1.deck.length === 39 && countName(lv2.s.players.p1.hand, VAN) === 1, `2-1 Lv2：1枚ドローした（デッキ ${lv2.s.players.p1.deck.length}）`)
    const lv1 = run(1)
    assert(lv1.s.players.p1.deck.length === 40, "2-2 Lv1：ドローしない")
}

// ============ BS12-006 竜拳士アルディ・バロン ============
console.log("=== 3. アルディ e2：自分のアタックステップ、シンボルを持たない自分のスピリット状態のブレイヴに赤シンボル1つ追加 ===")
{
    // シンボルを持たないスピリットがアタックしてライフを受けても減らない前提は置かず、ライフの減りの差で見る
    const run = (withArudi: boolean, atkId: string) => {
        const s = game("aru-sym", { turn: "p1", phase: "main" })
        if (withArudi) put(s, "p1", ARUDI, 1)
        const brave = putBrave(s, "p1", GEPA, 1)
        toAttack(s, "p1")
        void atkId
        const d = drv()
        attackFlow(s, "p1", brave.instanceId, d)
        return s.players.p2.life
    }
    const lifeWith = run(true, GEPA)
    const lifeWithout = run(false, GEPA)
    assert(lifeWithout === 5, `3-1 アルディ無し：シンボル0のブレイヴのアタックでライフは減らない（実際 ${lifeWithout}）`)
    assert(lifeWith === 4, `3-1 アルディ有り：赤シンボル1つを得て、ライフが1減る（実際 ${lifeWith}）`)
}
console.log("=== 4. アルディ e2：シンボル1つを持つ自分の合体スピリットに赤シンボル1つ追加（ライフ2減） ===")
{
    const run = (withArudi: boolean, lv1Only = false) => {
        const s = game("aru-comb", { turn: "p1", phase: "main" })
        if (withArudi) put(s, "p1", ARUDI, 1)
        const host = put(s, "p1", VAN, 1)
        const brave = putBrave(s, "p1", GEPA, 1)
        combine(s, "p1", brave, host)
        toAttack(s, "p1")
        const d = drv()
        void lv1Only
        attackFlow(s, "p1", host.instanceId, d)
        return s.players.p2.life
    }
    assert(run(true) === 3, "4-1 アルディ有り：合体スピリット(シンボル1)が赤1つ追加で2つになりライフ2減")
    assert(run(false) === 4, "4-2 アルディ無し：シンボル1つのままライフ1減")
}
console.log("=== 5. アルディ e3：【合体時】Lv3『このスピリットの合体アタック時』このスピリットをBP+10000 ===")
{
    const run = (cores: number) => {
        const s = game("aru-bp", { turn: "p1", phase: "main" })
        const host = put(s, "p1", ARUDI, cores)
        const brave = putBrave(s, "p1", FENRIR, 1)
        combine(s, "p1", brave, host)
        toAttack(s, "p1")
        const before = effectiveBp(s, "p1", host)
        must(s, "p1", { type: "attack", instanceId: host.instanceId }, "合体アタック宣言")
        settle(s, drv())
        const after = effectiveBp(s, "p1", host)
        return { before, after, lv: lvOf(host) }
    }
    const lv3 = run(5)
    assert(lv3.lv === 3 && lv3.after - lv3.before === 10000, `5-1 Lv3：BPが10000増える（${lv3.before} → ${lv3.after}）`)
    const lv2 = run(3)
    assert(lv2.lv === 2 && lv2.after - lv2.before === 0, `5-2 Lv2：増えない（${lv2.before} → ${lv2.after}）`)
    // 合体していないアタックでは発揮しない
    const s = game("aru-bp-solo", { turn: "p1", phase: "main" })
    const solo = put(s, "p1", ARUDI, 5)
    toAttack(s, "p1")
    const b = effectiveBp(s, "p1", solo)
    must(s, "p1", { type: "attack", instanceId: solo.instanceId }, "単体アタック宣言")
    settle(s, drv())
    assert(effectiveBp(s, "p1", solo) === b, "5-3 合体していないアタックではBPは増えない")
}

// ============ BS12-007 マルス・ドラグーン ============
console.log("=== 6. マルス e3：【合体時】Lv2･3 合体アタック時、シンボル2つを持つ相手のスピリット1体を破壊 ===")
{
    const run = (marsCores: number, combined = true) => {
        const s = game("mars", { turn: "p1", phase: "main" })
        const host = put(s, "p1", MARS, marsCores)
        const two = put(s, "p2", ENEMY2, 1)
        const one = put(s, "p2", VAN, 1)
        if (combined) combine(s, "p1", putBrave(s, "p1", FENRIR, 1), host)
        toAttack(s, "p1")
        const d = drv()
        attackFlow(s, "p1", host.instanceId, d)
        return { s, two, one }
    }
    const lv2 = run(3)
    assert(!onField(lv2.s, "p2", lv2.two), "6-1 Lv2：シンボル2つの相手スピリットが破壊された")
    assert(onField(lv2.s, "p2", lv2.one), "6-1 シンボル1つの相手スピリットは破壊されない")
    const lv1 = run(1)
    assert(onField(lv1.s, "p2", lv1.two), "6-2 Lv1：発揮しない")
    const solo = run(3, false)
    assert(onField(solo.s, "p2", solo.two), "6-3 合体していないアタックでは発揮しない")
}

// ============ BS12-014 ヴェリアム ============
console.log("=== 7. ヴェリアム e2：【合体時】Lv2 合体アタック時、無魔の自分のスピリット1体につき疲労状態の相手スピリット1体を破壊 ===")
{
    const run = (cores: number, withPigeon: boolean) => {
        const s = game("veriam", { turn: "p1", phase: "main" })
        const host = put(s, "p1", VERIAM, cores)
        if (withPigeon) put(s, "p1", PIGEON, 1)
        const rested = [put(s, "p2", VAN, 1, true), put(s, "p2", VAN, 1, true), put(s, "p2", VAN, 1, true)]
        const standing = put(s, "p2", MIRAGE, 1, false)
        combine(s, "p1", putBrave(s, "p1", FENRIR, 1), host)
        toAttack(s, "p1")
        attackFlow(s, "p1", host.instanceId, drv())
        return { s, restedLeft: rested.filter((x) => onField(s, "p2", x)).length, standing: onField(s, "p2", standing) }
    }
    const two = run(4, true)
    assert(two.restedLeft === 1, `7-1 無魔2体（自身+ピジョン）：疲労状態2体が破壊され1体残る（残り ${two.restedLeft}）`)
    assert(two.standing, "7-1 回復状態の相手は破壊されない")
    const one = run(4, false)
    assert(one.restedLeft === 2, `7-2 無魔1体（自身のみ）：疲労状態1体が破壊され2体残る（残り ${one.restedLeft}）`)
    const lv1 = run(1, true)
    assert(lv1.restedLeft === 3, `7-3 Lv1：発揮しない（残り ${lv1.restedLeft}）`)
}

// ============ BS12-015 クロノ・ハデス ============
console.log("=== 8. ハデス e3：【合体時】Lv2･3『破壊時』お互い1体ずつ指定し、指定されなかったスピリットすべてを破壊 ===")
{
    const run = (hadesCores: number, combined: boolean) => {
        const s = game("hades", { turn: "p1", phase: "main", interactive: true })
        const host = put(s, "p1", HADES, hadesCores)
        const keepMe = put(s, "p1", VAN, 1)
        const loseMe = put(s, "p1", MIRAGE, 1)
        const big = put(s, "p2", NAUMAN, 4) // BP12000：合体ハデス(7000+3000)を倒す
        const keepOpp = put(s, "p2", PIGEON, 1)
        const loseOpp = put(s, "p2", PIYON, 1)
        if (combined) combine(s, "p1", putBrave(s, "p1", FENRIR, 1), host)
        toAttack(s, "p1")
        const pickKeep = (st: GameState) => {
            const pc = st.pendingChoice!
            const want = pc.pid === "p1" ? keepMe.instanceId : keepOpp.instanceId
            return pc.candidates.includes(want) ? want : pc.candidates[0]
        }
        const d = drv(true, pickKeep)
        attackFlow(s, "p1", host.instanceId, d, big.instanceId)
        return { s, host, keepMe, loseMe, keepOpp, loseOpp, big, d }
    }
    const r = run(3, true)
    assert(!onField(r.s, "p1", r.host), "8-1 前提：合体ハデスはバトルで破壊された")
    assert(onField(r.s, "p1", r.keepMe) && !onField(r.s, "p1", r.loseMe), "8-1 自分：指定した1体だけ残り、他は破壊")
    assert(onField(r.s, "p2", r.keepOpp) && !onField(r.s, "p2", r.loseOpp), "8-1 相手：指定された1体だけ残り、他は破壊")
    const lv1 = run(1, true)
    assert(onField(lv1.s, "p1", lv1.loseMe) && onField(lv1.s, "p2", lv1.loseOpp), "8-2 Lv1：発揮しない")
    const solo = run(3, false)
    assert(onField(solo.s, "p1", solo.loseMe) && onField(solo.s, "p2", solo.loseOpp), "8-3 合体していないハデスの破壊では発揮しない")
}

// ============ BS12-024 ノブナガード ============
console.log("=== 9. ノブナガード e4：【合体時】Lv2･3 神星/星魂の自分のスピリットは、BPを比べ相手のスピリットだけを破壊したとき回復する ===")
{
    const setup = (nobuCores: number, combined: boolean, atkId: string, mine: boolean) => {
        const s = game("nobu", { turn: "p1", phase: "main" })
        const host = put(s, "p1", NOBU, nobuCores)
        const unit = put(s, "p1", atkId, 1)
        const foe = put(s, "p2", VAN, 1) // BP1000
        if (combined) combine(s, "p1", putBrave(s, "p1", FENRIR, 1), host)
        if (!mine) {
            s.turnPlayer = "p2"
            s.priorityPlayer = "p2"
            s.phase = "attack"
        }
        return { s, unit, foe }
    }
    {
        const { s, unit, foe } = setup(3, true, BEAR, true)
        toAttack(s, "p1")
        attackFlow(s, "p1", unit.instanceId, drv(), foe.instanceId)
        assert(!onField(s, "p2", foe) && unit.isRested === false, "9-1 自分のアタックで勝った星魂スピリットは回復する")
    }
    {
        const { s, unit, foe } = setup(3, true, BEAR, false)
        const atk = put(s, "p2", VAN, 1)
        s.players.p2.field.spirits = s.players.p2.field.spirits.filter((x) => x !== foe)
        attackFlow(s, "p2", atk.instanceId, drv(), unit.instanceId)
        assert(!onField(s, "p2", atk) && unit.isRested === false, "9-2 相手のアタックをブロックして勝った星魂スピリットも回復する（お互いのアタックステップ）")
    }
    {
        const { s, unit, foe } = setup(3, false, BEAR, true)
        toAttack(s, "p1")
        attackFlow(s, "p1", unit.instanceId, drv(), foe.instanceId)
        assert(!onField(s, "p2", foe) && unit.isRested === true, "9-3 合体していなければ回復しない")
    }
    {
        const { s, unit, foe } = setup(1, true, BEAR, true)
        toAttack(s, "p1")
        attackFlow(s, "p1", unit.instanceId, drv(), foe.instanceId)
        assert(!onField(s, "p2", foe) && unit.isRested === true, "9-4 Lv1では回復しない")
    }
    {
        const { s, unit, foe } = setup(3, true, VAN, true) // 地竜：神星でも星魂でもない
        toAttack(s, "p1")
        attackFlow(s, "p1", unit.instanceId, drv(), foe.instanceId)
        assert(!onField(s, "p2", foe) && unit.isRested === true, "9-5 神星/星魂でないスピリットは回復しない")
    }
}

// ============ BS12-X03 マサムネ ============
console.log("=== 10. マサムネ e3：【合体時】Lv2『自分のアタックステップ』怪虫/殻虫/殻人が相手のスピリットだけを破壊したら、相手のライフのコア1個を相手のリザーブに置く ===")
{
    const run = (masaCores: number, combined: boolean, atkId: string) => {
        const s = game("masa", { turn: "p1", phase: "main" })
        const host = put(s, "p1", MASA, masaCores)
        const unit = put(s, "p1", atkId, 1)
        const foe = put(s, "p2", VAN, 1)
        if (combined) combine(s, "p1", putBrave(s, "p1", FENRIR, 1), host)
        toAttack(s, "p1")
        attackFlow(s, "p1", unit.instanceId, drv(), foe.instanceId)
        return s
    }
    const ok = run(4, true, MIRAGE)
    assert(ok.players.p2.life === 4 && ok.players.p2.reserve === 12, `10-1 殻虫が勝つ：相手ライフ5→4、相手リザーブは破壊されたロクケラトプスのコア分+1に加えてライフのコア分+1で12（実際 ${ok.players.p2.life}/${ok.players.p2.reserve}）`)
    const noComb = run(4, false, MIRAGE)
    assert(noComb.players.p2.life === 5 && noComb.players.p2.reserve === 11, "10-2 合体していない：ライフは減らない")
    const lv1 = run(1, true, MIRAGE)
    assert(lv1.players.p2.life === 5, "10-3 Lv1：発揮しない")
    const other = run(4, true, VAN)
    assert(other.players.p2.life === 5, "10-4 系統が違う(地竜)スピリットが勝っても発揮しない")
}

// ============ BS12-030 フォルセティ ============
console.log("=== 11. フォルセティ e2：【重装甲：紫/緑】相手の紫/緑の効果を受けない ===")
{
    const run = (magicId: string, targetForseti: boolean) => {
        const s = game("forseti", { turn: "p2", phase: "main" })
        const fors = put(s, "p1", FORSETI, 1)
        const other = put(s, "p1", VAN, 1)
        s.players.p2.hand = [magicId]
        const target = targetForseti ? fors : other
        const err = act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId })
        settle(s, drv())
        return { fors, other, err }
    }
    const g = run(GREEN_REST, true)
    assert(g.fors.isRested === false, `11-1 相手の緑マジックの疲労を受けない（拒否: ${g.err}）`)
    const ctl = run(GREEN_REST, false)
    assert(ctl.err === null && ctl.other.isRested === true, `11-2 対照：同じマジックは装甲なしのスピリットを疲労させる（拒否: ${ctl.err}）`)
}

// ============ BS12-016 ギ・ガッシャ ============
console.log("=== 12. ギ・ガッシャ e1：トラッシュに無魔のスピリットカードが5枚以上ある間、手札のこれはコスト3 ===")
{
    const run = (trash: string[], reserve: number) => {
        const s = game("ga", { turn: "p1", phase: "main" })
        s.players.p1.hand = [GA]
        s.players.p1.trashCards = trash
        s.players.p1.reserve = reserve
        const err = act(s, "p1", { type: "summon", handIndex: 0 })
        return { s, err }
    }
    const five = Array.from({ length: 5 }, () => PIGEON)
    const ok = run(five, 4)
    assert(ok.err === null && ok.s.players.p1.field.spirits.some((x) => x.cardId === GA), `12-1 無魔5枚：コスト3で召喚できる（拒否: ${ok.err}）`)
    const four = run([...five.slice(0, 4), VAN], 4)
    assert(four.err !== null, "12-2 無魔4枚（もう1枚は無魔でない）：コスト8のまま召喚できない")
    const poor = run(five, 2)
    assert(poor.err !== null, "12-3 無魔5枚でもリザーブ2ではコスト3＋維持コアを払えない")
}

// ============ BS12-029 スノトラ ============
console.log("=== 13. スノトラ e2：【氷壁：緑/黄】相手が緑/黄のマジックを使用したとき、疲労させることで無効にする ===")
{
    const run = (magicId: string, confirm: boolean, opts: { rested?: boolean; myTurn?: boolean } = {}) => {
        const myTurn = opts.myTurn ?? false
        const s = game("snotra", { turn: myTurn ? "p1" : "p2", phase: "main", interactive: true })
        const sno = put(s, "p1", SNOTRA, 1, opts.rested ?? false)
        const caster: PlayerId = myTurn ? "p1" : "p2"
        s.players[caster].hand = [magicId]
        const d = drv(confirm)
        const err = act(s, caster, { type: "castMagic", handIndex: 0 })
        settle(s, d)
        return { s, sno, d, err, caster }
    }
    const ok = run(GREEN_DRAW, true)
    assert(ok.err === null && ok.d.confirms === 1, `13-1 緑マジックに確認が1回出る（実際 ${ok.d.confirms}／拒否: ${ok.err}）`)
    assert(ok.sno.isRested === true && ok.s.players.p2.deck.length === 40, "13-1 スノトラが疲労し、ドローは起きない（無効）")
    assert(ok.s.players.p2.trashCards.includes(GREEN_DRAW), "13-1 無効にされたマジックはトラッシュへ")
    const no = run(GREEN_DRAW, false)
    assert(no.d.confirms === 1 && no.sno.isRested === false && no.s.players.p2.deck.length < 40, "13-2 断ったら無効にならず、ドローが起きる")
    const blue = run(BLUE_DRAW, true)
    assert(blue.d.confirms === 0 && blue.s.players.p2.deck.length < 40, `13-3 青マジックは無効にできない（確認 ${blue.d.confirms}）`)
    const rested = run(GREEN_DRAW, true, { rested: true })
    assert(rested.d.confirms === 0 && rested.s.players.p2.deck.length < 40, `13-4 疲労済みなら確認を出さず無効にしない（確認 ${rested.d.confirms}）`)
    const mine = run(GREEN_DRAW, true, { myTurn: true })
    assert(mine.d.confirms === 0 && mine.sno.isRested === false, `13-5 自分のターンに自分で使うマジックは対象外（確認 ${mine.d.confirms}）`)
}

// ============ BS12-034 ペンタン ============
console.log("=== 14. ペンタン e1-cont：自分のスタートステップ、このターンの間、歌鳥の自分のスピリットすべてに星魂を与える ===")
{
    const mk = () => {
        const s = game("pentan", { turn: "p1", phase: "main" })
        const pen = put(s, "p1", PENTAN, 1)
        const bird = put(s, "p1", PIYON, 1)
        const van = put(s, "p1", VAN, 1)
        const oppBird = put(s, "p2", PIYON, 1)
        return { s, pen, bird, van, oppBird }
    }
    {
        const { s, pen, bird, van, oppBird } = mk()
        assert(!spiritHasFamily(s, "p1", bird, "星魂"), "14-0 前提：スタートステップ前は星魂を持たない")
        runTurnStart(s) // 自分(p1)のスタートステップ
        assert(spiritHasFamily(s, "p1", bird, "星魂"), "14-1 歌鳥のスピリットが星魂を得る")
        assert(spiritHasFamily(s, "p1", pen, "星魂"), "14-1 ペンタン自身も歌鳥なので得る")
        assert(!spiritHasFamily(s, "p1", van, "星魂"), "14-2 歌鳥でないスピリットは得ない")
        assert(!spiritHasFamily(s, "p2", oppBird, "星魂"), "14-3 相手の歌鳥は得ない")
        endTurn(s)
        while (s.pendingChoice) settle(s, drv())
        assert(s.turnPlayer === "p2", "14-4 前提：相手のターンになった")
        assert(!spiritHasFamily(s, "p1", bird, "星魂"), "14-4 このターンの間だけ：相手のターンには消える")
    }
    {
        // 相手のスタートステップでは与えない
        const { s, bird } = mk()
        s.turnPlayer = "p2"
        s.priorityPlayer = "p2"
        runTurnStart(s)
        assert(!spiritHasFamily(s, "p1", bird, "星魂"), "14-5 相手のスタートステップでは発揮しない")
    }
}

// ============ BS12-046 ナタ・ゴレム ============
console.log("=== 15. ナタ・ゴレム e2：【合体時】Lv2 効果の記述を持たないスピリットとして扱う（＝相手のマジックの支払い制限が消える） ===")
{
    // 自分(p1)のアタックステップ中のフラッシュで、相手(p2)がマジックを使う。相手のリザーブは0でスピリットのコアだけで払う
    const run = (nataCores: number, combined: boolean) => {
        const s = game("nata", { turn: "p1", phase: "main" })
        const nata = put(s, "p1", NATA, nataCores)
        const foeSpirit = put(s, "p2", VAN, 3)
        s.players.p2.reserve = 0
        s.players.p2.hand = [WILD]
        if (combined) combine(s, "p1", putBrave(s, "p1", FENRIR, 1), nata)
        toAttack(s, "p1")
        must(s, "p1", { type: "attack", instanceId: nata.instanceId }, "ナタのアタック")
        settle(s, drv())
        // フラッシュ①の優先権は自分→相手の順。自分がパスして相手が使う
        if (s.priorityPlayer === "p1") act(s, "p1", { type: "pass" })
        const err = act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: foeSpirit.instanceId, paySources: [{ instanceId: foeSpirit.instanceId, count: 2 }] })
        return { err }
    }
    const solo = run(3, false)
    assert(solo.err !== null, "15-1 対照：合体していないナタ(Lv2)なら、相手はスピリット上のコアでマジックを払えない")
    const comb = run(3, true)
    assert(comb.err !== null, "15-2 合体ナタ(Lv2)は「効果の記述を持たない」扱いになるだけで効果は発揮し続ける（2026-10-03確認）＝支払い制限は残る")
    const lv1 = run(1, true)
    assert(lv1.err !== null, "15-3 Lv1の合体でも制限が残る")
}

// ============ BS12-059 ショゴルス ============
console.log("=== 16. ショゴルス e1：【合体時】効果の記述を持たないスピリットとして扱う ===")
{
    // ゾン・サウルの「自分のアタックステップ：紫のスピリットBP+1000」はアタックステップ限定なので、アタックステップで見る
    const run = (withBrave: boolean) => {
        const s = game("shogo", { turn: "p1", phase: "main" })
        const host = put(s, "p1", ZON, 1)
        const pig = put(s, "p1", PIGEON, 1)
        if (withBrave) combine(s, "p1", putBrave(s, "p1", SHOGO, 2), host)
        toAttack(s, "p1")
        return effectiveBp(s, "p1", pig)
    }
    assert(run(false) === 2000, `16-0 前提：ゾン・サウルのBP+1000がピジョン(1000)に乗っている（実BP ${run(false)}）`)
    assert(run(true) === 2000, `16-1 ショゴルスと合体しても「効果の記述を持たない」扱いになるだけで、ゾン・サウルのBP+1000は発揮し続ける（2026-10-03確認）（実BP ${run(true)}）`)
}

console.log("=== 17. ハープ e2/e3：このターンの間、スピリット1体は効果すべてを失い新たに得ず、効果の記述を持たないスピリットとして扱う ===")
{
    const run = (cast: boolean) => {
        const s = game("harp", { turn: "p1", phase: "main" })
        const zon = put(s, "p1", ZON, 1)
        const brave = putBrave(s, "p1", GEPA, 1)
        s.players.p1.hand = [HARP]
        let err: string | null = null
        if (cast) err = act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: zon.instanceId })
        settle(s, drv())
        const errC = act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: zon.instanceId })
        return { err, errC }
    }
    const a = run(true)
    assert(a.err === null, `17-1 ハープを使える（拒否: ${a.err}）`)
    assert(a.errC === null, `17-2 効果の記述を持たない扱いなので「効果の記述を持たない」条件のゲパルバートと合体できる（拒否: ${a.errC}）`)
    assert(run(false).errC !== null, "17-3 対照：ハープを使っていないゾン・サウルとはゲパルバートは合体できない")
    const bp = (cast: "zon" | "van" | "none") => {
        const s = game("harp-bp", { turn: "p1", phase: "main" })
        const zon = put(s, "p1", ZON, 1)
        const pig = put(s, "p1", PIGEON, 1)
        const van = put(s, "p1", VAN, 1)
        s.players.p1.hand = [HARP]
        if (cast !== "none") must(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: (cast === "zon" ? zon : van).instanceId }, "ハープ")
        settle(s, drv())
        toAttack(s, "p1")
        return effectiveBp(s, "p1", pig)
    }
    assert(bp("none") === 2000, "17-4 前提：ハープなしならピジョンはBP2000")
    assert(bp("zon") === 1000, `17-5 ゾン・サウルが効果を失い、ピジョンのBP+1000が外れる（実BP ${bp("zon")}）`)
    assert(bp("van") === 2000, `17-6 別のスピリットを対象にしたらゾン・サウルの効果は残る（実BP ${bp("van")}）`)
}

// ============ BS12-057 ハイドランディア ============
console.log("=== 18. ハイドランディア e2：【合体時】相手の効果でこのスピリットのコアが0個になったら、最高Lvとして破壊される ===")
{
    // ギ・ガッシャ(Lv2『破壊時』相手のスピリットすべてを疲労)で見る。Lv1のガッシャが0コアで破壊されたとき、最高Lv扱いなら Lv2 の破壊時が出る
    const run = (withHydra: boolean) => {
        const s = game("hydra", { turn: "p2", phase: "main", interactive: true })
        const ga = put(s, "p1", GA, 1)
        const foeA = put(s, "p2", VAN, 1)
        if (withHydra) {
            s.turnPlayer = "p1"
            s.priorityPlayer = "p1"
            combine(s, "p1", putBrave(s, "p1", HYDRA, 1), ga)
            s.turnPlayer = "p2"
            s.priorityPlayer = "p2"
        }
        s.players.p2.hand = ["BS04-094", VAN, VAN, VAN]
        s.players.p2.reserve = 10
        return { s, ga, foeA }
    }
    const probe = getCard("BS04-094")
    assert(probe.name === "ダンスマカブル" && probe.type === "magic", "18-0 前提：BS04-094はダンスマカブル")
    for (const w of [true, false]) {
        const { s, ga, foeA } = run(w)
        const d = drv(true)
        const err = act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: ga.instanceId })
        settle(s, d)
        void d
        void err
        const destroyed = !onField(s, "p1", ga)
        console.log(`  （参考 18-${w ? "A" : "B"}: 破壊=${destroyed} 相手疲労=${foeA.isRested} 拒否=${err}）`)
        if (w) assert(destroyed && foeA.isRested === true, "18-1 ハイドランディアと合体：0コアで破壊され、最高Lv(Lv2)の『破壊時』で相手スピリットが疲労する")
        else assert(foeA.isRested === false, "18-2 対照：合体していなければLv1扱いで破壊され、相手は疲労しない")
    }
}

// ============ ネクサス：剣の誕生地 / 偶像の館 / 巨木の門 の e1（転召の置き換え） ============
console.log("=== 19. 【転召】時にネクサスを疲労させて、星魂コスト3の自分のスピリットのコアを『置いたものとして扱う』 ===")
{
    const sc = (nexusId: string, shoukanId: string, label: string, soulId = BEAR) => {
        const mk = (o: { nexusRested?: boolean; soul?: string }) => {
            const s = game(`shokan-${label}`, { turn: "p1", phase: "main", interactive: true })
            const nex = put(s, "p1", nexusId, 0, o.nexusRested ?? false)
            const soul = put(s, "p1", o.soul ?? soulId, 2)
            s.players.p1.hand = [shoukanId]
            s.players.p1.reserve = 12
            return { s, nex, soul }
        }
        const asks = (d: Drv) => d.asked.filter((x) => x.includes(getCard(nexusId).name)).length
        {
            const { s, nex, soul } = mk({})
            const d = drv(true)
            const err = act(s, "p1", { type: "summon", handIndex: 0 })
            settle(s, d)
            assert(err === null && s.players.p1.field.spirits.some((x) => x.cardId === shoukanId), `19-${label}-1 転召するスピリットが召喚できる（拒否: ${err}）`)
            assert(nex.isRested === true && onField(s, "p1", soul) && soul.cores === 2, `19-${label}-1 ネクサスを疲労させ、星魂スピリットはコアを動かさず残る（疲労 ${nex.isRested}／コア ${soul.cores}）`)
            assert(asks(d) === 1, `19-${label}-1 ネクサスを使うかの確認が1回出る（${asks(d)}回）`)
        }
        {
            const { s, nex, soul } = mk({})
            const d = drv(false)
            act(s, "p1", { type: "summon", handIndex: 0 })
            settle(s, d)
            assert(asks(d) === 1, `19-${label}-2 確認は1回（${asks(d)}回）`)
            assert(nex.isRested === false && (!onField(s, "p1", soul) || soul.cores === 0), `19-${label}-2 断ればネクサスは疲労せず、通常の転召（星魂のコアはボイドへ）になる（疲労 ${nex.isRested}／コア ${soul.cores}）`)
        }
        {
            const { s, nex } = mk({ nexusRested: true })
            const d = drv(true)
            act(s, "p1", { type: "summon", handIndex: 0 })
            settle(s, d)
            assert(nex.isRested === true && asks(d) === 0, `19-${label}-3 疲労済みのネクサスは使えず確認も出ない（確認 ${asks(d)}）`)
        }
        {
            const { s, nex } = mk({ soul: UNI }) // コスト4の星魂：対象外
            const d = drv(true)
            act(s, "p1", { type: "summon", handIndex: 0 })
            settle(s, d)
            assert(nex.isRested === false && asks(d) === 0, `19-${label}-4 星魂でもコスト3でないスピリットは対象外で確認も出ない（確認 ${asks(d)}）`)
        }
    }
    sc(N061, MARS, "061")
    sc(N064, HADES, "064")
    sc(N066, NOBU, "066")
}

// ============ BS12-062 白煙の大山脈 ============
console.log("=== 20. 白煙の大山脈 e2：Lv2『お互いのアタックステップ』自分のスピリットが2体以下の間、古竜の自分のスピリットを最高Lvとして扱う ===")
{
    const mk = (o: { nexusCores?: number; extra?: number; phase?: "main" | "attack"; turn?: PlayerId }) => {
        const s = game("n062", { turn: o.turn ?? "p1", phase: o.phase ?? "attack" })
        put(s, "p1", N062, o.nexusCores ?? 2)
        const dragon = put(s, "p1", ARUDI, 1) // 古竜(星竜/古竜)：Lv1 BP4000／Lv3 BP7000
        for (let i = 0; i < (o.extra ?? 0); i++) put(s, "p1", VAN, 1)
        const van = put(s, "p1", VAN, 1)
        refreshLevelAsOverrides(s)
        return { s, dragon, van }
    }
    const a = mk({})
    assert(lvOf(a.dragon) === 3 && effectiveBp(a.s, "p1", a.dragon) === 7000, `20-1 アタックステップ・2体以下：古竜は最高Lv(3)扱い（Lv ${lvOf(a.dragon)}）`)
    assert(lvOf(a.van) === 1, "20-1 古竜でない地竜は変わらない")
    const b = mk({ turn: "p2" })
    assert(lvOf(b.dragon) === 3, "20-2 相手のアタックステップでも最高Lv扱い（お互い）")
    const c = mk({ extra: 1 })
    assert(lvOf(c.dragon) === 1, "20-3 自分のスピリットが3体なら発揮しない")
    const d = mk({ phase: "main" })
    assert(lvOf(d.dragon) === 1, "20-4 メインステップでは発揮しない")
    const e = mk({ nexusCores: 0 })
    assert(lvOf(e.dragon) === 1, `20-5 ネクサスがLv1(コア0)なら発揮しない（古竜のLv ${lvOf(e.dragon)}）`)
}

console.log("すべてのチェックに合格しました 🎉（part477）")
