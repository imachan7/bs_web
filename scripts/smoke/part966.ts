// smoke パート966（#579・#582：アタック中の無色は継続効果 kind:"colorlessGrant"。宣言の時点から立ち、指定アタックの装甲判定にも効く）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioSpec } from "./scenario"
import { instColors } from "../../shared/rules/level"
import { matchesDirectedAttackFilter } from "../../shared/block"
import { directAttackFilter } from "../../shared/rules/activation"
import type { DirectAttackFilter } from "../../shared/rules/activation"

const HYDRA = "BS21-016" // デス・ヒュードラ（紫・コスト5・コア3でLv3）
const GLIDER = "BS13-052" // イビルグライダー（紫ブレイヴ・合体条件 コスト3以上）
const HOST3 = "BS04-066" // 猫人アビシニア（青・コスト3）
const MATAMATA = "BS22-030" // 透輝亀マタマタ（白・【重装甲：紫】）
const CANVAS = "BS11-063" // 終末描かれしキャンバス（紫ネクサス。Lv2で合体スピリットの指定アタック）
const HAGEN = "BS13-015" // 冥総裁ハーゲン（紫・Lv2で【呪撃】【不死】の色を無くす）
const CURSE = "BS05-011" // レッドキャップ（紫・【呪撃】）
const X08 = "BS23-X08" // 紫電の霊剣ライトニング・シオン（紫ブレイヴ・合体条件 コスト5以上）

const names: Record<string, string> = {
    [HYDRA]: "デス・ヒュードラ", [GLIDER]: "イビルグライダー", [HOST3]: "猫人アビシニア", [MATAMATA]: "透輝亀マタマタ",
    [CANVAS]: "終末描かれしキャンバス", [HAGEN]: "冥総裁ハーゲン", [CURSE]: "レッドキャップ",
}
for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id} は ${n}`)
assert(getCard(X08).name.startsWith("紫電の霊剣"), "BS23-X08 は紫電の霊剣")

function sc(spec: ScenarioSpec): void {
    scenario(spec)
}

console.log("=== A #579: 無色はアタック宣言の時点から立ち、アタック時の誘発に並ばない（デス・ヒュードラのコア除去で確かめる） ===")
sc({
    name: "glider-hydra-attack-colorless-no-choice",
    start: {
        me: { spirits: [{ card: HYDRA, label: "ヒュー", cores: 3 }, { card: GLIDER, label: "グライダー" }] },
        opp: { spirits: [{ card: MATAMATA, label: "マタマタ", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("グライダー"), hostInstanceId: t.id("ヒュー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ヒュー") })
        assert(instColors(t.inst("ヒュー")).length === 0, "アタック中の合体スピリットは色が無い（宣言の時点から）")
        assert(t.state.pendingChoice === null, "解決順の選択は出ない（無色化は誘発ではない）")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.グライダー.BP: 4000 → なし", "自分.グライダー.コア: 1 → 0", "自分.グライダー.場所: フィールド → 合体",
        "自分.ヒュー.BP: 6000 → 11000", "自分.ヒュー.Lv: 2 → 3", "自分.ヒュー.コア: 3 → 4", "自分.ヒュー.疲労: false → true",
        "相手.マタマタ.BP: 4000 → 2000", "相手.マタマタ.Lv: 2 → 1", "相手.マタマタ.コア: 2 → 1",
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== B #582: 無色の指定アタッカーは【重装甲：紫】の相手を指定できる（紫のままなら阻まれる） ===")
sc({
    name: "glider-directed-attack-past-heavy-armor",
    start: {
        me: { nexuses: [{ card: CANVAS, label: "キャンバス", cores: 3 }], spirits: [{ card: HOST3, label: "ホスト", cores: 3 }, { card: GLIDER, label: "グライダー" }] },
        opp: { spirits: [{ card: MATAMATA, label: "マタマタ", cores: 2, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("グライダー"), hostInstanceId: t.id("ホスト") })
        t.act("me", { type: "nextPhase" })
        // canDirectAttack はアタックステップの自分のターンに付く（キャンバスの constraintGrant の phaseTurn）
        const host = t.inst("ホスト")
        const filter = directAttackFilter(t.state, t.me, host)
        assert(filter !== null, "キャンバスのLv2で合体スピリットに指定アタックが付く")
        assert(matchesDirectedAttackFilter(filter!, t.inst("マタマタ"), t.state, t.opp, { pid: t.me, inst: host }) === null, "無色の指定アタッカーはマタマタを指定できる（装甲の判定に紫が残らない）")
        t.act("me", { type: "attack", instanceId: host.instanceId, targetSpiritInstanceId: t.id("マタマタ") })
    },
    expect: [
        "自分.グライダー.BP: 4000 → なし", "自分.グライダー.コア: 1 → 0", "自分.グライダー.場所: フィールド → 合体",
        "自分.ホスト.BP: 3000 → 10000", "自分.ホスト.Lv: 1 → 2", "自分.ホスト.コア: 3 → 4", "自分.ホスト.疲労: false → true",
    ],
})

console.log("=== B 対照: 紫のまま（無色でない）アタッカーは【重装甲：紫】に阻まれる ===")
sc({
    name: "purple-attacker-blocked-by-heavy-armor",
    start: {
        me: { spirits: [{ card: HYDRA, label: "紫", cores: 3 }] },
        opp: { spirits: [{ card: MATAMATA, label: "マタマタ", cores: 2, rested: true }] },
    },
    steps(t) {
        const filter: DirectAttackFilter = { targetFilter: "rested" }
        assert(matchesDirectedAttackFilter(filter, t.inst("マタマタ"), t.state, t.opp, { pid: t.me, inst: t.inst("紫") }) !== null, "紫のスピリットはマタマタを指定できない（重装甲：紫）")
    },
    expect: [],
})

console.log("=== C: バトルが終わったら色が戻る。アタックしていない合体スピリットは最初から色がある ===")
sc({
    name: "glider-color-returns-after-battle",
    start: {
        me: {
            spirits: [
                { card: HYDRA, label: "ヒュー", cores: 3 },
                { card: GLIDER, label: "グライダー" },
                { card: HYDRA, label: "待機", cores: 3 },
                { card: X08, label: "待機ブレイヴ" },
            ],
        },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("グライダー"), hostInstanceId: t.id("ヒュー") })
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("待機ブレイヴ"), hostInstanceId: t.id("待機") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ヒュー") })
        assert(instColors(t.inst("待機")).includes("purple"), "アタックしていない合体スピリットは紫のまま")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        assert(instColors(t.inst("ヒュー")).includes("purple"), "バトル終了後、アタックしていた合体スピリットの色が戻る")
    },
    expect: [
        "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11",
        "自分.グライダー.BP: 4000 → なし", "自分.グライダー.コア: 1 → 0", "自分.グライダー.場所: フィールド → 合体",
        "自分.ヒュー.BP: 6000 → 11000", "自分.ヒュー.Lv: 2 → 3", "自分.ヒュー.コア: 3 → 4", "自分.ヒュー.疲労: false → true",
        "自分.待機.BP: 6000 → 12000", "自分.待機.Lv: 2 → 3", "自分.待機.コア: 3 → 4",
        "自分.待機ブレイヴ.BP: 5000 → なし", "自分.待機ブレイヴ.コア: 1 → 0", "自分.待機ブレイヴ.場所: フィールド → 合体",
    ],
})

console.log("=== D 冥総裁ハーゲン Lv2: アタックしている【呪撃】持ちだけ無色。アタックしていない【呪撃】持ちは色がある ===")
sc({
    name: "hagen-only-attacking-curse-colorless",
    start: {
        me: {
            spirits: [
                { card: HAGEN, label: "ハーゲン", cores: 4 },
                { card: CURSE, label: "攻" },
                { card: CURSE, label: "待機" },
            ],
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("攻") })
        assert(instColors(t.inst("攻")).length === 0, "アタックしている【呪撃】持ちは無色")
        assert(instColors(t.inst("待機")).includes("purple"), "アタックしていない【呪撃】持ちは紫のまま")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.攻.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part966）")
