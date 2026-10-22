// smoke パート622（BS17 青15枚の場面テスト。期待値役：効果文だけから先に書いた。実装はあとで通す）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side, SideSpec } from "./scenario"

// ---- 対象（BS17 青）----
const CAMEL = "BS17-047" // 戦獣キャメルーン
const RATE = "BS17-048" // 熊人ラーテシード
const ALADDIN = "BS17-049" // ロック・アラディン
const LANTE = "BS17-050" // ランテゴス
const ALIBABA = "BS17-051" // 豹人アリババ
const SINBAD = "BS17-052" // アラビアン騎士シンド・バード
const STRO = "BS17-053" // 青玉の海竜シュトロドーム
const GOLEM = "BS17-054" // マジン・ゴレム
const JIN = "BS17-060" // ジン・アームズ
const DOOR = "BS17-071" // 開かれた岩扉
const LAMP = "BS17-072" // 願い叶えるランプ
const ABRA = "BS17-083" // アブラカダブラ
const TRI = "BS17-084" // トライアングルバン
const SHEH = "BS17-X06" // 千夜一夜物語の女帝シェハラザード

// ---- 脇役（既存カード。効果の無いもの以外は用途をコメント）----
const JEFF = "BS03-072" // 槍兵のジェフリー（青・コスト1・BP2000・闘神）
const GUSTAV = "BS04-060" // 戦士グスタフ（青・コスト1・BP2000）
const DOL = "BS06-061" // ドルフィーノ（青・コスト0・BP1000）
const BEARD = "BS03-083" // 熊男ベアード（青・コスト3・BP3000）
const MITH = "BS05-052" // ミスリル・ゴレム（青・コスト6・BP5000）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const GORA = "BS01-001" // ゴラドン（赤・コスト0）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・BP3000）
const TORNA = "BS10-009" // トルネードラ（赤・コスト6・BP5000）
const YUSHO = "BS16-037" // ブレーペンタンの音楽隊（黄・コスト2・系統「雄将」・Lv1 BP1000／Lv2 BP3000）
const HAMMA = "BS01-007" // ハンマドレイク（赤・コスト2）
const DRAGU = "BS01-011" // ドラグサウルス（赤・コスト3・召喚時：ネクサス1つを破壊）
const EMERALD = "BS01-063" // エメラルドシーザー（緑・コスト4・召喚時：相手のスピリット1体を疲労）
const HEAL = "BS09-078" // ヒーリングサークル（白・コスト5・メイン：ボイドからコア1個を自分のライフに）
const COFFIN = "BS01-131" // ダークコフィン（紫・コスト7・メイン：疲労状態のスピリット1体を破壊）
const BIND = "BS01-134" // バインディングソーン（緑・コスト2・フラッシュ：相手のスピリット1体を疲労）
const HAMMER = "BS03-144" // マジックハンマー（青・コスト4・メイン：相手のデッキを上から5枚破棄）
const NEXCOL = "BS12-073" // ネクサスコラプス（赤・コスト3・メイン：ネクサス2つまでを破壊）
const BURST_G = "BS14-101" // 仁王壁（緑・バースト持ち。相手側がセットするだけの脇役）
const BURST_P = "BS14-096" // 冥皇封滅呪（紫・コスト4・バースト：自分のライフ減少後、疲労状態のコスト5以下の相手のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [CAMEL]: "戦獣キャメルーン", [RATE]: "熊人ラーテシード", [ALADDIN]: "ロック・アラディン", [LANTE]: "ランテゴス",
        [ALIBABA]: "豹人アリババ", [SINBAD]: "アラビアン騎士シンド・バード", [STRO]: "青玉の海竜シュトロドーム", [GOLEM]: "マジン・ゴレム",
        [JIN]: "ジン・アームズ", [DOOR]: "開かれた岩扉", [LAMP]: "願い叶えるランプ", [ABRA]: "アブラカダブラ",
        [TRI]: "トライアングルバン", [SHEH]: "千夜一夜物語の女帝シェハラザード",
        [JEFF]: "槍兵のジェフリー", [GUSTAV]: "戦士グスタフ", [DOL]: "ドルフィーノ", [BEARD]: "熊男ベアード", [MITH]: "ミスリル・ゴレム",
        [ROKU]: "ロクケラトプス", [GORA]: "ゴラドン", [METAL]: "メタルバーン", [TORNA]: "トルネードラ", [YUSHO]: "ブレーペンタンの音楽隊",
        [HAMMA]: "ハンマドレイク", [DRAGU]: "ドラグサウルス", [EMERALD]: "エメラルドシーザー", [HEAL]: "ヒーリングサークル",
        [COFFIN]: "ダークコフィン", [BIND]: "バインディングソーン", [HAMMER]: "マジックハンマー", [NEXCOL]: "ネクサスコラプス",
        [BURST_G]: "仁王壁", [BURST_P]: "冥皇封滅呪",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
}

// ---- 道具 ----
const sideOf = (t: ScenarioCtx, pid: string): Side => (pid === t.me ? "me" : "opp")

function need(t: ScenarioCtx, side: Side) {
    const pc = t.state.pendingChoice
    if (!pc) throw new Error(`${side}の選択待ちが立っていない`)
    assert(sideOf(t, pc.pid) === side, `選択者は${side}`)
    return pc
}
// 「〜できる」の発動確認（confirm）に答える。残っているあいだ answers を先頭から使い、足りなければ「発動する」
// 確認以外の選択待ち（対象・カード選択）が立ったらそこで止める
function drive(t: ScenarioCtx, answers: boolean[] = []): void {
    for (let i = 0; i < 12; i++) {
        const pc = t.state.pendingChoice
        if (!pc || pc.kind !== "option" || !pc.confirm) break
        const yes = answers.shift() ?? true
        const side = sideOf(t, pc.pid)
        const label = pc.options?.[0]
        if (yes && label !== undefined) t.act(side, { type: "resolveChoice", option: label })
        else t.act(side, { type: "resolveChoice" })
    }
}
function pickCard(t: ScenarioCtx, side: Side, nth = 0): void {
    const pc = need(t, side)
    assert(pc.kind === "card" && (pc.cardIndices ?? []).length > nth, "カード選択の候補がある")
    t.act(side, { type: "resolveChoice", cardIndex: (pc.cardIndices ?? [])[nth] ?? 0 })
}
function pickTargets(t: ScenarioCtx, side: Side, labels: string[], finish = false): void {
    for (const l of labels) {
        need(t, side)
        t.act(side, { type: "resolveChoice", instanceId: t.id(l) })
    }
    if (finish && t.state.pendingChoice) t.act(side, { type: "resolveChoice" })
}
function pickOption(t: ScenarioCtx, side: Side, label: string): void {
    const pc = need(t, side)
    assert(pc.kind === "option" && (pc.options ?? []).includes(label), `選択肢「${label}」がある`)
    t.act(side, { type: "resolveChoice", option: label })
}
// 戦闘が終わるまで両者パスで進める。途中の発動確認には answers で答える
function settle(t: ScenarioCtx, answers: boolean[] = []): void {
    const queue = [...answers] // scenario は自分側／相手側で steps を2回走らせる。共有の配列を消費しない
    for (let i = 0; i < 30; i++) {
        drive(t, queue)
        if (t.state.pendingChoice || !t.state.battle) break
        if (t.state.isFlashTiming) t.act(sideOf(t, t.state.priorityPlayer), { type: "pass" })
        else t.act(sideOf(t, t.state.turnPlayer === t.me ? t.opp : t.me), { type: "takeLife" }) // ブロック宣言の場面：防御側は宣言していなければライフで受ける
    }
}
// フラッシュタイミングを両者パスで閉じる（ブロックはその後に宣言できる）
function passFlash(t: ScenarioCtx): void {
    for (let i = 0; i < 6 && !t.state.pendingChoice && t.state.battle && t.state.isFlashTiming; i++) t.act(sideOf(t, t.state.priorityPlayer), { type: "pass" })
}
function attack(t: ScenarioCtx, side: Side, label: string): void {
    t.act(side, { type: "attack", instanceId: t.id(label) })
}
function block(t: ScenarioCtx, side: Side, label: string): void {
    passFlash(t)
    t.act(side, { type: "block", instanceId: t.id(label) })
}
const rep = (name: string, n: number) => Array.from({ length: n }, () => name).join("、")
// 場面の途中で現れた個体の写像（召喚された直後）
const appears = (prefix: string, cores: number, lv: number, bp: number): string[] => [
    `${prefix}.場所: なし → フィールド`, `${prefix}.疲労: なし → false`, `${prefix}.コア: なし → ${cores}`, `${prefix}.Lv: なし → ${lv}`, `${prefix}.BP: なし → ${bp}`,
]
const gone = (prefix: string): string => `${prefix}.場所: フィールド → なし`
const vanilla = (n: number): string[] => Array.from({ length: n }, () => ROKU)
const spirits = (...cards: string[]): SideSpec["spirits"] => cards.map((card, i) => ({ card, label: `${i + 1}体目` }))
void spirits

// ======== BS17-047 戦獣キャメルーン：『自分のアタックステップ』自分のスピリットが3体以下の間、このスピリットをBP+2000 ========
console.log("=== BS17-047 ===")
scenario({
    name: "047 自分のスピリットが3体（自分自身を含む）：アタックステップでBP+2000。相手の体数は数えない",
    start: { phase: "main", me: { spirits: [{ card: CAMEL }, { card: JEFF }, { card: GUSTAV }] }, opp: { spirits: vanilla(4).map((card, i) => ({ card, label: `r${i + 1}` })) } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.戦獣キャメルーン.BP: 2000 → 4000"],
})
scenario({
    name: "047 自分のスピリットが4体：BPは増えない",
    start: { phase: "main", me: { spirits: [{ card: CAMEL }, { card: JEFF }, { card: GUSTAV }, { card: DOL }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})
scenario({
    name: "047 相手のアタックステップ：増えない（『自分の』）",
    start: { turn: "opp", phase: "main", me: { spirits: [{ card: CAMEL }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})

// ======== BS17-048 熊人ラーテシード ========
console.log("=== BS17-048 ===")
const healLines = (who: string) => [`${who}.手札: ヒーリングサークル → なし`, `${who}.リザーブ: 10 → 5`, `${who}.トラッシュのコア: 0 → 5`, `${who}.トラッシュ: なし → ヒーリングサークル`]
scenario({
    name: "048 お互い、ボイドからライフにコアを置けない：自分のマジックでもライフは増えない",
    start: { phase: "main", me: { hand: [HEAL], spirits: [{ card: RATE }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    expect: healLines("自分"),
})
scenario({
    name: "048 相手が使っても相手のライフは増えない",
    start: { turn: "opp", phase: "main", me: { spirits: [{ card: RATE }] }, opp: { hand: [HEAL] } },
    steps: (t) => t.act("opp", { type: "castMagic", handIndex: 0 }),
    expect: healLines("相手"),
})
scenario({
    name: "048 対照：ラーテシードがいなければライフが増える",
    start: { phase: "main", me: { hand: [HEAL], spirits: [{ card: JEFF }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0 }),
    expect: [...healLines("自分"), "自分.ライフ: 5 → 6"],
})
scenario({
    name: "048 Lv2『相手のアタックステップ』自分のスピリットが3体以下：自分のスピリットすべてBP+2000",
    start: { turn: "opp", phase: "main", me: { spirits: [{ card: RATE, cores: 3 }, { card: JEFF }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: ["自分.熊人ラーテシード.BP: 5000 → 7000", "自分.槍兵のジェフリー.BP: 2000 → 4000"],
})
scenario({
    name: "048 Lv1では増えない",
    start: { turn: "opp", phase: "main", me: { spirits: [{ card: RATE, cores: 1 }, { card: JEFF }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})
scenario({
    name: "048 Lv2でも自分のスピリットが4体なら増えない",
    start: { turn: "opp", phase: "main", me: { spirits: [{ card: RATE, cores: 3 }, { card: JEFF }, { card: GUSTAV }, { card: DOL }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})
scenario({
    name: "048 自分のアタックステップでは増えない（『相手の』）",
    start: { phase: "main", me: { spirits: [{ card: RATE, cores: 3 }, { card: JEFF }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})

// ======== BS17-049 ロック・アラディン ========
console.log("=== BS17-049 ===")
scenario({
    name: "049 バースト：自分のライフ減少後、このスピリットカードを召喚する",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: ALADDIN }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        attack(t, "opp", "相手.ロクケラトプス")
        settle(t)
    },
    expect: ["自分.ライフ: 5 → 4", "自分.バースト: ロック・アラディン → なし", "相手.ロクケラトプス.疲労: false → true", ...appears("自分.ロック・アラディン", 1, 1, 3000)],
})
scenario({
    name: "049 バースト：ライフが減らなければ発動しない（ブロックで防いだ）",
    start: { turn: "opp", phase: "attack", interactive: true, me: { burst: ALADDIN, spirits: [{ card: JEFF }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        attack(t, "opp", "相手.ロクケラトプス")
        block(t, "me", "自分.槍兵のジェフリー")
        settle(t)
    },
    expect: ["自分.槍兵のジェフリー.疲労: false → true", gone("相手.ロクケラトプス"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
const aladdinSummonBase = (hand: string[]) => ({ phase: "main" as const, interactive: true, me: { hand, reserve: 10 } })
scenario({
    name: "049 召喚時：手札のネクサス1枚をコストを支払わずに配置できる",
    start: aladdinSummonBase([ALADDIN, DOOR]),
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t, [true])
    },
    expect: [
        "自分.手札: ロック・アラディン、開かれた岩扉 → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4",
        ...appears("自分.ロック・アラディン", 1, 1, 3000),
        "自分.開かれた岩扉.場所: なし → ネクサス", "自分.開かれた岩扉.疲労: なし → false", "自分.開かれた岩扉.コア: なし → 0", "自分.開かれた岩扉.Lv: なし → 1",
    ],
})
scenario({
    name: "049 召喚時：断れば配置しない",
    start: aladdinSummonBase([ALADDIN, DOOR]),
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t, [false])
    },
    expect: ["自分.手札: ロック・アラディン、開かれた岩扉 → 開かれた岩扉", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...appears("自分.ロック・アラディン", 1, 1, 3000)],
})
scenario({
    name: "049 召喚時：手札にネクサスが無ければ何も起きない（スピリットは配置の候補ではない）",
    start: aladdinSummonBase([ALADDIN, ROKU]),
    steps: (t) => {
        t.act("me", { type: "summon", handIndex: 0 })
        drive(t)
    },
    expect: ["自分.手札: ロクケラトプス、ロック・アラディン → ロクケラトプス", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", ...appears("自分.ロック・アラディン", 1, 1, 3000)],
})
// 相手のターン開始：相手が引く・コアステップでリザーブ+1（ルール手順）
const OPP_START = ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"]
const startStepView = (aladdinCores: number, nexusRested: boolean, oppBurst: boolean) => ({
    name: `049 Lv2『相手のスタートステップ』（コア${aladdinCores}・ネクサス${nexusRested ? "疲労" : "回復"}・相手バースト${oppBurst ? "あり" : "なし"}）`,
    start: {
        turn: "me" as const, phase: "main" as const, interactive: true,
        me: { spirits: [{ card: ALADDIN, cores: aladdinCores }], nexuses: [{ card: DOOR, rested: nexusRested }] },
        opp: oppBurst ? { burst: BURST_G } : {},
    },
    steps: (t: ScenarioCtx) => {
        t.act("me", { type: "endTurn" })
        drive(t, [true])
        // 内容を見る確認が立っていたら閉じる（見るだけで盤面は変わらない）
        if (t.state.pendingChoice && t.state.pendingChoice.pid === t.me) t.act("me", { type: "resolveChoice" })
    },
})
scenario({ ...startStepView(4, false, true), expect: ["自分.開かれた岩扉.疲労: false → true", ...OPP_START] })
scenario({ ...startStepView(4, true, true), expect: OPP_START }) // 疲労させられるネクサスが無い
scenario({ ...startStepView(1, false, true), expect: OPP_START }) // Lv1では持たない
scenario({ ...startStepView(4, false, false), expect: OPP_START }) // 内容を見る相手のバーストが無い

// ======== BS17-050 ランテゴス：相手がバーストをセットしたとき、ボイドからコア1個を自分のスピリット/ネクサスに置く ========
console.log("=== BS17-050 ===")
scenario({
    name: "050 相手がバーストをセット：自分のスピリットにコア+1",
    start: { turn: "opp", phase: "main", me: { spirits: [{ card: LANTE }] }, opp: { hand: [BURST_G] } },
    steps: (t) => t.act("opp", { type: "setBurst", handIndex: 0 }),
    expect: ["相手.手札: 仁王壁 → なし", "相手.バースト: なし → 仁王壁", "自分.ランテゴス.コア: 1 → 2"],
})
scenario({
    name: "050 置き先は対戦者が選ぶ（ネクサスにも置ける）",
    start: { turn: "opp", phase: "main", interactive: true, me: { spirits: [{ card: LANTE }], nexuses: [{ card: DOOR, cores: 0 }] }, opp: { hand: [BURST_G] } },
    steps: (t) => {
        t.act("opp", { type: "setBurst", handIndex: 0 })
        const pc = need(t, "me")
        assert(pc.kind === "target" && pc.candidates.includes(t.id("自分.ランテゴス")) && pc.candidates.includes(t.id("自分.開かれた岩扉")), "スピリットとネクサスが候補")
        t.act("me", { type: "resolveChoice", instanceId: t.id("自分.開かれた岩扉") })
    },
    expect: ["相手.手札: 仁王壁 → なし", "相手.バースト: なし → 仁王壁", "自分.開かれた岩扉.コア: 0 → 1", "自分.開かれた岩扉.Lv: 1 → 2"],
})
scenario({
    name: "050 自分がバーストをセットしても置かない",
    start: { phase: "main", me: { hand: [BURST_G], spirits: [{ card: LANTE }] } },
    steps: (t) => t.act("me", { type: "setBurst", handIndex: 0 }),
    expect: ["自分.手札: 仁王壁 → なし", "自分.バースト: なし → 仁王壁"],
})

// ======== BS17-051 豹人アリババ：ライフ減少の置換（表: 7個以上→4／6・5→3／4→2） ========
console.log("=== BS17-051 ===")
const alibabaAttack = (cores: number, life: number, name: string, answers: boolean[], expect: string[]) =>
    scenario({
        name,
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: ALIBABA, cores }] }, opp: { life } },
        steps: (t) => {
            attack(t, "me", "自分.豹人アリババ")
            settle(t, answers)
        },
        expect: ["自分.豹人アリババ.疲労: false → true", ...expect],
    })
alibabaAttack(2, 5, "051 Lv2 相手ライフ5：置換を選ぶと3になりコア2個が相手のリザーブへ", [true], ["相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"])
alibabaAttack(2, 5, "051 置換は任意：断れば通常どおり1つ減る", [false], ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"])
alibabaAttack(2, 7, "051 相手ライフ7：4になる（コア3個）", [true], ["相手.ライフ: 7 → 4", "相手.リザーブ: 10 → 13"])
alibabaAttack(2, 6, "051 相手ライフ6：3になる（コア3個）", [true], ["相手.ライフ: 6 → 3", "相手.リザーブ: 10 → 13"])
alibabaAttack(2, 4, "051 相手ライフ4：2になる（コア2個）", [true], ["相手.ライフ: 4 → 2", "相手.リザーブ: 10 → 12"])
alibabaAttack(2, 3, "051 相手ライフ3以下は表に当たらず通常どおり減る（確認も出ない）", [], ["相手.ライフ: 3 → 2", "相手.リザーブ: 10 → 11"])
alibabaAttack(1, 5, "051 Lv1では置換しない", [], ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"])

// ======== BS17-052 アラビアン騎士シンド・バード ========
console.log("=== BS17-052 ===")
const sinbadBlock = (name: string, o: { sinbadCores: number; guard: string; label: string; deck?: string[]; answers: boolean[]; expect: string[] }) =>
    scenario({
        name,
        start: {
            turn: "opp", phase: "attack", interactive: true,
            me: { spirits: [{ card: SINBAD, cores: o.sinbadCores }, { card: o.guard, label: o.label }], ...(o.deck ? { deck: o.deck } : {}) },
            opp: { spirits: [{ card: METAL }] },
        },
        steps: (t) => {
            attack(t, "opp", "相手.メタルバーン")
            block(t, "me", `自分.${o.label}`)
            settle(t, o.answers)
        },
        expect: ["相手.メタルバーン.疲労: false → true", ...o.expect],
    })
sinbadBlock("052 相手のアタックステップ：「雄将」の自分のスピリットが破壊されるとき、デッキ5枚を破棄して回復状態で残す", {
    sinbadCores: 1, guard: YUSHO, label: "雄将", answers: [true],
    expect: ["自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${rep("ロクケラトプス", 5)}`],
})
sinbadBlock("052 払わなければ破壊される", {
    sinbadCores: 1, guard: YUSHO, label: "雄将", answers: [false],
    expect: [gone("自分.雄将"), "自分.トラッシュ: なし → ブレーペンタンの音楽隊", "自分.リザーブ: 10 → 11"],
})
sinbadBlock("052 デッキが4枚しかなければ払えず、破壊される", {
    sinbadCores: 1, guard: YUSHO, label: "雄将", deck: [ROKU, ROKU, ROKU, ROKU], answers: [],
    expect: [gone("自分.雄将"), "自分.トラッシュ: なし → ブレーペンタンの音楽隊", "自分.リザーブ: 10 → 11"],
})
sinbadBlock("052 「雄将」でないスピリットは対象外（確認も出ず破壊される）", {
    sinbadCores: 1, guard: JEFF, label: "非雄将", answers: [],
    expect: [gone("自分.非雄将"), "自分.トラッシュ: なし → 槍兵のジェフリー", "自分.リザーブ: 10 → 11"],
})
const sinbadBurst = (name: string, o: { turn: Side; sinbadCores: number; pick?: boolean; expect: string[] }) =>
    scenario({
        name,
        start: {
            turn: o.turn, phase: "main", interactive: true,
            me: { hand: o.turn === "me" ? [BURST_P] : [], spirits: [{ card: SINBAD, cores: o.sinbadCores }] },
            opp: { hand: o.turn === "opp" ? [BURST_P] : [], spirits: [{ card: METAL, label: "m" }, { card: TORNA }] },
        },
        steps: (t) => {
            t.act(o.turn, { type: "setBurst", handIndex: 0 })
            if (o.pick) pickTargets(t, "me", ["相手.m"])
        },
        expect: o.expect,
    })
sinbadBurst("052 Lv2：相手がバーストをセットしたとき、コスト6以下の相手のスピリット1体を破壊（選ぶのは自分）", {
    turn: "opp", sinbadCores: 4, pick: true,
    expect: ["相手.手札: 冥皇封滅呪 → なし", "相手.バースト: なし → 冥皇封滅呪", gone("相手.m"), "相手.トラッシュ: なし → メタルバーン", "相手.リザーブ: 10 → 11"],
})
sinbadBurst("052 Lv1では破壊しない", { turn: "opp", sinbadCores: 1, expect: ["相手.手札: 冥皇封滅呪 → なし", "相手.バースト: なし → 冥皇封滅呪"] })
sinbadBurst("052 自分がセットしたときは破壊しない", { turn: "me", sinbadCores: 4, expect: ["自分.手札: 冥皇封滅呪 → なし", "自分.バースト: なし → 冥皇封滅呪"] })

// ======== BS17-053 青玉の海竜シュトロドーム：【粉砕】アタック時、相手のデッキを上からLvと同じ枚数破棄 ========
console.log("=== BS17-053 ===")
for (const [cores, lv] of [[1, 1], [2, 2], [5, 3]] as const) {
    scenario({
        name: `053 Lv${lv}でアタック：相手のデッキを${lv}枚破棄`,
        start: { phase: "attack", me: { spirits: [{ card: STRO, cores }] } },
        steps: (t) => {
            attack(t, "me", "自分.青玉の海竜シュトロドーム")
            settle(t)
        },
        expect: ["自分.青玉の海竜シュトロドーム.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12", `相手.デッキ枚数: 40 → ${40 - lv}`, `相手.トラッシュ: なし → ${rep("ロクケラトプス", lv)}`],
    })
}
scenario({
    name: "053 アタックしていなければ破棄しない（ブロック側）",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: STRO, cores: 2 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        attack(t, "opp", "相手.ロクケラトプス")
        block(t, "me", "自分.青玉の海竜シュトロドーム")
        settle(t)
    },
    expect: ["自分.青玉の海竜シュトロドーム.疲労: false → true", gone("相手.ロクケラトプス"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

// ======== BS17-054 マジン・ゴレム ========
console.log("=== BS17-054 ===")
const coffinLines = ["相手.手札: ダークコフィン → なし", "相手.リザーブ: 10 → 3", "相手.トラッシュのコア: 0 → 7"]
const golemCoffin = (name: string, o: { golemCores?: number; golemRested?: boolean; withAladdin: boolean; target: string; reject?: boolean; expect: string[] }) =>
    scenario({
        name,
        start: {
            turn: "opp", phase: "main",
            me: { spirits: [...(o.golemCores ? [{ card: GOLEM, cores: o.golemCores, rested: o.golemRested ?? false }] : []), ...(o.withAladdin ? [{ card: ALADDIN, rested: o.target === "自分.ロック・アラディン" }] : [])] },
            opp: { hand: [COFFIN] },
        },
        steps: (t) => {
            const action = { type: "castMagic" as const, handIndex: 0, targetInstanceId: t.id(o.target) }
            if (o.reject) t.actRejected("opp", action)
            else t.act("opp", action)
        },
        expect: o.expect,
    })
golemCoffin("054 自分のロック・アラディンは相手のマジックの効果を受けない（対象にも選べない）", {
    golemCores: 1, withAladdin: true, target: "自分.ロック・アラディン", reject: true, expect: [],
})
golemCoffin("054 対照：ゴレムがいなければロック・アラディンは破壊される", {
    withAladdin: true, target: "自分.ロック・アラディン",
    expect: [...coffinLines, "相手.トラッシュ: なし → ダークコフィン", gone("自分.ロック・アラディン"), "自分.トラッシュ: なし → ロック・アラディン", "自分.リザーブ: 10 → 11"],
})
golemCoffin("054 ゴレム自身は耐性が無い（ロック・アラディンがいない・Lv1）：破壊される", {
    golemCores: 1, golemRested: true, withAladdin: false, target: "自分.マジン・ゴレム",
    expect: [...coffinLines, "相手.トラッシュ: なし → ダークコフィン", gone("自分.マジン・ゴレム"), "自分.トラッシュ: なし → マジン・ゴレム", "自分.リザーブ: 10 → 11"],
})
golemCoffin("054 Lv2『破壊時』ロック・アラディンがいる間：疲労状態で残る", {
    golemCores: 4, golemRested: true, withAladdin: true, target: "自分.マジン・ゴレム",
    expect: [...coffinLines, "相手.トラッシュ: なし → ダークコフィン"],
})
golemCoffin("054 Lv1では残らない（破壊される）", {
    golemCores: 1, golemRested: true, withAladdin: true, target: "自分.マジン・ゴレム",
    expect: [...coffinLines, "相手.トラッシュ: なし → ダークコフィン", gone("自分.マジン・ゴレム"), "自分.トラッシュ: なし → マジン・ゴレム", "自分.リザーブ: 10 → 11"],
})

// ======== BS17-060 ジン・アームズ ========
console.log("=== BS17-060 ===")
const jinTurn = (name: string, oppHand: string[], discard: boolean, expect: string[]) =>
    scenario({
        name,
        start: {
            phase: "main", interactive: true,
            me: { hand: [JIN], spirits: [{ card: BEARD, label: "att" }, { card: JEFF }] },
            opp: { hand: oppHand },
        },
        steps: (t) => {
            t.act("me", { type: "summon", handIndex: 0 })
            drive(t)
            t.act("me", { type: "nextPhase" })
            attack(t, "me", "自分.att")
            t.act("opp", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("自分.槍兵のジェフリー") })
            if (discard) {
                drive(t) // 先に「破棄しますか？」の確認。候補が1枚なら破棄するカードは自動で選ばれる
                if (t.state.pendingChoice?.kind === "card") pickCard(t, "opp")
            }
            settle(t)
        },
        expect: [
            // コスト5－自分の青シンボル2（ベアード・ジェフリー）の軽減2＝3、置くコア1
            "自分.手札: ジン・アームズ → なし", "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", ...appears("自分.ジン・アームズ", 1, 1, 4000),
            "自分.att.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 9", "相手.トラッシュのコア: 0 → 2", ...expect,
        ],
    })
jinTurn("060 召喚したターン：相手のマジックは、使用したマジック以上のコストのカードを破棄すれば発揮できる（同コストで足りる）", [BIND, HAMMA], true, [
    "相手.手札: ハンマドレイク、バインディングソーン → なし", "相手.トラッシュ: なし → ハンマドレイク、バインディングソーン", "自分.槍兵のジェフリー.疲労: false → true",
])
jinTurn("060 破棄できるカードが無ければ効果は発揮されない（マジックは使用済みでトラッシュへ）", [BIND, ROKU], false, [
    "相手.手札: バインディングソーン、ロクケラトプス → ロクケラトプス", "相手.トラッシュ: なし → バインディングソーン",
])
scenario({
    name: "060 合体条件：覇皇のスピリットに合体できる",
    start: { phase: "main", me: { spirits: [{ card: JIN }, { card: ALADDIN }] } },
    steps: (t) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("自分.ジン・アームズ"), hostInstanceId: t.id("自分.ロック・アラディン") }),
    expect: ["自分.ジン・アームズ.場所: フィールド → 合体", "自分.ジン・アームズ.コア: 1 → 0", "自分.ジン・アームズ.BP: 4000 → なし", "自分.ロック・アラディン.コア: 1 → 2", "自分.ロック・アラディン.BP: 3000 → 7000"],
})
scenario({
    name: "060 合体条件：覇皇／雄将／創手でないスピリットには合体できない",
    start: { phase: "main", me: { spirits: [{ card: JIN }, { card: JEFF }] } },
    steps: (t) => t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("自分.ジン・アームズ"), hostInstanceId: t.id("自分.槍兵のジェフリー") }),
    expect: [],
})

// ======== BS17-071 開かれた岩扉 ========
console.log("=== BS17-071 ===")
scenario({
    name: "071 コスト0/3/6のスピリットはブロックできない（自分側）。コスト1はできる",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: DOL }, { card: BEARD }, { card: MITH }, { card: JEFF }], nexuses: [{ card: DOOR, cores: 0 }] }, opp: { spirits: [{ card: ROKU }] } },
    steps: (t) => {
        attack(t, "opp", "相手.ロクケラトプス")
        passFlash(t) // ブロックを宣言できるのはフラッシュを閉じてから（拒否の理由がフラッシュタイミングにならないように）
        for (const l of ["自分.ドルフィーノ", "自分.熊男ベアード", "自分.ミスリル・ゴレム"]) t.actRejected("me", { type: "block", instanceId: t.id(l) })
        block(t, "me", "自分.槍兵のジェフリー")
        settle(t)
    },
    expect: ["自分.槍兵のジェフリー.疲労: false → true", gone("相手.ロクケラトプス"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})
scenario({
    name: "071 お互い：相手のコスト0/3/6のスピリットもブロックできない",
    start: { phase: "attack", me: { spirits: [{ card: JEFF }], nexuses: [{ card: DOOR, cores: 0 }] }, opp: { spirits: [{ card: GORA }, { card: METAL }, { card: TORNA }] } },
    steps: (t) => {
        attack(t, "me", "自分.槍兵のジェフリー")
        passFlash(t)
        for (const l of ["相手.ゴラドン", "相手.メタルバーン", "相手.トルネードラ"]) t.actRejected("opp", { type: "block", instanceId: t.id(l) })
        settle(t)
    },
    expect: ["自分.槍兵のジェフリー.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
const doorWin = (name: string, o: { doorCores: number; attacker: string; attackerCores: number; expect: string[] }) =>
    scenario({
        name,
        start: { phase: "attack", me: { spirits: [{ card: o.attacker, label: "att", cores: o.attackerCores }], nexuses: [{ card: DOOR, cores: o.doorCores }] }, opp: { spirits: [{ card: ROKU }] } },
        steps: (t) => {
            attack(t, "me", "自分.att")
            block(t, "opp", "相手.ロクケラトプス")
            settle(t)
        },
        expect: o.expect,
    })
const roku = [gone("相手.ロクケラトプス"), "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
doorWin("071 Lv2：「雄将」の自分のスピリットがBP比べで相手のスピリットだけを破壊：このネクサスにコア+1", {
    doorCores: 1, attacker: YUSHO, attackerCores: 2, expect: ["自分.att.疲労: false → true", "自分.開かれた岩扉.コア: 1 → 2", ...roku],
})
doorWin("071 Lv1では置かない", { doorCores: 0, attacker: YUSHO, attackerCores: 2, expect: ["自分.att.疲労: false → true", ...roku] })
doorWin("071 「雄将」でなければ置かない", { doorCores: 1, attacker: JEFF, attackerCores: 1, expect: ["自分.att.疲労: false → true", ...roku] })
doorWin("071 相打ち（自分のスピリットも破壊された）なら置かない", {
    doorCores: 1, attacker: YUSHO, attackerCores: 1,
    expect: [gone("自分.att"), "自分.トラッシュ: なし → ブレーペンタンの音楽隊", "自分.リザーブ: 10 → 11", ...roku],
})

// ======== BS17-072 願い叶えるランプ ========
console.log("=== BS17-072 ===")
const lampStart = (name: string, o: { turn?: Side; lampCores: number; mine: string[]; oppSpirits: { label: string; rested?: boolean }[]; pick: string[]; expect: string[] }) =>
    scenario({
        name,
        start: {
            turn: o.turn ?? "opp", phase: "main", interactive: true,
            me: { spirits: o.mine.map((card, i) => ({ card, label: `m${i + 1}` })), nexuses: [{ card: LAMP, cores: o.lampCores }] },
            opp: { spirits: o.oppSpirits.map((x) => ({ card: ROKU, label: x.label, rested: x.rested ?? false })) },
        },
        steps: (t) => {
            t.act(o.turn ?? "opp", { type: "nextPhase" })
            if (o.pick.length > 0) pickTargets(t, "opp", o.pick, true)
        },
        expect: o.expect,
    })
const five = ["r1", "r2", "r3", "r4", "r5"].map((label) => ({ label }))
lampStart("072 相手のステップ開始時、自分のスピリットが2体以下：相手は回復状態が3体になるよう自分で選んで疲労させる（Lv1）", {
    lampCores: 0, mine: [JEFF, GUSTAV], oppSpirits: five, pick: ["相手.r1", "相手.r2"],
    expect: ["相手.r1.疲労: false → true", "相手.r2.疲労: false → true"],
})
lampStart("072 すでに疲労しているスピリットは数えない：回復4体＋疲労1体なら1体だけ疲労させる", {
    lampCores: 0, mine: [JEFF], oppSpirits: [{ label: "r1" }, { label: "r2" }, { label: "r3" }, { label: "r4" }, { label: "r5", rested: true }], pick: ["相手.r3"],
    expect: ["相手.r3.疲労: false → true"],
})
lampStart("072 自分のスピリットが3体なら何もしない", { lampCores: 0, mine: [JEFF, GUSTAV, DOL], oppSpirits: five, pick: [], expect: [] })
lampStart("072 回復状態が3体以下なら何もしない", { lampCores: 0, mine: [JEFF], oppSpirits: [{ label: "r1" }, { label: "r2" }, { label: "r3" }, { label: "r4", rested: true }], pick: [], expect: [] })
lampStart("072 自分のアタックステップでは働かない（『相手の』）", { turn: "me", lampCores: 0, mine: [JEFF], oppSpirits: five, pick: [], expect: [] })
const lampSummon = (name: string, o: { lampCores: number; mine: string[]; expect: string[] }) =>
    scenario({
        name,
        start: {
            turn: "opp", phase: "main",
            me: { spirits: o.mine.map((card) => ({ card })), nexuses: [{ card: LAMP, cores: o.lampCores }] },
            opp: { hand: [EMERALD] },
        },
        steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
        expect: ["相手.手札: エメラルドシーザー → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...appears("相手.エメラルドシーザー", 1, 1, 3000), ...o.expect],
    })
lampSummon("072 Lv2：ロック・アラディンは相手のスピリットの効果を受けない（唯一の候補なので疲労しない）", { lampCores: 1, mine: [ALADDIN], expect: [] })
lampSummon("072 Lv1では効果を受ける", { lampCores: 0, mine: [ALADDIN], expect: ["自分.ロック・アラディン.疲労: false → true"] })
lampSummon("072 Lv2でもロック・アラディン以外は効果を受ける", { lampCores: 1, mine: [ALADDIN, JEFF], expect: ["自分.槍兵のジェフリー.疲労: false → true"] })

// ======== BS17-083 アブラカダブラ ========
console.log("=== BS17-083 ===")
const abraBase = (oppHand: string[], oppCard: string) => ({
    turn: "opp" as const, phase: "main" as const, interactive: true,
    me: { burst: ABRA, spirits: [{ card: ALADDIN }, { card: JEFF }], nexuses: [{ card: DOOR }] },
    opp: { hand: oppHand },
    note: oppCard,
})
const dragu = ["相手.手札: ドラグサウルス → なし", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 3", ...appears("相手.ドラグサウルス", 1, 1, 1000)]
const abraUsed = ["自分.バースト: アブラカダブラ → なし", gone("自分.開かれた岩扉").replace("フィールド", "ネクサス")]
scenario({
    name: "083 バースト：相手の召喚時効果の発揮後、そのスピリットの色（赤）のマジックを使えなくする（コストは払わない）",
    start: abraBase([DRAGU, NEXCOL], DRAGU),
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        drive(t, [true, false])
        t.actRejected("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: [...dragu.filter((l) => !l.startsWith("相手.手札")), ...abraUsed, "自分.トラッシュ: なし → アブラカダブラ、開かれた岩扉", "自分.リザーブ: 10 → 11", "相手.手札: ドラグサウルス、ネクサスコラプス → ネクサスコラプス"], // 破壊された岩扉のコア1個はリザーブへ
})
scenario({
    name: "083 禁止されるのは同じ色だけ：青のマジックは使える",
    start: abraBase([DRAGU, HAMMER], DRAGU),
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        drive(t, [true, false])
        t.act("opp", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        ...abraUsed, "相手.手札: ドラグサウルス、マジックハンマー → なし", "相手.リザーブ: 10 → 2", "相手.トラッシュのコア: 0 → 7", "相手.トラッシュ: なし → マジックハンマー",
        ...dragu.slice(3), "自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → アブラカダブラ、${rep("ロクケラトプス", 5)}、開かれた岩扉`,
        "自分.リザーブ: 10 → 11", // 破壊された岩扉のコア
    ],
})
scenario({
    name: "083 その後コストを支払う：召喚時効果を持つスピリットすべて（お互い）を疲労させる",
    start: abraBase([DRAGU], DRAGU),
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        drive(t, [true, true])
    },
    expect: [
        ...dragu.filter((l) => !l.includes("ドラグサウルス.疲労")), ...abraUsed, "自分.トラッシュ: なし → アブラカダブラ、開かれた岩扉",
        // コスト3－自分の青シンボルによる軽減1＝2、破壊された岩扉のコア1個がリザーブへ（10-2+1＝9）
        "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 2",
        "相手.ドラグサウルス.疲労: なし → true", "自分.ロック・アラディン.疲労: false → true",
    ],
})
scenario({
    name: "083 召喚時効果を持たないスピリットの召喚では発動しない",
    start: abraBase([ROKU], ROKU),
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        drive(t)
    },
    expect: ["相手.手札: ロクケラトプス → なし", "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 1", ...appears("相手.ロクケラトプス", 1, 1, 1000)],
})

// ======== BS17-084 トライアングルバン ========
console.log("=== BS17-084 ===")
const triAttack = (name: string, declared: string, answers: boolean[], expect: string[]) =>
    scenario({
        name,
        start: { phase: "attack", interactive: true, me: { hand: [TRI], spirits: [{ card: JEFF }] }, opp: { burst: BURST_P } },
        steps: (t) => {
            attack(t, "me", "自分.槍兵のジェフリー")
            t.act("opp", { type: "pass" }) // アタック宣言後の優先権は防御側から。パスで自分に回ってから使う
            t.act("me", { type: "castMagic", handIndex: 0 })
            pickOption(t, "me", `コスト${declared}`)
            settle(t, answers)
        },
        expect: ["自分.手札: トライアングルバン → なし", "自分.トラッシュのコア: 0 → 2", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "相手.バースト: 冥皇封滅呪 → なし", ...expect], // トライアングルバンはコスト3－自分の青シンボル1の軽減1＝2
    })
triAttack("084 コスト4を指定：相手はコスト4のバースト効果を発揮できない（バーストは発動し効果だけ飛ばす）", "4", [true], [
    "自分.トラッシュ: なし → トライアングルバン", "自分.槍兵のジェフリー.疲労: false → true", "相手.トラッシュ: なし → 冥皇封滅呪", "自分.リザーブ: 10 → 8",
])
triAttack("084 対照：コスト3を指定ならコスト4のバースト効果は発揮される（疲労したジェフリーが破壊される）", "3", [true, false], [
    "自分.トラッシュ: なし → トライアングルバン、槍兵のジェフリー", gone("自分.槍兵のジェフリー"), "自分.リザーブ: 10 → 9", "相手.トラッシュ: なし → 冥皇封滅呪",
])

// ======== BS17-X06 千夜一夜物語の女帝シェハラザード ========
console.log("=== BS17-X06 ===")
const shehSummon = (name: string, hand: string[], answers: boolean[], expect: string[]) =>
    scenario({
        name,
        start: { phase: "main", interactive: true, me: { hand } },
        steps: (t) => {
            t.act("me", { type: "summon", handIndex: 0 })
            drive(t, [...answers]) // scenario は p1・p2 で steps を2回走らせ、drive は配列を消費する
            if (t.state.pendingChoice && t.state.pendingChoice.kind === "card") pickCard(t, "me")
        },
        expect: ["自分.トラッシュのコア: 0 → 6", ...appears("自分.千夜一夜物語の女帝シェハラザード", 1, 1, 5000), ...expect],
    })
shehSummon("X06 召喚時：手札の「雄将」のスピリット1枚をコストを支払わずに召喚できる", [SHEH, YUSHO], [true], [
    "自分.手札: ブレーペンタンの音楽隊、千夜一夜物語の女帝シェハラザード → なし", ...appears("自分.ブレーペンタンの音楽隊", 1, 1, 1000), "自分.リザーブ: 10 → 2",
])
// 無償召喚でも置くコア1個はリザーブから（reserve 3 → 2）
shehSummon("X06 召喚時：断れば召喚しない", [SHEH, YUSHO], [false], ["自分.手札: ブレーペンタンの音楽隊、千夜一夜物語の女帝シェハラザード → ブレーペンタンの音楽隊", "自分.リザーブ: 10 → 3"])
shehSummon("X06 召喚時：「雄将」でなければ候補にならない", [SHEH, ROKU], [], ["自分.手札: ロクケラトプス、千夜一夜物語の女帝シェハラザード → ロクケラトプス", "自分.リザーブ: 10 → 3"])
const shehAttack = (name: string, o: { shehCores: number; attacker: string; answers: boolean[]; life: number; expect: string[] }) =>
    scenario({
        name,
        start: { phase: "attack", interactive: true, me: { spirits: [{ card: SHEH, cores: o.shehCores }, { card: o.attacker, label: "att" }] }, opp: { life: o.life } },
        steps: (t) => {
            attack(t, "me", "自分.att")
            settle(t, o.answers)
        },
        expect: ["自分.att.疲労: false → true", ...o.expect],
    })
shehAttack("X06 Lv2：「雄将」の自分のスピリットが相手のライフを減らすとき、置換できる（5→3）", { shehCores: 3, attacker: YUSHO, answers: [true], life: 5, expect: ["相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"] })
shehAttack("X06 置換は任意：断れば1つ減る", { shehCores: 3, attacker: YUSHO, answers: [false], life: 5, expect: ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"] })
shehAttack("X06 「覇皇」でも「雄将」でもないスピリットのアタックには使えない", { shehCores: 3, attacker: JEFF, answers: [], life: 5, expect: ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"] })
shehAttack("X06 Lv1では置換しない", { shehCores: 1, attacker: YUSHO, answers: [], life: 5, expect: ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"] })
shehAttack("X06 相手のライフが3以下なら表に当たらず通常どおり", { shehCores: 3, attacker: YUSHO, answers: [], life: 3, expect: ["相手.ライフ: 3 → 2", "相手.リザーブ: 10 → 11"] })
shehAttack("X06 相手のライフ7なら4になる", { shehCores: 3, attacker: YUSHO, answers: [true], life: 7, expect: ["相手.ライフ: 7 → 4", "相手.リザーブ: 10 → 13"] })

console.log("すべてのチェックに合格しました 🎉（part622）")
