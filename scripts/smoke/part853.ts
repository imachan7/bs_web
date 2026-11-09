// smoke パート853（BS23 赤バッチ：045 ガルグイオス・067 永遠なる神都・073 ダイノリボーン・X01 シャイニング・ドラゴン・オーバーレイ【強化】の節。
// BS23_PLAN §1 の X01 の行（Q4582・Q4583）と効果文から）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const GARGUIOS = "BS23-045"
const NEXUS = "BS23-067"
const DINO = "BS23-073"
const X01 = "BS23-X01"
const GUARDIAN = "BS23-006"
const ANDROMEDA = "BS23-008"
const DORACO = "BS23-002"
const CAUCASUS = "BS23-009"
const VLUM = "BS23-007"
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・Lv1 BP1000／Lv2 2コア BP3000）
const BEETLE = "BS01-050" // ビートビートル（緑・殻虫・コスト0・緑シンボル・Lv1 BP1000／Lv2 2コア BP2000）
const GORADON = "BS01-001" // ゴラドン（赤・コスト0・Lv1 BP1000）
const METALBURN = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv1 BP4000／Lv2 4コア BP7000）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・Lv1 BP5000／Lv4 4コア BP9000）
const KING = "BS01-X03" // キングタウロス大公（緑・コスト8）
const JIEND = "BS20-X01" // 滅龍帝ジエンド・ドラゴニス（赤・コスト9・Lv1 BP9000）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, n: string, type: string, cost: number) =>
        assert(getCard(id).name === n && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${n}（${type}・コスト${cost}）`)
    chk(GARGUIOS, "水竜神ガルグイオス", "spirit", 8)
    chk(NEXUS, "永遠なる神都", "nexus", 4)
    chk(DINO, "ダイノリボーン", "magic", 4)
    chk(X01, "龍輝神シャイニング・ドラゴン・オーバーレイ", "spirit", 8)
    chk(GUARDIAN, "ガーディアン・ドラゴン", "spirit", 5)
    chk(ANDROMEDA, "星雲竜アンドロメダ・ドラゴン", "spirit", 6)
    chk(DORACO, "恐竜剣聖ドラコレックス", "spirit", 3)
    chk(CAUCASUS, "コーカサストリケラ", "spirit", 8)
    chk(VLUM, "シルバー・ヴルム", "spirit", 5)
    chk(ROKU, "ロクケラトプス", "spirit", 1)
    chk(BEETLE, "ビートビートル", "spirit", 0)
    chk(GORADON, "ゴラドン", "spirit", 0)
    chk(METALBURN, "メタルバーン", "spirit", 3)
    chk(HADES, "デス・ハーデス", "spirit", 3)
    chk(WINGAL, "ウィンガル", "spirit", 6)
    chk(KING, "キングタウロス大公", "spirit", 8)
    chk(JIEND, "滅龍帝ジエンド・ドラゴニス", "spirit", 9)
    assert(getCard(GARGUIOS).family?.includes("想獣") === true && getCard(GARGUIOS).family?.includes("地竜") === true, "045 は想獣・地竜")
    assert(getCard(ROKU).family?.includes("地竜") === true && getCard(BEETLE).family?.includes("地竜") !== true, "ロクケラトプスは地竜・ビートビートルは違う")
    assert(getCard(KING).colors.join() === "green" && getCard(CAUCASUS).colors.includes("red") && getCard(GARGUIOS).colors.includes("red"), "キングは緑のみ・009と045は赤を含む")
}

const name = (id: string) => getCard(id).name
const names = (...ids: string[]) => ids.map(name).sort().join("、")

// --- BS23-045 ----------------------------------------------------------------
console.log("=== 045: 想獣/地竜のスピリットがBPを比べ相手のスピリットだけを破壊したら、ボイドからコア1個をライフへ ===")
const garg = name(GARGUIOS)
function gargBattle(label: string, attacker: { card: string; cores: number }, blocker: { card: string; cores?: number }, expect: string[], soul = false, attackerDies = false) {
    const aName = name(attacker.card)
    scenario({
        name: label,
        start: {
            me: { spirits: [{ card: GARGUIOS, cores: 1 }, attacker], ...(soul ? { soulCore: "リザーブ" } : {}) },
            opp: { spirits: [{ card: blocker.card, label: "ブロッカー", ...(blocker.cores !== undefined ? { cores: blocker.cores } : {}) }] },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(aName) })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
            t.closeFlash()
        },
        expect: [...(attackerDies ? [] : [`自分.${aName}.疲労: false → true`]), ...expect],
    })
}
// ロクケラトプス Lv2（BP3000）がビートビートル（BP1000）を倒す。ブロッカーのコア1個は相手のリザーブへ
const blockerDies = (n: string) => ["相手.ブロッカー.場所: フィールド → なし", `相手.トラッシュ: なし → ${n}`, "相手.リザーブ: 10 → 11"]
gargBattle("045-地竜が相手のスピリットだけを破壊でライフ+1", { card: ROKU, cores: 2 }, { card: BEETLE }, ["自分.ライフ: 5 → 6", ...blockerDies(name(BEETLE))])
gargBattle("045-ソウルコアがリザーブにあってもライフ+1", { card: ROKU, cores: 2 }, { card: BEETLE }, ["自分.ライフ: 5 → 6", ...blockerDies(name(BEETLE))], true)
// 3000 対 3000 の相打ちは「相手のスピリットだけ」ではない
gargBattle("045-相打ちではライフは増えない", { card: ROKU, cores: 2 }, { card: METALBURN }, [
    `自分.${name(ROKU)}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${name(ROKU)}`, "自分.リザーブ: 10 → 12",
    "相手.ブロッカー.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(METALBURN)}`, "相手.リザーブ: 10 → 11",
], false, true)
gargBattle("045-想獣でも地竜でもないスピリットではライフは増えない", { card: BEETLE, cores: 2 }, { card: GORADON }, blockerDies(name(GORADON)))

console.log("=== 045: Lv2以上の間、アタックステップに想獣/地竜の自分のスピリットすべてをBP+5000 ===")
const raise = (cores: number) =>
    scenario({
        name: `045-Lv${cores}のアタックステップ`,
        start: {
            me: { spirits: [{ card: GARGUIOS, cores }, { card: ROKU, cores: 1 }, { card: BEETLE }] },
            opp: { spirits: [{ card: ROKU, label: "相手ロク" }] },
        },
        steps: (t) => t.act("me", { type: "nextPhase" }),
        expect: cores >= 2 ? [`自分.${garg}.BP: 6000 → 11000`, `自分.${name(ROKU)}.BP: 1000 → 6000`] : [],
    })
raise(2)
raise(1)

// --- BS23-067 ----------------------------------------------------------------
console.log("=== 067: 配置時にトラッシュのコスト8以上の赤のスピリットすべてを手札に戻す ===")
const nexusLabel = name(NEXUS)
scenario({
    name: "067-配置時に戻る",
    // 赤を含むコスト8以上は4枚。ヴルム（コスト5）と緑のキング（コスト8）は戻らない。場に赤シンボルは無いのでコスト4
    start: { me: { hand: [NEXUS], trash: [JIEND, X01, CAUCASUS, GARGUIOS, VLUM, KING] } },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [
        `自分.${nexusLabel}.場所: なし → ネクサス`, `自分.${nexusLabel}.疲労: なし → false`, `自分.${nexusLabel}.コア: なし → 0`, `自分.${nexusLabel}.Lv: なし → 1`,
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4",
        `自分.手札: ${nexusLabel} → ${names(JIEND, X01, CAUCASUS, GARGUIOS)}`,
        `自分.トラッシュ: ${names(JIEND, X01, CAUCASUS, GARGUIOS, VLUM, KING)} → ${names(VLUM, KING)}`,
    ],
})
scenario({
    name: "067-戻せるものが無くても配置はされる",
    start: { me: { hand: [NEXUS], trash: [VLUM, KING] } },
    steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
    expect: [
        `自分.${nexusLabel}.場所: なし → ネクサス`, `自分.${nexusLabel}.疲労: なし → false`, `自分.${nexusLabel}.コア: なし → 0`, `自分.${nexusLabel}.Lv: なし → 1`,
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", `自分.手札: ${nexusLabel} → なし`,
    ],
})

console.log("=== 067: Lv2の間、アタックステップに、コスト8以上の自分のスピリットすべてに【激突】を与える ===")
const jiend = name(JIEND)
function nexusAttack(label: string, o: { mine: boolean; nexusCores: number; attacker: string; mustBlock: boolean }) {
    const aName = name(o.attacker)
    const loss = o.attacker === JIEND ? 2 : 1 // ジエンドは赤シンボル2つ
    scenario({
        name: label,
        start: {
            me: { spirits: [{ card: o.attacker, cores: 1 }], nexuses: o.mine ? [{ card: NEXUS, cores: o.nexusCores }] : [] },
            opp: { spirits: [{ card: ROKU, label: "相手ロク" }], nexuses: o.mine ? [] : [{ card: NEXUS, cores: o.nexusCores }] },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(aName) })
            t.closeFlash()
            if (o.mustBlock) {
                t.actRejected("opp", { type: "takeLife" })
                t.act("opp", { type: "block", instanceId: t.id("相手ロク") })
                t.closeFlash()
            } else t.act("opp", { type: "takeLife" })
        },
        expect: [
            `自分.${aName}.疲労: false → true`,
            ...(o.mustBlock
                ? ["相手.相手ロク.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(ROKU)}`, "相手.リザーブ: 10 → 11"]
                : [`相手.ライフ: 5 → ${5 - loss}`, `相手.リザーブ: 10 → ${10 + loss}`]),
        ],
    })
}
nexusAttack("067-Lv2でコスト9のアタックは必ずブロックされる", { mine: true, nexusCores: 2, attacker: JIEND, mustBlock: true })
nexusAttack("067-Lv2でもコスト8未満には与えない", { mine: true, nexusCores: 2, attacker: ROKU, mustBlock: false })
nexusAttack("067-Lv1では与えない", { mine: true, nexusCores: 0, attacker: JIEND, mustBlock: false })
nexusAttack("067-相手のネクサスは自分のスピリットに与えない", { mine: false, nexusCores: 2, attacker: JIEND, mustBlock: false })

// --- BS23-073 ----------------------------------------------------------------
console.log("=== 073 メイン: トラッシュの剣使/地竜のスピリット2枚までを手札に戻す。緑シンボルがあれば【連鎖】で相手が自分のスピリット2体を疲労 ===")
const dino = name(DINO)
const castMain = (t: { act: (s: "me", a: { type: "castMagic"; handIndex: number }) => void }) => t.act("me", { type: "castMagic", handIndex: 0 })
scenario({
    name: "073-同名3枚から2枚まで",
    start: { me: { hand: [DINO], trash: [ROKU, ROKU, ROKU] } },
    steps: castMain,
    expect: [
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4",
        `自分.手札: ${dino} → ${names(ROKU, ROKU)}`,
        `自分.トラッシュ: ${names(ROKU, ROKU, ROKU)} → ${names(ROKU, DINO)}`,
    ],
})
scenario({
    name: "073-剣使と地竜を1枚ずつ。系統の違うカードと緑シンボル無しの連鎖は起きない",
    start: { me: { hand: [DINO], trash: [ROKU, DORACO, BEETLE] }, opp: { spirits: [{ card: WINGAL, label: "A" }, { card: HADES, label: "B" }] } },
    steps: castMain,
    expect: [
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4",
        `自分.手札: ${dino} → ${names(ROKU, DORACO)}`,
        `自分.トラッシュ: ${names(ROKU, DORACO, BEETLE)} → ${names(BEETLE, DINO)}`,
    ],
})
scenario({
    name: "073-戻せるカードが無くても使える",
    start: { me: { hand: [DINO], trash: [BEETLE] } },
    steps: castMain,
    expect: ["自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", `自分.手札: ${dino} → なし`, `自分.トラッシュ: ${name(BEETLE)} → ${names(BEETLE, DINO)}`],
})
// ビートビートルの緑シンボルで軽減1（コスト3）。相手のスピリットが2体なので、その2体が疲労する
scenario({
    name: "073-緑シンボルがあれば連鎖で相手のスピリット2体が疲労する",
    start: { me: { hand: [DINO], trash: [ROKU], spirits: [{ card: BEETLE }] }, opp: { spirits: [{ card: WINGAL, label: "A" }, { card: HADES, label: "B" }] } },
    steps: castMain,
    expect: [
        "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3",
        `自分.手札: ${dino} → ${name(ROKU)}`, `自分.トラッシュ: ${name(ROKU)} → ${dino}`,
        "相手.A.疲労: false → true", "相手.B.疲労: false → true",
    ],
})

console.log("=== 073 フラッシュ: このターンの間、スピリット1体をBP+2000（自分でも相手でもよい）===")
// 場の赤シンボル（ロクケラトプス）で軽減1、コスト3
const flashCost = ["自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${dino} → なし`, `自分.トラッシュ: なし → ${dino}`]
scenario({
    name: "073-フラッシュで自分のスピリットをBP+2000",
    start: { me: { hand: [DINO], spirits: [{ card: ROKU, cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(name(ROKU)) })
        t.act("opp", { type: "pass" }) // アタック宣言直後の優先権は守る側から
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(name(ROKU)) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [...flashCost, `自分.${name(ROKU)}.疲労: false → true`, `自分.${name(ROKU)}.BP: 1000 → 3000`, "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
// ロクケラトプス Lv2（BP3000）対ゴラドン（BP1000）。相手のゴラドンに+2000すると3000で相打ち
scenario({
    name: "073-フラッシュで相手のスピリットをBP+2000して相打ちにする",
    start: { me: { hand: [DINO], spirits: [{ card: ROKU, cores: 2 }] }, opp: { spirits: [{ card: GORADON, label: "ゴラドン" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(name(ROKU)) })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ゴラドン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ゴラドン") })
        t.closeFlash()
    },
    // ロクケラトプスのコア2個がリザーブへ戻る（10 → 7 → 9）
    expect: [
        "自分.リザーブ: 10 → 9", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${dino} → なし`,
        `自分.${name(ROKU)}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${names(DINO, ROKU)}`,
        "相手.ゴラドン.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(GORADON)}`, "相手.リザーブ: 10 → 11",
    ],
})

// --- BS23-X01 【強化】の節 -----------------------------------------------------
// Lv3 の間、自分の赤のスピリットすべて（自身を含む）が【強化】を持つ＝それぞれ破壊上限+1000。
// 【強化】を持つ扱いは場の外だけで、場ではLv3のときだけ（Q4582・Q4583）
console.log("=== X01: Lv3の間、赤のスピリットすべてに【強化】（BP破壊効果の上限+1000ずつ）===")
const lifeHit = ["相手.ライフ: 5 → 4"]
function x01Cap(label: string, x01Cores: number, opp: string, destroyed: boolean) {
    scenario({
        name: label,
        start: { me: { spirits: [{ card: X01, cores: x01Cores }, { card: GUARDIAN, cores: 1 }] }, opp: { spirits: [{ card: opp, label: "X" }] } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(name(GUARDIAN)) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            `自分.${name(GUARDIAN)}.疲労: false → true`,
            ...lifeHit,
            ...(destroyed ? ["相手.X.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(opp)}`, "相手.リザーブ: 10 → 12"] : ["相手.リザーブ: 10 → 11"]),
        ],
    })
}
// 006 の上限3000＋X01 が持つ【強化】1つ＋006 が与えられた【強化】1つ＝5000
x01Cap("X01-Lv3で006の上限が5000", 4, WINGAL, true)
x01Cap("X01-Lv2では【強化】を持たず上限3000のまま", 3, HADES, false)

console.log("=== X01: 場にいる間は Lv3 でだけ【強化】を持つ（008 の召喚時のドロー枚数で見る）===")
// X01 が場にいるので赤シンボル1つで008の軽減1 → コスト5＋維持コア1
const andro = name(ANDROMEDA)
const newAndro = [
    `自分.${andro}.場所: なし → フィールド`, `自分.${andro}.疲労: なし → false`, `自分.${andro}.コア: なし → 1`, `自分.${andro}.Lv: なし → 1`, `自分.${andro}.BP: なし → 5000`,
    "自分.リザーブ: 10 → 4", "自分.トラッシュのコア: 0 → 5",
]
// Lv3：008自身（自身の【強化】＋与えられた【強化】）と X01（与えられた【強化】）で上限 6000+3000＝9000。【強化】を持つスピリットは008とX01の2体
scenario({
    name: "X01-Lv3は008のドローに数えられる",
    start: { me: { hand: [ANDROMEDA], spirits: [{ card: X01, cores: 4 }] }, opp: { spirits: [{ card: WINGAL, label: "X", cores: 4 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        ...newAndro, `自分.手札: ${andro} → ${names(ROKU, ROKU)}`, "自分.デッキ枚数: 40 → 38",
        "相手.X.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(WINGAL)}`, "相手.リザーブ: 10 → 14",
    ],
})
// Lv1：X01 は場では【強化】を持たない。上限は6000＋008自身の1000＝7000、ドローは008の1枚
scenario({
    name: "X01-Lv1は【強化】を持たず008のドローに数えられない",
    start: { me: { hand: [ANDROMEDA], spirits: [{ card: X01, cores: 1 }] }, opp: { spirits: [{ card: HADES, label: "X", cores: 4 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        ...newAndro, `自分.手札: ${andro} → ${name(ROKU)}`, "自分.デッキ枚数: 40 → 39",
        "相手.X.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(HADES)}`, "相手.リザーブ: 10 → 14",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part853）")
