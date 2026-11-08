// smoke パート852（BS23 赤バッチ：006 ガーディアン・ドラゴン・007 シルバー・ヴルム・008 アンドロメダ・ドラゴン・009 コーカサストリケラ。
// 【強化】＝「BP破壊効果」の上限+1000（007 は2つ）。BS23_PLAN §1 の 008「自身の【強化】で上限が上がる（Q4466）」と効果文から）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const GUARDIAN = "BS23-006"
const VLUM = "BS23-007"
const ANDROMEDA = "BS23-008"
const CAUCASUS = "BS23-009"
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・Lv1 BP1000／Lv2 2コア BP3000）
const BEETLE = "BS01-050" // ビートビートル（緑・殻虫・コスト0・Lv1 BP1000）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv1 BP4000／Lv2 4コア BP7000）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・Lv1 BP5000／Lv4 4コア BP9000）
const MATANGOL = "BS10-028" // マタンゴル（緑・コスト5・Lv1 BP6000）
const METALBURN = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000／Lv3 8コア BP8000）
const JUGONG = "BS03-042" // 海獣ジューゴン（白・コスト4・Lv3 4コア BP8000）
const MACHFLY = "BS03-029" // マッハフライ（緑・怪虫・コスト3・Lv1 BP2000）
const GOLNICK = "BS21-055" // ゴルニック・イーグル（ブレイヴ・赤・コスト3・合体時BP+3000）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, n: string, type: string, cost: number) =>
        assert(getCard(id).name === n && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${n}（${type}・コスト${cost}）`)
    chk(GUARDIAN, "ガーディアン・ドラゴン", "spirit", 5)
    chk(VLUM, "シルバー・ヴルム", "spirit", 5)
    chk(ANDROMEDA, "星雲竜アンドロメダ・ドラゴン", "spirit", 6)
    chk(CAUCASUS, "コーカサストリケラ", "spirit", 8)
    chk(ROKU, "ロクケラトプス", "spirit", 1)
    chk(BEETLE, "ビートビートル", "spirit", 0)
    chk(HADES, "デス・ハーデス", "spirit", 3)
    chk(WINGAL, "ウィンガル", "spirit", 6)
    chk(MATANGOL, "マタンゴル", "spirit", 5)
    chk(METALBURN, "メタルバーン", "spirit", 3)
    chk(JUGONG, "海獣ジューゴン", "spirit", 4)
    chk(MACHFLY, "マッハフライ", "spirit", 3)
    chk(GOLNICK, "ゴルニック・イーグル", "brave", 3)
    assert(getCard(CAUCASUS).family?.includes("怪虫") === true && getCard(CAUCASUS).family?.includes("地竜") === true, "009 は怪虫・地竜")
    assert(getCard(MACHFLY).family?.includes("怪虫") === true && getCard(MACHFLY).family?.includes("地竜") !== true, "マッハフライは怪虫だけ")
}

const name = (id: string) => getCard(id).name
const lifeHit = ["相手.ライフ: 5 → 4"]

// --- BS23-006 ----------------------------------------------------------------
console.log("=== 006: バトル時にBP3000以下を破壊。相手のアタックステップなら、この効果で破壊したとき回復する ===")
scenario({
    name: "006-自分のターンでは回復しない",
    start: { me: { spirits: [{ card: GUARDIAN, cores: 1 }] }, opp: { spirits: [{ card: METALBURN, label: "T" }, { card: WINGAL, label: "U" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(name(GUARDIAN)) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        `自分.${name(GUARDIAN)}.疲労: false → true`,
        ...lifeHit,
        "相手.T.場所: フィールド → なし",
        `相手.トラッシュ: なし → ${name(METALBURN)}`,
        "相手.リザーブ: 10 → 12",
    ],
})
// 006 はブロックで疲労する。回復すれば疲労なしのまま。相手のアタッカー A（BP4000）は 006（Lv2 BP6000）に倒される
function guardianBlock(label: string, oppSpirits: { card: string; label: string }[], destroyed: string[], recovered: boolean) {
    scenario({
        name: label,
        start: { turn: "opp", me: { spirits: [{ card: GUARDIAN, cores: 3 }] }, opp: { spirits: oppSpirits } },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("A") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id(name(GUARDIAN)) })
            t.closeFlash()
        },
        expect: [
            ...(recovered ? [] : [`自分.${name(GUARDIAN)}.疲労: false → true`]),
            ...destroyed.map((l) => `相手.${l}.場所: フィールド → なし`),
            `相手.トラッシュ: なし → ${[name(HADES), ...(destroyed.length > 1 ? [name(METALBURN)] : [])].sort().join("、")}`,
            `相手.リザーブ: 10 → ${10 + destroyed.length}`,
        ],
    })
}
guardianBlock("006-相手のアタックステップで破壊したら回復", [{ card: HADES, label: "A" }, { card: METALBURN, label: "T" }], ["A", "T"], true)
guardianBlock("006-破壊しなければ回復しない", [{ card: HADES, label: "A" }], ["A"], false)

// --- BS23-007 / 【強化】の上限 -------------------------------------------------
// 破壊役は 006（上限3000）。007 のLv1は【強化】1つ（+1000）、Lv2（2コア）は2つ（+2000）。
console.log("=== 007: 【強化】で「BP破壊効果」の上限が上がる（Lv1は+1000、Lv2は+2000）===")
function capCase(label: string, me: { card: string; cores: number; label?: string }[], opp: { card: string; label: string; cores?: number }[], destroyed: boolean, oppHasVlum = false) {
    scenario({
        name: label,
        start: { me: { spirits: [{ card: GUARDIAN, cores: 1 }, ...me] }, opp: { spirits: opp } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(name(GUARDIAN)) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            `自分.${name(GUARDIAN)}.疲労: false → true`,
            ...lifeHit,
            ...(destroyed
                ? ["相手.X.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(opp[0]!.card)}`, "相手.リザーブ: 10 → 12"]
                : ["相手.リザーブ: 10 → 11"]),
        ],
    })
    void oppHasVlum
}
const X = (card: string) => [{ card, label: "X" }]
capCase("007-Lv1で上限4000", [{ card: VLUM, cores: 1 }], X(HADES), true)
capCase("007-Lv1では5000は壊せない", [{ card: VLUM, cores: 1 }], X(WINGAL), false)
capCase("007-Lv2で上限5000", [{ card: VLUM, cores: 2 }], X(WINGAL), true)
capCase("007-Lv2でも6000は壊せない", [{ card: VLUM, cores: 2 }], X(MATANGOL), false)
capCase("007-【強化】が無ければ上限3000のまま", [], X(HADES), false)
// 相手の【強化】は自分の上限を上げない
scenario({
    name: "007-相手の007は自分の上限を上げない",
    start: { me: { spirits: [{ card: GUARDIAN, cores: 1 }] }, opp: { spirits: [{ card: HADES, label: "X" }, { card: VLUM, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(name(GUARDIAN)) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [`自分.${name(GUARDIAN)}.疲労: false → true`, ...lifeHit, "相手.リザーブ: 10 → 11"],
})

// --- BS23-008 ----------------------------------------------------------------
// 召喚コストは6。007 など赤シンボルのある味方がいれば軽減1（その場面はコメントで書く）
console.log("=== 008: 召喚時にBP6000以下を破壊することで、【強化】を持つ自分のスピリット1体につき1枚ドロー ===")
const andro = name(ANDROMEDA)
const newAndro = [
    `自分.${andro}.場所: なし → フィールド`, `自分.${andro}.疲労: なし → false`, `自分.${andro}.コア: なし → 1`,
    `自分.${andro}.Lv: なし → 1`, `自分.${andro}.BP: なし → 5000`,
]
function androCase(label: string, ally: { card: string; cores: number }[], oppCard: string, oppCores: number, opts: { destroyed: boolean; draws: number }) {
    const reduction = ally.length > 0 ? 1 : 0 // 味方の赤シンボル1つ
    scenario({
        name: label,
        start: { me: { hand: [ANDROMEDA], spirits: ally }, opp: { spirits: [{ card: oppCard, label: "X", cores: oppCores }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [
            ...newAndro,
            `自分.リザーブ: 10 → ${10 - (6 - reduction) - 1}`,
            `自分.トラッシュのコア: 0 → ${6 - reduction}`,
            ...(opts.draws === 0
                ? [`自分.手札: ${andro} → なし`]
                : [
                      `自分.手札: ${andro} → ${Array(opts.draws).fill(name(ROKU)).join("、")}`,
                      `自分.デッキ枚数: 40 → ${40 - opts.draws}`,
                  ]),
            ...(opts.destroyed
                ? ["相手.X.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(oppCard)}`, `相手.リザーブ: 10 → ${10 + oppCores}`]
                : []),
        ],
    })
}
// 自身の【強化】で上限が6000+1000（Q4466）。強化持ちは自身だけなので1枚
androCase("008-自身の強化で上限7000・1枚ドロー", [], HADES, 4, { destroyed: true, draws: 1 })
// 007 Lv2（強化2つ分の上限+2000）＋自身+1000＝9000。強化を持つスピリットは008と007の2体で2枚
androCase("008-007と並べば上限9000・2枚ドロー", [{ card: VLUM, cores: 2 }], WINGAL, 4, { destroyed: true, draws: 2 })
androCase("008-上限を超えるBPは破壊できず引けない", [], JUGONG, 4, { destroyed: false, draws: 0 })
scenario({
    name: "008-破壊する相手がいなければ引けない",
    start: { me: { hand: [ANDROMEDA] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...newAndro, "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", `自分.手札: ${andro} → なし`],
})

// Lv2･Lv3『自分のターン』相手の合体スピリットの「合体時BP+」を0として扱う。
// 相手が自分のターンの前に合体しておく：相手のターンに合体 → 終了。ターン開始の自動処理（ドロー1・コア1）は規則どおり
console.log("=== 008: Lv2以上で、自分のターン中は相手の合体スピリットの合体時BPを0として扱う ===")
function androBp(label: string, cores: number, bonusApplies: boolean) {
    scenario({
        name: label,
        start: {
            turn: "opp",
            me: { spirits: [{ card: ANDROMEDA, cores }] },
            opp: { spirits: [{ card: METALBURN, label: "ホスト" }, { card: GOLNICK, cores: 1 }] },
        },
        steps(t) {
            t.act("opp", { type: "combineBrave", braveInstanceId: t.id(name(GOLNICK)), hostInstanceId: t.id("ホスト") })
            t.act("opp", { type: "endTurn" })
        },
        expect: [
            `相手.${name(GOLNICK)}.場所: フィールド → 合体`,
            `相手.${name(GOLNICK)}.コア: 1 → 0`,
            `相手.${name(GOLNICK)}.BP: 3000 → なし`,
            "相手.ホスト.コア: 1 → 2",
            ...(bonusApplies ? ["相手.ホスト.BP: 3000 → 6000"] : []),
            "自分.手札: なし → ロクケラトプス",
            "自分.デッキ枚数: 40 → 39",
            "自分.リザーブ: 10 → 11",
        ],
    })
}
androBp("008-Lv2は相手の合体時BPを0として扱う", 2, false)
androBp("008-Lv1は相手の合体時BPがそのまま乗る", 1, true)

// --- BS23-009 ----------------------------------------------------------------
console.log("=== 009: 怪虫がアタックしたらBP5000以下を破壊（Lv1〜）、地竜がアタックしたらコア1個をそのスピリットへ（Lv2〜）===")
const cauc = name(CAUCASUS)
function caucCase(label: string, opts: { cores: number; attacker: string; ally?: string; destroyed: boolean; coreTo?: string; soul?: boolean; extra?: string[] }) {
    const ally = opts.ally ? [{ card: opts.ally }] : []
    // 009 は赤と緑のシンボル2つなので、ライフを受けられると2減る
    const loss = opts.attacker === cauc ? 2 : 1
    scenario({
        name: label,
        start: {
            me: { spirits: [{ card: CAUCASUS, cores: opts.cores }, ...ally], ...(opts.soul ? { soulCore: cauc } : {}) },
            opp: { spirits: [{ card: WINGAL, label: "T" }, { card: MATANGOL, label: "U" }] },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(opts.attacker) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            `自分.${opts.attacker}.疲労: false → true`,
            `相手.ライフ: 5 → ${5 - loss}`,
            ...(opts.destroyed
                ? ["相手.T.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(WINGAL)}`, `相手.リザーブ: 10 → ${11 + loss}`]
                : [`相手.リザーブ: 10 → ${10 + loss}`]),
            ...(opts.extra ?? []),
        ],
    })
}
caucCase("009-自身がアタックで破壊とコア（Lv2）", { cores: 3, attacker: cauc, destroyed: true, extra: [`自分.${cauc}.コア: 3 → 4`] })
caucCase("009-ソウルコアがあってもコアは置かれる", { cores: 3, attacker: cauc, destroyed: true, soul: true, extra: [`自分.${cauc}.コア: 3 → 4`] })
caucCase("009-Lv1ではコアは置かれず破壊だけ", { cores: 1, attacker: cauc, destroyed: true })
caucCase("009-地竜の味方がアタックしたらその味方にコア", {
    cores: 3, attacker: name(ROKU), ally: ROKU, destroyed: false,
    extra: [`自分.${name(ROKU)}.コア: 1 → 2`, `自分.${name(ROKU)}.Lv: 1 → 2`, `自分.${name(ROKU)}.BP: 1000 → 3000`],
})
caucCase("009-怪虫の味方がアタックしたら破壊だけ", { cores: 3, attacker: name(MACHFLY), ally: MACHFLY, destroyed: true })
caucCase("009-怪虫でも地竜でもない味方では何も起きない", { cores: 3, attacker: name(BEETLE), ally: BEETLE, destroyed: false })

console.log("すべてのチェックに合格しました 🎉（part852）")
