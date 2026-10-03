// smoke パート474（BS16 未発火効果の場面テスト：効果文だけから書いた期待値。実装に合わせて直さないこと）
// 対象：太骨望e2／ゴエモンe1・e2／ジャンヌ・ジル・ラ・イールの【氷壁】／釣魂台／オカピエン／パイルドラコ／
//       ギルガメシュ・セイリュービ・バゼルの【バースト】／牛骨魔王の破壊時／創造の原典
import { act, assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { InstanceSpec, ScenarioCtx, Side } from "./scenario"

const V = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const TAI = "BS16-018" // 太骨望
const GOE = "BS16-005" // ゴエモン・シーフ・ドラゴン
const JANNE = "BS16-036" // 氷聖女ジャンヌダルク
const GIL = "BS16-031" // ジル・ド・レ
const LAI = "BS16-032" // ラ・イール
const TURI = "BS16-063" // 釣魂台
const OKA = "BS16-014" // オカピエン
const PILE = "BS16-002" // パイルドラコ
const GIRU = "BS16-054" // 古の獣王ギルガメシュ
const SEI = "BS16-X03" // 烈の覇王セイリュービ
const BAZ = "BS16-X01" // 爆炎の覇王ロード・ドラゴン・バゼル
const GYU = "BS16-X02" // 牛骨魔王
const GEN = "BS16-070" // 創造の原典
const STON = "BS03-073" // ストン・スタチュー（青・コスト1。召喚時に相手のデッキを1枚破棄）
const GINGA = "BS11-045" // MCギンガー（青・コスト5。アタック時に相手のデッキを1枚破棄）
const DD = "BS01-117" // ダブルドロー（赤マジック・コスト4）
const MH = "BS03-144" // マジックハンマー（青マジック・コスト4）
const GF = "BS01-136" // ギャザーフォース（緑マジック・コスト3）
const HC = "BS09-078" // ヒーリングサークル（白マジック・コスト5）
const OZ = "BS16-081" // マジック・オブ・オズ（黄マジック・コスト4）
const CHAOS = "BS01-128" // カオスドロー（紫マジック・コスト5・紫軽減3）
const RETSU = "BS14-092" // 烈光閃刃（赤マジック。バースト：自分のライフ減少後）
const HOWL = "BS09-084" // ドラゴニックハウル（青マジック・コスト6。自分のデッキを1枚破棄）

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string][] = [
        [V, "ロクケラトプス", "spirit"], [TAI, "太骨望", "spirit"], [GOE, "ゴエモン・シーフ・ドラゴン", "spirit"],
        [JANNE, "氷聖女ジャンヌダルク", "spirit"], [GIL, "ジル・ド・レ", "spirit"], [LAI, "ラ・イール", "spirit"],
        [TURI, "釣魂台", "nexus"], [OKA, "オカピエン", "spirit"], [PILE, "パイルドラコ", "spirit"],
        [GIRU, "古の獣王ギルガメシュ", "spirit"], [SEI, "烈の覇王セイリュービ", "spirit"],
        [BAZ, "爆炎の覇王ロード・ドラゴン・バゼル", "spirit"], [GYU, "牛骨魔王", "spirit"], [GEN, "創造の原典", "nexus"],
        [STON, "ストン・スタチュー", "spirit"], [GINGA, "MCギンガー", "spirit"], [DD, "ダブルドロー", "magic"],
        [MH, "マジックハンマー", "magic"], [GF, "ギャザーフォース", "magic"], [HC, "ヒーリングサークル", "magic"],
        [OZ, "マジック・オブ・オズ", "magic"], [CHAOS, "カオスドロー", "magic"], [RETSU, "烈光閃刃", "magic"],
        [HOWL, "ドラゴニックハウル", "magic"],
    ]
    for (const [id, name, type] of expect) assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    assert(getCard(V).effects.length === 0, "VANILLAは効果なし")
}

const nm = (...ids: string[]) => ids.map((c) => getCard(c).name).sort().join("、") || "なし"
const N = (id: string) => getCard(id).name

// ---- 操作の共通部品 ----
type Pc = NonNullable<ScenarioCtx["state"]["pendingChoice"]>
const CONFIRM_WORDS = ["発動する", "復活させる"]
const isConfirm = (pc: Pc) =>
    pc.kind === "option" && (pc.confirm === true || pc.magicNegate !== undefined || (pc.options ?? []).some((o) => CONFIRM_WORDS.includes(o)))

// 確認が出たら accept なら押し、decline ならスキップする。出た確認の回数を返す。確認以外は先頭の候補で答える
function drive(t: ScenarioCtx, mode: "accept" | "decline" = "accept"): number {
    let confirms = 0
    let guard = 0
    while (t.state.pendingChoice) {
        if (++guard > 30) throw new Error("選択待ちが終わらない")
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(pc)) {
            confirms++
            if (mode === "accept") {
                const opt = (pc.options ?? []).find((o) => CONFIRM_WORDS.includes(o)) ?? pc.options![0]!
                t.act(side, { type: "resolveChoice", option: opt })
            } else {
                t.act(side, { type: "resolveChoice" })
            }
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else if (pc.kind === "card") {
            t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        } else {
            t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 6) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

// 拒否されても落とさない操作（不発・使えないはずの場面）
function tryAct(t: ScenarioCtx, side: Side, action: Parameters<ScenarioCtx["act"]>[1]): void {
    act(t.state, side === "me" ? t.me : t.opp, action)
}

interface AtkOpts {
    block?: string | undefined
    mode?: "accept" | "decline" | undefined
    flash?: ((t: ScenarioCtx) => void) | undefined
}

// アタックステップに入っている前提で1回アタックする
function declare(t: ScenarioCtx, atk: Side, who: string, o: AtkOpts = {}): number {
    const def: Side = atk === "me" ? "opp" : "me"
    let n = 0
    t.act(atk, { type: "attack", instanceId: t.id(who) })
    n += drive(t, o.mode)
    if (o.flash) {
        o.flash(t)
        n += drive(t, o.mode)
    }
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t, o.mode)
        if (o.block && t.state.battle) {
            t.act(def, { type: "block", instanceId: t.id(o.block) })
            n += drive(t, o.mode)
            t.closeFlash()
            n += drive(t, o.mode)
        }
        if (t.state.battle && !t.state.pendingChoice) {
            t.act(def, { type: "takeLife" })
            n += drive(t, o.mode)
        }
    }
    return n
}

function attack(t: ScenarioCtx, atk: Side, who: string, o: AtkOpts = {}): number {
    t.act(atk, { type: "nextPhase" })
    return declare(t, atk, who, o)
}

// フラッシュの優先権が相手にあるときは、相手にパスさせてから自分が使う
function flashAct(t: ScenarioCtx, side: Side, action: Parameters<ScenarioCtx["act"]>[1], mustPass: boolean): void {
    const pid = side === "me" ? t.me : t.opp
    if (t.state.priorityPlayer !== pid) act(t.state, t.state.priorityPlayer, { type: "pass" })
    if (mustPass) t.act(side, action)
    else tryAct(t, side, action)
}

const res = (side: string, n: number) => (n === 10 ? [] : [`${side}.リザーブ: 10 → ${n}`])
const trashCores = (side: string, n: number) => (n === 0 ? [] : [`${side}.トラッシュのコア: 0 → ${n}`])

// 召喚されたスピリットが盤面に現れる行（Lv1）
const appears = (side: string, id: string, bp: number) => [
    `${side}.${N(id)}.場所: なし → フィールド`,
    `${side}.${N(id)}.疲労: なし → false`,
    `${side}.${N(id)}.コア: なし → 1`,
    `${side}.${N(id)}.Lv: なし → 1`,
    `${side}.${N(id)}.BP: なし → ${bp}`,
]

// ============================================================
// BS16-018 太骨望 e2：フラッシュ『このスピリットのバトル時』
// ============================================================
function taiScene(name: string, hand: string[], target: InstanceSpec, destroyed: boolean) {
    const tname = target.label ?? N(target.card)
    scenario({
        name,
        start: { me: { spirits: [{ card: TAI }], hand }, opp: { spirits: [target] } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("太骨望") })
            drive(t)
            const ev = { type: "activateAbility" as const, instanceId: t.id("太骨望"), effectId: "BS16-018-e2" }
            flashAct(t, "me", ev, destroyed)
            drive(t)
            t.closeFlash()
            drive(t)
            if (t.state.battle && !t.state.pendingChoice) t.act("opp", { type: "takeLife" })
            drive(t)
        },
        expect: destroyed
            ? [
                  "自分.太骨望.疲労: false → true",
                  `自分.手札: ${nm(...hand)} → なし`,
                  `自分.トラッシュ: なし → ${nm(...hand)}`,
                  `相手.${tname}.場所: フィールド → なし`,
                  `相手.トラッシュ: なし → ${N(target.card)}`,
                  "相手.リザーブ: 10 → 12",
                  "相手.ライフ: 5 → 4",
              ]
            : ["自分.太骨望.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}
console.log("=== 太骨望 e2-1. 手札の雄将を捨て、疲労した相手のコスト6以下を破壊する ===")
taiScene("tai-ok", [GIL], { card: V, label: "標的", rested: true }, true)
console.log("=== 太骨望 e2-2. 手札が覇皇/雄将でない（無魔だけ）なら何も起きない ===")
taiScene("tai-nofamily", [OKA], { card: V, label: "標的", rested: true }, false)
console.log("=== 太骨望 e2-3. 相手のスピリットが疲労していなければ何も起きない ===")
taiScene("tai-notrested", [GIL], { card: V, label: "標的" }, false)
console.log("=== 太骨望 e2-4. 疲労していてもコスト7なら破壊できない ===")
taiScene("tai-cost7", [GIL], { card: JANNE, label: "標的", rested: true }, false)

// ============================================================
// BS16-005 ゴエモン e2：フラッシュ『自分のアタックステップ』
// ============================================================
function goeScene(name: string, spirits: InstanceSpec[], hand: string[], attacker: string, lines: string[]) {
    scenario({
        name,
        start: { me: { spirits, hand } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(attacker) })
            drive(t)
            flashAct(t, "me", { type: "activateAbility", instanceId: t.id("ゴエモン"), effectId: "BS16-005-e2" }, name === "goe-ok" || name === "goe-other")
            drive(t)
            t.closeFlash()
            drive(t)
            if (t.state.battle && !t.state.pendingChoice) t.act("opp", { type: "takeLife" })
            drive(t)
        },
        expect: lines,
    })
}
console.log("=== ゴエモン e2-1. Lv2：手札の赤を捨てると、アタックのシンボルが赤2つ（ライフ2点）になる ===")
goeScene("goe-ok", [{ card: GOE, label: "ゴエモン", cores: 2 }], [V], "ゴエモン", [
    "自分.ゴエモン.疲労: false → true", `自分.手札: ${N(V)} → なし`, `自分.トラッシュ: なし → ${N(V)}`, "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12",
])
console.log("=== ゴエモン e2-2. 手札が赤でなければ払えず、ライフ1点のまま ===")
goeScene("goe-nored", [{ card: GOE, label: "ゴエモン", cores: 2 }], [GIL], "ゴエモン", [
    "自分.ゴエモン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
])
console.log("=== ゴエモン e2-3. Lv1では使えず、ライフ1点のまま・手札も減らない ===")
goeScene("goe-lv1", [{ card: GOE, label: "ゴエモン", cores: 1 }], [V], "ゴエモン", [
    "自分.ゴエモン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
])
console.log("=== ゴエモン e2-4. 対象は覇皇/雄将の別のスピリットなので、アタックした赤の普通のスピリットは1点のまま ===")
goeScene("goe-other", [{ card: V, label: "アタッカー" }, { card: GOE, label: "ゴエモン", cores: 2 }], [V], "アタッカー", [
    "自分.アタッカー.疲労: false → true", `自分.手札: ${N(V)} → なし`, `自分.トラッシュ: なし → ${N(V)}`, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
])

// ============================================================
// BS16-005 ゴエモン e1：【バースト：相手の『このスピリット/ブレイヴの召喚時』発揮後】
// ============================================================
function goeBurstScene(name: string, o: { interactive: boolean; oppCard: string; ally: boolean; mode?: "accept" | "decline"; confirms: number; expect: string[] }) {
    scenario({
        name,
        start: {
            interactive: o.interactive,
            turn: "opp",
            me: { burst: GOE, spirits: o.ally ? [{ card: GIL, label: "味方" }] : [] },
            opp: { hand: [o.oppCard] },
        },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            const n = drive(t, o.mode)
            assert(n === o.confirms, `確認の回数は${o.confirms}回（実際 ${n} 回）`)
        },
        expect: o.expect,
    })
}
const oppStonLines = [
    `相手.手札: ${N(STON)} → なし`, "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...appears("相手", STON, 2000),
]
const myMillOne = ["自分.デッキ枚数: 40 → 39", `自分.トラッシュ: なし → ${N(V)}`]
const goeSummoned = [
    ...res("自分", 9), "自分.バースト: ゴエモン・シーフ・ドラゴン → なし", ...appears("自分", GOE, 3000),
]
console.log("=== ゴエモン e1-1. 非対話：召喚時効果が発揮された後、覇皇/雄将がいれば召喚する ===")
goeBurstScene("goeb-auto", { interactive: false, oppCard: STON, ally: true, confirms: 0, expect: [...oppStonLines, ...myMillOne, ...goeSummoned] })
console.log("=== ゴエモン e1-2. 対話：確認は1回で、押すと召喚する ===")
goeBurstScene("goeb-confirm", { interactive: true, oppCard: STON, ally: true, confirms: 1, expect: [...oppStonLines, ...myMillOne, ...goeSummoned] })
console.log("=== ゴエモン e1-3. 対話：確認を断ると召喚せず、バーストはセットされたまま ===")
goeBurstScene("goeb-decline", { interactive: true, oppCard: STON, ally: true, mode: "decline", confirms: 1, expect: [...oppStonLines, ...myMillOne] })
console.log("=== ゴエモン e1-4. 相手が召喚時効果のないスピリットを出しても発動せず、確認も出ない ===")
goeBurstScene("goeb-novanilla", {
    interactive: true, oppCard: V, ally: true, confirms: 0,
    expect: [`相手.手札: ${N(V)} → なし`, "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...appears("相手", V, 1000)],
})
console.log("=== ゴエモン e1-5. 覇皇/雄将の自分のスピリットがいなければ召喚されない（バースト自体は発動する） ===")
goeBurstScene("goeb-noally", {
    interactive: true, oppCard: STON, ally: false, confirms: 1,
    expect: [
        ...oppStonLines, "自分.デッキ枚数: 40 → 39", `自分.トラッシュ: なし → ${nm(V, GOE)}`, "自分.バースト: ゴエモン・シーフ・ドラゴン → なし",
    ],
})

// ============================================================
// 【バースト：自分のライフ減少後】で召喚する3枚＋バゼル（ギルガメシュ／セイリュービ／バゼル／ジャンヌ）
// ============================================================
function lifeBurstScene(name: string, o: { card: string; life: number; interactive: boolean; mode?: "accept" | "decline"; confirms: number; summon: { cost: number; bp: number } | null }) {
    const cn = N(o.card)
    const after = o.life - 1
    const lines = ["相手.攻撃者.疲労: false → true", `自分.ライフ: ${o.life} → ${after}`]
    if (o.mode === "decline") {
        lines.push("自分.リザーブ: 10 → 11")
    } else if (o.summon) {
        lines.push(...res("自分", 11 - (o.summon.cost + 1)), ...trashCores("自分", o.summon.cost), `自分.バースト: ${cn} → なし`, ...appears("自分", o.card, o.summon.bp))
    } else {
        lines.push("自分.リザーブ: 10 → 11", `自分.バースト: ${cn} → なし`, `自分.トラッシュ: なし → ${cn}`)
    }
    scenario({
        name,
        start: { turn: "opp", interactive: o.interactive, me: { life: o.life, burst: o.card }, opp: { spirits: [{ card: V, label: "攻撃者" }] } },
        steps(t) {
            const n = attack(t, "opp", "攻撃者", { mode: o.mode })
            assert(n === o.confirms, `確認の回数は${o.confirms}回（実際 ${n} 回）`)
        },
        expect: lines,
    })
}
console.log("=== ジャンヌ e1-1. 非対話：ライフが減ったら召喚する（コスト7を支払う） ===")
lifeBurstScene("janne-b-auto", { card: JANNE, life: 5, interactive: false, confirms: 0, summon: { cost: 0, bp: 4000 } })
console.log("=== ジャンヌ e1-2. 対話：確認は1回で、押すと召喚する ===")
lifeBurstScene("janne-b-confirm", { card: JANNE, life: 5, interactive: true, confirms: 1, summon: { cost: 0, bp: 4000 } })
console.log("=== ジャンヌ e1-3. 対話：断ると召喚せず、バーストはセットされたまま ===")
lifeBurstScene("janne-b-decline", { card: JANNE, life: 5, interactive: true, mode: "decline", confirms: 1, summon: null })

console.log("=== ギルガメシュ e1-1. ライフが3以下になったので召喚する（4→3の境目） ===")
lifeBurstScene("giru-b-ok", { card: GIRU, life: 4, interactive: false, confirms: 0, summon: { cost: 0, bp: 5000 } })
console.log("=== ギルガメシュ e1-2. 対話：確認は1回 ===")
lifeBurstScene("giru-b-confirm", { card: GIRU, life: 4, interactive: true, confirms: 1, summon: { cost: 0, bp: 5000 } })
console.log("=== ギルガメシュ e1-3. 減った後のライフが4なら召喚されない（バースト自体は発動し、カードはトラッシュへ） ===")
lifeBurstScene("giru-b-ng", { card: GIRU, life: 5, interactive: false, confirms: 0, summon: null })

console.log("=== セイリュービ e1-1. ライフが3以下になったので召喚する ===")
lifeBurstScene("sei-b-ok", { card: SEI, life: 4, interactive: false, confirms: 0, summon: { cost: 0, bp: 5000 } })
console.log("=== セイリュービ e1-2. 対話：確認は1回 ===")
lifeBurstScene("sei-b-confirm", { card: SEI, life: 4, interactive: true, confirms: 1, summon: { cost: 0, bp: 5000 } })
console.log("=== セイリュービ e1-3. 減った後のライフが4なら召喚されない ===")
lifeBurstScene("sei-b-ng", { card: SEI, life: 5, interactive: false, confirms: 0, summon: null })

console.log("=== バゼル e1-1. ライフが減ったらコストを支払わずに召喚する（コアはLv1の1個だけ置く） ===")
lifeBurstScene("baz-b-auto", { card: BAZ, life: 5, interactive: false, confirms: 0, summon: { cost: 0, bp: 5000 } })
console.log("=== バゼル e1-2. 対話：確認は1回で、押すと無償で召喚する ===")
lifeBurstScene("baz-b-confirm", { card: BAZ, life: 5, interactive: true, confirms: 1, summon: { cost: 0, bp: 5000 } })
console.log("=== バゼル e1-3. 対話：断ると召喚せず、バーストはセットされたまま ===")
lifeBurstScene("baz-b-decline", { card: BAZ, life: 5, interactive: true, mode: "decline", confirms: 1, summon: null })

// ============================================================
// 【氷壁】（ジャンヌ：赤/紫/緑/白、ジル：赤/青、ラ・イール：白/黄）
// ============================================================
interface MagicProfile {
    id: string
    cost: number
    cores: number // 使用者の側で、使用後のリザーブ（非軽減・シンボルなし）
    // 効果が通ったときだけ起きる行
    applied(caster: string, victim: string): string[]
    // 効果が通ったときの使用者の手札
    handAfter: string
}
const red: MagicProfile = {
    id: DD, cost: 4, cores: 6, handAfter: nm(V, V),
    applied: (c) => [`${c}.デッキ枚数: 40 → 38`],
}
const blue: MagicProfile = {
    id: MH, cost: 4, cores: 6, handAfter: "なし",
    applied: (_c, v) => [`${v}.デッキ枚数: 40 → 35`, `${v}.トラッシュ: なし → ${Array(5).fill(N(V)).join("、")}`],
}
const green: MagicProfile = {
    id: GF, cost: 3, cores: 7, handAfter: "なし", // 効果が通ると void からリザーブへ +1
    applied: () => [],
}
const white: MagicProfile = {
    id: HC, cost: 5, cores: 5, handAfter: "なし",
    applied: (c) => [`${c}.ライフ: 5 → 6`],
}
const yellow: MagicProfile = {
    id: OZ, cost: 4, cores: 6, handAfter: nm(V, V, V),
    applied: (c) => [`${c}.デッキ枚数: 40 → 37`],
}

function negateScene(name: string, o: {
    owner: string
    magic: MagicProfile
    ownerTurn?: boolean // 使用者が氷壁持ちの持ち主（=ターンプレイヤー）のとき、無効にならない
    rested?: boolean
    interactive: boolean
    mode?: "accept" | "decline"
    confirms: number
    negated: boolean
}) {
    const caster: Side = o.ownerTurn ? "me" : "opp"
    const C = caster === "me" ? "自分" : "相手"
    const Vt = caster === "me" ? "相手" : "自分"
    const p = o.magic
    const lines: string[] = []
    lines.push(`${C}.手札: ${N(p.id)} → ${o.negated ? "なし" : p.handAfter}`)
    lines.push(`${C}.トラッシュ: なし → ${N(p.id)}`)
    lines.push(...res(C, p.id === GF && !o.negated ? 8 : p.cores))
    lines.push(`${C}.トラッシュのコア: 0 → ${p.cost}`)
    if (!o.negated) lines.push(...p.applied(C, Vt))
    if (o.negated) lines.push(`自分.${N(o.owner)}.疲労: false → true`)
    scenario({
        name,
        start: {
            turn: caster,
            interactive: o.interactive,
            me: { spirits: [o.rested ? { card: o.owner, rested: true } : { card: o.owner }], hand: caster === "me" ? [p.id] : [] },
            opp: { hand: caster === "opp" ? [p.id] : [] },
        },
        steps(t) {
            t.act(caster, { type: "castMagic", handIndex: 0 })
            const n = drive(t, o.mode)
            assert(n === o.confirms, `確認の回数は${o.confirms}回（実際 ${n} 回）`)
        },
        expect: lines,
    })
}

console.log("=== ジャンヌ e3-1. 対話：相手の赤マジックを疲労して無効にする（確認1回） ===")
negateScene("janne-neg-red", { owner: JANNE, magic: red, interactive: true, confirms: 1, negated: true })
console.log("=== ジャンヌ e3-2. 非対話：払えるなら自動で無効にする ===")
negateScene("janne-neg-red-auto", { owner: JANNE, magic: red, interactive: false, confirms: 0, negated: true })
console.log("=== ジャンヌ e3-3. 対話：断ると効果が通り、ジャンヌは疲労しない ===")
negateScene("janne-neg-decline", { owner: JANNE, magic: red, interactive: true, mode: "decline", confirms: 1, negated: false })
console.log("=== ジャンヌ e3-4. 緑のマジックも無効にできる ===")
negateScene("janne-neg-green", { owner: JANNE, magic: green, interactive: true, confirms: 1, negated: true })
console.log("=== ジャンヌ e3-5. 青のマジックは対象外：確認も出ず、効果が通る ===")
negateScene("janne-neg-blue", { owner: JANNE, magic: blue, interactive: true, confirms: 0, negated: false })
console.log("=== ジャンヌ e3-6. すでに疲労していると払えず、確認も出ずに効果が通る ===")
negateScene("janne-neg-rested", { owner: JANNE, magic: red, rested: true, interactive: true, confirms: 0, negated: false })
console.log("=== ジャンヌ e3-7. 自分のターンに自分が使うマジックは対象外（『相手のターン』限定） ===")
negateScene("janne-neg-ownturn", { owner: JANNE, magic: red, ownerTurn: true, interactive: true, confirms: 0, negated: false })

console.log("=== ジル e1-1. 相手の赤マジックを無効にする ===")
negateScene("gil-neg-red", { owner: GIL, magic: red, interactive: true, confirms: 1, negated: true })
console.log("=== ジル e1-2. 相手の青マジックも無効にする ===")
negateScene("gil-neg-blue", { owner: GIL, magic: blue, interactive: true, confirms: 1, negated: true })
console.log("=== ジル e1-3. 緑マジックは対象外 ===")
negateScene("gil-neg-green", { owner: GIL, magic: green, interactive: true, confirms: 0, negated: false })

console.log("=== ラ・イール e1-1. 相手の白マジックを無効にする ===")
negateScene("lai-neg-white", { owner: LAI, magic: white, interactive: true, confirms: 1, negated: true })
console.log("=== ラ・イール e1-2. 相手の黄マジックを無効にする ===")
negateScene("lai-neg-yellow", { owner: LAI, magic: yellow, interactive: true, confirms: 1, negated: true })
console.log("=== ラ・イール e1-3. 赤マジックは対象外 ===")
negateScene("lai-neg-red", { owner: LAI, magic: red, interactive: true, confirms: 0, negated: false })

// ============================================================
// BS16-063 釣魂台 e1：バーストをセットしている間、紫のシンボルを1つ追加（カオスドローの軽減で観察する）
// ============================================================
function turiScene(name: string, cores: number, burst: boolean) {
    // 釣魂台自身の紫シンボル1つ（印刷）＋バースト中の追加1つ。カオスドローは紫シンボル1つにつき1軽減（コスト5）
    const cost = burst ? 3 : 4
    scenario({
        name,
        start: { me: burst ? { nexuses: [{ card: TURI, cores }], hand: [CHAOS], burst: RETSU } : { nexuses: [{ card: TURI, cores }], hand: [CHAOS] } },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0 })
            drive(t)
        },
        expect: [`自分.手札: ${N(CHAOS)} → なし`, `自分.トラッシュ: なし → ${N(CHAOS)}`, ...res("自分", 10 - cost), ...trashCores("自分", cost)],
    })
}
console.log("=== 釣魂台 e1-1. Lv1：バーストをセットしていると紫シンボルが2つ（コスト5→3） ===")
turiScene("turi-lv1-burst", 0, true)
console.log("=== 釣魂台 e1-2. Lv1：バーストをセットしていなければ紫シンボル1つのまま（コスト5→4） ===")
turiScene("turi-lv1-noburst", 0, false)
console.log("=== 釣魂台 e1-3. Lv2：バーストをセットしていると紫シンボルが2つ ===")
turiScene("turi-lv2-burst", 1, true)

// ============================================================
// BS16-014 オカピエン e1 ／ BS16-002 パイルドラコ e1：相手によってデッキからこのカードが破棄されたとき
// ============================================================
console.log("=== オカピエン e1-1. 相手のスピリットの効果でデッキから破棄されると、相手のライフのコア1個がボイドへ ===")
scenario({
    name: "oka-milled",
    start: { turn: "opp", me: { deck: Array(40).fill(OKA) }, opp: { spirits: [{ card: GINGA, label: "攻撃者" }] } },
    steps(t) {
        attack(t, "opp", "攻撃者")
    },
    expect: [
        "相手.攻撃者.疲労: false → true", "自分.デッキ枚数: 40 → 39", `自分.トラッシュ: なし → ${N(OKA)}`,
        "相手.ライフ: 5 → 4", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== オカピエン e1-2. 自分の効果で自分のデッキから破棄されても、相手のライフは減らない ===")
scenario({
    name: "oka-selfmill",
    start: { me: { deck: Array(40).fill(OKA), hand: [HOWL] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drive(t)
    },
    expect: [
        `自分.手札: ${N(HOWL)} → なし`, "自分.デッキ枚数: 40 → 39", `自分.トラッシュ: なし → ${nm(OKA, HOWL)}`,
        "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 6",
    ],
})

console.log("=== パイルドラコ e1-1. 相手のスピリットの効果で破棄されると、そのスピリットを破壊する ===")
scenario({
    name: "pile-milled",
    start: { turn: "opp", me: { deck: Array(40).fill(PILE) }, opp: { spirits: [{ card: GINGA, label: "攻撃者" }] } },
    steps(t) {
        attack(t, "opp", "攻撃者")
    },
    expect: [
        "相手.攻撃者.場所: フィールド → なし", `相手.トラッシュ: なし → ${N(GINGA)}`, "相手.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39", `自分.トラッシュ: なし → ${N(PILE)}`,
    ],
})
console.log("=== パイルドラコ e1-2. さらに、そのターンのうちは自分のデッキが破棄されない（2体目のアタックでは破棄されない） ===")
scenario({
    name: "pile-protect",
    start: { turn: "opp", me: { deck: Array(40).fill(PILE) }, opp: { spirits: [{ card: GINGA, label: "攻撃者A" }, { card: GINGA, label: "攻撃者B" }] } },
    steps(t) {
        attack(t, "opp", "攻撃者A")
        declare(t, "opp", "攻撃者B")
    },
    expect: [
        "相手.攻撃者A.場所: フィールド → なし", `相手.トラッシュ: なし → ${N(GINGA)}`, "相手.リザーブ: 10 → 11",
        "相手.攻撃者B.疲労: false → true", "自分.デッキ枚数: 40 → 39", `自分.トラッシュ: なし → ${N(PILE)}`,
        "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11",
    ],
})
console.log("=== パイルドラコ e1-3. マジックの効果で破棄されても（スピリットの効果ではないので）何も壊れない ===")
scenario({
    name: "pile-magic",
    start: { turn: "opp", me: { deck: Array(40).fill(PILE) }, opp: { hand: [MH], spirits: [{ card: V, label: "見張り" }] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        drive(t)
    },
    expect: [
        `相手.手札: ${N(MH)} → なし`, `相手.トラッシュ: なし → ${N(MH)}`, "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4",
        "自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${Array(5).fill(N(PILE)).join("、")}`,
    ],
})

// ============================================================
// BS16-X02 牛骨魔王 e2：『このスピリットの破壊時』手札1枚を破棄することで疲労状態で残る
// ============================================================
function gyuScene(name: string, o: { cores: number; hand: string[]; interactive: boolean; mode?: "accept" | "decline"; confirms: number; stays: boolean }) {
    const lines = ["相手.攻撃者.疲労: false → true"]
    if (o.stays) {
        lines.push("自分.牛骨魔王.疲労: false → true", `自分.手札: ${nm(...o.hand)} → なし`, `自分.トラッシュ: なし → ${nm(...o.hand)}`)
    } else {
        lines.push("自分.牛骨魔王.場所: フィールド → なし", `自分.トラッシュ: なし → ${N(GYU)}`, `自分.リザーブ: 10 → ${10 + o.cores}`)
    }
    scenario({
        name,
        start: {
            turn: "opp",
            interactive: o.interactive,
            me: { spirits: [{ card: GYU, cores: o.cores }], hand: o.hand },
            opp: { spirits: [{ card: SEI, label: "攻撃者", cores: 3 }] }, // Lv2 BP10000
        },
        steps(t) {
            const n = attack(t, "opp", "攻撃者", { block: "牛骨魔王", mode: o.mode })
            assert(n === o.confirms, `確認の回数は${o.confirms}回（実際 ${n} 回）`)
        },
        expect: lines,
    })
}
console.log("=== 牛骨魔王 e2-1. 非対話：手札を捨てて疲労状態のまま残る ===")
gyuScene("gyu-auto", { cores: 3, hand: [V], interactive: false, confirms: 0, stays: true })
console.log("=== 牛骨魔王 e2-2. 対話：確認は1回で、押すと残る ===")
gyuScene("gyu-confirm", { cores: 3, hand: [V], interactive: true, confirms: 1, stays: true })
console.log("=== 牛骨魔王 e2-3. 対話：断ると破壊され、手札は減らない ===")
gyuScene("gyu-decline", { cores: 3, hand: [V], interactive: true, mode: "decline", confirms: 1, stays: false })
console.log("=== 牛骨魔王 e2-4. 手札がなければ払えず、確認も出ずに破壊される ===")
gyuScene("gyu-nohand", { cores: 3, hand: [], interactive: true, confirms: 0, stays: false })
console.log("=== 牛骨魔王 e2-5. Lv1では効果がなく破壊される ===")
gyuScene("gyu-lv1", { cores: 1, hand: [V], interactive: true, confirms: 0, stays: false })

// ============================================================
// BS16-070 創造の原典 e2：自分のバーストが発動したとき、マジックなら無償でメイン/フラッシュ効果を発揮できる
// ============================================================
function genScene(name: string, cores: number, paid: boolean) {
    const lines = [
        "相手.攻撃者.場所: フィールド → なし", `相手.トラッシュ: なし → ${N(V)}`, "相手.リザーブ: 10 → 11",
        "自分.ライフ: 5 → 4", `自分.バースト: ${N(RETSU)} → なし`, `自分.トラッシュ: ${N(V)} → ${N(RETSU)}`, `自分.手札: なし → ${N(V)}`,
        ...res("自分", paid ? 7 : 11), ...trashCores("自分", paid ? 4 : 0),
    ]
    scenario({
        name,
        start: { turn: "opp", me: { nexuses: [{ card: GEN, cores }], burst: RETSU, trash: [V] }, opp: { spirits: [{ card: V, label: "攻撃者" }] } },
        steps(t) {
            attack(t, "opp", "攻撃者")
        },
        expect: lines,
    })
}
console.log("=== 創造の原典 e2-1. Lv2：バーストのマジックのメイン効果を、コストを支払わずに発揮する ===")
genScene("gen-lv2-free", 3, false)
console.log("=== 創造の原典 e2-2. Lv1：効果がないので、その後のコスト4を支払って発揮する ===")
genScene("gen-lv1-paid", 0, true)

console.log("すべてのチェックに合格しました 🎉（part474）")
