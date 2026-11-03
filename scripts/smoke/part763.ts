// smoke パート763（期待値役の場面テスト。効果文だけから書いた。実装は見ていない）
// BS08-X29 魔帝龍騎ダーク・クリムゾン（召喚時：すべてを召喚できる）
// BS19-095 光灯る三叉灯台（配置時：手札のブレイヴ1枚を召喚できる）
// BSC05-020 星空の冠（ライフ減少時：オープンできる。コスト2以下のスピリットなら召喚できる）
// BS19-084 命の蝋燭塔（【連鎖】のスピリットが相手の効果で破壊されたとき、相手の手札1枚をランダムに破棄）
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）

type Answer = "press" | "decline"

// 「できる」の確認に答える。press＝「発動する」、decline＝断る。候補選びは先頭を選ぶ。
// seq の数だけ確認に答える。seq が尽きたら確認は開いたまま残す（想定外の確認は盤面の「選択待ち」の差分で落ちる）
function answer(t: ScenarioCtx, seq: Answer[]) {
    let i = 0
    // 答えても閉じない確認（手札から選ぶ形など）で回り続けないよう、回数で打ち切る。残った確認は盤面の差分で落ちる
    for (let n = 0; n < 10 && t.state.pendingChoice; n++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "option" && (pc.options ?? []).includes("発動する")) {
            if (i >= seq.length) return
            const a = seq[i++]!
            t.act(side, a === "press" ? { type: "resolveChoice", option: "発動する" } : { type: "resolveChoice" })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            if (!pc.candidates?.length) return
            t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
    }
}

const DRAGON_DECK = ["光導龍騎ゾディアックアポロクリムゾン", "真紅の竜使いロッソ"]

console.log("=== 1. BS08-X29『このスピリットの召喚時』：オープンした龍帝/竜騎を召喚する（使う） ===")
scenario({
    name: "dark-crimson-press",
    start: {
        interactive: true,
        me: {
            hand: ["BS08-X29"],
            deck: ["X011", "BS05-007", VANILLA, VANILLA, VANILLA, VANILLA, VANILLA],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, ["press"])
    },
    expect: [
        "自分.魔帝龍騎ダーク・クリムゾン.場所: なし → フィールド",
        "自分.魔帝龍騎ダーク・クリムゾン.疲労: なし → false",
        "自分.魔帝龍騎ダーク・クリムゾン.コア: なし → 1",
        "自分.魔帝龍騎ダーク・クリムゾン.Lv: なし → 1",
        "自分.魔帝龍騎ダーク・クリムゾン.BP: なし → 6000",
        `自分.${DRAGON_DECK[0]}.場所: なし → フィールド`,
        `自分.${DRAGON_DECK[0]}.疲労: なし → false`,
        `自分.${DRAGON_DECK[0]}.コア: なし → 1`,
        `自分.${DRAGON_DECK[0]}.Lv: なし → 1`,
        `自分.${DRAGON_DECK[0]}.BP: なし → 12000`,
        `自分.${DRAGON_DECK[1]}.場所: なし → フィールド`,
        `自分.${DRAGON_DECK[1]}.疲労: なし → false`,
        `自分.${DRAGON_DECK[1]}.コア: なし → 1`,
        `自分.${DRAGON_DECK[1]}.Lv: なし → 1`,
        `自分.${DRAGON_DECK[1]}.BP: なし → 5000`,
        "自分.手札: 魔帝龍騎ダーク・クリムゾン → なし",
        "自分.リザーブ: 10 → 0",
        "自分.トラッシュのコア: 0 → 7",
        "自分.デッキ枚数: 7 → 0",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

console.log("=== 2. BS08-X29：オープンした召喚を断ると、7枚すべて破棄される（召喚されない） ===")
scenario({
    name: "dark-crimson-decline",
    start: {
        interactive: true,
        me: {
            hand: ["BS08-X29"],
            deck: ["X011", "BS05-007", VANILLA, VANILLA, VANILLA, VANILLA, VANILLA],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        answer(t, ["decline"])
    },
    expect: [
        "自分.魔帝龍騎ダーク・クリムゾン.場所: なし → フィールド",
        "自分.魔帝龍騎ダーク・クリムゾン.疲労: なし → false",
        "自分.魔帝龍騎ダーク・クリムゾン.コア: なし → 1",
        "自分.魔帝龍騎ダーク・クリムゾン.Lv: なし → 1",
        "自分.魔帝龍騎ダーク・クリムゾン.BP: なし → 6000",
        "自分.手札: 魔帝龍騎ダーク・クリムゾン → なし",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.デッキ枚数: 7 → 0",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、光導龍騎ゾディアックアポロクリムゾン、真紅の竜使いロッソ",
    ],
})

console.log("=== 3. BS19-095『このネクサスの配置時』：手札のブレイヴを召喚する（使う） ===")
scenario({
    name: "three-lighthouse-press",
    start: {
        interactive: true,
        me: { hand: ["BS19-095", "BS17-060"] },
    },
    steps(t) {
        t.act("me", { type: "setNexus", handIndex: 0 })
        answer(t, ["press"])
    },
    expect: [
        "自分.光灯る三叉灯台.場所: なし → ネクサス",
        "自分.光灯る三叉灯台.疲労: なし → false",
        "自分.光灯る三叉灯台.コア: なし → 0",
        "自分.光灯る三叉灯台.Lv: なし → 1",
        "自分.ジン・アームズ.場所: なし → フィールド",
        "自分.ジン・アームズ.疲労: なし → false",
        "自分.ジン・アームズ.コア: なし → 1",
        "自分.ジン・アームズ.Lv: なし → 1",
        "自分.ジン・アームズ.BP: なし → 4000",
        "自分.手札: ジン・アームズ、光灯る三叉灯台 → なし",
        "自分.リザーブ: 10 → 3", // ネクサスのコスト6＋ブレイヴの置くコア1
        "自分.トラッシュのコア: 0 → 6",
    ],
})

console.log("=== 4. BS19-095：召喚を断ると、ブレイヴは手札に残る ===")
scenario({
    name: "three-lighthouse-decline",
    start: {
        interactive: true,
        me: { hand: ["BS19-095", "BS17-060"] },
    },
    steps(t) {
        t.act("me", { type: "setNexus", handIndex: 0 })
        answer(t, ["decline"])
    },
    expect: [
        "自分.光灯る三叉灯台.場所: なし → ネクサス",
        "自分.光灯る三叉灯台.疲労: なし → false",
        "自分.光灯る三叉灯台.コア: なし → 0",
        "自分.光灯る三叉灯台.Lv: なし → 1",
        "自分.手札: ジン・アームズ、光灯る三叉灯台 → ジン・アームズ",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
    ],
})

console.log("=== 5. BSC05-020『自分のライフが減ったとき』：オープンを断る（何も起きず、ライフだけ減る） ===")
scenario({
    name: "star-crown-decline",
    start: {
        turn: "opp",
        interactive: true,
        me: { nexuses: [{ card: "BSC05-020", cores: 0 }], deck: ["SD06-002", ...Array.from({ length: 39 }, () => VANILLA)] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        answer(t, ["decline"])
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== 6. BSC05-020：オープンして、コスト2以下のスピリットを召喚する ===")
scenario({
    name: "star-crown-summon",
    start: {
        turn: "opp",
        interactive: true,
        me: { nexuses: [{ card: "BSC05-020", cores: 0 }], deck: ["SD06-002", ...Array.from({ length: 39 }, () => VANILLA)] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        answer(t, ["press", "press"])
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.デッキ枚数: 40 → 39",
        "自分.サラマントル.場所: なし → フィールド",
        "自分.サラマントル.疲労: なし → false",
        "自分.サラマントル.コア: なし → 1",
        "自分.サラマントル.Lv: なし → 1",
        "自分.サラマントル.BP: なし → 2000",
    ],
})

console.log("=== 7. BSC05-020：オープンして召喚せず、そのカードを手札に加える ===")
scenario({
    name: "star-crown-keep",
    start: {
        turn: "opp",
        interactive: true,
        me: { nexuses: [{ card: "BSC05-020", cores: 0 }], deck: ["SD06-002", ...Array.from({ length: 39 }, () => VANILLA)] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        answer(t, ["press", "decline"])
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → サラマントル",
    ],
})

console.log("=== 8. BS19-084『【連鎖】のスピリットが相手の効果で破壊されたとき』：相手の手札を1枚ランダムに破棄（確認は出ない） ===")
scenario({
    name: "candle-tower-random-discard",
    start: {
        turn: "opp",
        interactive: true,
        me: {
            spirits: [{ card: "SD11-003", label: "連鎖", cores: 3 }],
            nexuses: [{ card: "BS19-084", cores: 0 }],
        },
        opp: {
            spirits: [
                { card: "BS16-053", label: "青1" },
                { card: "BS16-053", label: "青2" },
                { card: "BS16-053", label: "青3" },
            ],
            hand: ["BS18-083", VANILLA, VANILLA],
        },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        answer(t, [])
    },
    expect: [
        "自分.連鎖.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・カリブー",
        "自分.リザーブ: 10 → 13",
        "相手.手札: アイアンファランクス、ロクケラトプス、ロクケラトプス → ロクケラトプス",
        "相手.トラッシュ: なし → アイアンファランクス、ロクケラトプス",
        "相手.リザーブ: 10 → 8", // アイアンファランクスのコスト4－青の軽減2
        "相手.トラッシュのコア: 0 → 2",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part763）")
