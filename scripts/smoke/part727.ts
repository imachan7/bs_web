// smoke パート727（BS19【連鎖】：連鎖元に続けて、自分の◯シンボルの有無で発揮されるか。docs/design/BS19_PLAN.md §2.1 Q771〜Q781）
// 場面は効果文とカードの属性だけから書いている（実装前に落ちてよい）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 主役（BS19。【連鎖】の仕組みを見るカード）──
const RENSOU_DROW = "BS19-006" // ケファレダガー（赤・スピリット・コスト4・地竜）召喚時破壊＋連鎖[紫]ドロー
const RENSOU_MAGIC = "BS19-101" // ヘルズバースディ（紫・マジック・コスト4）メイン＋連鎖[黄]
const RENSOU_BROKEN = "BS19-010" // 九刀竜スピノザンバー（赤・スピリット・コスト6・地竜）破壊時＋連鎖[紫]
const RENSOU_MOCHI = "BS19-021" // 吸血侯爵ベザレル（紫・スピリット・コスト6・夜族）Lv2【連鎖】持ちの召喚に誘発
const RENSOU_KEEP = "BS19-055" // ペルーディア（黄・スピリット・コスト6・想獣）継続の連鎖[白]

// ── 脇役（シンボル源・対象・ブロッカー。data/cards から選んだ）──
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ・BP1000）
const PURPLE_SYM = "BS04-012" // バンシィ（紫・コスト1・幽魔・バニラ）＝紫シンボル源
const YELLOW_SYM = "BS02-049" // ピヨン（黄・コスト0・歌鳥・バニラ）＝黄シンボル源
const WHITE_SYM = "BS01-074" // バーサーカー・ガン（白・コスト1・動器・バニラ・BP1000）＝白シンボル源
const SUMMON_TRIGGER_RED = "BS01-007" // ハンマドレイク（赤・コスト2・地竜）『このスピリットの召喚時』効果を持つ
const BLOCKER_2000 = "BS03-001" // 火精サラマンダート（赤・コスト1・空牙・バニラ・BP2000）
const BLOCKER_3000 = "BS01-008" // メタルバーン（赤・コスト3・機竜・バニラ・BP3000）
const BLOCKER_8000 = "BS05-006" // 城塞龍メガロン（赤・コスト5・機竜・バニラ）7コアでLv2 BP8000

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard(RENSOU_DROW)
    assert(
        c.name === "ケファレダガー" && c.type === "spirit" && c.colors.join() === "red" &&
            c.cost === 4 && c.family.join() === "地竜" && c.symbol.join() === "red",
        "BS19-006 ケファレダガーは赤・コスト4・地竜",
    )
    const m = getCard(RENSOU_MAGIC)
    assert(
        m.name === "ヘルズバースディ" && m.type === "magic" && m.colors.join() === "purple" && m.cost === 4,
        "BS19-101 ヘルズバースディは紫・コスト4のマジック",
    )
    const b = getCard(RENSOU_BROKEN)
    assert(
        b.name === "九刀竜スピノザンバー" && b.type === "spirit" && b.colors.join() === "red" &&
            b.cost === 6 && b.family.join() === "地竜",
        "BS19-010 九刀竜スピノザンバーは赤・コスト6・地竜",
    )
    const v = getCard(RENSOU_MOCHI)
    assert(
        v.name === "吸血侯爵ベザレル" && v.type === "spirit" && v.colors.join() === "purple" &&
            v.cost === 6 && v.family.join() === "夜族",
        "BS19-021 吸血侯爵ベザレルは紫・コスト6・夜族",
    )
    const p = getCard(RENSOU_KEEP)
    assert(
        p.name === "ペルーディア" && p.type === "spirit" && p.colors.join() === "yellow" &&
            p.cost === 6 && p.family.join() === "想獣",
        "BS19-055 ペルーディアは黄・コスト6・想獣",
    )
    assert(
        getCard(PURPLE_SYM).name === "バンシィ" && getCard(PURPLE_SYM).colors.join() === "purple" &&
            getCard(PURPLE_SYM).symbol.join() === "purple" && getCard(PURPLE_SYM).cost === 1,
        "BS04-012 バンシィは紫・コスト1・紫シンボル",
    )
    assert(
        getCard(YELLOW_SYM).name === "ピヨン" && getCard(YELLOW_SYM).colors.join() === "yellow" &&
            getCard(YELLOW_SYM).symbol.join() === "yellow",
        "BS02-049 ピヨンは黄・黄シンボル",
    )
    assert(
        getCard(WHITE_SYM).name === "バーサーカー・ガン" && getCard(WHITE_SYM).colors.join() === "white" &&
            getCard(WHITE_SYM).symbol.join() === "white" && getCard(WHITE_SYM).levels[0]!.bp === 1000,
        "BS01-074 バーサーカー・ガンは白・白シンボル・BP1000",
    )
    assert(
        getCard(SUMMON_TRIGGER_RED).name === "ハンマドレイク" && getCard(SUMMON_TRIGGER_RED).colors.join() === "red" &&
            getCard(SUMMON_TRIGGER_RED).family.join() === "地竜" &&
            getCard(SUMMON_TRIGGER_RED).effect.includes("このスピリットの召喚時"),
        "BS01-007 ハンマドレイクは『このスピリットの召喚時』効果を持つ赤の地竜",
    )
    assert(
        getCard(BLOCKER_2000).name === "火精サラマンダート" && getCard(BLOCKER_2000).colors.join() === "red" &&
            getCard(BLOCKER_2000).levels[0]!.bp === 2000,
        "BS03-001 火精サラマンダートはBP2000のバニラ",
    )
    assert(
        getCard(BLOCKER_3000).name === "メタルバーン" && getCard(BLOCKER_3000).colors.join() === "red" &&
            getCard(BLOCKER_3000).cost === 3 && getCard(BLOCKER_3000).levels[0]!.bp === 3000,
        "BS01-008 メタルバーンはコスト3・BP3000のバニラ",
    )
    assert(
        getCard(BLOCKER_8000).name === "城塞龍メガロン" && getCard(BLOCKER_8000).colors.join() === "red" &&
            getCard(BLOCKER_8000).levels[1]!.bp === 8000,
        "BS05-006 城塞龍メガロンはLv2 BP8000のバニラ",
    )
    assert(
        getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors.join() === "red" &&
            getCard(VANILLA).cost === 1 && getCard(VANILLA).levels[0]!.bp === 1000,
        "BS01-002 ロクケラトプスはコスト1・BP1000のバニラ",
    )
}

// ═══ BS19-006 ケファレダガー：召喚時破壊＋【連鎖：条件《紫シンボル》】[紫]ドロー ═══

// 紫シンボル（バンシィ）がある → 召喚時破壊に続けてドローする
scenario({
    name: "rensou006a",
    start: {
        me: { spirits: [{ card: PURPLE_SYM }], hand: [RENSOU_DROW] },
        opp: { spirits: [{ card: SUMMON_TRIGGER_RED }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ケファレダガー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ケファレダガー.場所: なし → フィールド",
        "自分.ケファレダガー.疲労: なし → false",
        "自分.ケファレダガー.コア: なし → 1",
        "自分.ケファレダガー.Lv: なし → 1",
        "自分.ケファレダガー.BP: なし → 3000",
        "相手.ハンマドレイク.場所: フィールド → なし",
        "相手.トラッシュ: なし → ハンマドレイク",
        "相手.リザーブ: 10 → 11",
    ],
})

// 紫シンボルが無い → 破壊はするがドローしない（条件を1つ外す）
scenario({
    name: "rensou006b",
    start: {
        me: { hand: [RENSOU_DROW] },
        opp: { spirits: [{ card: SUMMON_TRIGGER_RED }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ケファレダガー → なし",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ケファレダガー.場所: なし → フィールド",
        "自分.ケファレダガー.疲労: なし → false",
        "自分.ケファレダガー.コア: なし → 1",
        "自分.ケファレダガー.Lv: なし → 1",
        "自分.ケファレダガー.BP: なし → 3000",
        "相手.ハンマドレイク.場所: フィールド → なし",
        "相手.トラッシュ: なし → ハンマドレイク",
        "相手.リザーブ: 10 → 11",
    ],
})

// 相手に『このスピリットの召喚時』効果持ちがいない（連鎖元が対象なし）でも、紫シンボルがあれば連鎖は発揮する（Q773）
scenario({
    name: "rensou006c",
    start: {
        me: { spirits: [{ card: PURPLE_SYM }], hand: [RENSOU_DROW] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ケファレダガー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ケファレダガー.場所: なし → フィールド",
        "自分.ケファレダガー.疲労: なし → false",
        "自分.ケファレダガー.コア: なし → 1",
        "自分.ケファレダガー.Lv: なし → 1",
        "自分.ケファレダガー.BP: なし → 3000",
    ],
})

// ═══ BS19-101 ヘルズバースディ：メイン＋【連鎖：条件《黄シンボル》】[黄]コスト3以下はブロック不可 ═══

// 黄シンボル（ピヨン）がある → マジックのメイン（トラッシュからコストを支払わず召喚）に続けて、
// このターン相手のコスト3以下のスピリットはブロックできない（Q780：マジックは発揮時に条件を確かめる）
scenario({
    name: "rensou101a",
    start: {
        me: { spirits: [{ card: YELLOW_SYM }], hand: [RENSOU_MAGIC], trash: [VANILLA] },
        opp: { spirits: [{ card: BLOCKER_3000 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ピヨン") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ヘルズバースディ → なし",
        "自分.トラッシュ: ロクケラトプス → ヘルズバースディ",
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
        "自分.ピヨン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 黄シンボルが無い → メイン（トラッシュから召喚）は発揮するが、コスト3以下でもブロックできる（条件を1つ外す）
scenario({
    name: "rensou101b",
    start: {
        me: { spirits: [{ card: PURPLE_SYM }], hand: [RENSOU_MAGIC], trash: [VANILLA] },
        opp: { spirits: [{ card: BLOCKER_3000 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("バンシィ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: ヘルズバースディ → なし",
        "自分.トラッシュ: ロクケラトプス → バンシィ、ヘルズバースディ",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
        "自分.バンシィ.場所: フィールド → なし",
        "相手.メタルバーン.疲労: false → true",
    ],
})

// ═══ BS19-010 九刀竜スピノザンバー：Lv2破壊時＋【連鎖：条件《紫シンボル》】[紫]相手のコア7個をトラッシュへ ═══

// Lv2（3コア）でバトル破壊されたとき紫シンボル（バンシィ）がある → 相手はスピリットのコア7個を
// 相手のトラッシュに置く（1体から7個 → 0個になり消滅。コアはリザーブでなくトラッシュへ）
scenario({
    name: "rensou010a",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: RENSOU_BROKEN, cores: 3 }, { card: PURPLE_SYM }] },
        opp: { spirits: [{ card: BLOCKER_8000, cores: 7 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("九刀竜スピノザンバー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("城塞龍メガロン") })
        t.closeFlash()
    },
    expect: [
        "自分.九刀竜スピノザンバー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 九刀竜スピノザンバー",
        "自分.リザーブ: 10 → 13",
        "相手.城塞龍メガロン.場所: フィールド → なし",
        "相手.トラッシュ: なし → 城塞龍メガロン",
        "相手.トラッシュのコア: 0 → 7",
    ],
})

// 紫シンボルが無い → 破壊時の連鎖は発揮せず、相手のコアは動かない（条件を1つ外す）
scenario({
    name: "rensou010b",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: RENSOU_BROKEN, cores: 3 }] },
        opp: { spirits: [{ card: BLOCKER_8000, cores: 7 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("九刀竜スピノザンバー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("城塞龍メガロン") })
        t.closeFlash()
    },
    expect: [
        "自分.九刀竜スピノザンバー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 九刀竜スピノザンバー",
        "自分.リザーブ: 10 → 13",
        "相手.城塞龍メガロン.疲労: false → true",
    ],
})

// ═══ BS19-021 吸血侯爵ベザレル：Lv2･Lv3『自分のメインステップ』【連鎖】を持つ自分のスピリットが
//     召喚されたとき、疲労状態の相手のスピリット1体を破壊する ═══

// Lv2で、【連鎖】を持つスピリット（BS19-055 をLv2で召喚）を召喚 → 発揮する。
// 白シンボルが足りなくても「【連鎖】を持つ」ことに変わりはない（Q774・Q775）
scenario({
    name: "renmochi021a",
    start: {
        me: { spirits: [{ card: RENSOU_MOCHI, cores: 2 }], hand: [RENSOU_KEEP] },
        opp: { spirits: [{ card: VANILLA, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, level: 2 })
    },
    expect: [
        "自分.手札: ペルーディア → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 6",
        "自分.ペルーディア.場所: なし → フィールド",
        "自分.ペルーディア.疲労: なし → false",
        "自分.ペルーディア.コア: なし → 2",
        "自分.ペルーディア.Lv: なし → 2",
        "自分.ペルーディア.BP: なし → 5000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 【連鎖】を持たないスピリット（バニラ）の召喚では発揮しない（条件を1つ外す）
scenario({
    name: "renmochi021b",
    start: {
        me: { spirits: [{ card: RENSOU_MOCHI, cores: 2 }], hand: [VANILLA] },
        opp: { spirits: [{ card: VANILLA, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ロクケラトプス → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})

// BS19-021 がLv1ではこの効果は働くLvにいない → 発揮しない（条件を1つ外す）
scenario({
    name: "renmochi021c",
    start: {
        me: { spirits: [{ card: RENSOU_MOCHI, cores: 1 }], hand: [RENSOU_KEEP] },
        opp: { spirits: [{ card: VANILLA, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, level: 2 })
    },
    expect: [
        "自分.手札: ペルーディア → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 6",
        "自分.ペルーディア.場所: なし → フィールド",
        "自分.ペルーディア.疲労: なし → false",
        "自分.ペルーディア.コア: なし → 2",
        "自分.ペルーディア.Lv: なし → 2",
        "自分.ペルーディア.BP: なし → 5000",
    ],
})

// ═══ BS19-055 ペルーディア：継続の連鎖[白]【聖命】を持つ自分のスピリットすべては、
//     そのスピリットのBP以下の相手のスピリットからブロックされない ═══

// 白シンボルが途中で増える（バーサーカー・ガンを召喚）→ 満たした瞬間に効き、
// BP3000の相手はBP5000のペルーディア（【聖命】持ち）をブロックできない（Q778）
scenario({
    name: "renkeep055a",
    start: {
        me: { spirits: [{ card: RENSOU_KEEP, cores: 2 }], hand: [WHITE_SYM] },
        opp: { spirits: [{ card: BLOCKER_3000 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ペルーディア") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: バーサーカー・ガン → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        "自分.バーサーカー・ガン.場所: なし → フィールド",
        "自分.バーサーカー・ガン.疲労: なし → false",
        "自分.バーサーカー・ガン.コア: なし → 1",
        "自分.バーサーカー・ガン.Lv: なし → 1",
        "自分.バーサーカー・ガン.BP: なし → 1000",
        "自分.ペルーディア.疲労: false → true",
        "自分.ライフ: 5 → 6",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 白シンボルが場を離れて無くなった瞬間に止まる（Q777）→ BP以下の相手でもブロックできる。
// 白シンボル源（バーサーカー・ガン）を先にアタックさせ、BP2000の相手に破壊させてからペルーディアがアタックする
scenario({
    name: "renkeep055b",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: RENSOU_KEEP, cores: 2 }, { card: WHITE_SYM }] },
        opp: { spirits: [{ card: BLOCKER_2000 }, { card: BLOCKER_3000 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("バーサーカー・ガン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("火精サラマンダート") })
        t.closeFlash()
        t.act("me", { type: "attack", instanceId: t.id("ペルーディア") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.バーサーカー・ガン.場所: フィールド → なし",
        "自分.トラッシュ: なし → バーサーカー・ガン",
        "自分.リザーブ: 10 → 11",
        "自分.ペルーディア.疲労: false → true",
        "相手.火精サラマンダート.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part727）")
