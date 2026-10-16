// smoke パート601（BS13 弾ほか：一度も適用されていなかった効果節の場面テスト。期待値は効果文のみから書く）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioSpec } from "./scenario"
import { instColors } from "../../shared/rules/level"
import { hasHeavyArmorAgainst } from "../../shared/rules/constraints"

const V = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BULL = "BS03-071" // 戦闘獣ブルトップ（青・BP1000）
const DOLFINO = "BS06-061" // ドルフィーノ（青・BP1000）
const HYO = "BS13-054" // ヒョウ・カッチュー（緑ブレイヴ・BP3000）
const REDBRAVE = "BS12-049" // アンフィスバエナー（赤ブレイヴ・BP4000・合体条件 神星/光導/星魂）

{
    const names: Record<string, string> = {
        X008: "神星皇ストライク・アポロドラゴン", "BS13-015": "冥総裁ハーゲン", "BS13-053": "モクバオー", "BS13-071": "巨人港",
        "BS13-X01": "光龍騎神サジット・アポロドラゴン", "BS13-052": "イビルグライダー", "BS13-054": "ヒョウ・カッチュー",
        "BS13-030": "リーサルウェポンドラゴン", "BS13-056": "ホーク・ブレイカー", "BS13-040": "金星神龍ヴィーナ・フェーザー",
        "BS13-058": "シユウ", "BS13-059": "フォビッド・バルチャー", "BS13-060": "トレス・ベルーガ", "BS13-049": "イリテバン",
        X005A: "北斗七星龍ジーク・アポロドラゴン", X005E: "北斗七星龍ジーク・アポロドラゴン", X005D: "北斗七星龍ジーク・アポロドラゴン",
        X005T: "北斗七星龍ジーク・アポロドラゴン", X005S: "北斗七星龍ジーク・アポロドラゴン", "BS13-039": "神獣バーロン",
        X007: "天地神龍ガイ・アスラ", "BS13-X04": "獅機龍神ストライクヴルム・レオ", "BS13-027": "ムーンショウウオ", "BS13-034": "ミノガメン",
        "BS12-049": "アンフィスバエナー", "BS05-011": "レッドキャップ", "BS10-026": "老兵ノーガン", "BS01-123": "リターンドロー",
        "BS04-066": "猫人アビシニア", "BS15-037": "クダギツネン", "BS03-076": "爪剣のラザラス", "BS07-026": "烈針獣マツノアラシ",
        "BS06-061": "ドルフィーノ", "BS03-071": "戦闘獣ブルトップ", "BS01-002": "ロクケラトプス",
    }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id} は ${n}`)
}

// 想定外の例外（ラベル違い等）で後続が止まらないよう、1場面ずつ捕まえる
function sc(spec: ScenarioSpec): void {
    try {
        scenario(spec)
    } catch (e) {
        assert(false, `[${spec.name}] 場面が最後まで走らなかった: ${(e as Error).message}`)
    }
}

// 自分のターン終了→相手のターン開始（ドロー1枚・リザーブ+1）で盤面に出る変化
const OPP_TURN_START = ["相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス"]
// ブレイヴ合体（ブレイヴのコアはリザーブへ戻り、ホストにブレイヴのBPが加わる）
// gain：ホストに加わるBP（合体状態のBP表の値で、スピリット状態のBPと違うブレイヴがある）
const comb = (host: string, hostBp: number, brave: string, braveBp: number, gain = braveBp, cores = 1) => [
    `自分.${brave}.BP: ${braveBp} → なし`,
    `自分.${brave}.コア: ${cores} → 0`,
    `自分.${brave}.場所: フィールド → 合体`,
    `自分.${host}.BP: ${hostBp} → ${hostBp + gain}`,
]
const sorted = (...ids: string[]) => ids.map((i) => getCard(i).name).sort().join("、")

console.log("=== X008 神星皇ストライク・アポロドラゴン ===")
{
    const base = (cores: number, brave: string, opp: { card: string; label: string; cores?: number }[]) => ({
        me: { spirits: [{ card: "X008", label: "アポロ", cores, rested: true }, { card: brave, label: "ブレイヴ" }] },
        opp: { spirits: opp },
    })
    const oppAttack = (t: Parameters<ScenarioSpec["steps"]>[0]) => {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("敵") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    }
    // A: 緑/白/黄のブレイヴとの合体時、相手のスピリットがアタックしたとき回復する
    sc({
        name: "x008-recover-green",
        start: base(2, HYO, [{ card: BULL, label: "敵" }]),
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("アポロ") })
            oppAttack(t)
        },
        expect: [...comb("アポロ", 10000, "ブレイヴ", 3000), ...OPP_TURN_START, "自分.リザーブ: 10 → 12", "自分.ライフ: 5 → 4", "自分.アポロ.疲労: true → false", "相手.敵.疲労: false → true"],
    })
    sc({
        name: "x008-no-recover-red",
        start: base(2, REDBRAVE, [{ card: BULL, label: "敵" }]),
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("アポロ") })
            oppAttack(t)
        },
        expect: [...comb("アポロ", 10000, "ブレイヴ", 4000), ...OPP_TURN_START, "自分.リザーブ: 10 → 12", "自分.ライフ: 5 → 4", "相手.敵.疲労: false → true"],
    })
    // 相手のスピリットのアタックに限る：自分のアタックでは回復しない
    sc({
        name: "x008-no-recover-own-attack",
        start: { me: { spirits: [{ card: "X008", label: "アポロ", cores: 2 }, { card: HYO, label: "ブレイヴ" }] } },
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("アポロ") })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("アポロ") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [...comb("アポロ", 10000, "ブレイヴ", 3000), "自分.リザーブ: 10 → 11", "自分.アポロ.疲労: false → true", "相手.ライフ: 5 → 2", "相手.リザーブ: 10 → 13"],
    })
    // B: 赤/紫/青のブレイヴとの合体アタック時、BP10000以下の相手のスピリット1体を破壊する（Lv2・Lv3）
    const atk = (t: Parameters<ScenarioSpec["steps"]>[0]) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("アポロ") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アポロ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    }
    const mine = (cores: number, brave: string) => ({ spirits: [{ card: "X008", label: "アポロ", cores }, { card: brave, label: "ブレイヴ" }] })
    sc({
        name: "x008-destroy-red-lv2",
        start: { me: mine(2, REDBRAVE), opp: { spirits: [{ card: BULL, label: "敵" }] } },
        steps: atk,
        expect: [...comb("アポロ", 10000, "ブレイヴ", 4000), "自分.リザーブ: 10 → 11", "自分.アポロ.疲労: false → true", "相手.ライフ: 5 → 2", "相手.リザーブ: 10 → 14", "相手.敵.場所: フィールド → なし", "相手.トラッシュ: なし → 戦闘獣ブルトップ"],
    })
    sc({
        name: "x008-destroy-red-lv3",
        start: { me: mine(5, REDBRAVE), opp: { spirits: [{ card: BULL, label: "敵" }] } },
        steps: atk,
        expect: [...comb("アポロ", 13000, "ブレイヴ", 4000), "自分.リザーブ: 10 → 11", "自分.アポロ.疲労: false → true", "相手.ライフ: 5 → 2", "相手.リザーブ: 10 → 14", "相手.敵.場所: フィールド → なし", "相手.トラッシュ: なし → 戦闘獣ブルトップ"],
    })
    sc({
        name: "x008-nodestroy-green",
        start: { me: mine(2, HYO), opp: { spirits: [{ card: BULL, label: "敵" }] } },
        steps: atk,
        expect: [...comb("アポロ", 10000, "ブレイヴ", 3000), "自分.リザーブ: 10 → 11", "自分.アポロ.疲労: false → true", "相手.ライフ: 5 → 2", "相手.リザーブ: 10 → 13"],
    })
    sc({
        name: "x008-nodestroy-over10000",
        start: { me: mine(2, REDBRAVE), opp: { spirits: [{ card: "X007", label: "敵", cores: 3 }] } },
        steps: atk,
        expect: [...comb("アポロ", 10000, "ブレイヴ", 4000), "自分.リザーブ: 10 → 11", "自分.アポロ.疲労: false → true", "相手.ライフ: 5 → 2", "相手.リザーブ: 10 → 13"],
    })
    sc({
        name: "x008-nodestroy-lv1",
        start: { me: mine(1, REDBRAVE), opp: { spirits: [{ card: BULL, label: "敵" }] } },
        steps: atk,
        expect: [...comb("アポロ", 6000, "ブレイヴ", 4000), "自分.リザーブ: 10 → 11", "自分.アポロ.疲労: false → true", "相手.ライフ: 5 → 2", "相手.リザーブ: 10 → 13"],
    })
}

type Ctx = Parameters<ScenarioSpec["steps"]>[0]
const attackAndTakeLife = (t: Ctx, label: string) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}

console.log("=== BS13-015 冥総裁ハーゲン ===")
{
    const RED_CAP = "BS05-011" // レッドキャップ（紫・【呪撃】Lv1･Lv2）
    const run = (name: string, hagenCores: number, attacker: string, colorless: boolean, turn: "me" | "opp") =>
        sc({
            name,
            start: turn === "me"
                ? { me: { spirits: [{ card: "BS13-015", label: "ハーゲン", cores: hagenCores }, { card: attacker, label: "攻" }] } }
                : { turn: "opp", me: { spirits: [{ card: "BS13-015", label: "ハーゲン", cores: hagenCores }] }, opp: { spirits: [{ card: attacker, label: "攻" }] } },
            steps(t) {
                if (turn === "me") {
                    t.act("me", { type: "nextPhase" })
                    t.act("me", { type: "attack", instanceId: t.id("攻") })
                } else {
                    t.act("opp", { type: "nextPhase" })
                    t.act("opp", { type: "attack", instanceId: t.id("攻") })
                }
                assert((instColors(t.inst("攻")).length === 0) === colorless, `${name}: アタック中の色が${colorless ? "無い" : "残っている"}`)
                t.closeFlash()
                t.act(turn === "me" ? "opp" : "me", { type: "takeLife" })
            },
            expect: turn === "me"
                ? ["自分.攻.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
                : ["相手.攻.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
        })
    run("hagen-lv2-curse-colorless", 4, RED_CAP, true, "me")
    run("hagen-lv1-keeps-color", 1, RED_CAP, false, "me")
    run("hagen-lv2-nonkeyword-keeps-color", 4, V, false, "me")
    run("hagen-opp-attacker-keeps-color", 4, RED_CAP, false, "opp")
}

console.log("=== BS13-071 巨人港 ===")
{
    const MAGIC = "BS01-123" // リターンドロー（紫・コスト2。メイン効果はターン限りの持続のみ）
    const run = (name: string, nexusCores: number, castCount: number, who: "opp" | "me", mainEnds: boolean) =>
        sc({
            name,
            start: who === "opp"
                ? { turn: "opp", me: { nexuses: [{ card: "BS13-071", cores: nexusCores }] }, opp: { hand: Array(castCount).fill(MAGIC) } }
                : { me: { nexuses: [{ card: "BS13-071", cores: nexusCores }], hand: Array(castCount).fill(MAGIC) } },
            steps(t) {
                for (let i = 0; i < castCount; i++) t.act(who, { type: "castMagic", handIndex: 0 })
                assert(t.state.phase === (mainEnds ? "attack" : "main"), `${name}: メインステップが${mainEnds ? "終了している" : "続いている"}（phase=${t.state.phase}）`)
            },
            expect: [
                `${who === "opp" ? "相手" : "自分"}.手札: ${Array(castCount).fill("リターンドロー").join("、")} → なし`,
                `${who === "opp" ? "相手" : "自分"}.トラッシュ: なし → ${Array(castCount).fill("リターンドロー").join("、")}`,
                `${who === "opp" ? "相手" : "自分"}.リザーブ: 10 → ${10 - 2 * castCount}`,
                `${who === "opp" ? "相手" : "自分"}.トラッシュのコア: 0 → ${2 * castCount}`,
            ],
        })
    run("kyojin-opp-two-magics-ends-main", 2, 2, "opp", true)
    run("kyojin-opp-one-magic-continues", 2, 1, "opp", false)
    run("kyojin-lv1-two-magics-continues", 0, 2, "opp", false)
    run("kyojin-own-two-magics-continues", 2, 2, "me", false)
}

console.log("=== BS13-X01 サジット・アポロドラゴン ===")
{
    const BLUEBRAVE = "BS12-060" // バルカン・アームズ（青ブレイヴ・BP5000・合体条件 神星/光導/星魂）
    const dead = (label: string) => `相手.${label}.場所: フィールド → なし`
    const mine = (cores: number, braves: string[]) => ({
        spirits: [{ card: "BS13-X01", label: "サジット", cores }, ...braves.map((b, i) => ({ card: b, label: `ブレイヴ${i + 1}` }))],
    })
    const run = (n: number, ctx: Ctx) => {
        for (let i = 1; i <= n; i++) ctx.act("me", { type: "combineBrave", braveInstanceId: ctx.id(`ブレイヴ${i}`), hostInstanceId: ctx.id("サジット") })
        ctx.act("me", { type: "nextPhase" })
        ctx.act("me", { type: "attack", instanceId: ctx.id("サジット") })
        // 破壊する相手を選ぶ場面なら敵Aを選ぶ
        while (ctx.state.pendingChoice) ctx.act("me", { type: "resolveChoice", instanceId: ctx.id("敵A") })
        ctx.closeFlash()
        ctx.act("opp", { type: "takeLife" })
    }
    // ブレイヴ2つ：BP13000+3000+4000。シンボルは赤+緑+赤の3つなので相手のライフは3減る
    const two = (lv3: boolean) => [
        "自分.ブレイヴ1.BP: 3000 → なし", "自分.ブレイヴ1.コア: 1 → 0", "自分.ブレイヴ1.場所: フィールド → 合体",
        "自分.ブレイヴ2.BP: 4000 → なし", "自分.ブレイヴ2.コア: 1 → 0", "自分.ブレイヴ2.場所: フィールド → 合体",
        `自分.サジット.BP: ${lv3 ? 13000 : 10000} → ${lv3 ? 20000 : 17000}`, "自分.リザーブ: 10 → 12", "自分.サジット.疲労: false → true", "相手.ライフ: 5 → 2",
    ]
    sc({
        name: "sagit-two-braves-destroy-two",
        start: { me: mine(5, [HYO, REDBRAVE]), opp: { spirits: [{ card: BULL, label: "敵A" }, { card: DOLFINO, label: "敵B" }] } },
        steps: (t) => run(2, t),
        expect: [...two(true), dead("敵A"), dead("敵B"), `相手.トラッシュ: なし → ${sorted(BULL, DOLFINO)}`, "相手.リザーブ: 10 → 15"],
    })
    // ブレイヴ1つにつき1体：1つなら破壊は1体だけ（選んだ敵A）
    sc({
        name: "sagit-one-brave-destroy-one",
        start: { me: mine(5, [HYO]), opp: { spirits: [{ card: BULL, label: "敵A" }, { card: DOLFINO, label: "敵B" }] }, interactive: true },
        steps: (t) => {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ1"), hostInstanceId: t.id("サジット") })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("サジット") })
            assert(t.state.pendingChoice?.pid === t.me, "破壊する相手は自分が選ぶ")
            t.act("me", { type: "resolveChoice", instanceId: t.id("敵A") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.ブレイヴ1.BP: 3000 → なし", "自分.ブレイヴ1.コア: 1 → 0", "自分.ブレイヴ1.場所: フィールド → 合体",
            "自分.サジット.BP: 13000 → 16000", "自分.リザーブ: 10 → 11", "自分.サジット.疲労: false → true", "相手.ライフ: 5 → 3",
            dead("敵A"), `相手.トラッシュ: なし → ${getCard(BULL).name}`, "相手.リザーブ: 10 → 13",
        ],
    })
    // BP10000を超える相手は破壊できない
    sc({
        name: "sagit-over10000-survives",
        start: { me: mine(5, [HYO, REDBRAVE]), opp: { spirits: [{ card: BULL, label: "敵A" }, { card: "X007", label: "敵C", cores: 3 }] } },
        steps: (t) => run(2, t),
        expect: [...two(true), dead("敵A"), `相手.トラッシュ: なし → ${getCard(BULL).name}`, "相手.リザーブ: 10 → 14"],
    })
    // Lv2では誘発しない
    sc({
        name: "sagit-lv2-no-destroy",
        start: { me: mine(3, [HYO, REDBRAVE]), opp: { spirits: [{ card: BULL, label: "敵A" }] } },
        steps: (t) => run(2, t),
        expect: [...two(false), "相手.リザーブ: 10 → 13"],
    })
}

console.log("=== BS13-053 モクバオー ===")
{
    const NOGAN = "BS10-026" // 老兵ノーガン（緑・コスト4・フラッシュ【神速】・召喚時効果なし）
    const nogan = (label: string, side: "自分" | "相手") => [
        `${side}.${label}.BP: なし → 3000`, `${side}.${label}.Lv: なし → 1`, `${side}.${label}.コア: なし → 1`, `${side}.${label}.場所: なし → フィールド`, `${side}.${label}.疲労: なし → false`,
    ]
    const mine = { interactive: true, me: { spirits: [{ card: "BS13-053", label: "モクバオー", rested: true }, { card: V, label: "攻" }], hand: [NOGAN] } }
    const steps = (answer: "accept" | "decline") => (t: Ctx) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("攻") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "summon", handIndex: 0 })
        assert(t.state.pendingChoice?.pid === t.me, "モクバオーの確認は自分に出る")
        if (answer === "accept") t.act("me", { type: "resolveChoice", option: "発動する" })
        else t.act("me", { type: "resolveChoice" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    }
    const common = ["自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 5", "自分.手札: 老兵ノーガン → なし", "自分.攻.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
    // 合体時にブレイヴのコアがホストへ集約される（BRAVE.md）。効果文にコアの行き先は書かれていない
    sc({
        name: "mokubao-recover-and-combine",
        start: mine,
        steps: steps("accept"),
        expect: [
            ...common, "自分.モクバオー.疲労: true → false", "自分.モクバオー.BP: 4000 → なし", "自分.モクバオー.場所: フィールド → 合体", "自分.モクバオー.コア: 1 → 0",
            "自分.老兵ノーガン.BP: なし → 9000", "自分.老兵ノーガン.Lv: なし → 2", "自分.老兵ノーガン.コア: なし → 2", "自分.老兵ノーガン.場所: なし → フィールド", "自分.老兵ノーガン.疲労: なし → false",
        ],
    })
    // 回復は「できる」の前にあるので、合体を断っても回復はする（読み1）
    sc({
        name: "mokubao-recover-only-when-declined",
        start: mine,
        steps: steps("decline"),
        expect: [...common, "自分.モクバオー.疲労: true → false", ...nogan("老兵ノーガン", "自分")],
    })
    // 相手の【神速】スピリットでは反応しない
    sc({
        name: "mokubao-ignores-opp-summon",
        start: { me: { spirits: [{ card: "BS13-053", label: "モクバオー", rested: true }, { card: V, label: "攻" }] }, opp: { hand: [NOGAN] } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("攻") })
            t.act("opp", { type: "summon", handIndex: 0 })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.攻.疲労: false → true", "相手.トラッシュのコア: 0 → 4", "相手.リザーブ: 10 → 6", "相手.手札: 老兵ノーガン → なし", "相手.ライフ: 5 → 4", ...nogan("老兵ノーガン", "相手")],
    })
}

console.log("=== BS13-052 イビルグライダー ===")
{
    const HOST = "BS04-066" // 猫人アビシニア（青・コスト3・BP3000）
    const run = (name: string, withBrave: boolean) =>
        sc({
            name,
            start: { me: { spirits: [{ card: HOST, label: "ホスト" }, ...(withBrave ? [{ card: "BS13-052", label: "ブレイヴ" }] : [])] } },
            steps(t) {
                if (withBrave) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ホスト") })
                assert(instColors(t.inst("ホスト")).length > 0, `${name}: アタック前は色がある`)
                t.act("me", { type: "nextPhase" })
                t.act("me", { type: "attack", instanceId: t.id("ホスト") })
                assert((instColors(t.inst("ホスト")).length === 0) === withBrave, `${name}: アタック中の色が${withBrave ? "無い" : "残っている"}`)
                t.closeFlash()
                t.act("opp", { type: "takeLife" })
            },
            expect: [
                ...(withBrave ? comb("ホスト", 3000, "ブレイヴ", 4000).concat(["自分.リザーブ: 10 → 11"]) : []),
                "自分.ホスト.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
            ],
        })
    run("evilglider-combined-attack-colorless", true)
    run("evilglider-no-brave-keeps-color", false)
}

console.log("=== BS13-054 ヒョウ・カッチュー ===")
{
    const run = (name: string, oppCount: number, rested: string[]) =>
        sc({
            name,
            start: {
                interactive: true,
                me: { hand: [HYO] },
                opp: { spirits: ["敵A", "敵B", "敵C"].slice(0, oppCount).map((l, i) => ({ card: [BULL, DOLFINO, "BS05-046"][i] as string, label: l })) },
            },
            steps(t) {
                t.act("me", { type: "summon", handIndex: 0 })
                // 疲労させるスピリットを選ぶのは相手
                // 疲労させる体数以下しかいなければ選ぶ余地が無いので、選択待ちは出ない
                for (const l of oppCount > 2 ? rested : []) {
                    assert(t.state.pendingChoice?.pid === t.opp, `${name}: 疲労させる相手を選ぶのは相手（pid=${t.state.pendingChoice?.pid}）`)
                    t.act("opp", { type: "resolveChoice", instanceId: t.id(l) })
                }
                assert(!t.state.pendingChoice, `${name}: 選択待ちが残らない`)
            },
            expect: [
                "自分.手札: ヒョウ・カッチュー → なし", "自分.トラッシュのコア: 0 → 4", "自分.リザーブ: 10 → 5",
                "自分.ヒョウ・カッチュー.BP: なし → 3000", "自分.ヒョウ・カッチュー.Lv: なし → 1", "自分.ヒョウ・カッチュー.コア: なし → 1",
                "自分.ヒョウ・カッチュー.場所: なし → フィールド", "自分.ヒョウ・カッチュー.疲労: なし → false",
                ...rested.map((l) => `相手.${l}.疲労: false → true`),
            ],
        })
    run("hyo-opp-rests-two-of-three", 3, ["敵A", "敵C"])
    run("hyo-opp-with-one-rests-it", 1, ["敵A"])
}

// 選択待ち（対象選び）が出ている間、候補に優先ラベルがあればそれを、無ければ先頭を選んで答える
const answerPicks = (t: Ctx, prefer: string[] = []) => {
    for (let guard = 0; t.state.pendingChoice && guard < 10; guard++) {
        const pc = t.state.pendingChoice
        const who = pc.pid === t.me ? "me" : "opp"
        const hit = prefer.map((l) => t.id(l)).find((id) => pc.candidates.includes(id))
        t.act(who, { type: "resolveChoice", instanceId: (hit ?? pc.candidates[0]) as string })
    }
}

console.log("=== BS13-030 リーサルウェポンドラゴン ===")
{
    for (const [cores, lv] of [[1, 1], [3, 2]] as const) {
        sc({
            name: `lethal-heavyarmor-lv${lv}`,
            start: { me: { spirits: [{ card: "BS13-030", label: "リーサル", cores }] } },
            steps(t) {
                const i = t.inst("リーサル")
                assert(hasHeavyArmorAgainst(i, ["purple"]), `Lv${lv}: 紫の効果を受けない`)
                assert(hasHeavyArmorAgainst(i, ["blue"]), `Lv${lv}: 青の効果を受けない`)
                assert(!hasHeavyArmorAgainst(i, ["red"]), `Lv${lv}: 赤の効果は受ける`)
                assert(!hasHeavyArmorAgainst(i, ["green"]), `Lv${lv}: 緑の効果は受ける`)
            },
            expect: [],
        })
    }
    const GREEN_BLOCKER = "BS01-050" // ビートビートル（緑・BP1000・バニラ）
    const PURPLE = "BS01-031" // デス・ハーデス（紫・バニラ）
    const run = (name: string, cores: number, combined: boolean, bounced: boolean) =>
        sc({
            name,
            start: {
                interactive: true,
                me: { spirits: [{ card: "BS13-030", label: "リーサル", cores }, ...(combined ? [{ card: HYO, label: "ブレイヴ" }] : [])] },
                opp: { spirits: [{ card: PURPLE, label: "紫" }, { card: BULL, label: "青A" }, { card: DOLFINO, label: "青B" }, { card: GREEN_BLOCKER, label: "緑" }] },
            },
            steps(t) {
                if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("リーサル") })
                t.act("me", { type: "nextPhase" })
                t.act("me", { type: "attack", instanceId: t.id("リーサル") })
                answerPicks(t, ["青A"])
                t.closeFlash()
                answerPicks(t, ["青A"])
                t.act("opp", { type: "block", instanceId: t.id("緑") })
                answerPicks(t, ["青A"])
                t.closeFlash()
                answerPicks(t, ["青A"])
            },
            expect: [
                ...(combined ? [...comb("リーサル", cores === 3 ? 7000 : 4000, "ブレイヴ", 3000), "自分.リザーブ: 10 → 11"] : []),
                "自分.リーサル.疲労: false → true",
                "相手.緑.場所: フィールド → なし", `相手.トラッシュ: なし → ${getCard(GREEN_BLOCKER).name}`,
                ...(bounced
                    ? ["相手.紫.場所: フィールド → なし", "相手.青A.場所: フィールド → なし", `相手.手札: なし → ${sorted(PURPLE, BULL)}`, "相手.リザーブ: 10 → 13"]
                    : ["相手.リザーブ: 10 → 11"]),
            ],
        })
    run("lethal-combined-lv2-bounces-purple-and-one-blue", 3, true, true)
    run("lethal-combined-lv1-no-bounce", 1, true, false)
    run("lethal-lv2-not-combined-no-bounce", 3, false, false)
}

console.log("=== BS13-056 ホーク・ブレイカー ===")
{
    const HOST = "BS03-099" // 虎拳士タイガ（青・コスト7・Lv1 BP5000）
    // スピリット状態の間だけ、自分のスピリットすべてに【重装甲：赤】を与える
    sc({
        name: "hawk-grants-red-heavyarmor-while-spirit",
        start: { me: { spirits: [{ card: "BS13-056", label: "ホーク" }, { card: "BS03-099", label: "味方" }] }, opp: { spirits: [{ card: BULL, label: "敵" }] } },
        steps(t) {
            assert(hasHeavyArmorAgainst(t.inst("味方"), ["red"]), "味方は赤の効果を受けない")
            assert(!hasHeavyArmorAgainst(t.inst("味方"), ["blue"]), "味方は青の効果は受ける")
            assert(!hasHeavyArmorAgainst(t.inst("敵"), ["red"]), "相手のスピリットには与えない")
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ホーク"), hostInstanceId: t.id("味方") })
            assert(!hasHeavyArmorAgainst(t.inst("味方"), ["red"]), "合体するとスピリット状態ではないので与えない")
        },
        expect: [...comb("味方", 5000, "ホーク", 7000, 3000), "自分.リザーブ: 10 → 11"],
    })
    // 【合体時】ブロック時：バトルしている相手のスピリットのシンボル1つにつきBP+5000
    const block = (name: string, attacker: string, symbols: number, combined: boolean) =>
        sc({
            name,
            start: { me: { spirits: [{ card: HOST, label: "ホスト" }, { card: "BS13-056", label: "ホーク" }] }, opp: { spirits: [{ card: attacker, label: "攻" }] } },
            steps(t) {
                if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ホーク"), hostInstanceId: t.id("ホスト") })
                t.act("me", { type: "endTurn" })
                t.act("opp", { type: "nextPhase" })
                t.act("opp", { type: "attack", instanceId: t.id("攻") })
                t.closeFlash()
                t.act("me", { type: "block", instanceId: t.id("ホスト") })
            },
            expect: [
                ...(combined ? [...comb("ホスト", 5000, "ホーク", 7000, 3000).slice(0, 3), "自分.リザーブ: 10 → 11"] : []),
                ...OPP_TURN_START, "相手.攻.疲労: false → true", "自分.ホスト.疲労: false → true",
                ...(combined ? [`自分.ホスト.BP: 5000 → ${8000 + 5000 * symbols}`] : []),
            ],
        })
    block("hawk-block-two-symbols", "X008", 2, true)
    block("hawk-block-one-symbol", V, 1, true)
    block("hawk-block-not-combined", V, 1, false)
}

console.log("=== BS13-040 金星神龍ヴィーナ・フェーザー ===")
{
    const HAWK = "BS13-056" // シンボルを持たないブレイヴ（合体BP+3000）
    const run = (name: string, cores: number, combined: boolean, blocked: boolean) =>
        sc({
            name,
            start: { me: { spirits: [{ card: "BS13-040", label: "ヴィーナ", cores }, ...(combined ? [{ card: HAWK, label: "ブレイヴ" }] : [])] }, opp: { spirits: [{ card: BULL, label: "敵" }] } },
            steps(t) {
                if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ヴィーナ") })
                t.act("me", { type: "nextPhase" })
                t.act("me", { type: "attack", instanceId: t.id("ヴィーナ") })
                t.closeFlash()
                if (blocked) t.act("opp", { type: "block", instanceId: t.id("敵") })
                else t.act("opp", { type: "takeLife" })
                t.closeFlash()
            },
            expect: [
                ...(combined ? [...comb("ヴィーナ", cores === 4 ? 8000 : 6000, "ブレイヴ", 7000, 3000), "自分.リザーブ: 10 → 11"] : []),
                "自分.ヴィーナ.疲労: false → true",
                ...(blocked
                    ? ["相手.敵.場所: フィールド → なし", `相手.トラッシュ: なし → ${getCard(BULL).name}`, "相手.リザーブ: 10 → 11", ...(combined && cores === 4 ? ["自分.ライフ: 5 → 6"] : [])]
                    : ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]),
            ],
        })
    run("vena-lv3-combined-blocked-gains-life", 4, true, true)
    run("vena-lv3-combined-unblocked-no-gain", 4, true, false)
    run("vena-lv2-combined-blocked-no-gain", 2, true, true)
    run("vena-lv3-not-combined-blocked-no-gain", 4, false, true)
}

console.log("=== BS13-058 シユウ ===")
{
    const HOST = "BS11-044" // シェル・ゴレム（青・コスト4・Lv1 BP4000・シンボル青）
    const TRASH5 = Array(5).fill(getCard(V).name).join("、")
    const baseLines = (extra: string[]) => [...comb("ホスト", 4000, "ブレイヴ", 5000), "自分.リザーブ: 10 → 11", "自分.ホスト.疲労: false → true", ...extra]
    const milled = ["自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${TRASH5}`, "自分.ライフ: 5 → 6"]
    const start = (oppCard: string, oppCores: number, deckSize = 40) => ({
        me: { spirits: [{ card: HOST, label: "ホスト" }, { card: "BS13-058", label: "ブレイヴ" }], deck: Array(deckSize).fill(V) },
        opp: { spirits: [{ card: oppCard, label: "敵", cores: oppCores }] },
    })
    const go = (t: Ctx) => {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ホスト") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ホスト") })
        t.closeFlash()
    }
    // 山札5枚破棄でライフ+1。Lv1/Lv2の相手のスピリットにはブロックされない
    for (const [cores, lv] of [[1, 1], [3, 2]] as const)
        sc({
            name: `shiyu-unblockable-by-lv${lv}`,
            start: start(BULL, cores),
            steps(t) {
                go(t)
                t.actRejected("opp", { type: "block", instanceId: t.id("敵") })
                t.act("opp", { type: "takeLife" })
            },
            expect: baseLines([...milled, "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12", ...(lv === 2 ? ["相手.敵.コア: 3 → 3"].slice(1) : [])]),
        })
    // Lv3 の相手にはブロックされうる
    sc({
        name: "shiyu-lv3-can-block",
        start: start("BS01-058", 5),
        steps(t) {
            go(t)
            t.act("opp", { type: "block", instanceId: t.id("敵") })
            t.closeFlash()
        },
        expect: baseLines([...milled, "相手.敵.場所: フィールド → なし", "相手.トラッシュ: なし → ヘラクレス・ジオ", "相手.リザーブ: 10 → 15"]),
    })
    // 山札が5枚に満たなければ払えず、何も起きない（Lv1にブロックされうる）
    sc({
        name: "shiyu-deck-too-small-nothing",
        start: start(BULL, 1, 3),
        steps(t) {
            go(t)
            t.act("opp", { type: "block", instanceId: t.id("敵") })
            t.closeFlash()
        },
        expect: baseLines(["相手.敵.場所: フィールド → なし", `相手.トラッシュ: なし → ${getCard(BULL).name}`, "相手.リザーブ: 10 → 11"]),
    })
}

console.log("=== BS13-059 フォビッド・バルチャー ===")
{
    const N = { purple: "SD01-028", green: "BS01-109", blue: "BS13-071", red: "BS14-075" } // 呪われし神殿／風吹く丘陵／巨人港／焔竜の城塞都市
    assert(getCard(N.purple).type === "nexus" && getCard(N.green).type === "nexus" && getCard(N.blue).type === "nexus" && getCard(N.red).type === "nexus", "4枚ともネクサス")
    const placed = (id: string, label: string) => [
        `自分.${label}.場所: なし → ネクサス`, `自分.${label}.疲労: なし → false`, `自分.${label}.コア: なし → 0`, `自分.${label}.Lv: なし → 1`,
    ]
    const fobid = [
        "自分.手札: フォビッド・バルチャー → なし", "自分.トラッシュのコア: 0 → 5", "自分.リザーブ: 10 → 4",
        "自分.フォビッド・バルチャー.BP: なし → 4000", "自分.フォビッド・バルチャー.Lv: なし → 1", "自分.フォビッド・バルチャー.コア: なし → 1",
        "自分.フォビッド・バルチャー.場所: なし → フィールド", "自分.フォビッド・バルチャー.疲労: なし → false",
    ]
    // 紫/緑/青のネクサスカードすべてを、コストを支払わずに配置する（赤は対象外）
    sc({
        name: "fobid-places-all-purple-green-blue-nexus",
        start: { me: { hand: ["BS13-059"], trash: [N.purple, N.green, N.blue, N.red] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [
            ...fobid, `自分.トラッシュ: ${sorted(N.purple, N.green, N.blue, N.red)} → ${getCard(N.red).name}`,
            ...placed(N.purple, "呪われし神殿"), ...placed(N.green, "風吹く丘陵"), ...placed(N.blue, "巨人港"),
        ],
    })
    sc({
        name: "fobid-places-nothing-for-red-only",
        start: { me: { hand: ["BS13-059"], trash: [N.red] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: fobid,
    })
}

console.log("=== BS13-060 トレス・ベルーガ ===")
{
    const HOST = "BS10-X02" // 双魚賊神ピスケガレオン（紫・光導・コスト7・Lv1 BP5000）
    const top = (cards: string[]) => [...cards, ...Array(40 - cards.length).fill(V)]
    const run = (name: string, deck: string[], paid: boolean, recovered: boolean) =>
        sc({
            name,
            start: { me: { spirits: [{ card: HOST, label: "ホスト", rested: false }, { card: "BS13-060", label: "ブレイヴ" }], deck } },
            steps(t) {
                t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ホスト") })
                t.act("me", { type: "nextPhase" })
                t.act("me", { type: "attack", instanceId: t.id("ホスト") })
                t.closeFlash() // 相手のブロック宣言を待つ状態で止める（BP+はこの間の値を見る）
            },
            expect: [
                ...comb("ホスト", 5000, "ブレイヴ", 6000).slice(0, 3), `自分.ホスト.BP: 5000 → ${11000 + (paid ? 6000 : 0)}`, "自分.リザーブ: 10 → 11",
                ...(recovered ? [] : ["自分.ホスト.疲労: false → true"]),
                ...(paid ? ["自分.デッキ枚数: " + deck.length + " → " + (deck.length - 6), `自分.トラッシュ: なし → ${sorted(...deck.slice(0, 6))}`] : []),
            ],
        })
    run("torres-mill6-with-kodo-recovers", top([HOST]), true, true)
    run("torres-mill6-without-kodo-no-recover", top([]), true, false)
    run("torres-deck-5-cannot-pay", Array(5).fill(V), false, false)
}

console.log("=== BS13-049 イリテバン ===")
{
    const ready = (extra: boolean) => ({ me: { spirits: [{ card: "BS13-049", label: "イリテバン" }, ...(extra ? [{ card: HYO, label: "ヒョウ" }] : [])] } })
    sc({
        name: "iriteban-combines-another-brave",
        start: ready(true),
        steps: (t) => t.act("me", { type: "activateAbility", instanceId: t.id("イリテバン"), effectId: "BS13-049-e1" }),
        expect: [...comb("イリテバン", 4000, "ヒョウ", 3000), "自分.リザーブ: 10 → 11"],
    })
    sc({
        name: "iriteban-needs-another-brave",
        start: ready(false),
        steps: (t) => t.actRejected("me", { type: "activateAbility", instanceId: t.id("イリテバン"), effectId: "BS13-049-e1" }),
        expect: [],
    })
    // スピリット状態の間だけ：合体しているイリテバンでは使えない
    sc({
        name: "iriteban-not-while-combined",
        start: { me: { spirits: [{ card: "BS03-099", label: "ホスト" }, { card: "BS13-049", label: "イリテバン" }, { card: HYO, label: "ヒョウ" }] } },
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("イリテバン"), hostInstanceId: t.id("ホスト") })
            t.actRejected("me", { type: "activateAbility", instanceId: t.id("イリテバン"), effectId: "BS13-049-e1" })
        },
        expect: [
            "自分.イリテバン.BP: 4000 → なし", "自分.イリテバン.コア: 1 → 0", "自分.イリテバン.場所: フィールド → 合体", "自分.ホスト.BP: 5000 → 7000", "自分.リザーブ: 10 → 11",
        ],
    })
}

console.log("=== X005A/E/D/T/S 北斗七星龍ジーク・アポロドラゴン ===")
{
    // 合体アタック時：BPを比べ相手のスピリットだけを破壊したとき、相手のスピリット1体を破壊する
    const run = (id: string, cores: number, combined: boolean, blocked: boolean, tag: string) =>
        sc({
            name: `zieg-${id}-${tag}`,
            start: {
                me: { spirits: [{ card: id, label: "ジーク", cores }, ...(combined ? [{ card: HYO, label: "ブレイヴ" }] : [])] },
                opp: { spirits: [{ card: BULL, label: "敵A" }, { card: DOLFINO, label: "敵B" }] },
            },
            steps(t) {
                if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ジーク") })
                t.act("me", { type: "nextPhase" })
                t.act("me", { type: "attack", instanceId: t.id("ジーク") })
                t.closeFlash()
                if (blocked) t.act("opp", { type: "block", instanceId: t.id("敵A") })
                else t.act("opp", { type: "takeLife" })
                t.closeFlash()
            },
            expect: [
                ...(combined ? [...comb("ジーク", cores === 5 ? 11000 : 8000, "ブレイヴ", 3000), "自分.リザーブ: 10 → 11"] : []),
                "自分.ジーク.疲労: false → true",
                ...(blocked
                    ? ["相手.敵A.場所: フィールド → なし", ...(combined && cores === 5 ? ["相手.敵B.場所: フィールド → なし", `相手.トラッシュ: なし → ${sorted(BULL, DOLFINO)}`, "相手.リザーブ: 10 → 12"]
                        : [`相手.トラッシュ: なし → ${getCard(BULL).name}`, "相手.リザーブ: 10 → 11"])]
                    : [`相手.ライフ: 5 → ${combined ? 3 : 4}`, `相手.リザーブ: 10 → ${combined ? 12 : 11}`]),
            ],
        })
    for (const id of ["X005A", "X005E", "X005D", "X005T", "X005S"]) {
        run(id, 5, true, true, "lv3-combined-blocked-destroys-another")
        run(id, 5, true, false, "lv3-combined-unblocked-no-extra")
    }
    run("X005A", 3, true, true, "lv2-no-extra")
    run("X005A", 5, false, true, "not-combined-no-extra")
}

console.log("=== BS13-039 神獣バーロン ===")
{
    const GITSUNE = "BS15-037" // クダギツネン（黄・戯狩・シンボル黄1）
    const OTHER = ["BS02-049", "BS02-051", "BS02-053"] // ピヨン／チュンポポ／妖精ターニャ（黄・戯狩ではない）
    const fieldOf = (gi: number, others: number) => [
        ...Array.from({ length: gi }, (_, i) => ({ card: GITSUNE, label: `戯狩${i + 1}` })),
        ...OTHER.slice(0, others).map((c, i) => ({ card: c, label: `他${i + 1}` })),
    ]
    const run = (name: string, mine: { card: string; label: string }[], oppGitsune: boolean, pay: number) =>
        sc({
            name,
            start: { me: { hand: ["BS13-039"], spirits: mine }, opp: { spirits: oppGitsune ? [{ card: GITSUNE, label: "相手戯狩" }] : [] } },
            steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
            expect: [
                "自分.手札: 神獣バーロン → なし", `自分.トラッシュのコア: 0 → ${pay}`, `自分.リザーブ: 10 → ${10 - pay - 1}`,
                "自分.神獣バーロン.BP: なし → 4000", "自分.神獣バーロン.Lv: なし → 1", "自分.神獣バーロン.コア: なし → 1",
                "自分.神獣バーロン.場所: なし → フィールド", "自分.神獣バーロン.疲労: なし → false",
            ],
        })
    // 黄シンボルは3つ。軽減は[黄][黄]＋戯狩1体につき[黄]1つ
    run("barron-one-gikari-cost-3", fieldOf(1, 2), false, 3)
    run("barron-two-gikari-cost-2", fieldOf(2, 2), false, 2)
    run("barron-no-gikari-cost-4", fieldOf(0, 3), false, 4)
    run("barron-opp-gikari-doesnt-count", fieldOf(0, 3), true, 4)
}

console.log("=== BS13-X04 獅機龍神ストライクヴルム・レオ ===")
{
    for (const [cores, lv] of [[1, 1], [2, 2], [4, 3]] as const)
        sc({
            name: `leo-heavyarmor-lv${lv}`,
            start: { me: { spirits: [{ card: "BS13-X04", label: "レオ", cores }] } },
            steps(t) {
                const i = t.inst("レオ")
                for (const c of ["purple", "green", "white", "yellow"] as const) assert(hasHeavyArmorAgainst(i, [c]), `Lv${lv}: ${c}の効果を受けない`)
                for (const c of ["red", "blue"] as const) assert(!hasHeavyArmorAgainst(i, [c]), `Lv${lv}: ${c}の効果は受ける`)
            },
            expect: [],
        })
}

console.log("=== X007 天地神龍ガイ・アスラ ===")
{
    const HAWK = "BS13-056"
    const run = (name: string, combined: boolean) =>
        sc({
            name,
            start: {
                me: { spirits: [{ card: "X007", label: "ガイ", cores: 3, rested: true }, { card: V, label: "味方", cores: 3 }, ...(combined ? [{ card: HAWK, label: "ブレイヴ" }] : [])] },
                opp: { spirits: [{ card: BULL, label: "敵" }] },
            },
            steps(t) {
                if (combined) t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ガイ") })
                t.act("me", { type: "endTurn" })
                t.act("opp", { type: "nextPhase" })
                t.act("opp", { type: "attack", instanceId: t.id("敵") })
                if (combined) t.act("me", { type: "awaken", instanceId: t.id("ガイ"), fromInstanceId: t.id("味方"), count: 2 })
                else t.actRejected("me", { type: "awaken", instanceId: t.id("ガイ"), fromInstanceId: t.id("味方"), count: 2 })
                t.closeFlash()
                t.act("me", { type: "takeLife" })
            },
            expect: [
                ...(combined ? comb("ガイ", 12000, "ブレイヴ", 7000, 3000).slice(0, 3) : []),
                ...OPP_TURN_START, "相手.敵.疲労: false → true", "自分.ライフ: 5 → 4", `自分.リザーブ: 10 → ${combined ? 12 : 11}`,
                ...(combined
                    ? ["自分.ガイ.コア: 3 → 5", "自分.ガイ.Lv: 2 → 3", "自分.ガイ.BP: 12000 → 19000", "自分.ガイ.疲労: true → false", "自分.味方.コア: 3 → 1", "自分.味方.Lv: 3 → 1", "自分.味方.BP: 4000 → 1000"]
                    : []),
            ],
        })
    run("x007-super-awaken-recovers-when-combined", true)
    run("x007-no-awaken-when-not-combined", false)
}

console.log("=== BS13-027 ムーンショウウオ ===")
{
    const run = (name: string, moonCores: number, blocked: boolean) =>
        sc({
            name,
            start: {
                interactive: true,
                turn: "opp",
                me: { spirits: [{ card: "BS13-027", label: "ムーン", cores: moonCores }, { card: BULL, label: "壁" }] },
                opp: { spirits: [{ card: "BS07-026", label: "攻", cores: 1 }] },
            },
            steps(t) {
                t.act("opp", { type: "nextPhase" })
                // ステップ開始時の「手札に戻すことで」は使わない
                if (t.state.pendingChoice) t.act("me", { type: "resolveChoice" })
                t.act("opp", { type: "attack", instanceId: t.id("攻") })
                t.closeFlash()
                if (blocked) t.act("me", { type: "block", instanceId: t.id("壁") })
                else t.act("me", { type: "takeLife" })
                t.closeFlash()
            },
            expect: blocked
                ? [
                    "相手.攻.疲労: false → true", "自分.壁.場所: フィールド → なし", `自分.トラッシュ: なし → ${getCard(BULL).name}`,
                    ...(moonCores >= 3 ? ["自分.リザーブ: 10 → 11"] : ["自分.リザーブ: 10 → 12", "自分.ライフ: 5 → 4"]),
                ]
                : ["相手.攻.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
        })
    // 相手のスピリットの効果（マツノアラシがバトルに勝ったときの効果）では、Lv2のムーンのライフは減らない
    run("moon-lv2-spirit-effect-cant-reduce-life", 3, true)
    run("moon-lv1-spirit-effect-reduces-life", 1, true)
    // アタックそのもの（効果ではない）によるライフ減少は防がない
    run("moon-lv2-attack-damage-still-applies", 3, false)
}

console.log("=== BS13-034 ミノガメン ===")
{
    const MINO = "BS13-034"
    const run = (name: string, summon: boolean) =>
        sc({
            name,
            start: {
                interactive: true,
                turn: "opp",
                me: { deck: [MINO, ...Array(39).fill(V)] },
                opp: { spirits: [{ card: "BS03-076", label: "攻", cores: 2 }] }, // 爪剣のラザラス Lv2：相手のデッキを上から2枚破棄
            },
            steps(t) {
                t.act("opp", { type: "nextPhase" })
                t.act("opp", { type: "attack", instanceId: t.id("攻") })
                assert(t.state.pendingChoice?.pid === t.me, `${name}: 召喚するかは自分に聞く`)
                if (summon) t.act("me", { type: "resolveChoice", option: "召喚する" })
                else t.act("me", { type: "resolveChoice" })
                t.closeFlash()
                t.act("me", { type: "takeLife" })
            },
            // 召喚時の確認に答えたあと「このターンの間、自分のデッキは破棄されない」ので、2枚目は破棄されない（デッキは1枚だけ減る）
            expect: [
                "相手.攻.疲労: false → true", "自分.デッキ枚数: 40 → 39", "自分.ライフ: 5 → 4",
                ...(summon
                    ? ["自分.ミノガメン.BP: なし → 1000", "自分.ミノガメン.Lv: なし → 1", "自分.ミノガメン.コア: なし → 1", "自分.ミノガメン.場所: なし → フィールド", "自分.ミノガメン.疲労: なし → false"]
                    : ["自分.トラッシュ: なし → ミノガメン", "自分.リザーブ: 10 → 11"]),
            ],
        })
    run("mino-opp-mill-summon-free", true)
    run("mino-opp-mill-declined-stays-in-trash", false)
    // 自分の効果（トレス・ベルーガのコスト）で破棄された場合は、召喚の確認も出ず、デッキも守られない
    sc({
        name: "mino-own-mill-no-summon",
        start: { interactive: true, me: { spirits: [{ card: "BS10-X02", label: "ホスト" }, { card: "BS13-060", label: "ブレイヴ" }], deck: [MINO, ...Array(39).fill(V)] } },
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("ブレイヴ"), hostInstanceId: t.id("ホスト") })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("ホスト") })
            // トレスの発動確認に答える。そのあとにミノガメンの確認が出てはいけない
            if (t.state.pendingChoice) t.act("me", { type: "resolveChoice", option: t.state.pendingChoice.options?.[0] ?? "" })
            assert(!t.state.pendingChoice, "自分の効果で破棄しても召喚の確認は出ない")
        },
        expect: [
            ...comb("ホスト", 5000, "ブレイヴ", 6000).slice(0, 3), "自分.ホスト.BP: 5000 → 17000", "自分.リザーブ: 10 → 11", "自分.ホスト.疲労: false → true",
            "自分.デッキ枚数: 40 → 34", `自分.トラッシュ: なし → ${sorted(MINO, ...Array(5).fill(V))}`,
        ],
        mirror: false,
    })
}
console.log("すべてのチェックに合格しました 🎉（part601）")
