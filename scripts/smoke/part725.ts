// smoke パート725（scenario の soulCore 指定：ソウルコアはボイドへ行かない。SOULCORE.md §1・§2「有効化までに足すコアの移動」）
// ソウルコアありの場面の手本。コアを動かす器を足したら、この形で1件書く
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const VENOM = "BS04-095"
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VENOM).name === "ヴェノムショット" && getCard(VENOM).type === "magic" && getCard(VENOM).cost === 5, "VENOMはヴェノムショット（マジック・コスト5）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

console.log("=== ソウルコアなし：コア1個のスピリットはボイドへ取られて消滅する ===")
scenario({
    name: "ヴェノムショット-ソウルコアなし",
    start: { me: { hand: [VENOM] }, opp: { spirits: [{ card: VANILLA, cores: 1 }] } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") }),
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.手札: ヴェノムショット → なし",
        "自分.トラッシュ: なし → ヴェノムショット",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
    ],
})

// 「ソウルコア1個だけのスピリット：ボイドへ置けないので何も起きない」は、関所（SOULCORE.md §4）が未実装のため書いていない。
// いまはソウルコアをリザーブへ逃がしてスピリットが消滅する。関所を入れるときにこの場面を足す

console.log("=== ソウルコアと通常コア：通常コアだけがボイドへ行き、ソウルコアは残る ===")
scenario({
    name: "ヴェノムショット-ソウルコアと通常コア",
    start: { me: { hand: [VENOM] }, opp: { spirits: [{ card: VANILLA, cores: 2 }], soulCore: "ロクケラトプス" } },
    steps: (t) => t.act("me", { type: "castMagic", handIndex: 0, targetInstanceId: t.id("ロクケラトプス") }),
    expect: [
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.手札: ヴェノムショット → なし",
        "自分.トラッシュ: なし → ヴェノムショット",
        "相手.ロクケラトプス.コア: 2 → 1",
        "相手.ロクケラトプス.Lv: 2 → 1",
        "相手.ロクケラトプス.BP: 3000 → 1000",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part725）")
