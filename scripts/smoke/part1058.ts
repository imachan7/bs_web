// smoke パート1058（BS11-X06 天秤造神リブラ・ゴレム Lv3 の「回復状態の間、相手のライフを減らせない」は、リブラ自身が減らすときだけ効く。issue #705）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const LIBRA = "BS11-X06" // 天秤造神リブラ・ゴレム（青・コスト8・Lv3は4コア）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const MAGIC = "BS01-123" // リターンドロー（マジック。粉砕でスピリットが落ちない山札用）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LIBRA).name === "天秤造神リブラ・ゴレム" && getCard(LIBRA).type === "spirit", "LIBRAはリブラ・ゴレム")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).type === "spirit", "VANILLAはロクケラトプス")
    assert(getCard(MAGIC).name === "リターンドロー" && getCard(MAGIC).type === "magic", "MAGICはリターンドロー")
}

const spiritDeck = Array.from({ length: 40 }, () => VANILLA)
const magicDeck = Array.from({ length: 40 }, () => MAGIC)

console.log("=== 1. Lv3 が回復状態で場にいるだけ：別のスピリットのアタックでライフは減る ===")
scenario({
    name: "libraIdleOtherAttacks",
    start: {
        phase: "attack",
        me: { spirits: [{ card: LIBRA, label: "リブラ", cores: 4 }, { card: VANILLA, label: "ロク" }] },
        opp: { life: 7 },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロク.疲労: false → true", "相手.ライフ: 7 → 6", "相手.リザーブ: 10 → 11"],
})

console.log("=== 2. 粉砕で回復した直後、同じアタックステップで別のスピリットがアタック：ライフは減る ===")
scenario({
    name: "libraRefreshedThenOtherAttacks",
    start: {
        phase: "attack",
        me: { spirits: [{ card: LIBRA, label: "リブラ", cores: 4 }, { card: VANILLA, label: "ロク" }] },
        opp: { life: 7, deck: spiritDeck },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("リブラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        t.act("me", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロク.疲労: false → true", "相手.ライフ: 7 → 6", "相手.リザーブ: 10 → 11", "相手.デッキ枚数: 40 → 37", "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス"],
})

console.log("=== 3. Lv3 のアタックで粉砕により回復：そのアタックではライフが減らない ===")
scenario({
    name: "libraOwnAttackRefreshed",
    start: {
        phase: "attack",
        me: { spirits: [{ card: LIBRA, label: "リブラ", cores: 4 }] },
        opp: { life: 7, deck: spiritDeck },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("リブラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["相手.デッキ枚数: 40 → 37", "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス"],
})

console.log("=== 4. Lv3 のアタックで破棄しない（疲労のまま）：ライフが1減る ===")
scenario({
    name: "libraOwnAttackStaysRested",
    start: {
        phase: "attack",
        me: { spirits: [{ card: LIBRA, label: "リブラ", cores: 4 }] },
        opp: { life: 7, deck: magicDeck },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("リブラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.リブラ.疲労: false → true", "相手.ライフ: 7 → 6", "相手.リザーブ: 10 → 11", "相手.デッキ枚数: 40 → 37", "相手.トラッシュ: なし → リターンドロー、リターンドロー、リターンドロー"],
})

console.log("=== 5. Lv2 のアタック：回復も制約もなくライフが1減る ===")
scenario({
    name: "libraLv2",
    start: {
        phase: "attack",
        me: { spirits: [{ card: LIBRA, label: "リブラ", cores: 2 }] },
        opp: { life: 7, deck: spiritDeck },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("リブラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.リブラ.疲労: false → true", "相手.ライフ: 7 → 6", "相手.リザーブ: 10 → 11", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス"],
})

console.log("すべてのチェックに合格しました 🎉（part1058）")
