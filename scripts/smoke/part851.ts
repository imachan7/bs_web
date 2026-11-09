// smoke パート851（BS23 赤バッチ：001 ディメトロン・002 ドラコレックス【合体時】・004 ソウエン・ドラグーン・005 シューティングスター。BS23_PLAN §1 の Q4458〜Q4462 と効果文から）
// 期待値は効果文だけから書いた。「相手の効果で疲労させる対象」は、ブロックして疲労済みの個体より未疲労の個体を選ぶ前提
import { assert, getCard } from "./helpers"
import type { ScenarioCtx } from "./scenario"
import { scenario } from "./scenario"

const DIMETRON = "BS23-001"
const DORACO = "BS23-002"
const SOUEN = "BS23-004"
const SHOOTING = "BS23-005"
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・Lv1 BP1000／Lv2 2コア BP3000）
const BEETLE = "BS01-050" // ビートビートル（緑・殻虫・コスト0・緑シンボル・Lv1 BP1000／Lv2 2コア BP2000）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv1 BP4000）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・Lv1 BP5000）
const MATANGOL = "BS10-028" // マタンゴル（緑・コスト5・Lv1 BP6000）
const METALBURN = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const SITORI = "BS21-057" // 冥獣騎シトリー（ブレイヴ・コスト3・合体条件コスト3以上・合体時BP+0）
const ARK = "BS21-X01" // 光輝龍皇シャイニング・ドラゴン・アーク（赤・コスト7）
const JIEND = "BS20-X01" // 滅龍帝ジエンド・ドラゴニス（赤・滅龍・コスト9・Lv1 BP9000）
const GORADON = "BS01-001" // ゴラドン（赤・コスト0・Lv1 BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, cost: number) =>
        assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${name}（${type}・コスト${cost}）`)
    chk(DIMETRON, "扇剣竜ディメトロン", "spirit", 2)
    chk(DORACO, "恐竜剣聖ドラコレックス", "spirit", 3)
    chk(SOUEN, "ソウエン・ドラグーン", "spirit", 4)
    chk(SHOOTING, "流星の剣聖シューティングスター", "spirit", 5)
    chk(ROKU, "ロクケラトプス", "spirit", 1)
    chk(BEETLE, "ビートビートル", "spirit", 0)
    chk(HADES, "デス・ハーデス", "spirit", 3)
    chk(WINGAL, "ウィンガル", "spirit", 6)
    chk(MATANGOL, "マタンゴル", "spirit", 5)
    chk(METALBURN, "メタルバーン", "spirit", 3)
    chk(SITORI, "冥獣騎シトリー", "brave", 3)
    chk(ARK, "光輝龍皇シャイニング・ドラゴン・アーク", "spirit", 7)
    chk(JIEND, "滅龍帝ジエンド・ドラゴニス", "spirit", 9)
    chk(GORADON, "ゴラドン", "spirit", 0)
    assert(getCard(SOUEN).family?.[0] === "星竜" && getCard(JIEND).family?.[0] === "滅龍", "ジエンドは滅龍・ソウエンは星竜")
    assert(getCard(DORACO).family?.includes("剣使") === true && getCard(DORACO).family?.includes("地竜") === true, "002 は剣使・地竜")
    assert(getCard(ROKU).family?.includes("地竜") === true && getCard(BEETLE).family?.includes("殻虫") === true, "ロクケラトプスは地竜・ビートビートルは殻虫")
}

const name = (id: string) => getCard(id).name

// --- BS23-001 ---------------------------------------------------------------
// ブロッカー B（BP5000）に 001（BP1000）が倒される。B は破壊上限4000を超え、ブロックで疲労済み
function dimetronCase(green: boolean, opp: { card: string; label: string }[], expect: string[], label: string) {
    scenario({
        name: label,
        start: {
            me: { spirits: [{ card: DIMETRON, cores: 1 }, ...(green ? [{ card: BEETLE }] : [])] },
            opp: { spirits: opp },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("扇剣竜ディメトロン") })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("B") })
            t.closeFlash()
        },
        expect: [
            "自分.扇剣竜ディメトロン.場所: フィールド → なし",
            "自分.トラッシュ: なし → 扇剣竜ディメトロン",
            "自分.リザーブ: 10 → 11",
            "相手.B.疲労: false → true",
            ...expect,
        ],
    })
}
const B = { card: WINGAL, label: "B" }
const T = { card: HADES, label: "T" }
const Z = { card: MATANGOL, label: "Z" }
const tGone = ["相手.T.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(HADES)}`, "相手.リザーブ: 10 → 11"]

console.log("=== 001: 破壊時にBP4000以下を破壊。緑シンボルがあれば【連鎖】で相手1体を疲労 ===")
dimetronCase(true, [B, T, Z], [...tGone, "相手.Z.疲労: false → true"], "001-連鎖あり")
dimetronCase(false, [B, T, Z], tGone, "001-緑シンボルなしは連鎖しない")
// 連鎖元の対象がいなくても条件を満たせば連鎖は発揮する（BS19 調査の Q773）。B は疲労済みなので疲労させる相手は Z
dimetronCase(true, [B, Z], ["相手.Z.疲労: false → true"], "001-連鎖元に対象がいなくても連鎖する")

// --- BS23-002 【合体時】Lv2･Lv3 --------------------------------------------
const combine = (t: ScenarioCtx, host: string) =>
    t.act("me", { type: "combineBrave", braveInstanceId: t.id(name(SITORI)), hostInstanceId: t.id(host) })
const hostName = name(DORACO)
const combineLines = (hostCores: number) => [
    `自分.${name(SITORI)}.場所: フィールド → 合体`,
    `自分.${name(SITORI)}.コア: 1 → 0`,
    `自分.${name(SITORI)}.BP: 2000 → なし`,
    `自分.${hostName}.コア: ${hostCores} → ${hostCores + 1}`,
]
const draw1 = [`自分.手札: なし → ${name(ROKU)}`, "自分.デッキ枚数: 40 → 39"]
const lifeHit = ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

function dracoCase(label: string, opts: { hostCores: number; brave: boolean; attacker: string; ally?: { card: string; label: string }[]; expect: string[] }) {
    scenario({
        name: label,
        start: {
            me: {
                spirits: [
                    { card: DORACO, cores: opts.hostCores },
                    ...(opts.brave ? [{ card: SITORI, cores: 1 }] : []),
                    ...(opts.ally ?? []),
                ],
            },
        },
        steps(t) {
            if (opts.brave) combine(t, hostName)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(opts.attacker) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [...(opts.brave ? combineLines(opts.hostCores) : []), ...lifeHit, ...opts.expect],
    })
}
console.log("=== 002: 合体中のLv2以上で、剣使/地竜の自分のスピリットがアタックしたら1枚ドロー ===")
dracoCase("002-合体Lv2で自身がアタック", { hostCores: 3, brave: true, attacker: hostName, expect: [`自分.${hostName}.疲労: false → true`, ...draw1] })
dracoCase("002-合体Lv2で地竜の味方がアタック", {
    hostCores: 3, brave: true, attacker: name(ROKU), ally: [{ card: ROKU, label: name(ROKU) }],
    expect: [`自分.${name(ROKU)}.疲労: false → true`, ...draw1],
})
dracoCase("002-剣使も地竜も持たない味方のアタックでは引かない", {
    hostCores: 3, brave: true, attacker: name(BEETLE), ally: [{ card: BEETLE, label: name(BEETLE) }],
    expect: [`自分.${name(BEETLE)}.疲労: false → true`],
})
// コア1個＋ブレイヴのコア1個＝2個でLv1のまま（Lv2は3個）
dracoCase("002-合体してもLv1なら引かない", { hostCores: 1, brave: true, attacker: hostName, expect: [`自分.${hostName}.疲労: false → true`] })
dracoCase("002-合体していなければ引かない", { hostCores: 3, brave: false, attacker: hostName, expect: [`自分.${hostName}.疲労: false → true`] })

// --- BS23-004 ----------------------------------------------------------------
// 軽減は場の赤シンボル（ソウエン自身）1つ。疲労で-2 → 9-1-2=6、Lv1の維持コア1
console.log("=== 004: 滅龍のコスト9以上を召喚するとき、疲労させてコスト-2 ===")
const newJiend = [
    `自分.${name(JIEND)}.場所: なし → フィールド`,
    `自分.${name(JIEND)}.疲労: なし → false`,
    `自分.${name(JIEND)}.コア: なし → 1`,
    `自分.${name(JIEND)}.Lv: なし → 1`,
    `自分.${name(JIEND)}.BP: なし → 9000`,
    `自分.手札: ${name(JIEND)} → なし`,
]
// 「疲労させることで」の指定方法（アクションの形）は未確定。既存の肩代わりの欄 shinsokuAssistInstanceIds で仮置き
scenario({
    name: "004-疲労でコスト-2",
    start: { me: { hand: [JIEND], spirits: [{ card: SOUEN, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id(name(SOUEN))] }),
    expect: [...newJiend, "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", `自分.${name(SOUEN)}.疲労: false → true`],
})
scenario({
    name: "004-疲労させなければコストは減らない",
    start: { me: { hand: [JIEND], spirits: [{ card: SOUEN, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...newJiend, "自分.リザーブ: 10 → 1", "自分.トラッシュのコア: 0 → 8"],
})
scenario({
    name: "004-滅龍でないスピリットには使えない",
    start: { me: { hand: [ROKU], spirits: [{ card: SOUEN, cores: 1 }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id(name(SOUEN))] }),
    expect: [],
})
scenario({
    name: "004-疲労済みでは使えない",
    start: { me: { hand: [JIEND], spirits: [{ card: SOUEN, cores: 1, rested: true }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [t.id(name(SOUEN))] }),
    expect: [],
})
console.log("=== 004: ブロックされたら1枚ドロー ===")
scenario({
    name: "004-ブロックされたら引く",
    start: { me: { spirits: [{ card: SOUEN, cores: 1 }] }, opp: { spirits: [{ card: BEETLE, label: "ブロッカー" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(name(SOUEN)) })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    // 3000 対 1000 でブロッカーが破壊される
    expect: [
        `自分.${name(SOUEN)}.疲労: false → true`,
        ...draw1,
        "相手.ブロッカー.場所: フィールド → なし",
        `相手.トラッシュ: なし → ${name(BEETLE)}`,
        "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "004-ブロックされなければ引かない",
    start: { me: { spirits: [{ card: SOUEN, cores: 1 }] }, opp: { spirits: [{ card: BEETLE, label: "ブロッカー" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(name(SOUEN)) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [`自分.${name(SOUEN)}.疲労: false → true`, ...lifeHit],
})

// --- BS23-005 ----------------------------------------------------------------
// アークは「シャイニング・ドラゴン」入りでコスト7。場に赤シンボルが無いので軽減なし：7＋維持コア1
console.log("=== 005: トラッシュのこのカードは、シャイニング・ドラゴン入りの自分のスピリットが召喚されたとき手札に戻る ===")
const newArk = [
    `自分.${name(ARK)}.場所: なし → フィールド`,
    `自分.${name(ARK)}.疲労: なし → false`,
    `自分.${name(ARK)}.コア: なし → 1`,
    `自分.${name(ARK)}.Lv: なし → 1`,
    `自分.${name(ARK)}.BP: なし → 6000`,
]
const arkPaid = ["自分.リザーブ: 10 → 2", "自分.トラッシュのコア: 0 → 7"]
scenario({
    name: "005-手札に戻る",
    start: { me: { hand: [ARK], trash: [SHOOTING] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...newArk, ...arkPaid, `自分.手札: ${name(ARK)} → ${name(SHOOTING)}`, `自分.トラッシュ: ${name(SHOOTING)} → なし`],
})
scenario({
    name: "005-同名2枚はどちらも戻る（Q4462）",
    start: { me: { hand: [ARK], trash: [SHOOTING, SHOOTING] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        ...newArk, ...arkPaid,
        `自分.手札: ${name(ARK)} → ${[name(SHOOTING), name(SHOOTING)].join("、")}`,
        `自分.トラッシュ: ${[name(SHOOTING), name(SHOOTING)].join("、")} → なし`,
    ],
})
scenario({
    name: "005-カード名に入っていないスピリットでは戻らない",
    start: { me: { hand: [ROKU], trash: [SHOOTING] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        `自分.${name(ROKU)}.場所: なし → フィールド`, `自分.${name(ROKU)}.疲労: なし → false`, `自分.${name(ROKU)}.コア: なし → 1`,
        `自分.${name(ROKU)}.Lv: なし → 1`, `自分.${name(ROKU)}.BP: なし → 1000`,
        "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 1", `自分.手札: ${name(ROKU)} → なし`,
    ],
})
scenario({
    name: "005-相手が召喚しても戻らない",
    start: { turn: "opp", me: { trash: [SHOOTING] }, opp: { hand: [ARK] } },
    steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
    expect: [
        `相手.${name(ARK)}.場所: なし → フィールド`, `相手.${name(ARK)}.疲労: なし → false`, `相手.${name(ARK)}.コア: なし → 1`,
        `相手.${name(ARK)}.Lv: なし → 1`, `相手.${name(ARK)}.BP: なし → 6000`,
        "相手.リザーブ: 10 → 2", "相手.トラッシュのコア: 0 → 7", `相手.手札: ${name(ARK)} → なし`,
    ],
})

console.log("=== 005: 【合体時】Lv2･Lv3 バトル時にBP4000以下の相手1体を破壊 ===")
const sName = name(SHOOTING)
function shootingCase(label: string, hostCores: number, brave: boolean, destroyed: boolean) {
    scenario({
        name: label,
        start: {
            me: { spirits: [{ card: SHOOTING, cores: hostCores }, ...(brave ? [{ card: SITORI, cores: 1 }] : [])] },
            opp: { spirits: [{ card: HADES, label: "T" }, { card: WINGAL, label: "U" }] },
        },
        steps(t) {
            if (brave) combine(t, sName)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(sName) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            ...(brave ? [`自分.${name(SITORI)}.場所: フィールド → 合体`, `自分.${name(SITORI)}.コア: 1 → 0`, `自分.${name(SITORI)}.BP: 2000 → なし`, `自分.${sName}.コア: ${hostCores} → ${hostCores + 1}`, ...(hostCores === 3 ? [`自分.${sName}.Lv: 2 → 3`, `自分.${sName}.BP: 6000 → 8000`] : [])] : []),
            `自分.${sName}.疲労: false → true`,
            "相手.ライフ: 5 → 4",
            ...(destroyed ? ["相手.T.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(HADES)}`, "相手.リザーブ: 10 → 12"] : ["相手.リザーブ: 10 → 11"]),
        ],
    })
}
// コア3＋ブレイヴのコア1＝4個でLv3（BP8000）。【合体時】はLv2･Lv3
shootingCase("005-合体Lv3のバトル時に4000以下を破壊", 3, true, true)
shootingCase("005-合体してもLv1なら破壊しない", 1, true, false)
shootingCase("005-合体していなければ破壊しない", 3, false, false)

console.log("すべてのチェックに合格しました 🎉（part851）")
