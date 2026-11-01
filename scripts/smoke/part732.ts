// smoke パート732（BS19 紫8枚の場面テスト：効果文と属性だけから書いた期待値。実装前に落ちてよい）
// 対象：BS19-013/014/015/017/018/020/022/069。うち BS19-017（大蛇サイドロン）は【強化】の行だけなので
// part726 の管轄でここでは場面を書かない（機械確認だけ行う）。
// 解釈：docs/design/BS19_PLAN.md §2（Q772〜781 の連鎖・PROMO_PLAN §2）・SEMANTICS_AUDIT §3.23〜3.25・§3.9・
// CONJUNCTION.md・SOULCORE.md §0（ソウルコアはボイドとライフへ行かない＝リザーブへは動ける）
// 補足：非対話（既定）では選択はエンジンが自動で決める。候補が1体の盤面にして決定性を保っている。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ── 前提：カードの機械確認（cardId は記憶で書かない）──────────────────────────
function assertCard(
    id: string,
    name: string,
    type: string,
    colors: string,
    family: string,
    cost: number,
): void {
    const c = getCard(id)
    assert(
        c.name === name &&
            c.type === type &&
            c.colors.join("/") === colors &&
            c.family.join("/") === family &&
            c.cost === cost,
        `${id}は${name}（${type}・${colors}・${family}・コスト${cost}）`,
    )
}

console.log("=== 前提: カードの機械確認 ===")
{
    // 主役8枚（BS19）
    assertCard("BS19-013", "ダーク・デモボーン", "spirit", "purple", "無魔", 2)
    assertCard("BS19-014", "ダーク・ソードール", "spirit", "purple", "無魔", 3)
    assertCard("BS19-015", "ミトランスネーク", "spirit", "purple", "妖蛇", 3)
    assertCard("BS19-017", "大蛇サイドロン", "spirit", "purple", "妖蛇", 4)
    assertCard("BS19-018", "ヴィクトローラー", "spirit", "purple", "妖蛇", 4)
    assertCard(
        "BS19-020",
        "影の剣使いブラックパルド",
        "spirit",
        "purple",
        "剣使/魔影",
        5,
    )
    assertCard(
        "BS19-022",
        "ダーク・スカルピオーネ",
        "spirit",
        "purple",
        "無魔/妖蛇",
        6,
    )
    assertCard("BS19-069", "ヒヒ・ボーン", "brave", "purple", "無魔", 3)
    // 脇役（data/cards の既存弾）
    assertCard("BS01-002", "ロクケラトプス", "spirit", "red", "地竜", 1) // バニラ・Lv1BP1000/Lv2BP3000
    assertCard("BS01-005", "アイバーン", "spirit", "red", "翼竜", 2) // バニラ・Lv1BP2000
    assertCard("BS01-031", "デス・ハーデス", "spirit", "purple", "呪鬼", 3) // バニラ・Lv1BP4000（ヒヒ・ボーンの合体先）
    assertCard("BS07-037", "ヒッポカンプー", "spirit", "yellow", "想獣", 1) // バニラ・黄シンボル
    assertCard("BS10-007", "デュアルド", "spirit", "red", "古竜/異合", 5) // バニラ・Lv1BP5000（コスト5）
    assertCard("BS10-028", "マタンゴル", "spirit", "green", "樹魔", 5) // バニラ・Lv1BP6000（コスト5）
    assertCard(
        "BS16-043",
        "スペードビースト・レオ",
        "spirit",
        "yellow",
        "四道/戯狩",
        6,
    ) // バニラ・Lv2BP6000
    assertCard("BS17-007", "ヴァジュランガ", "spirit", "red", "皇獣", 6) // バニラ・Lv2BP10000
    assertCard("BS03-144", "マジックハンマー", "magic", "blue", "", 4) // メイン：相手のデッキを5枚破棄
    assertCard(
        "BS11-056",
        "極星剣機ポーラ・キャリバー",
        "brave",
        "white",
        "動器",
        5,
    ) // 合体条件：コスト5以上・合体BP6000
    assertCard("BS17-057", "ギョクジーグ", "brave", "green", "雄将/殻虫", 2) // トラッシュに置くだけのブレイヴカード
}

// ══════════════════════════════════════════════════════════════════════════
// BS19-013 ダーク・デモボーン
// Lv1･Lv2『このスピリットの破壊時』コスト4以下の疲労状態の相手のスピリット1体を破壊する。
// 【連鎖：条件《黄シンボル》】[黄]：自分のスピリット1体を回復させる。
// ══════════════════════════════════════════════════════════════════════════

// 013-1 破壊時：疲労状態のコスト2の相手を破壊する（黄シンボルが無いので連鎖は不発）
scenario({
    name: "demobone-onDeath-destroy",
    start: {
        turn: "opp",
        phase: "attack",
        me: {
            spirits: [
                { card: "BS19-013", cores: 2 },
                { card: "BS01-031", cores: 1, rested: true },
            ],
        },
        opp: {
            spirits: [
                { card: "BS10-007", cores: 1 },
                { card: "BS01-005", cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・デモボーン") })
        t.closeFlash()
    },
    expect: [
        "相手.デュアルド.疲労: false → true",
        "自分.ダーク・デモボーン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・デモボーン",
        "自分.リザーブ: 10 → 12",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

// 013-2 連鎖：自分の黄シンボルがあるとき、破壊時の破壊に続けて自分のスピリット1体を回復
scenario({
    name: "demobone-rensa-yellow-refresh",
    start: {
        turn: "opp",
        phase: "attack",
        me: {
            spirits: [
                { card: "BS19-013", cores: 2 },
                { card: "BS07-037", cores: 1, rested: true },
            ],
        },
        opp: {
            spirits: [
                { card: "BS10-007", cores: 1 },
                { card: "BS01-005", cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・デモボーン") })
        t.closeFlash()
    },
    expect: [
        "相手.デュアルド.疲労: false → true",
        "自分.ダーク・デモボーン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・デモボーン",
        "自分.リザーブ: 10 → 12",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.リザーブ: 10 → 11",
        "自分.ヒッポカンプー.疲労: true → false",
    ],
})

// 013-3 破壊時の起きない場面：疲労状態の相手がコスト5なので対象に取れない
scenario({
    name: "demobone-onDeath-cost5",
    start: {
        turn: "opp",
        phase: "attack",
        me: {
            spirits: [
                { card: "BS19-013", cores: 2 },
                { card: "BS01-031", cores: 1, rested: true },
            ],
        },
        opp: {
            spirits: [
                { card: "BS10-007", cores: 1 },
                { card: "BS10-028", cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・デモボーン") })
        t.closeFlash()
    },
    expect: [
        "相手.デュアルド.疲労: false → true",
        "自分.ダーク・デモボーン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・デモボーン",
        "自分.リザーブ: 10 → 12",
    ],
})

// ══════════════════════════════════════════════════════════════════════════
// BS19-014 ダーク・ソードール
// Lv1-3『このスピリットの召喚時』1枚ドロー。
// 【連鎖：条件《黄シンボル》】[黄]：このターンの間、このスピリットはLv1の相手のスピリットからブロックされない。
// Lv3：このスピリットの色とシンボルは黄としても扱う。
// ══════════════════════════════════════════════════════════════════════════

// 014-1 召喚時ドロー＋連鎖：黄シンボルがあるので同じターンのアタックがLv1の相手からブロックされない
scenario({
    name: "swordoll-draw-unblockable",
    start: {
        turn: "me",
        phase: "main",
        me: { hand: ["BS19-014"], spirits: [{ card: "BS07-037", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-005", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        // 召喚で場に出た個体はラベルが付いていないので state から探す
        const summoned = t.state.players[t.me].field.spirits.find(
            (x) => x.cardId === "BS19-014",
        )
        assert(summoned !== undefined, "ダーク・ソードールが場に出ている")
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: summoned!.instanceId })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("アイバーン") })
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ダーク・ソードール → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 6",
        "自分.ダーク・ソードール.場所: なし → フィールド",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ダーク・ソードール.疲労: なし → true",
        "自分.ダーク・ソードール.コア: なし → 1",
        "自分.ダーク・ソードール.Lv: なし → 1",
        "自分.ダーク・ソードール.BP: なし → 1000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 014-2 連鎖の起きない場面：黄シンボルが無いのでLv1の相手にブロックされる
scenario({
    name: "swordoll-no-yellow-blocked",
    start: {
        turn: "me",
        phase: "main",
        me: { hand: ["BS19-014"] },
        opp: { spirits: [{ card: "BS01-005", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        const summoned = t.state.players[t.me].field.spirits.find(
            (x) => x.cardId === "BS19-014",
        )
        assert(summoned !== undefined, "ダーク・ソードールが場に出ている")
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: summoned!.instanceId })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("アイバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: ダーク・ソードール → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュ: なし → ダーク・ソードール",
        "自分.トラッシュのコア: 0 → 3",
        "相手.アイバーン.疲労: false → true",
    ],
})

// 014-3 Lv3：色とシンボルは黄としても扱う（ダーク・デモボーンの【連鎖】の条件を満たす）
scenario({
    name: "swordoll-lv3-as-yellow",
    start: {
        turn: "opp",
        phase: "attack",
        me: {
            spirits: [
                { card: "BS19-014", cores: 5, rested: true },
                { card: "BS19-013", cores: 2 },
            ],
        },
        opp: {
            spirits: [
                { card: "BS10-007", cores: 1 },
                { card: "BS01-005", cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・デモボーン") })
        t.closeFlash()
    },
    expect: [
        "相手.デュアルド.疲労: false → true",
        "自分.ダーク・デモボーン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・デモボーン",
        "自分.リザーブ: 10 → 12",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.リザーブ: 10 → 11",
        "自分.ダーク・ソードール.疲労: true → false",
    ],
})

// 014-4 Lv3の起きない場面：Lv2（コア2個）なので黄シンボルとして数えず連鎖も回復もしない
scenario({
    name: "swordoll-lv2-not-yellow",
    start: {
        turn: "opp",
        phase: "attack",
        me: {
            spirits: [
                { card: "BS19-014", cores: 2, rested: true },
                { card: "BS19-013", cores: 2 },
            ],
        },
        opp: {
            spirits: [
                { card: "BS10-007", cores: 1 },
                { card: "BS01-005", cores: 1, rested: true },
            ],
        },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("デュアルド") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ダーク・デモボーン") })
        t.closeFlash()
    },
    expect: [
        "相手.デュアルド.疲労: false → true",
        "自分.ダーク・デモボーン.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・デモボーン",
        "自分.リザーブ: 10 → 12",
        "相手.アイバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

// ══════════════════════════════════════════════════════════════════════════
// BS19-015 ミトランスネーク
// Lv2『このスピリットのアタック時』相手のスピリットのコア1個を相手のリザーブに置く。
// この効果でそのスピリットのコアが0個になったとき、1枚ドローする。
// ══════════════════════════════════════════════════════════════════════════

// 015-1 Lv2アタック時：コア1個の相手を0個にして破壊（消滅）させ、1枚ドロー
scenario({
    name: "mitran-lv2-empties-draw",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS19-015", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミトランスネーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ミトランスネーク.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
        "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
    ],
})

// 015-2 起きない場面：Lv1のアタックではコアを動かさない
scenario({
    name: "mitran-lv1-none",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS19-015", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 1, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミトランスネーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ミトランスネーク.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 015-3 ドローの起きない場面：コア2個の相手から1個動かしても0個にならない
scenario({
    name: "mitran-2cores-no-draw",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS19-015", cores: 3 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 2, rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミトランスネーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ミトランスネーク.疲労: false → true",
        "相手.ロクケラトプス.コア: 2 → 1",
        "相手.ロクケラトプス.Lv: 2 → 1",
        "相手.ロクケラトプス.BP: 3000 → 1000",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// 015-4 ソウルコアありの場面：ソウルコア1個のスピリットからもリザーブへ動かせる（ソウルコアはボイドとライフへ行かないだけ）
scenario({
    name: "mitran-lv2-soulcore",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS19-015", cores: 3 }] },
        opp: {
            spirits: [{ card: "BS01-002", cores: 1, rested: true }],
            soulCore: "ロクケラトプス",
        },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミトランスネーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // 相手の効果でリザーブへ置くとき、ソウルコアを含めるかは持ち主が選ぶ（SOULCORE.md §2）。選ばせない場面では含めないので、ロクケラトプスは残る
    expect: [
        "自分.ミトランスネーク.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ══════════════════════════════════════════════════════════════════════════
// BS19-018 ヴィクトローラー
// Lv1-3『このスピリットの召喚時』相手のスピリットのコア1個を相手のリザーブに置く。
// Lv1-3：お互いのデッキは破棄されない。
// ══════════════════════════════════════════════════════════════════════════

// 018-1 召喚時：相手のスピリットのコア1個を相手のリザーブへ（Lv2→Lv1に落ちる）
scenario({
    name: "victroller-summon-core-remove",
    start: {
        turn: "me",
        phase: "main",
        me: { hand: ["BS19-018"] },
        opp: { spirits: [{ card: "BS01-002", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ヴィクトローラー → なし",
        "自分.リザーブ: 10 → 5",
        "自分.ヴィクトローラー.場所: なし → フィールド",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ヴィクトローラー.疲労: なし → false",
        "自分.ヴィクトローラー.コア: なし → 1",
        "自分.ヴィクトローラー.Lv: なし → 1",
        "自分.ヴィクトローラー.BP: なし → 2000",
        "相手.ロクケラトプス.コア: 2 → 1",
        "相手.ロクケラトプス.Lv: 2 → 1",
        "相手.ロクケラトプス.BP: 3000 → 1000",
        "相手.リザーブ: 10 → 11",
    ],
})

// 018-2 常時：相手のマジック（メイン：相手のデッキを5枚破棄）でも自分のデッキは破棄されない
scenario({
    name: "victroller-deck-protected",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: "BS19-018", cores: 1 }] },
        opp: { hand: ["BS03-144"] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.手札: マジックハンマー → なし",
        "相手.トラッシュ: なし → マジックハンマー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
    ],
})

// 018-3 打ち消しの裏側（保護が無いときのマジックハンマーの素の挙動。020の節の否定場面も兼ねる）
scenario({
    name: "deck-mill-baseline",
    start: {
        turn: "opp",
        phase: "main",
        opp: { hand: ["BS03-144"] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.手札: マジックハンマー → なし",
        "相手.トラッシュ: なし → マジックハンマー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
        "自分.デッキ枚数: 40 → 35",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

// 018-4 ソウルコアありの場面：ソウルコア1個の相手からもリザーブへ動かし、0個で破壊（消滅）させる
scenario({
    name: "victroller-summon-soulcore",
    start: {
        turn: "me",
        phase: "main",
        me: { hand: ["BS19-018"] },
        opp: {
            spirits: [{ card: "BS01-002", cores: 1 }],
            soulCore: "ロクケラトプス",
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // ソウルコアを含めるかは持ち主が選ぶ（SOULCORE.md §2）。選ばせない場面では含めないので、ロクケラトプスは残る
    expect: [
        "自分.手札: ヴィクトローラー → なし",
        "自分.リザーブ: 10 → 5",
        "自分.ヴィクトローラー.場所: なし → フィールド",
        "自分.トラッシュのコア: 0 → 4",
        "自分.ヴィクトローラー.疲労: なし → false",
        "自分.ヴィクトローラー.コア: なし → 1",
        "自分.ヴィクトローラー.Lv: なし → 1",
        "自分.ヴィクトローラー.BP: なし → 2000",
    ],
})

// ══════════════════════════════════════════════════════════════════════════
// BS19-020 影の剣使いブラックパルド
// Lv1-3：お互いのデッキは破棄されない。
// 【合体時】Lv2-3『このスピリットの合体アタック時』バトル終了時、自分のトラッシュにあるブレイヴカード1枚を手札に戻す。
// ══════════════════════════════════════════════════════════════════════════

// 020-1 常時：デッキ破棄を止める（018と同じ文言。こちらは020を置く）
scenario({
    name: "blackpal-deck-protected",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: "BS19-020", cores: 1 }] },
        opp: { hand: ["BS03-144"] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.手札: マジックハンマー → なし",
        "相手.トラッシュ: なし → マジックハンマー",
        "相手.トラッシュのコア: 0 → 4",
        "相手.リザーブ: 10 → 6",
    ],
})

// 020-2 合体アタック時：バトル終了時にトラッシュのブレイヴカード1枚を手札に戻す
scenario({
    name: "blackpal-braved-return-brave",
    start: {
        turn: "me",
        phase: "main",
        me: {
            spirits: [{ card: "BS19-020", cores: 3 }],
            hand: ["BS11-056"],
            trash: ["BS17-057"],
        },
    },
    steps(t) {
        t.act("me", {
            type: "summon",
            handIndex: 0,
            braveTargetInstanceId: t.id("影の剣使いブラックパルド"),
        })
        t.act("me", { type: "nextPhase" })
        t.act("me", {
            type: "attack",
            instanceId: t.id("影の剣使いブラックパルド"),
        })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 極星剣機ポーラ・キャリバー → ギョクジーグ",
        "自分.トラッシュ: ギョクジーグ → なし",
        "自分.リザーブ: 10 → 5",
        "自分.極星剣機ポーラ・キャリバー.場所: なし → 合体",
        "自分.トラッシュのコア: 0 → 5",
        "自分.極星剣機ポーラ・キャリバー.疲労: なし → false",
        "自分.極星剣機ポーラ・キャリバー.コア: なし → 0",
        "自分.極星剣機ポーラ・キャリバー.Lv: なし → 1",
        "自分.影の剣使いブラックパルド.疲労: false → true",
        "自分.影の剣使いブラックパルド.BP: 5000 → 11000",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

// 020-3 合体アタック時の起きない場面：合体していないのでブレイヴカードを戻さない
scenario({
    name: "blackpal-unbraved-no-return",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS19-020", cores: 3 }], trash: ["BS17-057"] },
    },
    steps(t) {
        t.act("me", {
            type: "attack",
            instanceId: t.id("影の剣使いブラックパルド"),
        })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.影の剣使いブラックパルド.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ══════════════════════════════════════════════════════════════════════════
// BS19-022 ダーク・スカルピオーネ
// 【不死：コスト2/3】『お互いのアタックステップ』トラッシュにあるこのカードは、コスト2/3の自分のスピリットが破壊されたとき召喚できる。
// Lv2-3『このスピリットのアタック時』ブロックされたとき、相手は相手の手札1枚を破棄する。
// 【連鎖：条件《黄シンボル》】[黄]：このターンの間、相手のスピリット1体をBP-2000する。
// ════════════════════════════════════════════════════════════════════════

// 022-1 【不死】：アタックステップにコスト3の自分が破壊されたとき、トラッシュからコストを支払って召喚される
// （破壊されたデス・ハーデスの紫シンボル1つで軽減1。6-1=5を支払いLv1の維持コア1個を置く）
scenario({
    name: "scorpion-fushi-summon",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS01-031", cores: 1 }], trash: ["BS19-022"] },
        opp: { spirits: [{ card: "BS10-007", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("デス・ハーデス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("デュアルド") })
        t.closeFlash()
    },
    expect: [
        "自分.デス・ハーデス.場所: フィールド → なし",
        "自分.トラッシュ: ダーク・スカルピオーネ → デス・ハーデス",
        "自分.リザーブ: 10 → 5",
        "自分.ダーク・スカルピオーネ.場所: なし → フィールド",
        "自分.トラッシュのコア: 0 → 5",
        "自分.ダーク・スカルピオーネ.疲労: なし → false",
        "自分.ダーク・スカルピオーネ.コア: なし → 1",
        "自分.ダーク・スカルピオーネ.Lv: なし → 1",
        "自分.ダーク・スカルピオーネ.BP: なし → 3000",
        "相手.デュアルド.疲労: false → true",
    ],
})

// 022-2 アタック時：ブロックされたとき相手は手札1枚を破棄する（黄シンボルが無いので連鎖は不発）
scenario({
    name: "scorpion-blocked-discard",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS19-022", cores: 3 }] },
        opp: {
            spirits: [{ card: "BS16-043", cores: 2 }],
            hand: ["BS01-002", "BS01-002"],
        },
    },
    steps(t) {
        t.act("me", {
            type: "attack",
            instanceId: t.id("ダーク・スカルピオーネ"),
        })
        t.closeFlash()
        t.act("opp", {
            type: "block",
            instanceId: t.id("スペードビースト・レオ"),
        })
        t.closeFlash()
    },
    expect: [
        "自分.ダーク・スカルピオーネ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・スカルピオーネ",
        "自分.リザーブ: 10 → 13",
        "相手.手札: ロクケラトプス、ロクケラトプス → ロクケラトプス",
        "相手.スペードビースト・レオ.疲労: false → true",
        "相手.トラッシュ: なし → ロクケラトプス",
    ],
})

// 022-3 アタック時の起きない場面：ブロックされなければ手札を破棄させない
scenario({
    name: "scorpion-unblocked-no-discard",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "BS19-022", cores: 3 }] },
        opp: { hand: ["BS01-002", "BS01-002"] },
    },
    steps(t) {
        t.act("me", {
            type: "attack",
            instanceId: t.id("ダーク・スカルピオーネ"),
        })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ダーク・スカルピオーネ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 022-4 連鎖：自分の黄シンボルがあるとき、相手のスピリット1体をBP-2000（ブロッカーがBPを下回って破壊される）
scenario({
    name: "scorpion-rensa-bpminus",
    start: {
        turn: "me",
        phase: "attack",
        me: {
            spirits: [
                { card: "BS19-022", cores: 3 },
                { card: "BS07-037", cores: 1 },
            ],
        },
        opp: {
            spirits: [{ card: "BS16-043", cores: 2 }],
            hand: ["BS01-002", "BS01-002"],
        },
    },
    steps(t) {
        t.act("me", {
            type: "attack",
            instanceId: t.id("ダーク・スカルピオーネ"),
        })
        t.closeFlash()
        t.act("opp", {
            type: "block",
            instanceId: t.id("スペードビースト・レオ"),
        })
        t.closeFlash()
    },
    expect: [
        "自分.ダーク・スカルピオーネ.疲労: false → true",
        "相手.スペードビースト・レオ.場所: フィールド → なし",
        "相手.トラッシュ: なし → スペードビースト・レオ、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.手札: ロクケラトプス、ロクケラトプス → ロクケラトプス",
    ],
})

// ══════════════════════════════════════════════════════════════════════════
// BS19-069 ヒヒ・ボーン（ブレイヴ・合体条件：コスト3以下）
// Lv1『このブレイヴの召喚時』1枚ドロー。
// 【合体中】【呪撃】『このスピリットのアタック時』バトル解決時にブロックしていた相手のスピリット1体を、バトル終了時に破壊する。
// ══════════════════════════════════════════════════════════════════════════

// 069-1 ブレイヴの召喚時：1枚ドロー（スピリット状態で召喚）
scenario({
    name: "hihione-brave-summon-draw",
    start: {
        turn: "me",
        phase: "main",
        me: { hand: ["BS19-069"] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ヒヒ・ボーン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 6",
        "自分.ヒヒ・ボーン.場所: なし → フィールド",
        "自分.トラッシュのコア: 0 → 3",
        "自分.ヒヒ・ボーン.疲労: なし → false",
        "自分.ヒヒ・ボーン.コア: なし → 1",
        "自分.ヒヒ・ボーン.Lv: なし → 1",
        "自分.ヒヒ・ボーン.BP: なし → 2000",
    ],
})

// 069-2 【呪撃】：BPで負けてもバトル終了時にブロックしていた相手を破壊する
// （ダイレクトブレイヴでコスト3のデス・ハーデスに合体。召喚時ドローも発揮する。
//   合体スピリットが破壊されてもブレイヴはスピリット状態で場に残り、ホストのコア1個がその維持コアになる）
scenario({
    name: "hihione-jugeki-destroys-blocker",
    start: {
        turn: "me",
        phase: "main",
        me: { spirits: [{ card: "BS01-031", cores: 1 }], hand: ["BS19-069"] },
        opp: { spirits: [{ card: "BS17-007", cores: 3 }] },
    },
    steps(t) {
        t.act("me", {
            type: "summon",
            handIndex: 0,
            braveTargetInstanceId: t.id("デス・ハーデス"),
        })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("デス・ハーデス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ヴァジュランガ") })
        t.closeFlash()
    },
    expect: [
        "自分.手札: ヒヒ・ボーン → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.デス・ハーデス.場所: フィールド → なし",
        "自分.トラッシュ: なし → デス・ハーデス",
        "自分.ヒヒ・ボーン.場所: なし → フィールド",
        "自分.ヒヒ・ボーン.疲労: なし → true",
        "自分.ヒヒ・ボーン.コア: なし → 1",
        "自分.ヒヒ・ボーン.Lv: なし → 1",
        "自分.ヒヒ・ボーン.BP: なし → 2000",
        "相手.ヴァジュランガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヴァジュランガ",
        "相手.リザーブ: 10 → 13",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part732）")
