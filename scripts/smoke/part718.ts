// smoke パート718（プロモ バッチE：PX19 双斧帝ゴルディアス／P055 プリふじさん／P064 グリムの天使アイヴィー。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const PX19 = "PX19"
const P055 = "P055"
const P064 = "P064"
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・BP3000）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・BP4000）
const TAIGA = "BS03-099" // 虎拳士タイガ（青・コスト7・Lv1 BP5000／Lv3(コア7) BP10000）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・BP5000・軽減[白]×3）
const PONISASU = "BS03-063" // ポニサス（黄・コスト5・BP4000）
const WHITEGUN = "BS01-074" // バーサーカー・ガン（白・コスト1・白シンボル）
const WERNDO = "BS07-028" // 機人ヴェルンド（白・コスト1・【装甲：青】）
const MARIS = "BS10-014" // 闇騎士マリス（紫・【不死：コスト4】。トラッシュにあるとき、自分のコスト4のスピリットが破壊されたら召喚できる）
const CALLOST = "BS01-118" // コールオブロスト（赤・マジック・コスト4。メイン：自分のトラッシュのスピリットカード1枚を手札に戻す）
const FALCONIA = "BS07-052" // 隼の剣士ファルコニア（青・コスト5・BP5000・【強襲：1】）
const TOPAZ = "BS02-085" // トパーズの流星（黄・ネクサス・コスト3。この場面では何も起きない）
const KETTO = "BS02-077" // 決闘台地（赤・ネクサス・コスト4。この場面では何も起きない）
const BURST = "SD06-016" // 絶甲氷盾（白・マジック・バースト）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join() === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(PX19, "双斧帝ゴルディアス", "spirit", "blue", 7)
    chk(P055, "プリふじさん", "spirit", "blue", 3)
    chk(P064, "グリムの天使アイヴィー", "spirit", "yellow", 3)
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(METAL, "メタルバーン", "spirit", "red", 3)
    chk(ARNOLD, "ディープ・アーノルド", "spirit", "blue", 4)
    chk(TAIGA, "虎拳士タイガ", "spirit", "blue", 7)
    chk(WINGAL, "ウィンガル", "spirit", "white", 6)
    chk(PONISASU, "ポニサス", "spirit", "yellow", 5)
    chk(WHITEGUN, "バーサーカー・ガン", "spirit", "white", 1)
    chk(WERNDO, "機人ヴェルンド", "spirit", "white", 1)
    chk(MARIS, "闇騎士マリス", "spirit", "purple", 3)
    chk(CALLOST, "コールオブロスト", "magic", "red", 4)
    chk(FALCONIA, "隼の剣士ファルコニア", "spirit", "blue", 5)
    chk(TOPAZ, "トパーズの流星", "nexus", "yellow", 3)
    chk(KETTO, "決闘台地", "nexus", "red", 4)
    chk(BURST, "絶甲氷盾", "magic", "white", 4)
    assert(c(TAIGA).levels[2]!.cores === 7 && c(TAIGA).levels[2]!.bp === 10000, "TAIGAはLv3(コア7)でBP10000")
    assert(c(PX19).levels[1]!.cores === 4 && c(PX19).levels[2]!.cores === 7, "PX19はLv2がコア4・Lv3がコア7")
    assert(c(P055).levels[1]!.cores === 3, "P055はLv2がコア3")
    assert(c(WERNDO).effect.includes("【装甲：青】"), "WERNDOは【装甲：青】")
    assert(c(MARIS).effect.includes("【不死：コスト4】") && c(ARNOLD).cost === 4, "MARISは【不死：コスト4】（コスト4のARNOLDが破壊されると召喚できる）")
    assert(c(FALCONIA).effect.includes("【強襲：1】"), "FALCONIAは【強襲：1】")
    assert(c(WINGAL).reduction.join() === "white,white,white", "WINGALの軽減は[白]×3")
    for (const id of [ROKU, METAL, ARNOLD, TAIGA, WINGAL, PONISASU, WHITEGUN]) assert(c(id).effects.length === 0, `${id}は効果なし`)
}

function resolveAll(t: ScenarioCtx, prefer: string[] = []): void {
    for (let i = 0; i < 20 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const hit = prefer.map((l) => t.id(l)).find((id) => pc.candidates.includes(id))
            t.act(side, { type: "resolveChoice", instanceId: hit ?? pc.candidates[0]! })
        } else if (pc.kind === "option") t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        else {
            const zone = pc.cardZone === "trash" ? t.state.players[pc.cardOwner!].trashCards : t.state.players[pc.cardOwner!].hand
            const idx = pc.cardIndices!.find((i) => prefer.includes(getCard(zone[i]!).name))
            t.act(side, { type: "resolveChoice", cardIndex: idx ?? pc.cardIndices![0]! })
        }
    }
}

// ================= PX19 =================
// コールオブロスト（メイン：トラッシュのスピリット1枚を手札に戻す）を使う場面。マジック4コスト・シンボルなし
function castCallost(t: ScenarioCtx): void {
    t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    resolveAll(t, ["ロクケラトプス"])
}
const CALLOST_PAID = ["自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4"]

console.log("=== 1. PX19 トラッシュの凍結：相手の場に PX19 がいると、自分のトラッシュのスピリットを手札に戻せない（マジックのコストは払う） ===")
scenario({
    name: "px19-freeze-opp",
    start: { me: { hand: [CALLOST], trash: [ROKU] }, opp: { spirits: [{ card: PX19 }] } },
    steps: castCallost,
    expect: [...CALLOST_PAID, "自分.手札: コールオブロスト → なし", "自分.トラッシュ: ロクケラトプス → コールオブロスト、ロクケラトプス"],
})

console.log("=== 2. PX19 トラッシュの凍結は「お互い」：自分の場にいても同じ ===")
scenario({
    name: "px19-freeze-own",
    start: { me: { hand: [CALLOST], trash: [ROKU], spirits: [{ card: PX19 }] } },
    steps: castCallost,
    expect: [...CALLOST_PAID, "自分.手札: コールオブロスト → なし", "自分.トラッシュ: ロクケラトプス → コールオブロスト、ロクケラトプス"],
})

console.log("=== 3. PX19 の対照：PX19 がいなければ手札に戻る ===")
scenario({
    name: "px19-no-freeze",
    start: { me: { hand: [CALLOST], trash: [ROKU] }, opp: { spirits: [{ card: ARNOLD }] } },
    steps: castCallost,
    expect: [...CALLOST_PAID, "自分.手札: コールオブロスト → ロクケラトプス", "自分.トラッシュ: ロクケラトプス → コールオブロスト"],
})

console.log("=== 4. PX19 自身がトラッシュにあるときは効かない：手札に戻せる ===")
scenario({
    name: "px19-in-trash",
    start: { interactive: true, me: { hand: [CALLOST], trash: [ROKU, PX19] } },
    steps: castCallost,
    expect: [...CALLOST_PAID, "自分.手札: コールオブロスト → ロクケラトプス", "自分.トラッシュ: ロクケラトプス、双斧帝ゴルディアス → コールオブロスト、双斧帝ゴルディアス"],
})

// 相手のアタックを、コスト4のディープ・アーノルドでブロックして破壊される。トラッシュのマリスは【不死：コスト4】
function oppAttackBlocked(t: ScenarioCtx): void {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("相手.虎拳士タイガ") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("自分.ディープ・アーノルド") })
    t.closeFlash()
    resolveAll(t)
}
const BLOCKED_LINES = [
    "相手.虎拳士タイガ.疲労: false → true",
    "自分.ディープ・アーノルド.場所: フィールド → なし",
    "自分.リザーブ: 10 → 11",
    "自分.トラッシュ: 闇騎士マリス → ディープ・アーノルド、闇騎士マリス",
]

console.log("=== 5. PX19 トラッシュのカード自身の効果も止まる：【不死】のマリスは召喚できない ===")
scenario({
    name: "px19-undying-frozen",
    start: {
        turn: "opp",
        me: { spirits: [{ card: ARNOLD }], trash: [MARIS] },
        opp: { spirits: [{ card: TAIGA }, { card: PX19, rested: true }] },
    },
    steps: oppAttackBlocked,
    expect: BLOCKED_LINES,
})

console.log("=== 6. PX19 の対照：PX19 がいなければ、アーノルドが破壊されたときマリスが【不死】で召喚される ===")
scenario({
    name: "px19-undying-control",
    start: { turn: "opp", me: { spirits: [{ card: ARNOLD }], trash: [MARIS] }, opp: { spirits: [{ card: TAIGA }] } },
    steps: (t) => {
        oppAttackBlocked(t)
        assert(t.state.players[t.me].field.spirits.some((x) => getCard(x.cardId).name === "闇騎士マリス"), "マリスが不死で召喚されている")
    },
    expect: [
        "相手.虎拳士タイガ.疲労: false → true",
        "自分.ディープ・アーノルド.場所: フィールド → なし",
        "自分.トラッシュ: 闇騎士マリス → ディープ・アーノルド",
        "自分.闇騎士マリス.場所: なし → フィールド",
        "自分.闇騎士マリス.疲労: なし → false",
        "自分.闇騎士マリス.コア: なし → 1",
        "自分.闇騎士マリス.Lv: なし → 1",
        "自分.闇騎士マリス.BP: なし → 3000",
        "自分.リザーブ: 10 → 7", // アーノルドのコア1個が戻り、不死の召喚で4（コスト3＋コア1個）を払う想定
        "自分.トラッシュのコア: 0 → 3",
    ],
})

// 攻撃側 PX19 の場面
function px19Attack(t: ScenarioCtx): void {
    t.act("me", { type: "nextPhase" })
    resolveAll(t)
    t.act("me", { type: "attack", instanceId: t.id("双斧帝ゴルディアス") })
    resolveAll(t)
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
    resolveAll(t)
}

console.log("=== 7. PX19 Lv2 アタック時：コスト4以下の相手のスピリット1体を破壊し、破壊したら回復する ===")
scenario({
    name: "px19-destroy-recover",
    start: { me: { spirits: [{ card: PX19, cores: 4 }] }, opp: { spirits: [{ card: METAL }, { card: TAIGA, rested: true }] } },
    steps: px19Attack,
    expect: [
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 12", // 破壊されたコア1個＋ライフのコア1個
        "相手.ライフ: 5 → 4",
        // 双斧帝ゴルディアスは疲労 → 回復で差分なし
    ],
})

console.log("=== 8. PX19 Lv2：コスト4以下がいなければ破壊も回復も起きない（疲労したまま） ===")
scenario({
    name: "px19-none",
    start: { me: { spirits: [{ card: PX19, cores: 4 }] }, opp: { spirits: [{ card: TAIGA, rested: true }] } },
    steps: px19Attack,
    expect: ["自分.双斧帝ゴルディアス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 9. PX19：【装甲：青】の相手は効果を受けず、破壊できなかったので回復しない ===")
scenario({
    name: "px19-armor",
    start: { me: { spirits: [{ card: PX19, cores: 4 }] }, opp: { spirits: [{ card: WERNDO, rested: true }, { card: TAIGA, rested: true }] } },
    steps: px19Attack,
    expect: ["自分.双斧帝ゴルディアス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 10. PX19 アタック時の破壊はLv2から：Lv1（コア3）ではメタルバーンを破壊しない ===")
scenario({
    name: "px19-lv1",
    start: { me: { spirits: [{ card: PX19, cores: 3 }] }, opp: { spirits: [{ card: METAL, rested: true }] } },
    steps: px19Attack,
    expect: ["自分.双斧帝ゴルディアス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 11. PX19 Lv3：アタックステップ開始時に相手のスピリットを指定すると、このターンはコスト3としても扱う。コスト7のタイガがアタック時の「コスト4以下」の破壊に当たる ===")
scenario({
    name: "px19-lv3-cost3",
    start: { me: { spirits: [{ card: PX19, cores: 7 }] }, opp: { spirits: [{ card: TAIGA }] } },
    steps: px19Attack,
    expect: [
        "相手.虎拳士タイガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → 虎拳士タイガ",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== 12. PX19 Lv2 には指定が無い：コスト7のタイガは「コスト4以下」の対象にならず破壊されない ===")
scenario({
    name: "px19-lv2-no-designate",
    start: { me: { spirits: [{ card: PX19, cores: 4 }] }, opp: { spirits: [{ card: TAIGA, rested: true }] } },
    steps: px19Attack,
    expect: ["自分.双斧帝ゴルディアス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ================= P055 =================
function falconiaAttack(t: ScenarioCtx, prefer: string[] = []): void {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("自分.隼の剣士ファルコニア") })
    resolveAll(t, prefer)
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
    resolveAll(t, prefer)
}

console.log("=== 13. P055：自分のスピリットの【強襲】を、ネクサスではなく P055 を疲労させて使える（ネクサスが無くても回復する） ===")
scenario({
    name: "p055-assault",
    start: { me: { spirits: [{ card: FALCONIA }, { card: P055 }] } },
    steps: (t) => falconiaAttack(t),
    expect: ["自分.プリふじさん.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 14. P055：ネクサスと P055 の両方が疲労できるなら、P055 を選ぶとネクサスは疲労しない ===")
scenario({
    name: "p055-choose-self",
    start: { me: { spirits: [{ card: FALCONIA }, { card: P055 }], nexuses: [{ card: TOPAZ, cores: 0 }] } },
    steps: (t) => {
        t.state.interactiveTargets = true
        falconiaAttack(t, ["自分.プリふじさん"])
    },
    expect: ["自分.プリふじさん.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 15. P055：P055 が疲労済みでネクサスも無ければ回復できない ===")
scenario({
    name: "p055-rested",
    start: { me: { spirits: [{ card: FALCONIA }, { card: P055, rested: true }] } },
    steps: (t) => falconiaAttack(t),
    expect: ["自分.隼の剣士ファルコニア.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 16. P055 は「自分のスピリット」だけ：相手の【強襲】持ちは自分の P055 を疲労させて回復できない ===")
scenario({
    name: "p055-opp-assault",
    start: { turn: "opp", me: { spirits: [{ card: P055 }] }, opp: { spirits: [{ card: FALCONIA }] } },
    steps: (t) => {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.隼の剣士ファルコニア") })
        resolveAll(t)
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        resolveAll(t)
    },
    expect: ["相手.隼の剣士ファルコニア.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("=== 17. P055 Lv2：自分のアタックステップ、自分のネクサス1つにつき【強襲】を持つ自分のスピリットをBP+1000（自分のネクサス2つ＝+2000。相手のネクサスは数えない。【強襲】を持たないスピリットは対象外） ===")
scenario({
    name: "p055-lv2-bp",
    start: {
        me: { spirits: [{ card: P055, cores: 3 }, { card: FALCONIA }, { card: ROKU }], nexuses: [{ card: TOPAZ, cores: 0 }, { card: KETTO, cores: 0 }] },
        opp: { nexuses: [{ card: KETTO, cores: 0 }] },
    },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: ["自分.隼の剣士ファルコニア.BP: 5000 → 7000"],
})

console.log("=== 18. P055 の BP+ はLv2から：Lv1（コア1）では上がらない ===")
scenario({
    name: "p055-lv1-bp",
    start: { me: { spirits: [{ card: P055 }, { card: FALCONIA }], nexuses: [{ card: TOPAZ, cores: 0 }, { card: KETTO, cores: 0 }] } },
    steps: (t) => t.act("me", { type: "nextPhase" }),
    expect: [],
})

console.log("=== 19. P055 の BP+ は「自分のアタックステップ」：相手のアタックステップでは上がらない ===")
scenario({
    name: "p055-opp-step-bp",
    start: { turn: "opp", me: { spirits: [{ card: P055, cores: 3 }, { card: FALCONIA }], nexuses: [{ card: TOPAZ, cores: 0 }] } },
    steps: (t) => t.act("opp", { type: "nextPhase" }),
    expect: [],
})

// ================= P064 =================
// 相手のメインステップに、相手が手札のスピリットを召喚する。自分（P064側）はバーストをセットしている／いない
function oppSummon(t: ScenarioCtx): void {
    t.act("opp", { type: "summon", handIndex: 0 })
    resolveAll(t)
}

console.log("=== 20. P064：自分のバーストをセットしている間、相手のコスト6以上のスピリットは召喚されたとき疲労する ===")
scenario({
    name: "p064-rest",
    start: { turn: "opp", me: { spirits: [{ card: P064 }], burst: BURST }, opp: { hand: [WINGAL] } },
    steps: oppSummon,
    expect: [
        "相手.手札: ウィンガル → なし",
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 6",
        "相手.ウィンガル.場所: なし → フィールド",
        "相手.ウィンガル.疲労: なし → true",
        "相手.ウィンガル.コア: なし → 1",
        "相手.ウィンガル.Lv: なし → 1",
        "相手.ウィンガル.BP: なし → 5000",
    ],
})

console.log("=== 21. P064：コストが軽減されて支払いが5になっても、カードのコストが6以上なら疲労する ===")
scenario({
    name: "p064-rest-reduced",
    start: { turn: "opp", me: { spirits: [{ card: P064 }], burst: BURST }, opp: { hand: [WINGAL], spirits: [{ card: WHITEGUN }] } },
    steps: oppSummon,
    expect: [
        "相手.手札: ウィンガル → なし",
        "相手.リザーブ: 10 → 4",
        "相手.トラッシュのコア: 0 → 5",
        "相手.ウィンガル.場所: なし → フィールド",
        "相手.ウィンガル.疲労: なし → true",
        "相手.ウィンガル.コア: なし → 1",
        "相手.ウィンガル.Lv: なし → 1",
        "相手.ウィンガル.BP: なし → 5000",
    ],
})

console.log("=== 22. P064：コスト7でも疲労する（6以上） ===")
scenario({
    name: "p064-rest-cost7",
    start: { turn: "opp", me: { spirits: [{ card: P064 }], burst: BURST }, opp: { hand: [TAIGA] } },
    steps: oppSummon,
    expect: [
        "相手.手札: 虎拳士タイガ → なし",
        "相手.リザーブ: 10 → 2",
        "相手.トラッシュのコア: 0 → 7",
        "相手.虎拳士タイガ.場所: なし → フィールド",
        "相手.虎拳士タイガ.疲労: なし → true",
        "相手.虎拳士タイガ.コア: なし → 1",
        "相手.虎拳士タイガ.Lv: なし → 1",
        "相手.虎拳士タイガ.BP: なし → 5000",
    ],
})

const WINGAL_SUMMONED = [
    "相手.手札: ウィンガル → なし",
    "相手.リザーブ: 10 → 3",
    "相手.トラッシュのコア: 0 → 6",
    "相手.ウィンガル.場所: なし → フィールド",
    "相手.ウィンガル.疲労: なし → false",
    "相手.ウィンガル.コア: なし → 1",
    "相手.ウィンガル.Lv: なし → 1",
    "相手.ウィンガル.BP: なし → 5000",
]
console.log("=== 23. P064 の対照：自分がバーストをセットしていなければ疲労しない ===")
scenario({
    name: "p064-no-burst",
    start: { turn: "opp", me: { spirits: [{ card: P064 }] }, opp: { hand: [WINGAL] } },
    steps: oppSummon,
    expect: WINGAL_SUMMONED,
})

console.log("=== 24. P064：コスト5以下は疲労しない ===")
scenario({
    name: "p064-cost5",
    start: { turn: "opp", me: { spirits: [{ card: P064 }], burst: BURST }, opp: { hand: [PONISASU] } },
    steps: oppSummon,
    expect: [
        "相手.手札: ポニサス → なし",
        "相手.リザーブ: 10 → 4",
        "相手.トラッシュのコア: 0 → 5",
        "相手.ポニサス.場所: なし → フィールド",
        "相手.ポニサス.疲労: なし → false",
        "相手.ポニサス.コア: なし → 1",
        "相手.ポニサス.Lv: なし → 1",
        "相手.ポニサス.BP: なし → 4000",
    ],
})

console.log("=== 25. P064 は「相手のメインステップ」「相手のスピリット」：自分のターンに自分がコスト6を召喚しても疲労しない ===")
scenario({
    name: "p064-own-turn",
    start: { me: { spirits: [{ card: P064 }], hand: [WINGAL], burst: BURST } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        "自分.手札: ウィンガル → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.ウィンガル.場所: なし → フィールド",
        "自分.ウィンガル.疲労: なし → false",
        "自分.ウィンガル.コア: なし → 1",
        "自分.ウィンガル.Lv: なし → 1",
        "自分.ウィンガル.BP: なし → 5000",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part718）")
