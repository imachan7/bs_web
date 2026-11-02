// smoke パート766（期待値役：ワルキューレ・ヒルド／月光集める塔の耐性が、相手の効果を正しく防ぐことの場面テスト）
// 期待値は効果文と属性だけから書いた。今の実装は誤っている見込みで、❌ が出るのは想定どおり
import { assert, getCard } from "./helpers"
import type { PendingChoice } from "../../server/src/types/choice"
import { scenario } from "./scenario"

const HILDA = "BS04-043" // ワルキューレ・ヒルド（白・Lv1 1コア/5000・Lv2 3コア/7000）
const TOWER = "BS12-067" // 月光集める塔（ネクサス・白）
const DESPERADO = "BS01-X02" // 魔界七将デスペラード（紫・Lv1 1コア/6000・Lv2 4コア/9000）
const PISCES = "BS10-X02" // 双魚賊神ピスケガレオン（紫・Lv1 1コア/5000）
const KONTON = "BS19-051" // 凶獣コントン（黄・Lv1 1コア/2000）
const CATS_EYE = "BS08-079" // キャッツアイ（黄・マジック・コスト3）
const ILLUSION = "BS02-111" // スピリットイリュージョン（黄・マジック・コスト6）
const TYPHOON = "BS10-111" // ハンドタイフーン（黄・マジック・コスト5）
const PANDEMIUM = "BS04-X14" // 魔界七将パンデミウム（紫・Lv3 6コア/9000）
const BALANCE = "BS01-125" // デッドリィバランス（紫・マジック・コスト3）
const CRYSTAL = "BS10-036" // 水晶魚クリスティール（白・効果なし・Lv1 1コア/4000・Lv2 2コア/6000・Lv3 3コア/7000）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HILDA).name === "ワルキューレ・ヒルド" && getCard(HILDA).type === "spirit", "HILDAはワルキューレ・ヒルド")
    assert(getCard(TOWER).name === "月光集める塔" && getCard(TOWER).type === "nexus", "TOWERは月光集める塔")
    assert(getCard(DESPERADO).name === "魔界七将デスペラード", "DESPERADOは魔界七将デスペラード")
    assert(getCard(PISCES).name === "双魚賊神ピスケガレオン", "PISCESは双魚賊神ピスケガレオン")
    assert(getCard(KONTON).name === "凶獣コントン", "KONTONは凶獣コントン")
    assert(getCard(CATS_EYE).name === "キャッツアイ" && getCard(CATS_EYE).type === "magic", "CATS_EYEはキャッツアイのマジック")
    assert(getCard(ILLUSION).name === "スピリットイリュージョン", "ILLUSIONはスピリットイリュージョン")
    assert(getCard(TYPHOON).name === "ハンドタイフーン", "TYPHOONはハンドタイフーン")
    assert(getCard(PANDEMIUM).name === "魔界七将パンデミウム", "PANDEMIUMは魔界七将パンデミウム")
    assert(getCard(BALANCE).name === "デッドリィバランス", "BALANCEはデッドリィバランス")
    assert(getCard(CRYSTAL).name === "水晶魚クリスティール" && getCard(CRYSTAL).effects.length === 0, "CRYSTALは効果なしの水晶魚クリスティール")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

// 相手（opp）の耐性の駒を、どの場面にも置く
const HILDA_LV2 = { card: HILDA, label: "ヒルド", cores: 3 }

// 攻撃役で相手を直接攻撃し、フラッシュの優先権を自分に回す（相手が持っていれば相手が1回パス）
const attackOpp = (t: { act: (side: "me" | "opp", a: any) => void; id: (l: string) => string; state: { priorityPlayer: string }; opp: string }) => {
    t.act("me", { type: "attack", instanceId: t.id("攻撃役") })
    if (t.state.priorityPlayer === t.opp) t.act("opp", { type: "pass" })
}

console.log("=== 1. デスペラード召喚時：ヒルドのコアは減らない（耐性の無い相手のロクケラトプスは1個減る） ===")
scenario({
    name: "hilda-vs-desperado-summon",
    start: {
        me: { hand: [DESPERADO] },
        opp: { spirits: [HILDA_LV2, { card: VANILLA, label: "敵", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 魔界七将デスペラード → なし",
        "自分.魔界七将デスペラード.場所: なし → フィールド",
        "自分.魔界七将デスペラード.疲労: なし → false",
        "自分.魔界七将デスペラード.コア: なし → 1",
        "自分.魔界七将デスペラード.Lv: なし → 1",
        "自分.魔界七将デスペラード.BP: なし → 6000",
        "自分.リザーブ: 10 → 1",
        "自分.トラッシュのコア: 0 → 8",
        "相手.敵.コア: 2 → 1",
        "相手.敵.Lv: 2 → 1",
        "相手.敵.BP: 3000 → 1000",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 2. ピスケガレオン召喚時：ヒルドのコアは減らない（同上） ===")
scenario({
    name: "hilda-vs-pisces-summon",
    start: {
        me: { hand: [PISCES] },
        opp: { spirits: [HILDA_LV2, { card: VANILLA, label: "敵", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 双魚賊神ピスケガレオン → なし",
        "自分.双魚賊神ピスケガレオン.場所: なし → フィールド",
        "自分.双魚賊神ピスケガレオン.疲労: なし → false",
        "自分.双魚賊神ピスケガレオン.コア: なし → 1",
        "自分.双魚賊神ピスケガレオン.Lv: なし → 1",
        "自分.双魚賊神ピスケガレオン.BP: なし → 5000",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "相手.敵.コア: 2 → 1",
        "相手.敵.Lv: 2 → 1",
        "相手.敵.BP: 3000 → 1000",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 3. コントン召喚時『相手のスピリットすべてをLv1として扱う』：ヒルドのLvは下がらない ===")
scenario({
    name: "hilda-vs-konton-lv1",
    start: {
        me: { hand: [KONTON] },
        opp: { spirits: [HILDA_LV2, { card: DESPERADO, label: "敵", cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 凶獣コントン → なし",
        "自分.凶獣コントン.場所: なし → フィールド",
        "自分.凶獣コントン.疲労: なし → false",
        "自分.凶獣コントン.コア: なし → 1",
        "自分.凶獣コントン.Lv: なし → 1",
        "自分.凶獣コントン.BP: なし → 2000",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "相手.敵.Lv: 2 → 1",
        "相手.敵.BP: 9000 → 6000",
    ],
})

console.log("=== 4. キャッツアイ（メイン）『相手のスピリット1体をLv1』：ヒルドは対象の候補に出ない ===")
scenario({
    name: "hilda-vs-catseye-target",
    start: {
        interactive: true,
        me: { hand: [CATS_EYE] },
        // 耐性の無い候補を2体置く（候補が1体だと選択を出さずに自動で決まるため。2026-11-03 メインループが追加）
        opp: { spirits: [HILDA_LV2, { card: DESPERADO, label: "敵", cores: 4 }, { card: VANILLA, label: "素" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        const pc = t.state.pendingChoice as PendingChoice | null
        assert(pc !== null && pc.kind === "target", "キャッツアイの対象選択が出る")
        assert(!pc!.candidates.includes(t.id("ヒルド")), "ヒルドは候補に出ない（耐性で対象に選べない）")
        t.act("me", { type: "resolveChoice", instanceId: t.id("敵") })
    },
    expect: [
        "自分.手札: キャッツアイ → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュ: なし → キャッツアイ",
        "自分.トラッシュのコア: 0 → 3",
        "相手.敵.Lv: 2 → 1",
        "相手.敵.BP: 9000 → 6000",
    ],
})

console.log("=== 5. スピリットイリュージョン（メイン）で白を指定：ヒルドは最高Lvにならず、耐性の無い白の水晶魚は最高Lvになる ===")
scenario({
    name: "hilda-vs-illusion-white",
    start: {
        interactive: true,
        me: { hand: [ILLUSION] },
        opp: {
            spirits: [
                { card: HILDA, label: "ヒルド", cores: 1 },
                { card: CRYSTAL, label: "水晶", cores: 1 },
            ],
        },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        const pc = t.state.pendingChoice as PendingChoice | null
        assert(pc !== null && pc.kind === "option", "色の指定の選択が出る")
        const opt = pc!.options?.find((o) => o.includes("白"))
        assert(opt !== undefined, "白の選択肢がある")
        t.act("me", { type: "resolveChoice", option: opt! })
    },
    expect: [
        "自分.手札: スピリットイリュージョン → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュ: なし → スピリットイリュージョン",
        "自分.トラッシュのコア: 0 → 6",
        "相手.水晶.Lv: 1 → 3",
        "相手.水晶.BP: 4000 → 7000",
    ],
})

console.log("=== 6. ハンドタイフーン：塔がある相手の手札は破棄されず、ドローだけする ===")
scenario({
    name: "tower-vs-typhoon",
    start: {
        me: { hand: [TYPHOON, VANILLA, VANILLA] },
        opp: {
            hand: [VANILLA, VANILLA, VANILLA],
            nexuses: [{ card: TOWER, label: "塔", cores: 0 }],
        },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.手札: ハンドタイフーン、ロクケラトプス、ロクケラトプス → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "自分.トラッシュ: なし → ハンドタイフーン、ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 36",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "相手.手札: ロクケラトプス、ロクケラトプス、ロクケラトプス → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.デッキ枚数: 40 → 36",
    ],
})

console.log("=== 7. パンデミウムの破壊時（Lv3）『お互い、手札5枚を破棄する』：塔がある相手の手札は破棄されない ===")
scenario({
    name: "tower-vs-pandemium-discard",
    start: {
        phase: "attack",
        interactive: true,
        me: {
            hand: [BALANCE, VANILLA, VANILLA, VANILLA, VANILLA, VANILLA],
            spirits: [{ card: PANDEMIUM, label: "パンデミウム", cores: 6 }, { card: VANILLA, label: "攻撃役" }],
        },
        opp: {
            hand: [VANILLA, VANILLA, VANILLA, VANILLA, VANILLA],
            nexuses: [{ card: TOWER, label: "塔", cores: 0 }],
        },
    },
    steps(t) {
        attackOpp(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.act("me", { type: "resolveChoice", instanceId: t.id("パンデミウム") })
        // 破壊時の「手札5枚を破棄」で出る選択に、選ぶ本人が先頭から答える（上限つき）
        for (let n = 0; n < 10 && t.state.pendingChoice; n++) {
            const pc = t.state.pendingChoice as PendingChoice
            const side = pc.pid === t.me ? "me" : "opp"
            if (pc.candidates.length > 0) t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
            else if (pc.cardIndices?.length) t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices[0]! })
            else break
        }
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: デッドリィバランス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス → なし",
        "自分.トラッシュ: なし → デッドリィバランス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、魔界七将パンデミウム",
        "自分.リザーブ: 10 → 14",
        "自分.トラッシュのコア: 0 → 2",
        "自分.パンデミウム.場所: フィールド → なし",
        "自分.攻撃役.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 8a. デッドリィバランス（フラッシュ）：相手の場がヒルドだけなら、相手は何も破壊しない ===")
scenario({
    name: "hilda-vs-balance-only-hilda",
    start: {
        phase: "attack",
        interactive: true,
        me: {
            hand: [BALANCE],
            spirits: [{ card: VANILLA, label: "攻撃役" }, { card: VANILLA, label: "犠牲" }],
        },
        opp: { spirits: [{ ...HILDA_LV2, rested: true }] },
    },
    steps(t) {
        attackOpp(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.act("me", { type: "resolveChoice", instanceId: t.id("犠牲") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: デッドリィバランス → なし",
        "自分.トラッシュ: なし → デッドリィバランス、ロクケラトプス",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 3",
        "自分.犠牲.場所: フィールド → なし",
        "自分.攻撃役.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.ヒルド.疲労: true → false", // ヒルド Lv2「自分のライフが減ったとき、このスピリットは回復する」／破壊されたカードはトラッシュへ
    ],
})

console.log("=== 8b. デッドリィバランス（フラッシュ）：相手は耐性のあるヒルドを選べず、ロクケラトプスを選ぶ ===")
scenario({
    name: "hilda-vs-balance-choice",
    start: {
        phase: "attack",
        interactive: true,
        me: {
            hand: [BALANCE],
            spirits: [{ card: VANILLA, label: "攻撃役" }, { card: VANILLA, label: "犠牲" }],
        },
        opp: {
            spirits: [
                { ...HILDA_LV2, rested: true },
                { card: VANILLA, label: "敵", cores: 2, rested: true },
            ],
        },
    },
    steps(t) {
        attackOpp(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.act("me", { type: "resolveChoice", instanceId: t.id("犠牲") })
        // 相手の選択。ヒルドが候補に出ないこと
        const pc = t.state.pendingChoice as PendingChoice | null
        if (pc !== null) {
            assert(pc.pid === t.opp, "相手が選ぶ")
            assert(!pc.candidates.includes(t.id("ヒルド")), "相手はヒルドを選べない（耐性）")
            t.act("opp", { type: "resolveChoice", instanceId: t.id("敵") })
        }
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: デッドリィバランス → なし",
        "自分.トラッシュ: なし → デッドリィバランス、ロクケラトプス",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 3",
        "自分.犠牲.場所: フィールド → なし",
        "自分.攻撃役.疲労: false → true",
        "相手.敵.場所: フィールド → なし",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 13",
        "相手.ヒルド.疲労: true → false", // ヒルド Lv2「自分のライフが減ったとき、このスピリットは回復する」／破壊されたカードはトラッシュへ
        "相手.トラッシュ: なし → ロクケラトプス",
    ],
})

console.log("=== 8c. デッドリィバランス：ほかのカードから与えられた耐性も効く（マジン・ゴレムの「自分の[ロック・アラディン]すべては、相手のマジックの効果を受けない」） ===")
// メインループが追加（2026-11-03）。総当たり（audit:immunity）で、与えられた耐性を mutualDestroyChoice が見ていないのが見つかったため
scenario({
    name: "granted-immunity-vs-balance",
    start: {
        phase: "attack",
        interactive: true,
        me: {
            hand: [BALANCE],
            spirits: [{ card: VANILLA, label: "攻撃役" }, { card: VANILLA, label: "犠牲" }],
        },
        opp: {
            spirits: [
                { card: "BS17-049", label: "アラディン", cores: 1, rested: true },
                { card: "BS17-054", label: "ゴレム", cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        attackOpp(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.act("me", { type: "resolveChoice", instanceId: t.id("犠牲") })
        const pc = t.state.pendingChoice as PendingChoice | null
        if (pc !== null) {
            assert(!pc.candidates.includes(t.id("アラディン")), "相手はロック・アラディンを選べない（与えられた耐性）")
            t.act("opp", { type: "resolveChoice", instanceId: t.id("ゴレム") })
        }
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: デッドリィバランス → なし",
        "自分.トラッシュ: なし → デッドリィバランス、ロクケラトプス",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 3",
        "自分.犠牲.場所: フィールド → なし",
        "自分.攻撃役.疲労: false → true",
        "相手.ゴレム.場所: フィールド → なし",
        "相手.トラッシュ: なし → マジン・ゴレム",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part766）")
