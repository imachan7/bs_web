// smoke パート855（BS23 紫バッチ：016 死神剣聖ダークネス・メア（アタック時・合体時の節）・017 シャドー・アルデウス・018 邪骨竜皇ボーン・ティタノクス・058 魔剣デスサイズ。
// BS23_PLAN §1 の 016・018・058 の行（Q4485・Q20344）と効果文から）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const MARE = "BS23-016"
const ALDEUS = "BS23-017"
const TITANOX = "BS23-018"
const DEATHSCYTHE = "BS23-058"
const SHION = "BS23-X08"
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・Lv1 BP1000／Lv2 2コア BP3000）
const BEETLE = "BS01-050" // ビートビートル（緑・殻虫・コスト0・Lv1 BP1000／Lv2 2コア BP2000）
const BERSERKER = "BS01-074" // バーサーカー・ガン（白・動器・コスト1・Lv1 BP1000／Lv2 2コア BP3000）
const METALBURN = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3）
const PIGEON = "BS06-013" // ピジョンヘディレス（紫・コスト0）
const FANTASMA = "BS02-014" // ファンタズマ（紫・コスト2）
const GORADON = "BS01-001" // ゴラドン（赤・コスト0）
const KING = "BS01-X03" // キングタウロス大公（緑・コスト8・Lv1 BP4000）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, n: string, type: string, cost: number) =>
        assert(getCard(id).name === n && getCard(id).type === type && getCard(id).cost === cost, `${id} は ${n}（${type}・コスト${cost}）`)
    chk(MARE, "死神剣聖ダークネス・メア", "spirit", 6)
    chk(ALDEUS, "シャドー・アルデウス", "spirit", 6)
    chk(TITANOX, "邪骨竜皇ボーン・ティタノクス", "spirit", 8)
    chk(DEATHSCYTHE, "魔剣デスサイズ", "brave", 4)
    chk(SHION, "紫電の霊剣ライトニング・シオン", "brave", 6)
    chk(ROKU, "ロクケラトプス", "spirit", 1)
    chk(BEETLE, "ビートビートル", "spirit", 0)
    chk(BERSERKER, "バーサーカー・ガン", "spirit", 1)
    chk(METALBURN, "メタルバーン", "spirit", 3)
    chk(HADES, "デス・ハーデス", "spirit", 3)
    chk(PIGEON, "ピジョンヘディレス", "spirit", 0)
    chk(FANTASMA, "ファンタズマ", "spirit", 2)
    chk(GORADON, "ゴラドン", "spirit", 0)
    chk(KING, "キングタウロス大公", "spirit", 8)
    const fam = (id: string, f: string) => getCard(id).family?.includes(f) === true
    assert(fam(TITANOX, "無魔") && fam(TITANOX, "地竜") && fam(ROKU, "地竜") && !fam(BERSERKER, "地竜") && !fam(BERSERKER, "無魔") && !fam(BEETLE, "地竜"), "系統: 018は無魔・地竜／ROKUは地竜／バーサーカー・ガンとBEETLEはどちらでもない")
    assert(fam(MARE, "剣使") && fam(SHION, "剣刃") && fam(DEATHSCYTHE, "剣刃"), "016は剣使・X08と058は剣刃")
    assert(getCard(GORADON).colors.join() === "red" && getCard(PIGEON).colors.join() === "purple" && getCard(HADES).colors.join() === "purple", "ゴラドンは赤・ピジョンとハーデスは紫")
}

const name = (id: string) => getCard(id).name
const born = (id: string, cores: number, lv: number, bp: number, who = "自分") => [
    `${who}.${name(id)}.場所: なし → フィールド`, `${who}.${name(id)}.疲労: なし → false`, `${who}.${name(id)}.コア: なし → ${cores}`,
    `${who}.${name(id)}.Lv: なし → ${lv}`, `${who}.${name(id)}.BP: なし → ${bp}`,
]
const ownTurnStart = ["自分.手札: なし → ロクケラトプス", "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11"]

// --- BS23-016 ----------------------------------------------------------------
console.log("=== 016: アタック時にトラッシュのコスト0/3の紫のスピリットをコストなしで召喚できる ===")
const mare = name(MARE)
function mareAttack(label: string, trashCard: string, summoned: boolean) {
    const base = ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", `自分.${mare}.疲労: false → true`]
    scenario({
        name: label,
        start: { me: { spirits: [{ card: MARE }], trash: [trashCard] } },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(mare) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: summoned
            ? [...base, ...born(trashCard, 1, 1, getCard(trashCard).levels![0]!.bp), `自分.トラッシュ: ${name(trashCard)} → なし`, "自分.リザーブ: 10 → 9"]
            : base,
    })
}
mareAttack("016-コスト3の紫を召喚", HADES, true)
mareAttack("016-コスト0の紫を召喚", PIGEON, true)
mareAttack("016-コスト2の紫は対象外", FANTASMA, false)
mareAttack("016-コスト0でも赤は対象外", GORADON, false)

// 【合体時】Lv2･Lv3：相手の合体スピリットのブレイヴ1つを破壊する。相手はまず自分のターンに合体して終了し、自分のターンの開始処理（ドロー1・コア1）を経てから攻撃する。
// 合体するとブレイヴのコアはホストへ移る。合体したスピリットはシンボルが2つなのでライフは2減る。016 は合体で必ず Lv2 以上になるので、Lv1 の場面は作れない
console.log("=== 016: 合体時 Lv2・Lv3 のアタック時に相手の合体スピリットのブレイヴを破壊する ===")
function mareCombined(label: string, oppCombines: boolean) {
    const oppBrave = name(DEATHSCYTHE)
    scenario({
        name: label,
        start: {
            turn: "opp",
            me: { spirits: [{ card: MARE, cores: 2 }, { card: SHION, label: "シオン" }] },
            opp: { spirits: [{ card: KING }, { card: DEATHSCYTHE, label: "デスサイズ" }] },
        },
        steps(t) {
            if (oppCombines) t.act("opp", { type: "combineBrave", braveInstanceId: t.id("デスサイズ"), hostInstanceId: t.id(name(KING)) })
            t.act("opp", { type: "endTurn" })
            t.act("me", { type: "combineBrave", braveInstanceId: t.id("シオン"), hostInstanceId: t.id(mare) })
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(mare) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            ...ownTurnStart, `自分.${mare}.疲労: false → true`, `自分.${mare}.コア: 2 → 3`, `自分.${mare}.BP: 6000 → 11000`,
            "自分.シオン.場所: フィールド → 合体", "自分.シオン.コア: 1 → 0", "自分.シオン.BP: 5000 → なし",
            "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12",
            ...(!oppCombines ? [] : [`相手.${name(KING)}.コア: 1 → 2`,
                ...(label.includes("破壊")
                    ? ["相手.デスサイズ.場所: フィールド → なし", `相手.トラッシュ: なし → ${oppBrave}`]
                    : [])]),
        ],
    })
}
mareCombined("016-Lv2 の合体アタックで相手のブレイヴを破壊", true)
mareCombined("016-相手が合体していなければ何も破壊しない", false)

// --- BS23-017 ----------------------------------------------------------------
console.log("=== 017: 召喚時に疲労状態の相手のスピリット1体を破壊し、破壊したらドロー ===")
function aldeus(label: string, rested: boolean) {
    scenario({
        name: label,
        start: { me: { hand: [ALDEUS] }, opp: { spirits: [{ card: ROKU, label: "標的", rested }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...born(ALDEUS, 1, 1, 4000), "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6",
            ...(rested
                ? ["相手.標的.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(ROKU)}`, "相手.リザーブ: 10 → 11", `自分.手札: ${name(ALDEUS)} → ${name(ROKU)}`, "自分.デッキ枚数: 40 → 39"]
                : [`自分.手札: ${name(ALDEUS)} → なし`])],
    })
}
aldeus("017-疲労状態の相手を破壊してドロー", true)
aldeus("017-疲労していなければ破壊もドローもしない", false)
scenario({
    name: "017-相手がいなければ破壊もドローもしない",
    start: { me: { hand: [ALDEUS] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [...born(ALDEUS, 1, 1, 4000), "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 6", `自分.手札: ${name(ALDEUS)} → なし`],
})

// --- BS23-018 ----------------------------------------------------------------
// 無魔/地竜の自分のスピリットがBPを比べ相手のスピリットだけを破壊したら、デッキの上1枚をこのスピリットの下へ（写像ではデッキ枚数が1減る）。
console.log("=== 018: 無魔/地竜がBPを比べ相手のスピリットだけを破壊したら、デッキの上1枚を下に置く ===")
const titanox = name(TITANOX)
function titanoxBattle(label: string, attacker: { card: string; cores: number }, blocker: string, expect: string[], mineAttacks = true) {
    const aName = name(attacker.card)
    scenario({
        name: label,
        start: mineAttacks
            ? { me: { spirits: [{ card: TITANOX }, attacker] }, opp: { spirits: [{ card: blocker, label: "ブロッカー" }] } }
            : { turn: "opp", phase: "attack", me: { spirits: [{ card: TITANOX }, attacker] }, opp: { spirits: [{ card: blocker, label: "攻撃役" }] } },
        steps(t) {
            if (mineAttacks) {
                t.act("me", { type: "nextPhase" })
                t.act("me", { type: "attack", instanceId: t.id(aName) })
                t.closeFlash()
                t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
            } else {
                t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
                t.closeFlash()
                t.act("me", { type: "block", instanceId: t.id(aName) })
            }
            t.closeFlash()
        },
        expect,
    })
}
const aroku = name(ROKU)
// ROKU Lv2（BP3000）が BEETLE（BP1000）を破壊
const rokuWins = ["相手.ブロッカー.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(BEETLE)}`, "相手.リザーブ: 10 → 11", `自分.${aroku}.疲労: false → true`]
titanoxBattle("018-地竜が相手のスピリットだけを破壊でデッキ-1", { card: ROKU, cores: 2 }, BEETLE, [...rokuWins, "自分.デッキ枚数: 40 → 39"])
titanoxBattle("018-無魔でも地竜でもない場合は置かない", { card: BERSERKER, cores: 2 }, BEETLE, [...rokuWins.slice(0, 3), `自分.${name(BERSERKER)}.疲労: false → true`])
titanoxBattle("018-相打ちは相手のスピリットだけではない", { card: ROKU, cores: 2 }, METALBURN, [
    "相手.ブロッカー.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(METALBURN)}`, `自分.${aroku}.場所: フィールド → なし`, `自分.トラッシュ: なし → ${aroku}`,
    "相手.リザーブ: 10 → 11", "自分.リザーブ: 10 → 12"])
// 相手のアタックを無魔/地竜がブロックして破壊する形（お互いのアタックステップ）。攻撃役は BEETLE（BP1000）
titanoxBattle("018-相手のターンのブロックでも置く", { card: ROKU, cores: 2 }, BEETLE, [
    "相手.攻撃役.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(BEETLE)}`, "相手.リザーブ: 10 → 11", `自分.${aroku}.疲労: false → true`, "自分.デッキ枚数: 40 → 39"], false)

// Lv3『アタック時』：下のカード1枚を破棄することで、相手は自分のスピリットのコア1個をボイドに置く。
// 先に ROKU のアタックで下のカードを1枚作り、続けて 018（Lv3＝5コア）でアタックする
console.log("=== 018: Lv3 のアタック時に下のカード1枚を破棄して、相手のスピリットのコア1個をボイドへ ===")
function titanoxLv3(label: string, cores: number, withUnder: boolean, soul: boolean) {
    const oppCoresAfter = cores === 5 && withUnder ? 2 : 3
    scenario({
        name: label,
        start: {
            me: { spirits: [{ card: TITANOX, cores }, ...(withUnder ? [{ card: ROKU, cores: 2 }] : [])] },
            opp: { spirits: [{ card: BEETLE, label: "ブロッカー" }, { card: BEETLE, label: "標的", cores: 3 }], ...(soul ? { soulCore: "標的" } : {}) },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            if (withUnder) {
                t.act("me", { type: "attack", instanceId: t.id(aroku) })
                t.closeFlash()
                t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
                t.closeFlash()
            }
            t.act("me", { type: "attack", instanceId: t.id(titanox) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            `自分.${titanox}.疲労: false → true`, "相手.ライフ: 5 → 3", ...(oppCoresAfter === 3 ? [] : [`相手.標的.コア: 3 → ${oppCoresAfter}`]),
            ...(withUnder ? [`自分.${aroku}.疲労: false → true`, "相手.ブロッカー.場所: フィールド → なし", `相手.トラッシュ: なし → ${name(BEETLE)}`, "相手.リザーブ: 10 → 13",
                ...(cores === 5 ? [`自分.トラッシュ: なし → ${aroku}`, "自分.デッキ枚数: 40 → 38"] : ["自分.デッキ枚数: 40 → 39"])]
                : ["相手.リザーブ: 10 → 12"]),
        ],
    })
}
titanoxLv3("018-Lv3 は下のカードを破棄して相手のコアをボイドへ", 5, true, false)
titanoxLv3("018-ソウルコアは動かず通常のコアがボイドへ", 5, true, true)
titanoxLv3("018-Lv2 では何も起きない", 2, true, false)
titanoxLv3("018-下のカードが無ければ破棄できず何も起きない", 5, false, false)

// --- BS23-058 ----------------------------------------------------------------
console.log("=== 058: 召喚時にデッキの上から「ダークネス」入りのスピリットが出るまでオープン（上限6枚）して手札へ、残りは破棄 ===")
function scythe(label: string, mareAt: number) {
    const deck = Array.from({ length: 40 }, () => ROKU)
    deck[mareAt] = MARE
    const found = mareAt < 6
    const opened = found ? mareAt + 1 : 6
    const discarded = found ? opened - 1 : opened
    scenario({
        name: label,
        start: { me: { hand: [DEATHSCYTHE], deck } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...born(DEATHSCYTHE, 1, 1, 2000), "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 4", `自分.デッキ枚数: 40 → ${40 - opened}`,
            `自分.手札: ${name(DEATHSCYTHE)} → ${found ? name(MARE) : "なし"}`,
            `自分.トラッシュ: なし → ${Array(discarded).fill(aroku).join("、")}`],
    })
}
scythe("058-3枚目で見つかる（残り2枚を破棄）", 2)
scythe("058-6枚目でも見つかる", 5)
scythe("058-7枚目は上限を超えるので見つからず6枚を破棄", 6)

console.log("すべてのチェックに合格しました 🎉（part855）")
