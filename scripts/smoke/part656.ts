// smoke パート656（BS18 赤の場面テスト：効果文だけから先に書いた期待値）
// 担当：BS18-001〜009・055・061・062・073・074・X01・X021・X022（BS18-007 は効果文なし）。
// 選択待ちの答え方（yes/no/対象/カード番号）の順序は、盤面の差分とは別に推定で書いてある。
import { assert, currentLevel, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const MAIPA = "BS06-029" // メイパロット（緑・コスト3）召喚時にボイドからコアを自分のスピリットへ
const GATHER = "BS01-136" // ギャザーフォース（緑マジック・コスト3）メイン：ボイドからリザーブへ
const STON = "BS03-073" // ストン・スタチュー（青・コスト1）召喚時に相手のデッキを1枚破棄
const VIERGE = "BS12-X05" // 戦神乙女ヴィエルジェ（黄・コスト6）召喚時にボイドからライフへ
const ANT = "BS05-024" // 用心棒アントマン（緑・コスト4・BP5000・バニラ）
const DRAW = "BS15-076" // 妖華吸血爪（紫マジック）バースト：自分のライフ減少後に2枚ドロー
const BSET = "BS14-099" // 武迅衝（緑マジック・コスト2）バースト効果を持つ
const LIGHT = "BS14-092" // 烈光閃刃（赤マジック）バースト：自分のライフ減少後
const FEN = "BS17-002" // フェンサー・ドラゴン（赤・コスト3・系統戦竜）
const RAZ = "BS03-076" // 爪剣のラザラス（青・コスト2）【粉砕】
const FORT = "BS03-068" // フォルトロス（黄・コスト7・バニラ・BP5000）
const ARDER = "BS17-073" // アーダーフレイム（赤マジック・コスト4）フラッシュ：BP4000以下の相手のスピリット1体を破壊
const CHAIN = "BS02-099" // ライフチェイン（緑マジック・コスト5）フラッシュ：自分のスピリット1体を破壊
const LD1 = "SD06-007" // 英雄龍ロード・ドラゴン（赤・コスト6）
const DESTRO = "BS02-X06" // 魔界七将デストロード（紫・コスト7）召喚時効果はLv1だけ。Lv2はコア6個
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3）召喚時に1枚ドロー
const LD2 = "BS16-X01" // 爆炎の覇王ロード・ドラゴン・バゼル（赤・コスト7）

const TERI = "BS18-001"
const SHISHINGA = "BS18-002"
const ASSASSIN = "BS18-003"
const BASA = "BS18-004"
const SHISHINGINI = "BS18-005"
const GUNNER = "BS18-006"
const MONK = "BS18-008"
const HANU = "BS18-009"
const DRAKE = "BS18-055"
const SEKIHI = "BS18-061"
const SANCHO = "BS18-062"
const HEROIC = "BS18-073"
const KYUSEI = "BS18-074"
const SABER = "BS18-X01"
const INTI = "X021"
const WORLD = "X022"

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string, string][] = [
        [ROKU, "ロクケラトプス", "spirit"], [MAIPA, "メイパロット", "spirit"], [GATHER, "ギャザーフォース", "magic"],
        [STON, "ストン・スタチュー", "spirit"], [VIERGE, "戦神乙女ヴィエルジェ", "spirit"], [ANT, "用心棒アントマン", "spirit"],
        [DRAW, "妖華吸血爪", "magic"], [BSET, "武迅衝", "magic"], [LIGHT, "烈光閃刃", "magic"], [FEN, "フェンサー・ドラゴン", "spirit"],
        [RAZ, "爪剣のラザラス", "spirit"], [FORT, "フォルトロス", "spirit"], [ARDER, "アーダーフレイム", "magic"], [CHAIN, "ライフチェイン", "magic"],
        [LD1, "英雄龍ロード・ドラゴン", "spirit"], [DESTRO, "魔界七将デストロード", "spirit"], [GRIP, "グリプ・ハンズ", "spirit"], [LD2, "爆炎の覇王ロード・ドラゴン・バゼル", "spirit"],
        [TERI, "テリジーノ", "spirit"], [SHISHINGA, "守獣シシンガ", "spirit"], [ASSASSIN, "アサシン・ドラゴン", "spirit"],
        [BASA, "バサ・ラザン", "spirit"], [SHISHINGINI, "護獣シシンギニ", "spirit"], [GUNNER, "ガンナー・ドラゴン", "spirit"],
        [MONK, "モンク・ドラゴン", "spirit"], [HANU, "炎の覇獣ハヌ・マーグ", "spirit"], [DRAKE, "ドレイク・バヤー", "brave"],
        [SEKIHI, "戦史の石碑", "nexus"], [SANCHO, "最も高き山頂", "nexus"], [HEROIC, "ヒロイックエントリー", "magic"],
        [KYUSEI, "救世神撃覇", "magic"], [SABER, "超覇王ロード・ドラゴン・セイバー", "spirit"],
        [INTI, "黄金の覇王ロード・ドラゴン・インティ", "spirit"], [WORLD, "覇王ロード・ドラゴン・ザ・ワールド", "spirit"],
    ]
    for (const [id, name, type] of names) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}（${type}）`)
    const costs: [string, number][] = [
        [ROKU, 1], [MAIPA, 3], [GATHER, 3], [STON, 1], [VIERGE, 6], [ANT, 4], [DRAW, 5], [BSET, 2], [LIGHT, 4], [FEN, 3], [FORT, 7],
        [DESTRO, 7], [GRIP, 3], [ARDER, 4], [CHAIN, 5], [LD1, 6], [HANU, 7], [DRAKE, 4], [HEROIC, 4], [KYUSEI, 4], [SABER, 10], [INTI, 8], [WORLD, 9],
    ]
    for (const [id, c] of costs) assert(getCard(id).cost === c, `${id} のコストは ${c}`)
}

type Ans = "yes" | "no" | { id: string } | { opt: string } | { card: number }

function pc(t: ScenarioCtx) {
    const p = t.state.pendingChoice
    assert(p !== null, "選択待ちがあるはず")
    return p!
}

// yes＝確認の唯一の選択肢／no＝スキップ（選ばない）／id＝対象／card＝カードの番号
function ans(t: ScenarioCtx, a: Ans): void {
    const p = pc(t)
    const side = p.pid === t.me ? "me" : "opp"
    if (a === "yes") t.act(side, { type: "resolveChoice", option: p.options![0]! })
    else if (a === "no") t.act(side, { type: "resolveChoice" })
    else if ("id" in a) t.act(side, { type: "resolveChoice", instanceId: t.id(a.id) })
    else if ("opt" in a) t.act(side, { type: "resolveChoice", option: a.opt })
    else t.act(side, { type: "resolveChoice", cardIndex: a.card })
}

function go(t: ScenarioCtx, ...as: Ans[]): void {
    for (const a of as) ans(t, a)
}

function noChoice(t: ScenarioCtx, msg: string): void {
    assert(t.state.pendingChoice === null, msg)
}

// 「好きなだけ」の選び終え（スキップが確定を意味する選択待ちだけを閉じる）
function finishSelect(t: ScenarioCtx): void {
    if (t.state.pendingChoice?.skipLabel) ans(t, "no")
}

const nm = (...ids: string[]) => ids.map((i) => getCard(i).name).sort().join("、") || "なし"

// 場面の途中で現れた個体の写像
function appear(prefix: string, bp: number, lv: number, cores: number): string[] {
    return [`${prefix}.BP: なし → ${bp}`, `${prefix}.Lv: なし → ${lv}`, `${prefix}.コア: なし → ${cores}`, `${prefix}.場所: なし → フィールド`, `${prefix}.疲労: なし → false`]
}

const gone = (prefix: string, zone = "フィールド") => `${prefix}.場所: ${zone} → なし`

function attackOpp(t: ScenarioCtx, label: string): void {
    t.act("me", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}

function oppAttacksMe(t: ScenarioCtx, label: string): void {
    t.act("opp", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}

// 自分のアタックが相手のブロックを受けてバトル終了まで進む
function attackBlocked(t: ScenarioCtx, attacker: string, blocker: string): void {
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}

// 相手のアタックを自分がブロックしてバトル終了まで進む
function oppAttackBlocked(t: ScenarioCtx, attacker: string, blocker: string): void {
    t.act("opp", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}

// 妖華吸血爪のバーストが相手のアタックで発動し、後半の支払いを断った盤面の変化（自分側のライフ5・リザーブ10から）
const burstDrawLines = [
    "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", `自分.手札: なし → ${nm(ROKU, ROKU)}`, "自分.デッキ枚数: 40 → 38",
    `自分.バースト: ${getCard(DRAW).name} → なし`, `自分.トラッシュ: なし → ${getCard(DRAW).name}`, "相手.用心棒アントマン.疲労: false → true",
]

// ───────── BS18-001 テリジーノ ─────────
console.log("=== 001 テリジーノ ===")
{
    const base = { turn: "opp" as const, interactive: true, me: { spirits: [{ card: TERI }] } }
    scenario({
        name: "teri-yes",
        start: { ...base, opp: { hand: [MAIPA] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            ans(t, "yes")
            noChoice(t, "選択待ちは残らない")
        },
        expect: [
            "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 3", `相手.手札: ${getCard(MAIPA).name} → なし`,
            `相手.トラッシュ: なし → ${getCard(MAIPA).name}`, "自分.テリジーノ.疲労: false → true",
        ],
    })
    scenario({
        name: "teri-no",
        start: { ...base, opp: { hand: [MAIPA] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            ans(t, "no")
        },
        expect: [
            "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 3", `相手.手札: ${getCard(MAIPA).name} → なし`,
            ...appear("相手.メイパロット", 3000, 2, 2),
        ],
    })
    scenario({
        name: "teri-life",
        start: { ...base, opp: { hand: [VIERGE] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            ans(t, "yes")
        },
        expect: [
            "相手.ライフ: 5 → 6", "相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 6", `相手.手札: ${getCard(VIERGE).name} → なし`,
            `相手.トラッシュ: なし → ${getCard(VIERGE).name}`, "自分.テリジーノ.疲労: false → true",
        ],
    })
    scenario({
        name: "teri-magic",
        start: { ...base, opp: { hand: [GATHER] } },
        steps(t) {
            t.act("opp", { type: "castMagic", handIndex: 0 })
            noChoice(t, "マジックの効果ではテリジーノは誘発しない")
        },
        expect: [
            "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 3", `相手.手札: ${getCard(GATHER).name} → なし`,
            `相手.トラッシュ: なし → ${getCard(GATHER).name}`,
        ],
    })
    scenario({
        name: "teri-rested",
        start: { ...base, me: { spirits: [{ card: TERI, rested: true }] }, opp: { hand: [MAIPA] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            noChoice(t, "疲労済みなら支払えないので確認は出ない")
        },
        expect: ["相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 3", `相手.手札: ${getCard(MAIPA).name} → なし`, ...appear("相手.メイパロット", 3000, 2, 2)],
    })
    scenario({
        name: "teri-own-turn",
        start: { turn: "me", interactive: true, me: { hand: [MAIPA], spirits: [{ card: TERI }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            noChoice(t, "自分のターン・自分のスピリットの効果では誘発しない")
        },
        expect: ["自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${getCard(MAIPA).name} → なし`, ...appear("自分.メイパロット", 3000, 2, 2)],
    })
}

// ───────── BS18-002 守獣シシンガ ─────────
console.log("=== 002 守獣シシンガ ===")
{
    const stonSummonMe = ["自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", `自分.手札: ${getCard(STON).name} → なし`, ...appear("自分.ストン・スタチュー", 2000, 1, 1)]
    scenario({
        name: "shishinga-mill-mine",
        start: { me: { hand: [STON], spirits: [{ card: SHISHINGA }, { card: ROKU }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: stonSummonMe,
    })
    scenario({
        name: "shishinga-mill-control",
        start: { me: { hand: [STON], spirits: [{ card: ROKU }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [...stonSummonMe, "相手.デッキ枚数: 40 → 39", `相手.トラッシュ: なし → ${getCard(ROKU).name}`],
    })
    scenario({
        name: "shishinga-mill-opp-effect",
        start: { turn: "opp", me: { spirits: [{ card: SHISHINGA }, { card: ROKU }] }, opp: { hand: [STON] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
        },
        expect: ["相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", `相手.手札: ${getCard(STON).name} → なし`, ...appear("相手.ストン・スタチュー", 2000, 1, 1)],
    })
    scenario({
        name: "shishinga-on-opp-field",
        start: { me: { hand: [STON], spirits: [{ card: ROKU }] }, opp: { spirits: [{ card: SHISHINGA }, { card: ROKU }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: stonSummonMe,
    })
    scenario({
        name: "shishinga-crush",
        start: { phase: "attack", me: { spirits: [{ card: SHISHINGA }, { card: RAZ }] } },
        steps(t) {
            attackOpp(t, "爪剣のラザラス")
        },
        expect: ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "自分.爪剣のラザラス.疲労: false → true"],
    })
    scenario({
        name: "shishinga-lv3-alone",
        start: { me: { hand: [ROKU], spirits: [{ card: SHISHINGA }] }, opp: { spirits: [{ card: ROKU, label: "a" }, { card: ROKU, label: "b" }, { card: ROKU, label: "c" }] } },
        steps(t) {
            const s = t.inst("守獣シシンガ")
            assert(currentLevel(s).level === 3 && effectiveBp(t.state, t.me, s) === 6000, "自分のスピリットが1体（相手の数は無関係）ならLv3として扱う")
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [
            "自分.守獣シシンガ.BP: 6000 → 2000", "自分.守獣シシンガ.Lv: 3 → 1", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1",
            `自分.手札: ${getCard(ROKU).name} → なし`, ...appear("自分.ロクケラトプス", 1000, 1, 1),
        ],
    })
}

// ───────── BS18-003 アサシン・ドラゴン ─────────
console.log("=== 003 アサシン・ドラゴン ===")
{
    scenario({
        name: "assassin-mill",
        start: { turn: "opp", me: { spirits: [{ card: ASSASSIN }] }, opp: { hand: [STON] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
        },
        expect: ["相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", `相手.手札: ${getCard(STON).name} → なし`, ...appear("相手.ストン・スタチュー", 2000, 1, 1)],
    })
    scenario({
        name: "assassin-bp-lv1",
        start: { phase: "attack", me: { spirits: [{ card: ASSASSIN }] } },
        steps(t) {
            attackOpp(t, "アサシン・ドラゴン")
        },
        expect: ["自分.アサシン・ドラゴン.疲労: false → true", "自分.アサシン・ドラゴン.BP: 3000 → 6000", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    const lv2 = { phase: "attack" as const, interactive: true }
    scenario({
        name: "assassin-designate",
        start: { ...lv2, me: { spirits: [{ card: ASSASSIN, cores: 2 }] }, opp: { spirits: [{ card: MAIPA }, { card: ROKU, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("アサシン・ドラゴン") })
            const p = pc(t)
            assert(p.candidates.includes(t.id("メイパロット")) && !p.candidates.includes(t.id("ロクケラトプス")), "指定できるのは召喚時効果を持つ相手のスピリットだけ")
            ans(t, { id: "メイパロット" })
            t.closeFlash()
        },
        expect: [
            "自分.アサシン・ドラゴン.疲労: false → true", "自分.アサシン・ドラゴン.BP: 4000 → 7000", gone("相手.メイパロット"),
            "相手.リザーブ: 10 → 11", `相手.トラッシュ: なし → ${getCard(MAIPA).name}`,
        ],
    })
    scenario({
        name: "assassin-designate-declined",
        start: { ...lv2, me: { spirits: [{ card: ASSASSIN, cores: 2 }] }, opp: { spirits: [{ card: MAIPA }, { card: ROKU, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("アサシン・ドラゴン") })
            ans(t, "no")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.アサシン・ドラゴン.疲労: false → true", "自分.アサシン・ドラゴン.BP: 4000 → 7000", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "assassin-lv1-cannot-designate",
        start: { ...lv2, me: { spirits: [{ card: ASSASSIN, cores: 1 }] }, opp: { spirits: [{ card: MAIPA, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("アサシン・ドラゴン") })
            noChoice(t, "Lv1 は指定できない")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.アサシン・ドラゴン.疲労: false → true", "自分.アサシン・ドラゴン.BP: 3000 → 6000", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "assassin-no-summon-effect-target",
        start: { ...lv2, me: { spirits: [{ card: ASSASSIN, cores: 2 }] }, opp: { spirits: [{ card: ROKU, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("アサシン・ドラゴン") })
            noChoice(t, "召喚時効果を持つ相手のスピリットがいなければ指定できない")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.アサシン・ドラゴン.疲労: false → true", "自分.アサシン・ドラゴン.BP: 4000 → 7000", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

// ───────── 003 追加：指定できるのは現在Lvで有効な召喚時効果（2026-10-23 確認）─────────
console.log("=== 003 現在Lvで有効な召喚時効果 ===")
{
    const lv2 = { phase: "attack" as const, interactive: true }
    scenario({
        name: "assassin-designate-destro-lv1",
        start: { ...lv2, me: { spirits: [{ card: ASSASSIN, cores: 2 }] }, opp: { spirits: [{ card: DESTRO, cores: 1 }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("アサシン・ドラゴン") })
            const p = pc(t)
            assert(p.candidates.includes(t.id("魔界七将デストロード")), "Lv1 のデストロードは召喚時効果が有効なので指定できる")
            ans(t, { id: "魔界七将デストロード" })
            t.closeFlash()
        },
        expect: [
            "自分.アサシン・ドラゴン.疲労: false → true", "自分.アサシン・ドラゴン.BP: 4000 → 7000", gone("相手.魔界七将デストロード"),
            "相手.リザーブ: 10 → 11", `相手.トラッシュ: なし → ${getCard(DESTRO).name}`,
        ],
    })
    scenario({
        name: "assassin-designate-destro-lv2",
        start: { ...lv2, me: { spirits: [{ card: ASSASSIN, cores: 2 }] }, opp: { spirits: [{ card: DESTRO, cores: 6, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("アサシン・ドラゴン") })
            noChoice(t, "Lv2 のデストロードに召喚時効果は無いので指定できない")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: ["自分.アサシン・ドラゴン.疲労: false → true", "自分.アサシン・ドラゴン.BP: 4000 → 7000", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

// ───────── BS18-004 バサ・ラザン ─────────
console.log("=== 004 バサ・ラザン ===")
{
    scenario({
        name: "basa-own-attack-step",
        start: { me: { spirits: [{ card: BASA }, { card: SHISHINGA }, { card: ROKU }] } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
        },
        expect: ["自分.バサ・ラザン.BP: 2000 → 4000"],
    })
    scenario({
        name: "basa-opp-kojuu-not-counted",
        start: { me: { spirits: [{ card: BASA }] }, opp: { spirits: [{ card: SHISHINGA }, { card: ROKU }] } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
        },
        expect: ["自分.バサ・ラザン.BP: 2000 → 3000"],
    })
    scenario({
        name: "basa-opp-attack-step",
        start: { turn: "opp", me: { spirits: [{ card: BASA }, { card: SHISHINGA }, { card: ROKU }] } },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
        },
        expect: [],
    })
}

// ───────── BS18-005 護獣シシンギニ ─────────
console.log("=== 005 護獣シシンギニ ===")
{
    scenario({
        name: "shishingini-mill-and-lv",
        start: { me: { hand: [STON], spirits: [{ card: SHISHINGINI }, { card: ROKU }] }, opp: { spirits: [{ card: ROKU, label: "a" }, { card: ROKU, label: "b" }, { card: ROKU, label: "c" }] } },
        steps(t) {
            const g = t.inst("護獣シシンギニ")
            assert(currentLevel(g).level === 3 && effectiveBp(t.state, t.me, g) === 7000, "自分のスピリットが2体以下（相手の数は無関係）ならLv3として扱う")
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [
            "自分.護獣シシンギニ.BP: 7000 → 3000", "自分.護獣シシンギニ.Lv: 3 → 1", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1",
            `自分.手札: ${getCard(STON).name} → なし`, ...appear("自分.ストン・スタチュー", 2000, 1, 1),
        ],
    })
    scenario({
        name: "shishingini-mill-opp-effect",
        start: { turn: "opp", me: { spirits: [{ card: SHISHINGINI }] }, opp: { hand: [STON] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
        },
        expect: ["相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", `相手.手札: ${getCard(STON).name} → なし`, ...appear("相手.ストン・スタチュー", 2000, 1, 1)],
    })
}

// ───────── BS18-006 ガンナー・ドラゴン ─────────
console.log("=== 006 ガンナー・ドラゴン ===")
{
    const atk = { phase: "attack" as const, interactive: true }
    const blockedLines = ["自分.ガンナー・ドラゴン.疲労: false → true", gone("相手.R"), `相手.トラッシュ: なし → ${getCard(ROKU).name}`, "相手.リザーブ: 10 → 11"]
    scenario({
        name: "gunner-set-burst",
        start: { ...atk, me: { hand: [BSET, ROKU], spirits: [{ card: GUNNER }] }, opp: { spirits: [{ card: ROKU, label: "R" }] } },
        steps(t) {
            attackBlocked(t, "ガンナー・ドラゴン", "R")
            const p = pc(t)
            const idx = p.cardIndices?.[0] ?? -1
            assert(p.cardIndices?.length === 1 && getCard(t.state.players[t.me].hand[idx]!).name === "武迅衝", "セットできるのはバースト効果を持つカードだけ")
            ans(t, { card: idx })
        },
        expect: [...blockedLines, `自分.手札: ${nm(ROKU, BSET)} → ${nm(ROKU)}`, `自分.バースト: なし → ${getCard(BSET).name}`],
    })
    scenario({
        name: "gunner-burst-already-set",
        start: { ...atk, me: { hand: [BSET], burst: LIGHT, spirits: [{ card: GUNNER }] }, opp: { spirits: [{ card: ROKU, label: "R" }] } },
        steps(t) {
            attackBlocked(t, "ガンナー・ドラゴン", "R")
            noChoice(t, "バーストがセットされていればセットできない")
        },
        expect: blockedLines,
    })
    scenario({
        name: "gunner-set-declined",
        start: { ...atk, me: { hand: [BSET], spirits: [{ card: GUNNER }] }, opp: { spirits: [{ card: ROKU, label: "R" }] } },
        steps(t) {
            attackBlocked(t, "ガンナー・ドラゴン", "R")
            ans(t, "no")
        },
        expect: blockedLines,
    })
    scenario({
        name: "gunner-other-senryu",
        start: { ...atk, me: { hand: [BSET], spirits: [{ card: GUNNER }, { card: FEN }] }, opp: { spirits: [{ card: ROKU, label: "R" }] } },
        steps(t) {
            attackBlocked(t, "フェンサー・ドラゴン", "R")
            ans(t, { card: 0 })
        },
        expect: [
            "自分.フェンサー・ドラゴン.疲労: false → true", gone("相手.R"), `相手.トラッシュ: なし → ${getCard(ROKU).name}`, "相手.リザーブ: 10 → 11",
            `自分.手札: ${getCard(BSET).name} → なし`, `自分.バースト: なし → ${getCard(BSET).name}`,
        ],
    })
    scenario({
        name: "gunner-non-senryu",
        start: { ...atk, me: { hand: [BSET], spirits: [{ card: GUNNER }, { card: ANT }] }, opp: { spirits: [{ card: ROKU, label: "R" }] } },
        steps(t) {
            attackBlocked(t, "用心棒アントマン", "R")
            noChoice(t, "系統「戦竜」でないスピリットのバトル終了では出ない")
        },
        expect: ["自分.用心棒アントマン.疲労: false → true", gone("相手.R"), `相手.トラッシュ: なし → ${getCard(ROKU).name}`, "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "gunner-senryu-destroyed",
        start: { ...atk, me: { hand: [BSET], spirits: [{ card: GUNNER }, { card: FEN }] }, opp: { spirits: [{ card: ANT, label: "A" }] } },
        steps(t) {
            attackBlocked(t, "フェンサー・ドラゴン", "A")
            noChoice(t, "破壊された戦竜のバトル終了時には発揮しない")
        },
        expect: [gone("自分.フェンサー・ドラゴン"), `自分.トラッシュ: なし → ${getCard(FEN).name}`, "自分.リザーブ: 10 → 11"],
    })
    scenario({
        name: "gunner-opp-senryu",
        start: { turn: "opp", phase: "attack", interactive: true, me: { hand: [BSET], spirits: [{ card: GUNNER }, { card: ROKU, label: "R" }] }, opp: { spirits: [{ card: FEN }] } },
        steps(t) {
            oppAttackBlocked(t, "フェンサー・ドラゴン", "R")
            noChoice(t, "相手のターン・相手の戦竜では出ない")
        },
        expect: ["相手.フェンサー・ドラゴン.疲労: false → true", gone("自分.R"), `自分.トラッシュ: なし → ${getCard(ROKU).name}`, "自分.リザーブ: 10 → 11"],
    })

    // Lv2・3 アタック時：バースト1つを破棄して同じLvの相手のスピリット1体を破壊
    const gunnerAtk = (cores: number) => [{ card: GUNNER, cores }]
    scenario({
        name: "gunner-burst-discard-destroy",
        start: { ...atk, me: { burst: LIGHT, spirits: gunnerAtk(3) }, opp: { spirits: [{ card: ROKU, label: "R2", cores: 2, rested: true }, { card: ROKU, label: "R1", rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ガンナー・ドラゴン") })
            ans(t, "yes")
            const p = pc(t)
            assert(p.candidates.includes(t.id("R2")) && !p.candidates.includes(t.id("R1")), "同じLvの相手のスピリットだけが対象")
            ans(t, { id: "R2" })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.ガンナー・ドラゴン.疲労: false → true", `自分.バースト: ${getCard(LIGHT).name} → なし`, `自分.トラッシュ: なし → ${getCard(LIGHT).name}`,
            gone("相手.R2"), `相手.トラッシュ: なし → ${getCard(ROKU).name}`, "相手.リザーブ: 10 → 13", "相手.ライフ: 5 → 4",
        ],
    })
    const noEffectLines = ["自分.ガンナー・ドラゴン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
    scenario({
        name: "gunner-no-burst",
        start: { ...atk, me: { spirits: gunnerAtk(3) }, opp: { spirits: [{ card: ROKU, cores: 2, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ガンナー・ドラゴン") })
            noChoice(t, "バーストがなければ払えない")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: noEffectLines,
    })
    scenario({
        name: "gunner-no-same-level",
        start: { ...atk, me: { burst: LIGHT, spirits: gunnerAtk(3) }, opp: { spirits: [{ card: ROKU, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ガンナー・ドラゴン") })
            noChoice(t, "同じLvの相手のスピリットがいなければ払えない")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: noEffectLines,
    })
    scenario({
        name: "gunner-declined",
        start: { ...atk, me: { burst: LIGHT, spirits: gunnerAtk(3) }, opp: { spirits: [{ card: ROKU, cores: 2, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ガンナー・ドラゴン") })
            ans(t, "no")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: noEffectLines,
    })
    scenario({
        name: "gunner-lv1-nothing",
        start: { ...atk, me: { burst: LIGHT, spirits: gunnerAtk(1) }, opp: { spirits: [{ card: ROKU, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ガンナー・ドラゴン") })
            noChoice(t, "Lv1 にはアタック時効果がない")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: noEffectLines,
    })
    scenario({
        name: "gunner-lv3",
        start: { ...atk, me: { burst: LIGHT, spirits: gunnerAtk(4) }, opp: { spirits: [{ card: ROKU, label: "R3", cores: 3, rested: true }, { card: ROKU, label: "R2", cores: 2, rested: true }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("ガンナー・ドラゴン") })
            ans(t, "yes")
            const p = pc(t)
            assert(p.candidates.includes(t.id("R3")) && !p.candidates.includes(t.id("R2")), "このスピリットと同じLv3の相手のスピリットだけが対象")
            ans(t, { id: "R3" })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.ガンナー・ドラゴン.疲労: false → true", `自分.バースト: ${getCard(LIGHT).name} → なし`, `自分.トラッシュ: なし → ${getCard(LIGHT).name}`,
            gone("相手.R3"), `相手.トラッシュ: なし → ${getCard(ROKU).name}`, "相手.リザーブ: 10 → 14", "相手.ライフ: 5 → 4",
        ],
    })
}

// ───────── BS18-008 モンク・ドラゴン ─────────
console.log("=== 008 モンク・ドラゴン ===")
{
    const start = (extra: object = {}) => ({
        turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: DRAW, spirits: [{ card: MONK, rested: true }, { card: ROKU, label: "RA", cores: 2 }] },
        opp: { spirits: [{ card: ANT }] }, ...extra,
    })
    scenario({
        name: "monk-recover-and-core",
        start: start(),
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            go(t, "yes", "no", { id: "RA" })
        },
        expect: [
            ...burstDrawLines, "自分.モンク・ドラゴン.疲労: true → false", "自分.モンク・ドラゴン.コア: 1 → 2", "自分.モンク・ドラゴン.Lv: 1 → 2", "自分.モンク・ドラゴン.BP: 5000 → 7000",
            "自分.RA.コア: 2 → 1", "自分.RA.Lv: 2 → 1", "自分.RA.BP: 3000 → 1000",
        ],
    })
    scenario({
        name: "monk-recover-only",
        start: start(),
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            go(t, "yes", "no", "no")
        },
        expect: [...burstDrawLines, "自分.モンク・ドラゴン.疲労: true → false"],
    })
    scenario({
        name: "monk-opp-burst",
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: MONK, rested: true }, { card: ANT }] }, opp: { burst: DRAW } },
        steps(t) {
            attackOpp(t, "用心棒アントマン")
            go(t, "yes", "no")
        },
        expect: [
            "自分.用心棒アントマン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", `相手.手札: なし → ${nm(ROKU, ROKU)}`, "相手.デッキ枚数: 40 → 38",
            `相手.バースト: ${getCard(DRAW).name} → なし`, `相手.トラッシュ: なし → ${getCard(DRAW).name}`,
        ],
    })
}

// ───────── BS18-009 炎の覇獣ハヌ・マーグ ─────────
console.log("=== 009 炎の覇獣ハヌ・マーグ ===")
{
    scenario({
        name: "hanu-burst-summon-destroy2",
        start: { turn: "opp", me: { burst: HANU }, opp: { hand: [STON], spirits: [{ card: ROKU, label: "R1" }, { card: ANT }] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            ans(t, "yes")
            noChoice(t, "BP4000以下の相手のスピリット2体（R1・ストン）が自動で破壊される")
        },
        expect: [
            "相手.トラッシュのコア: 0 → 1", `相手.手札: ${getCard(STON).name} → なし`, `相手.トラッシュ: なし → ${nm(STON, ROKU)}`, gone("相手.R1"),
            "自分.デッキ枚数: 40 → 39", `自分.トラッシュ: なし → ${getCard(ROKU).name}`, `自分.バースト: ${getCard(HANU).name} → なし`,
            "自分.リザーブ: 10 → 9", ...appear("自分.炎の覇獣ハヌ・マーグ", 5000, 1, 1),
        ],
    })
    scenario({
        name: "hanu-burst-no-summon-effect",
        start: { turn: "opp", me: { burst: HANU }, opp: { hand: [ROKU] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            noChoice(t, "召喚時効果を持たないスピリットの召喚では発動しない")
        },
        expect: ["相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", `相手.手札: ${getCard(ROKU).name} → なし`, ...appear("相手.ロクケラトプス", 1000, 1, 1)],
    })
    const atk = { phase: "attack" as const }
    scenario({
        name: "hanu-lv2-blocked-by-cost7",
        start: { ...atk, me: { spirits: [{ card: HANU, cores: 2 }] }, opp: { spirits: [{ card: FORT }] } },
        steps(t) {
            attackBlocked(t, "炎の覇獣ハヌ・マーグ", "フォルトロス")
        },
        expect: [
            "自分.炎の覇獣ハヌ・マーグ.疲労: false → true", gone("相手.フォルトロス"), `相手.トラッシュ: なし → ${getCard(FORT).name}`,
            "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 12",
        ],
    })
    scenario({
        name: "hanu-lv2-blocked-by-cost4",
        start: { ...atk, me: { spirits: [{ card: HANU, cores: 2 }] }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            attackBlocked(t, "炎の覇獣ハヌ・マーグ", "用心棒アントマン")
        },
        expect: ["自分.炎の覇獣ハヌ・マーグ.疲労: false → true", gone("相手.用心棒アントマン"), `相手.トラッシュ: なし → ${getCard(ANT).name}`, "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "hanu-lv1-blocked-by-cost7",
        start: { ...atk, me: { spirits: [{ card: HANU }] }, opp: { spirits: [{ card: FORT }] } },
        steps(t) {
            attackBlocked(t, "炎の覇獣ハヌ・マーグ", "フォルトロス")
        },
        expect: [
            gone("自分.炎の覇獣ハヌ・マーグ"), `自分.トラッシュ: なし → ${getCard(HANU).name}`, "自分.リザーブ: 10 → 11",
            gone("相手.フォルトロス"), `相手.トラッシュ: なし → ${getCard(FORT).name}`, "相手.リザーブ: 10 → 11",
        ],
    })
}

// ───────── BS18-055 ドレイク・バヤー ─────────
console.log("=== 055 ドレイク・バヤー ===")
{
    const summonLines = ["自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...appear("自分.ドレイク・バヤー", 3000, 1, 1)]
    scenario({
        name: "drake-return-yusho",
        start: { me: { hand: [DRAKE], trash: [SHISHINGA, ROKU] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [...summonLines, `自分.手札: ${getCard(DRAKE).name} → ${getCard(SHISHINGA).name}`, `自分.トラッシュ: ${nm(SHISHINGA, ROKU)} → ${getCard(ROKU).name}`],
    })
    scenario({
        name: "drake-choose-one-of-two",
        start: { interactive: true, me: { hand: [DRAKE], trash: [SHISHINGA, SHISHINGINI] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            ans(t, { card: 1 })
        },
        expect: [...summonLines, `自分.手札: ${getCard(DRAKE).name} → ${getCard(SHISHINGINI).name}`, `自分.トラッシュ: ${nm(SHISHINGA, SHISHINGINI)} → ${getCard(SHISHINGA).name}`],
    })
    scenario({
        name: "drake-no-yusho-in-trash",
        start: { interactive: true, me: { hand: [DRAKE], trash: [ROKU] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            noChoice(t, "トラッシュに系統「雄将」がなければ何も起きない")
        },
        expect: [...summonLines, `自分.手札: ${getCard(DRAKE).name} → なし`],
    })
    scenario({
        name: "drake-combine-cost-condition",
        start: { me: { hand: [DRAKE], spirits: [{ card: ROKU }] } },
        steps(t) {
            t.actRejected("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ロクケラトプス") })
        },
        expect: [],
    })
}

// ───────── 055 追加：合体 ─────────
console.log("=== 055 合体 ===")
{
    scenario({
        name: "drake-combine",
        start: { me: { hand: [DRAKE], spirits: [{ card: ANT }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("用心棒アントマン") })
        },
        expect: [
            "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", `自分.手札: ${getCard(DRAKE).name} → なし`,
            "自分.用心棒アントマン.コア: 1 → 2", "自分.用心棒アントマン.BP: 5000 → 8000",
            "自分.ドレイク・バヤー.場所: なし → 合体", "自分.ドレイク・バヤー.疲労: なし → false", "自分.ドレイク・バヤー.コア: なし → 0", "自分.ドレイク・バヤー.Lv: なし → 1",
        ],
    })
}

// ───────── BS18-061 戦史の石碑 ─────────
console.log("=== 061 戦史の石碑 ===")
{
    const drawLines = ["自分.フェンサー・ドラゴン.疲労: false → true", `自分.手札: なし → ${getCard(ROKU).name}`, "自分.デッキ枚数: 40 → 39"]
    for (const cores of [0, 2]) {
        scenario({
            name: `sekihi-draw-lv${cores === 0 ? 1 : 2}`,
            start: { phase: "attack", me: { nexuses: [{ card: SEKIHI, cores }], spirits: [{ card: FEN }] } },
            steps(t) {
                t.act("me", { type: "attack", instanceId: t.id("フェンサー・ドラゴン") })
            },
            expect: drawLines,
        })
    }
    scenario({
        name: "sekihi-non-senryu",
        start: { phase: "attack", me: { nexuses: [{ card: SEKIHI }], spirits: [{ card: ANT }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("用心棒アントマン") })
        },
        expect: ["自分.用心棒アントマン.疲労: false → true"],
    })
    scenario({
        name: "sekihi-opp-senryu",
        start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: SEKIHI }] }, opp: { spirits: [{ card: FEN }] } },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("フェンサー・ドラゴン") })
        },
        expect: ["相手.フェンサー・ドラゴン.疲労: false → true"],
    })
    // Lv2：相手によって自分の赤のスピリットが破壊されたとき、BP5000以下の相手のスピリット1体を破壊
    const oppKills = (nexusCores: number, myCard: string, myLabel: string) => ({
        turn: "opp" as const, interactive: true,
        me: { nexuses: [{ card: SEKIHI, cores: nexusCores }], spirits: [{ card: myCard, label: myLabel }] },
        opp: { hand: [ARDER], spirits: [{ card: ANT }, { card: ROKU, label: "RO" }] },
    })
    const oppCast = (t: ScenarioCtx, target: string) => t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })
    const castLines = ["相手.トラッシュのコア: 0 → 4", `相手.手札: ${getCard(ARDER).name} → なし`]
    scenario({
        name: "sekihi-lv2-counter",
        start: oppKills(2, ROKU, "RR"),
        steps(t) {
            oppCast(t, "RR")
            ans(t, { id: "用心棒アントマン" })
        },
        expect: [
            ...castLines, gone("自分.RR"), `自分.トラッシュ: なし → ${getCard(ROKU).name}`, "自分.リザーブ: 10 → 11",
            gone("相手.用心棒アントマン"), "相手.リザーブ: 10 → 7", `相手.トラッシュ: なし → ${nm(ARDER, ANT)}`,
        ],
    })
    scenario({
        name: "sekihi-lv2-green-destroyed",
        start: oppKills(2, MAIPA, "MM"),
        steps(t) {
            oppCast(t, "MM")
            noChoice(t, "破壊されたのが赤でなければ発揮しない")
        },
        expect: [...castLines, gone("自分.MM"), `自分.トラッシュ: なし → ${getCard(MAIPA).name}`, "自分.リザーブ: 10 → 11", "相手.リザーブ: 10 → 6", `相手.トラッシュ: なし → ${getCard(ARDER).name}`],
    })
    scenario({
        name: "sekihi-lv1-no-counter",
        start: oppKills(0, ROKU, "RR"),
        steps(t) {
            oppCast(t, "RR")
            noChoice(t, "Lv1 にはこの効果がない")
        },
        expect: [...castLines, gone("自分.RR"), `自分.トラッシュ: なし → ${getCard(ROKU).name}`, "自分.リザーブ: 10 → 11", "相手.リザーブ: 10 → 6", `相手.トラッシュ: なし → ${getCard(ARDER).name}`],
    })
    scenario({
        name: "sekihi-lv2-own-effect",
        start: { me: { hand: [CHAIN], nexuses: [{ card: SEKIHI, cores: 2 }], spirits: [{ card: ROKU, label: "RR" }] }, opp: { spirits: [{ card: ROKU, label: "RO" }] } },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("RR") })
            noChoice(t, "自分の効果による破壊では発揮しない")
        },
        expect: [
            "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${getCard(CHAIN).name} → なし`, gone("自分.RR"),
            `自分.トラッシュ: なし → ${nm(CHAIN, ROKU)}`,
        ],
    })
}

// Lv2：「相手によって」にはバトルでの破壊も含む
scenario({
    name: "sekihi-lv2-battle-destroyed",
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { nexuses: [{ card: SEKIHI, cores: 2 }], spirits: [{ card: ROKU, label: "RR" }] },
        opp: { spirits: [{ card: ANT }, { card: ROKU, label: "RO" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("用心棒アントマン") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("RR") })
        t.closeFlash()
        ans(t, { id: "用心棒アントマン" })
    },
    expect: [
        gone("自分.RR"), `自分.トラッシュ: なし → ${getCard(ROKU).name}`, "自分.リザーブ: 10 → 11",
        gone("相手.用心棒アントマン"), "相手.リザーブ: 10 → 11", `相手.トラッシュ: なし → ${getCard(ANT).name}`,
    ],
})

// ───────── BS18-062 最も高き山頂 ─────────
console.log("=== 062 最も高き山頂 ===")
{
    scenario({
        name: "sancho-red-bp-new-spirits",
        start: { me: { hand: [ROKU, ANT], nexuses: [{ card: SANCHO }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [
            "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${nm(ROKU, ANT)} → なし`,
            ...appear("自分.ロクケラトプス", 2000, 1, 1), ...appear("自分.用心棒アントマン", 5000, 1, 1),
        ],
    })
    scenario({
        name: "sancho-red-bp-own-turn",
        start: { me: { nexuses: [{ card: SANCHO, cores: 2 }], spirits: [{ card: ROKU, label: "自R" }, { card: ANT, label: "自A" }] }, opp: { spirits: [{ card: ROKU, label: "相R" }] } },
        steps(t) {
            assert(effectiveBp(t.state, t.me, t.inst("自R")) === 2000, "自分の赤のスピリットは自分のターンBP+1000")
            assert(effectiveBp(t.state, t.me, t.inst("自A")) === 5000, "赤でないスピリットには効かない")
            assert(effectiveBp(t.state, t.opp, t.inst("相R")) === 1000, "相手の赤のスピリットには効かない")
        },
        expect: [],
    })
    scenario({
        name: "sancho-red-bp-opp-turn",
        start: { turn: "opp", me: { nexuses: [{ card: SANCHO }], spirits: [{ card: ROKU, label: "自R" }] } },
        steps(t) {
            assert(effectiveBp(t.state, t.me, t.inst("自R")) === 1000, "相手のターンには効かない")
        },
        expect: [],
    })
    const kill = (nexusCores: number, ally: string, enemy: string) => ({
        phase: "attack" as const,
        me: { nexuses: [{ card: SANCHO, cores: nexusCores }], spirits: [{ card: ally, label: "A1" }] },
        opp: { nexuses: [{ card: SEKIHI, label: "石碑" }], spirits: [{ card: enemy, label: "E1" }] },
    })
    scenario({
        name: "sancho-lv2-destroy-nexus",
        start: kill(2, ANT, ROKU),
        steps(t) {
            attackBlocked(t, "A1", "E1")
        },
        expect: [
            "自分.A1.疲労: false → true", gone("相手.E1"), gone("相手.石碑", "ネクサス"), "相手.リザーブ: 10 → 11",
            `相手.トラッシュ: なし → ${nm(ROKU, SEKIHI)}`,
        ],
    })
    scenario({
        name: "sancho-lv2-mutual-destruction",
        start: kill(2, ANT, ANT),
        steps(t) {
            attackBlocked(t, "A1", "E1")
        },
        expect: [
            gone("自分.A1"), `自分.トラッシュ: なし → ${getCard(ANT).name}`, "自分.リザーブ: 10 → 11",
            gone("相手.E1"), `相手.トラッシュ: なし → ${getCard(ANT).name}`, "相手.リザーブ: 10 → 11",
        ],
    })
    scenario({
        name: "sancho-lv1-no-nexus-destroy",
        start: kill(0, ANT, ROKU),
        steps(t) {
            attackBlocked(t, "A1", "E1")
        },
        expect: ["自分.A1.疲労: false → true", gone("相手.E1"), "相手.リザーブ: 10 → 11", `相手.トラッシュ: なし → ${getCard(ROKU).name}`],
    })
    scenario({
        name: "sancho-lv2-life-attack",
        start: { phase: "attack", me: { nexuses: [{ card: SANCHO, cores: 2 }], spirits: [{ card: ANT, label: "A1" }] }, opp: { nexuses: [{ card: SEKIHI, label: "石碑" }] } },
        steps(t) {
            attackOpp(t, "A1")
        },
        expect: ["自分.A1.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
}

// ───────── BS18-073 ヒロイックエントリー ─────────
console.log("=== 073 ヒロイックエントリー ===")
{
    scenario({
        name: "heroic-main-cost-equals-life",
        start: { me: { life: 3, hand: [HEROIC, HANU] } },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [
            "自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 7", `自分.手札: ${nm(HEROIC, HANU)} → なし`, `自分.トラッシュ: なし → ${getCard(HEROIC).name}`,
            ...appear("自分.炎の覇獣ハヌ・マーグ", 5000, 1, 1),
        ],
    })
    scenario({
        name: "heroic-main-non-haou-unchanged",
        start: { me: { life: 3, hand: [HEROIC, ROKU] } },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [
            "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${nm(HEROIC, ROKU)} → なし`, `自分.トラッシュ: なし → ${getCard(HEROIC).name}`,
            ...appear("自分.ロクケラトプス", 1000, 1, 1),
        ],
    })
    const flashLines = ["自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", `自分.手札: ${getCard(HEROIC).name} → なし`, `自分.トラッシュ: なし → ${getCard(HEROIC).name}`]
    for (const [name, target, bpLine] of [
        ["heroic-flash-own", "自分.用心棒アントマン", "自分.用心棒アントマン.BP: 5000 → 7000"],
        ["heroic-flash-opp", "相手.R", "相手.R.BP: 1000 → 3000"],
    ] as const) {
        scenario({
            name,
            start: { phase: "attack", me: { hand: [HEROIC], spirits: [{ card: ANT }] }, opp: { spirits: [{ card: ROKU, label: "R", rested: true }] } },
            steps(t) {
                t.act("me", { type: "attack", instanceId: t.id("用心棒アントマン") })
                t.act("opp", { type: "pass" })
                t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target.split(".")[1]!) })
            },
            expect: [...flashLines, "自分.用心棒アントマン.疲労: false → true", bpLine],
        })
    }
}

// ───────── 073 追加：メインで使った後に手札へ入ったカードにも効く ─────────
console.log("=== 073 後から手札に入った覇皇 ===")
{
    scenario({
        name: "heroic-main-card-drawn-later",
        start: { me: { life: 3, reserve: 12, hand: [HEROIC, GRIP], deck: [HANU, ...Array.from({ length: 39 }, () => ROKU)] } },
        steps(t) {
            t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
            t.act("me", { type: "summon", handIndex: 0 })
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [
            "自分.リザーブ: 12 → 0", "自分.トラッシュのコア: 0 → 10", `自分.手札: ${nm(HEROIC, GRIP)} → なし`, "自分.デッキ枚数: 40 → 39",
            `自分.トラッシュ: なし → ${getCard(HEROIC).name}`, ...appear("自分.グリプ・ハンズ", 2000, 1, 1), ...appear("自分.炎の覇獣ハヌ・マーグ", 5000, 1, 1),
        ],
    })
}

// ───────── BS18-074 救世神撃覇 ─────────
console.log("=== 074 救世神撃覇 ===")
{
    const setup = (oppSpirits: { card: string; label?: string; cores?: number }[]) => ({
        turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: KYUSEI, hand: [BSET] }, opp: { spirits: oppSpirits },
    })
    const burstUsed = [`自分.バースト: ${getCard(KYUSEI).name} → なし`, `自分.トラッシュ: なし → ${getCard(KYUSEI).name}`, "自分.ライフ: 5 → 4"]
    scenario({
        name: "kyusei-destroy-and-flash",
        start: setup([{ card: ANT }, { card: ROKU, label: "R" }]),
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
            ans(t, { id: "用心棒アントマン" })
            ans(t, { id: "R" })
            finishSelect(t)
            ans(t, "yes")
            const p = pc(t)
            assert(p.kind === "card", "ドロー後にセットするバーストカードを選ぶ")
            ans(t, { card: 0 })
        },
        expect: [
            "自分.ライフ: 5 → 4", `自分.バースト: ${getCard(KYUSEI).name} → ${getCard(BSET).name}`, `自分.トラッシュ: なし → ${getCard(KYUSEI).name}`,
            "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 4", "自分.デッキ枚数: 40 → 39", `自分.手札: ${getCard(BSET).name} → ${getCard(ROKU).name}`,
            gone("相手.用心棒アントマン"), gone("相手.R"), "相手.リザーブ: 10 → 12", `相手.トラッシュ: なし → ${nm(ANT, ROKU)}`,
        ],
    })
    scenario({
        name: "kyusei-flash-declined",
        start: setup([{ card: ANT }, { card: ROKU, label: "R" }]),
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
            ans(t, { id: "用心棒アントマン" })
            ans(t, { id: "R" })
            finishSelect(t)
            ans(t, "no")
        },
        expect: [...burstUsed, "自分.リザーブ: 10 → 11", gone("相手.用心棒アントマン"), gone("相手.R"), "相手.リザーブ: 10 → 12", `相手.トラッシュ: なし → ${nm(ANT, ROKU)}`],
    })
    scenario({
        name: "kyusei-bp-total-limit",
        start: setup([{ card: ANT }, { card: ROKU, label: "R3", cores: 3 }, { card: ROKU, label: "R" }]),
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
            ans(t, { id: "用心棒アントマン" })
            const p = pc(t)
            assert(p.candidates.includes(t.id("R")) && !p.candidates.includes(t.id("R3")), "BP合計6000まで：5000を選んだあとは1000までしか選べない")
            finishSelect(t)
            ans(t, "no")
        },
        expect: [...burstUsed, "自分.リザーブ: 10 → 11", gone("相手.用心棒アントマン"), "相手.リザーブ: 10 → 11", `相手.トラッシュ: なし → ${getCard(ANT).name}`],
    })
}

// 074 追加：フィールドにコアが無く、リザーブも足りないときは払えない
scenario({
    name: "kyusei-cannot-pay",
    start: { turn: "opp", phase: "attack", interactive: true, me: { reserve: 2, burst: KYUSEI }, opp: { spirits: [{ card: ANT }] } },
    steps(t) {
        oppAttacksMe(t, "用心棒アントマン")
        ans(t, "yes")
        ans(t, { id: "用心棒アントマン" })
        finishSelect(t)
        noChoice(t, "払えないので確認は出ない")
    },
    expect: [
        "自分.ライフ: 5 → 4", `自分.バースト: ${getCard(KYUSEI).name} → なし`, `自分.トラッシュ: なし → ${getCard(KYUSEI).name}`, "自分.リザーブ: 2 → 3",
        gone("相手.用心棒アントマン"), "相手.リザーブ: 10 → 11", `相手.トラッシュ: なし → ${getCard(ANT).name}`,
    ],
})

// ───────── BS18-X01 超覇王ロード・ドラゴン・セイバー ─────────
console.log("=== X01 超覇王ロード・ドラゴン・セイバー ===")
{
    const sv = "自分.超覇王ロード・ドラゴン・セイバー"
    scenario({
        name: "saber-burst-tenshou",
        start: { turn: "opp", phase: "attack", interactive: true, me: { burst: SABER, spirits: [{ card: HANU, cores: 2 }] }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
            while (t.state.pendingChoice) ans(t, t.state.pendingChoice.kind === "target" ? { id: "炎の覇獣ハヌ・マーグ" } : "yes")
        },
        expect: [
            "相手.用心棒アントマン.疲労: false → true", `自分.バースト: ${getCard(SABER).name} → なし`, "自分.リザーブ: 10 → 9",
            gone("自分.炎の覇獣ハヌ・マーグ"), `自分.トラッシュ: なし → ${getCard(HANU).name}`, ...appear(sv, 10000, 1, 1),
        ],
    })
    scenario({
        name: "saber-burst-no-haou",
        start: { turn: "opp", phase: "attack", interactive: true, me: { burst: SABER, spirits: [{ card: ROKU }] }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
        },
        expect: [
            "相手.用心棒アントマン.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", `自分.バースト: ${getCard(SABER).name} → なし`,
            `自分.トラッシュ: なし → ${getCard(SABER).name}`,
        ],
    })
    scenario({
        name: "saber-hand-summon",
        start: { me: { reserve: 11, hand: [SABER] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: ["自分.リザーブ: 11 → 0", "自分.トラッシュのコア: 0 → 10", `自分.手札: ${getCard(SABER).name} → なし`, ...appear(sv, 10000, 1, 1)],
    })
    const buffLines = [
        `${sv}.コア: 3 → 4`, `${sv}.BP: 13000 → 18000`, `${sv}.疲労: false → true`, "自分.RA.BP: 1000 → 6000", "自分.ライフ: 5 → 4",
    ]
    scenario({
        name: "saber-attack-buff",
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: SABER, cores: 3 }, { card: ROKU, label: "RA" }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("超覇王ロード・ドラゴン・セイバー") })
            ans(t, "yes")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [...buffLines, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "saber-block-buff",
        start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [{ card: SABER, cores: 3 }, { card: ROKU, label: "RA" }] }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            oppAttackBlocked(t, "用心棒アントマン", "超覇王ロード・ドラゴン・セイバー")
        },
        expect: [...buffLines, gone("相手.用心棒アントマン"), `相手.トラッシュ: なし → ${getCard(ANT).name}`, "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "saber-attack-declined",
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: SABER, cores: 3 }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("超覇王ロード・ドラゴン・セイバー") })
            ans(t, "no")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [`${sv}.疲労: false → true`, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "saber-lv1-no-buff",
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: SABER, cores: 1 }] } },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("超覇王ロード・ドラゴン・セイバー") })
            noChoice(t, "Lv1 にはアタック時効果がない")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [`${sv}.疲労: false → true`, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
    })
    const burstStart = (cores: number) => ({
        turn: "opp" as const, phase: "attack" as const, interactive: true,
        me: { burst: DRAW, spirits: [{ card: SABER, cores, rested: true }] }, opp: { spirits: [{ card: ANT }] },
    })
    scenario({
        name: "saber-lv3-recover",
        start: burstStart(5),
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            go(t, "yes", "no")
        },
        expect: [...burstDrawLines, `${sv}.疲労: true → false`],
    })
    scenario({
        name: "saber-lv2-no-recover",
        start: burstStart(3),
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            go(t, "yes", "no")
        },
        expect: burstDrawLines,
    })
}

// ───────── X021 黄金の覇王ロード・ドラゴン・インティ ─────────
console.log("=== X021 インティ ===")
{
    const deckWith = (top: string[]) => [...top, ...Array.from({ length: 40 - top.length }, () => ROKU)]
    const ti = "自分.黄金の覇王ロード・ドラゴン・インティ"
    scenario({
        name: "inti-burst-life3-summon-ld",
        start: { turn: "opp", phase: "attack", interactive: true, me: { life: 4, burst: INTI, deck: deckWith([LD1, ROKU, LD2, ROKU, ROKU]) }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
            ans(t, { card: 0 })
            ans(t, { card: 2 })
            finishSelect(t)
        },
        expect: [
            "相手.用心棒アントマン.疲労: false → true", "自分.ライフ: 4 → 3", "自分.リザーブ: 10 → 8", "自分.デッキ枚数: 40 → 35",
            `自分.バースト: ${getCard(INTI).name} → なし`, `自分.トラッシュ: なし → ${nm(ROKU, ROKU, ROKU)}`,
            ...appear(ti, 6000, 1, 1), ...appear("自分.英雄龍ロード・ドラゴン", 4000, 1, 1), ...appear("自分.爆炎の覇王ロード・ドラゴン・バゼル", 5000, 1, 1),
        ],
    })
    scenario({
        name: "inti-burst-life4-not-summoned",
        start: { turn: "opp", phase: "attack", interactive: true, me: { burst: INTI }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
        },
        expect: [
            "相手.用心棒アントマン.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", `自分.バースト: ${getCard(INTI).name} → なし`,
            `自分.トラッシュ: なし → ${getCard(INTI).name}`,
        ],
    })
    const handSummon = (top: string[]) => ({ interactive: true, me: { hand: [INTI], deck: deckWith(top) } })
    scenario({
        name: "inti-open5-summon-one",
        start: handSummon([LD1, ROKU, ROKU, ROKU, ROKU]),
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            ans(t, { card: 0 })
            finishSelect(t)
        },
        expect: [
            "自分.リザーブ: 10 → 0", "自分.トラッシュのコア: 0 → 8", `自分.手札: ${getCard(INTI).name} → なし`, "自分.デッキ枚数: 40 → 35",
            `自分.トラッシュ: なし → ${nm(ROKU, ROKU, ROKU, ROKU)}`, ...appear(ti, 6000, 1, 1), ...appear("自分.英雄龍ロード・ドラゴン", 4000, 1, 1),
        ],
    })
    scenario({
        name: "inti-open5-none-named",
        start: handSummon([ROKU, ROKU, ROKU, ROKU, ROKU]),
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            noChoice(t, "名前に「ロード・ドラゴン」を持つスピリットがいなければ選択は出ない")
        },
        expect: [
            "自分.リザーブ: 10 → 1", "自分.トラッシュのコア: 0 → 8", `自分.手札: ${getCard(INTI).name} → なし`, "自分.デッキ枚数: 40 → 35",
            `自分.トラッシュ: なし → ${nm(ROKU, ROKU, ROKU, ROKU, ROKU)}`, ...appear(ti, 6000, 1, 1),
        ],
    })
    scenario({
        name: "inti-open5-summon-none",
        start: handSummon([LD1, ROKU, ROKU, ROKU, ROKU]),
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            ans(t, "no")
        },
        expect: [
            "自分.リザーブ: 10 → 1", "自分.トラッシュのコア: 0 → 8", `自分.手札: ${getCard(INTI).name} → なし`, "自分.デッキ枚数: 40 → 35",
            `自分.トラッシュ: なし → ${nm(LD1, ROKU, ROKU, ROKU, ROKU)}`, ...appear(ti, 6000, 1, 1),
        ],
    })
}

// 追加：「ターンに1回」はカード名ごとに数える（RULES_BATSPI_WIKI ②）
scenario({
    name: "inti-second-copy-same-turn",
    start: { interactive: true, me: { reserve: 18, hand: [INTI, INTI], deck: [ROKU, ROKU, ROKU, ROKU, ROKU, LD1, ...Array.from({ length: 34 }, () => ROKU)] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "summon", handIndex: 0 })
        noChoice(t, "同じターンに2体目のインティを召喚しても、この効果は使えない")
    },
    expect: [
        "自分.リザーブ: 18 → 0", "自分.トラッシュのコア: 0 → 16", `自分.手札: ${nm(INTI, INTI)} → なし`, "自分.デッキ枚数: 40 → 35",
        `自分.トラッシュ: なし → ${nm(ROKU, ROKU, ROKU, ROKU, ROKU)}`,
        ...appear("自分.黄金の覇王ロード・ドラゴン・インティ", 6000, 1, 1), ...appear("自分.黄金の覇王ロード・ドラゴン・インティ#2", 6000, 1, 1),
    ],
})

// ───────── X022 覇王ロード・ドラゴン・ザ・ワールド ─────────
console.log("=== X022 ザ・ワールド ===")
{
    const wd = "自分.覇王ロード・ドラゴン・ザ・ワールド"
    scenario({
        name: "world-summon-draw-setburst",
        start: { interactive: true, me: { hand: [WORLD, BSET] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            ans(t, { card: 0 })
        },
        expect: [
            "自分.リザーブ: 10 → 0", "自分.トラッシュのコア: 0 → 9", `自分.手札: ${nm(WORLD, BSET)} → ${getCard(ROKU).name}`, "自分.デッキ枚数: 40 → 39",
            `自分.バースト: なし → ${getCard(BSET).name}`, ...appear(wd, 8000, 1, 1),
        ],
    })
    scenario({
        name: "world-burst-life3",
        start: { turn: "opp", phase: "attack", interactive: true, me: { life: 4, burst: WORLD, hand: [BSET] }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
            ans(t, { card: 0 })
        },
        expect: [
            "相手.用心棒アントマン.疲労: false → true", "自分.ライフ: 4 → 3", "自分.デッキ枚数: 40 → 39", `自分.手札: ${getCard(BSET).name} → ${getCard(ROKU).name}`,
            `自分.バースト: ${getCard(WORLD).name} → ${getCard(BSET).name}`, ...appear(wd, 8000, 1, 1),
        ],
    })
    scenario({
        name: "world-burst-life4-not-summoned",
        start: { turn: "opp", phase: "attack", interactive: true, me: { burst: WORLD }, opp: { spirits: [{ card: ANT }] } },
        steps(t) {
            oppAttacksMe(t, "用心棒アントマン")
            ans(t, "yes")
        },
        expect: [
            "相手.用心棒アントマン.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", `自分.バースト: ${getCard(WORLD).name} → なし`,
            `自分.トラッシュ: なし → ${getCard(WORLD).name}`,
        ],
    })
    // Lv2・3：「ロード・ドラゴン」を名前に持つ自分のスピリットが、BPを比べ相手のスピリットだけを破壊したとき
    const killer = (worldCores: number, attacker: string, label: string, blocker: string, blockerCores = 1) => ({
        phase: "attack" as const,
        me: { spirits: [{ card: WORLD, cores: worldCores, label: "W", rested: false }, ...(attacker === WORLD ? [] : [{ card: attacker, label }])] },
        opp: { spirits: [{ card: blocker, label: "E1", cores: blockerCores }] },
    })
    const lifeToTrash = ["相手.ライフ: 5 → 4", "相手.トラッシュのコア: 0 → 1"]
    const kills = (blockerName: string, cores = 1) => [gone("相手.E1"), `相手.トラッシュ: なし → ${blockerName}`, `相手.リザーブ: 10 → ${10 + cores}`]
    scenario({
        name: "world-lv2-self-kills",
        start: { phase: "attack", me: { spirits: [{ card: WORLD, cores: 3, label: "W" }] }, opp: { spirits: [{ card: ANT, label: "E1" }] } },
        steps(t) {
            attackBlocked(t, "W", "E1")
        },
        expect: ["自分.W.疲労: false → true", ...kills(getCard(ANT).name), ...lifeToTrash],
    })
    scenario({
        name: "world-lv2-other-ld-kills",
        start: killer(3, LD1, "L", ROKU),
        steps(t) {
            attackBlocked(t, "L", "E1")
        },
        expect: ["自分.L.疲労: false → true", ...kills(getCard(ROKU).name), ...lifeToTrash],
    })
    scenario({
        name: "world-lv2-non-ld-kills",
        start: killer(3, ANT, "A", ROKU),
        steps(t) {
            attackBlocked(t, "A", "E1")
        },
        expect: ["自分.A.疲労: false → true", ...kills(getCard(ROKU).name)],
    })
    scenario({
        name: "world-lv1-no-effect",
        start: { phase: "attack", me: { spirits: [{ card: WORLD, cores: 1, label: "W" }] }, opp: { spirits: [{ card: ANT, label: "E1" }] } },
        steps(t) {
            attackBlocked(t, "W", "E1")
        },
        expect: ["自分.W.疲労: false → true", ...kills(getCard(ANT).name)],
    })
    scenario({
        name: "world-lv2-mutual-destruction",
        start: killer(3, LD1, "L", ROKU, 3),
        steps(t) {
            attackBlocked(t, "L", "E1")
        },
        expect: [gone("自分.L"), `自分.トラッシュ: なし → ${getCard(LD1).name}`, "自分.リザーブ: 10 → 11", ...kills(getCard(ROKU).name, 3)],
    })
}

// 追加：バーストがセット中でも、古いバーストを破棄してセットし直せる（BURST.md 38行）
scenario({
    name: "world-replace-set-burst",
    start: { interactive: true, me: { burst: LIGHT, hand: [WORLD, BSET] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        ans(t, { card: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 0", "自分.トラッシュのコア: 0 → 9", `自分.手札: ${nm(WORLD, BSET)} → ${getCard(ROKU).name}`, "自分.デッキ枚数: 40 → 39",
        `自分.バースト: ${getCard(LIGHT).name} → ${getCard(BSET).name}`, `自分.トラッシュ: なし → ${getCard(LIGHT).name}`, ...appear("自分.覇王ロード・ドラゴン・ザ・ワールド", 8000, 1, 1),
    ],
})

console.log("すべてのチェックに合格しました 🎉（part656）")
