// smoke パート762（BS08-003等の『自分のメインステップ』【転召】対象効果・BS08-031/057/SD02-013のコスト+3・BS13-062・BS08-066・BS13-003・X011【合体時】の時間帯の中/外）
// 期待値は効果文だけから書いた。見出しの時間帯の外では効果が働かないことを確かめる
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import type { GameAction } from "./helpers"
import type { PendingChoice } from "../../server/src/type"

// ── 対象カード ──
const FATIGUE = [
    { id: "BS08-003", name: "ダークアンキラーザウルス", label: "アンキラー", pay: 6 }, // 軽減紫なし
    { id: "BS08-012", name: "ダークスカルデーモン", label: "スカル", pay: 5 }, // 紫シンボルでザブルガン軽減1
    { id: "BS08-021", name: "ブラックアメンボーグ", label: "アメンボーグ", pay: 6 },
    { id: "BS08-039", name: "ダークチュンポポ", label: "チュンポポ", pay: 6 },
    { id: "BS08-048", name: "ブラックウガルルム", label: "ウガル", pay: 6 },
] as const
const ORIFIYA = "BS08-040" // 天使オリフィア
const GARNES = "BS08-049" // 獣司祭ガーネス
const GUNGNIR = "BS08-031" // 冥機グングニル
const REDSAND = "BS08-057" // 赤き砂の座
const ALTAR = "SD02-013" // 転召の祭壇
const GALAXY = "BS13-062" // 光り輝く大銀河
const CITY = "BS08-066" // 海底に眠りし古代都市
const CHAMELE = "BS13-003" // カメレオプス
const X011 = "X011" // 光導龍騎ゾディアックアポロクリムゾン

// ── 道具カード ──
const ZABUR = "BS07-017" // 冥獣士ザブルガン（【転召：コスト3以上/トラッシュ】・召喚時は相手コア→ボイド）
const TRON = "BS07-044" // 天使長トロン（黄・【転召：コスト3以上/トラッシュ】）
const LUMI = "BS04-055" // 光帝リュミエール（黄・【転召：コスト5以上/トラッシュ】・他効果なし）
const OZ = "BS16-X05" // アルカナマスター・オズ（Lv2以上・相手に破壊されたとき黄を召喚）
const VANATK = "BS17-007" // ヴァジュランガ（赤・効果なし・3コアでBP10000）
const RHINO = "SD01-007" // スティラホーン（赤・コスト5・効果なし）
const AAMON = "BS08-011" // 冥狼士アーモン（紫・コスト2・冥主・効果なし）
const CATOR = "BS05-041" // アルカナファイター・カトル（黄・コスト4・四道・効果なし）
const CANCER = "BS10-X03" // 巨蟹武神キャンサード（緑・コスト6・光導）
const VOLGAND = "BS17-008" // 紅玉の巨龍ボルガンド（赤・コスト7・軽減赤3・フラッシュ覚醒のみ）
const TUSKER = "BS11-050" // 激爪竜パワード・タスカー（赤・ブレイヴ・合体条件コスト5以上）

console.log("=== 前提: カードの機械確認 ===")
{
    for (const f of FATIGUE) assert(getCard(f.id).name === f.name, `${f.id}は${f.name}`)
    assert(getCard(ORIFIYA).name === "天使オリフィア", "BS08-040は天使オリフィア")
    assert(getCard(GARNES).name === "獣司祭ガーネス", "BS08-049は獣司祭ガーネス")
    assert(getCard(GUNGNIR).name === "冥機グングニル", "BS08-031は冥機グングニル")
    assert(getCard(REDSAND).name === "赤き砂の座" && getCard(REDSAND).type === "nexus", "BS08-057はネクサス赤き砂の座")
    assert(getCard(ALTAR).name === "転召の祭壇" && getCard(ALTAR).type === "nexus", "SD02-013はネクサス転召の祭壇")
    assert(getCard(GALAXY).name === "光り輝く大銀河" && getCard(GALAXY).type === "nexus", "BS13-062はネクサス光り輝く大銀河")
    assert(getCard(CITY).name === "海底に眠りし古代都市" && getCard(CITY).type === "nexus", "BS08-066はネクサス海底に眠りし古代都市")
    assert(getCard(CHAMELE).name === "カメレオプス", "BS13-003はカメレオプス")
    assert(getCard(X011).name === "光導龍騎ゾディアックアポロクリムゾン", "X011は光導龍騎ゾディアックアポロクリムゾン")
    assert(getCard(ZABUR).name === "冥獣士ザブルガン", "BS07-017は冥獣士ザブルガン")
    assert(getCard(TRON).name === "天使長トロン", "BS07-044は天使長トロン")
    assert(getCard(LUMI).name === "光帝リュミエール", "BS04-055は光帝リュミエール")
    assert(getCard(OZ).name === "アルカナマスター・オズ", "BS16-X05はアルカナマスター・オズ")
    assert(getCard(VANATK).name === "ヴァジュランガ" && getCard(VANATK).effects.length === 0, "BS17-007は効果なしのヴァジュランガ")
    assert(getCard(RHINO).name === "スティラホーン" && getCard(RHINO).cost === 5 && getCard(RHINO).effects.length === 0, "SD01-007はコスト5のバニラ")
    assert(getCard(AAMON).name === "冥狼士アーモン" && getCard(AAMON).cost === 2 && getCard(AAMON).effects.length === 0, "BS08-011はコスト2のバニラ冥主")
    assert(getCard(CATOR).name === "アルカナファイター・カトル" && getCard(CATOR).cost === 4 && getCard(CATOR).effects.length === 0, "BS05-041はコスト4のバニラ四道")
    assert(getCard(CANCER).name === "巨蟹武神キャンサード" && getCard(CANCER).family.includes("光導"), "BS10-X03は光導のキャンサード")
    assert(getCard(VOLGAND).name === "紅玉の巨龍ボルガンド" && getCard(VOLGAND).cost === 7, "BS17-008はコスト7のボルガンド")
    assert(getCard(TUSKER).name === "激爪竜パワード・タスカー" && getCard(TUSKER).type === "brave", "BS11-050はブレイヴ")
}

// pendingChoice に順に答える（同じ選択待ちが残ったら落とす。回数上限10）
function drain(t: ScenarioCtx, policy: (pc: PendingChoice) => GameAction, label: string): void {
    for (let i = 0; i < 10; i++) {
        const pc = t.state.pendingChoice
        if (!pc) return
        const res = policy(pc)
        t.act(pc.pid === t.me ? "me" : "opp", res)
        if (t.state.pendingChoice === pc) {
            assert(false, `${label}: 答えても選択待ちが進まない（${pc.prompt}）`)
            return
        }
    }
    assert(false, `${label}: 選択待ちが10回で終わらない`)
}

// 疲労確認の「断る」側のラベル（scripts/smoke の外の定数と同じ文言）
const DUMP = "疲労せずコアを置く"

// オズ破壊 → 黄の【転召】持ちを召喚、の流れの選択に答える（転召対象は targetLabel で明示選択）
function ozDrain(t: ScenarioCtx, targetLabel: string, label: string): void {
    drain(
        t,
        (pc) => {
            if (pc.kind === "card") {
                const idx = pc.cardIndices?.[0]
                return idx === undefined ? { type: "resolveChoice" } : { type: "resolveChoice", cardIndex: idx }
            }
            if (pc.kind === "target") return { type: "resolveChoice", instanceId: t.id(targetLabel) }
            if (pc.prompt.includes("疲労してコアを維持")) {
                assert(false, `${label}: 時間帯の外では疲労での転召代替の確認が出ないはず（${pc.prompt}）`)
                return { type: "resolveChoice", option: DUMP }
            }
            return { type: "resolveChoice" }
        },
        label,
    )
}

// ── 1. 疲労代替『自分のメインステップ』：時間帯の中（ザブルガンの転召対象にして疲労で代える） ──
for (const f of FATIGUE) {
    console.log(`=== 1. ${f.name}：自分のメインステップでは転召を疲労で代えられる ===`)
    scenario({
        name: `fatigue-in-${f.id}`,
        start: { me: { spirits: [{ card: f.id, label: f.label }], hand: [ZABUR] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
        },
        expect: [
            `自分.${f.label}.疲労: false → true`,
            `自分.トラッシュのコア: 0 → ${f.pay}`,
            `自分.リザーブ: 10 → ${10 - f.pay - 1}`,
            "自分.手札: 冥獣士ザブルガン → なし",
            "自分.冥獣士ザブルガン.場所: なし → フィールド",
            "自分.冥獣士ザブルガン.疲労: なし → false",
            "自分.冥獣士ザブルガン.コア: なし → 1",
            "自分.冥獣士ザブルガン.Lv: なし → 1",
            "自分.冥獣士ザブルガン.BP: なし → 4000",
        ],
    })
}

// ── 2. 疲労代替：時間帯の外（相手のアタックステップでオズが破壊されトロンを召喚 → 転召は通常どおり） ──
for (const f of FATIGUE) {
    console.log(`=== 2. ${f.name}：相手のアタックステップでは転召を疲労で代えられない ===`)
    scenario({
        name: `fatigue-out-${f.id}`,
        start: {
            turn: "opp",
            phase: "attack",
            interactive: true,
            me: {
                spirits: [
                    { card: OZ, label: "オズ", cores: 2 },
                    { card: f.id, label: f.label },
                ],
                hand: [TRON],
            },
            opp: { spirits: [{ card: VANATK, label: "攻撃竜", cores: 3 }] },
        },
        steps(t) {
            t.act("opp", { type: "attack", instanceId: t.id("攻撃竜") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("オズ") })
            t.closeFlash()
            ozDrain(t, f.label, `fatigue-out-${f.id}`)
        },
        expect: [
            "自分.オズ.場所: フィールド → なし",
            `自分.${f.label}.場所: フィールド → なし`,
            "自分.手札: 天使長トロン → なし",
            `自分.トラッシュ: なし → アルカナマスター・オズ、${f.name}`,
            "自分.トラッシュのコア: 0 → 1",
            "自分.リザーブ: 10 → 11",
            "自分.天使長トロン.場所: なし → フィールド",
            "自分.天使長トロン.疲労: なし → false",
            "自分.天使長トロン.コア: なし → 1",
            "自分.天使長トロン.Lv: なし → 1",
            "自分.天使長トロン.BP: なし → 4000",
            "相手.攻撃竜.疲労: false → true",
        ],
    })
}

// ── 3. 疲労代替：断れば通常の転召になる（「〜できる」は任意） ──
console.log("=== 3. ダークスカルデーモン：疲労での代替を断れば通常の転召になる ===")
scenario({
    name: "fatigue-declined",
    start: { interactive: true, me: { spirits: [{ card: FATIGUE[1].id, label: "スカル" }], hand: [ZABUR] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        drain(
            t,
            (pc) => {
                if (pc.kind === "target") return { type: "resolveChoice", instanceId: t.id("スカル") }
                if (pc.prompt.includes("疲労してコアを維持")) return { type: "resolveChoice", option: DUMP } // 疲労での代替は断る
                return { type: "resolveChoice" }
            },
            "fatigue-declined",
        )
    },
    expect: [
        "自分.スカル.場所: フィールド → なし",
        "自分.手札: 冥獣士ザブルガン → なし",
        "自分.トラッシュ: なし → ダークスカルデーモン",
        "自分.トラッシュのコア: 0 → 6",
        "自分.リザーブ: 10 → 4",
        "自分.冥獣士ザブルガン.場所: なし → フィールド",
        "自分.冥獣士ザブルガン.疲労: なし → false",
        "自分.冥獣士ザブルガン.コア: なし → 1",
        "自分.冥獣士ザブルガン.Lv: なし → 1",
        "自分.冥獣士ザブルガン.BP: なし → 4000",
    ],
})

// ── 4. 天使オリフィア：時間帯の中（転召対象になったらライフにコア1個） ──
console.log("=== 4. 天使オリフィア：自分のメインステップでは転召対象のときライフが増える ===")
scenario({
    name: "orifiya-in",
    start: { me: { spirits: [{ card: ORIFIYA, label: "オリフィア" }], hand: [ZABUR] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.オリフィア.場所: フィールド → なし",
        "自分.ライフ: 5 → 6",
        "自分.手札: 冥獣士ザブルガン → なし",
        "自分.トラッシュ: なし → 天使オリフィア",
        "自分.トラッシュのコア: 0 → 7",
        "自分.リザーブ: 10 → 3",
        "自分.冥獣士ザブルガン.場所: なし → フィールド",
        "自分.冥獣士ザブルガン.疲労: なし → false",
        "自分.冥獣士ザブルガン.コア: なし → 1",
        "自分.冥獣士ザブルガン.Lv: なし → 1",
        "自分.冥獣士ザブルガン.BP: なし → 4000",
    ],
})

console.log("=== 5. 天使オリフィア：相手のアタックステップではライフが増えない ===")
scenario({
    name: "orifiya-out",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: OZ, label: "オズ", cores: 2 }, { card: ORIFIYA, label: "オリフィア" }], hand: [TRON] },
        opp: { spirits: [{ card: VANATK, label: "攻撃竜", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃竜") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("オズ") })
        t.closeFlash()
        ozDrain(t, "オリフィア", "orifiya-out")
    },
    expect: [
        "自分.オズ.場所: フィールド → なし",
        "自分.オリフィア.場所: フィールド → なし",
        "自分.手札: 天使長トロン → なし",
        "自分.トラッシュ: なし → アルカナマスター・オズ、天使オリフィア",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 11",
        "自分.天使長トロン.場所: なし → フィールド",
        "自分.天使長トロン.疲労: なし → false",
        "自分.天使長トロン.コア: なし → 1",
        "自分.天使長トロン.Lv: なし → 1",
        "自分.天使長トロン.BP: なし → 4000",
        "相手.攻撃竜.疲労: false → true",
    ],
})

// ── 6. 獣司祭ガーネス：時間帯の中（転召対象になったら自分のネクサスにコア3個） ──
console.log("=== 6. 獣司祭ガーネス：自分のメインステップでは転召対象のときネクサスにコア3個 ===")
scenario({
    name: "garnes-in",
    start: {
        me: {
            spirits: [{ card: GARNES, label: "ガーネス" }],
            nexuses: [{ card: GALAXY, label: "銀河", cores: 0 }],
            hand: [ZABUR],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.ガーネス.場所: フィールド → なし",
        "自分.銀河.コア: 0 → 3",
        "自分.銀河.Lv: 1 → 2",
        "自分.手札: 冥獣士ザブルガン → なし",
        "自分.トラッシュ: なし → 獣司祭ガーネス",
        "自分.トラッシュのコア: 0 → 7",
        "自分.リザーブ: 10 → 3",
        "自分.冥獣士ザブルガン.場所: なし → フィールド",
        "自分.冥獣士ザブルガン.疲労: なし → false",
        "自分.冥獣士ザブルガン.コア: なし → 1",
        "自分.冥獣士ザブルガン.Lv: なし → 1",
        "自分.冥獣士ザブルガン.BP: なし → 4000",
    ],
})

console.log("=== 7. 獣司祭ガーネス：相手のアタックステップではネクサスにコアが乗らない ===")
scenario({
    name: "garnes-out",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: {
            spirits: [{ card: OZ, label: "オズ", cores: 2 }, { card: GARNES, label: "ガーネス" }],
            nexuses: [{ card: GALAXY, label: "銀河", cores: 0 }],
            hand: [TRON],
        },
        opp: { spirits: [{ card: VANATK, label: "攻撃竜", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃竜") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("オズ") })
        t.closeFlash()
        ozDrain(t, "ガーネス", "garnes-out")
    },
    expect: [
        "自分.オズ.場所: フィールド → なし",
        "自分.ガーネス.場所: フィールド → なし",
        "自分.手札: 天使長トロン → なし",
        "自分.トラッシュ: なし → アルカナマスター・オズ、獣司祭ガーネス",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 11",
        "自分.天使長トロン.場所: なし → フィールド",
        "自分.天使長トロン.疲労: なし → false",
        "自分.天使長トロン.コア: なし → 1",
        "自分.天使長トロン.Lv: なし → 1",
        "自分.天使長トロン.BP: なし → 4000",
        "相手.攻撃竜.疲労: false → true",
    ],
})

// ── 8. 冥機グングニル（コスト+3）：時間帯の中（コスト3+3=6 が転召コスト5以上の対象になる） ──
console.log("=== 8. 冥機グングニル：自分のメインステップでは【転召】持ち召喚時にコスト+3 ===")
scenario({
    name: "gungnir-in",
    start: { me: { spirits: [{ card: GUNGNIR, label: "グングニル" }], hand: [LUMI] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.グングニル.場所: フィールド → なし",
        "自分.手札: 光帝リュミエール → なし",
        "自分.トラッシュ: なし → 冥機グングニル",
        "自分.トラッシュのコア: 0 → 7",
        "自分.リザーブ: 10 → 3",
        "自分.光帝リュミエール.場所: なし → フィールド",
        "自分.光帝リュミエール.疲労: なし → false",
        "自分.光帝リュミエール.コア: なし → 1",
        "自分.光帝リュミエール.Lv: なし → 1",
        "自分.光帝リュミエール.BP: なし → 4000",
    ],
})

// ── 9. 冥機グングニル：時間帯の外（相手のアタックステップではコスト3のまま → 転召コスト5以上の候補にならない） ──
console.log("=== 9. 冥機グングニル：相手のアタックステップではコスト+3されない ===")
scenario({
    name: "gungnir-out",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: {
            spirits: [
                { card: OZ, label: "オズ", cores: 2 },
                { card: GUNGNIR, label: "グングニル" },
                { card: RHINO, label: "犀" },
            ],
            hand: [LUMI],
        },
        opp: { spirits: [{ card: VANATK, label: "攻撃竜", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃竜") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("オズ") })
        t.closeFlash()
        drain(
            t,
            (pc) => {
                if (pc.kind === "card") return { type: "resolveChoice", cardIndex: pc.cardIndices![0]! }
                if (pc.kind === "target") {
                    assert(
                        !pc.candidates.includes(t.id("グングニル")),
                        "gungnir-out: コスト3のグングニルは転召（コスト5以上）の候補に入らない",
                    )
                    return { type: "resolveChoice", instanceId: t.id("犀") }
                }
                return { type: "resolveChoice" }
            },
            "gungnir-out",
        )
    },
    expect: [
        "自分.オズ.場所: フィールド → なし",
        "自分.犀.場所: フィールド → なし",
        "自分.手札: 光帝リュミエール → なし",
        "自分.トラッシュ: なし → アルカナマスター・オズ、スティラホーン",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 11",
        "自分.光帝リュミエール.場所: なし → フィールド",
        "自分.光帝リュミエール.疲労: なし → false",
        "自分.光帝リュミエール.コア: なし → 1",
        "自分.光帝リュミエール.Lv: なし → 1",
        "自分.光帝リュミエール.BP: なし → 4000",
        "相手.攻撃竜.疲労: false → true",
    ],
})

// ── 10. 赤き砂の座Lv2（冥主コスト+3）：時間帯の中（コスト2の冥主+3=5 が転召コスト5以上の対象になる） ──
console.log("=== 10. 赤き砂の座：自分のメインステップでは冥主すべてコスト+3 ===")
scenario({
    name: "redsand-in",
    start: {
        me: {
            spirits: [{ card: AAMON, label: "アーモン" }],
            nexuses: [{ card: REDSAND, label: "砂座", cores: 1 }],
            hand: [LUMI],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.アーモン.場所: フィールド → なし",
        "自分.手札: 光帝リュミエール → なし",
        "自分.トラッシュ: なし → 冥狼士アーモン",
        "自分.トラッシュのコア: 0 → 7",
        "自分.リザーブ: 10 → 3",
        "自分.光帝リュミエール.場所: なし → フィールド",
        "自分.光帝リュミエール.疲労: なし → false",
        "自分.光帝リュミエール.コア: なし → 1",
        "自分.光帝リュミエール.Lv: なし → 1",
        "自分.光帝リュミエール.BP: なし → 4000",
    ],
})

console.log("=== 11. 赤き砂の座：相手のアタックステップでは冥主にコスト+3されない ===")
scenario({
    name: "redsand-out",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: {
            spirits: [
                { card: OZ, label: "オズ", cores: 2 },
                { card: AAMON, label: "アーモン" },
                { card: RHINO, label: "犀" },
            ],
            nexuses: [{ card: REDSAND, label: "砂座", cores: 1 }],
            hand: [LUMI],
        },
        opp: { spirits: [{ card: VANATK, label: "攻撃竜", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃竜") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("オズ") })
        t.closeFlash()
        drain(
            t,
            (pc) => {
                if (pc.kind === "card") return { type: "resolveChoice", cardIndex: pc.cardIndices![0]! }
                if (pc.kind === "target") {
                    assert(
                        !pc.candidates.includes(t.id("アーモン")),
                        "redsand-out: コスト2のアーモンは転召（コスト5以上）の候補に入らない",
                    )
                    return { type: "resolveChoice", instanceId: t.id("犀") }
                }
                return { type: "resolveChoice" }
            },
            "redsand-out",
        )
    },
    expect: [
        "自分.オズ.場所: フィールド → なし",
        "自分.犀.場所: フィールド → なし",
        "自分.手札: 光帝リュミエール → なし",
        "自分.トラッシュ: なし → アルカナマスター・オズ、スティラホーン",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 11",
        "自分.光帝リュミエール.場所: なし → フィールド",
        "自分.光帝リュミエール.疲労: なし → false",
        "自分.光帝リュミエール.コア: なし → 1",
        "自分.光帝リュミエール.Lv: なし → 1",
        "自分.光帝リュミエール.BP: なし → 4000",
        "相手.攻撃竜.疲労: false → true",
    ],
})

// ── 12. 転召の祭壇Lv2（同系統コスト+3）：時間帯の中（コスト4の四道+3=7 が転召コスト5以上の対象になる） ──
console.log("=== 12. 転召の祭壇：自分のメインステップでは同系統のスピリットすべてコスト+3 ===")
scenario({
    name: "altar-in",
    start: {
        me: {
            spirits: [{ card: CATOR, label: "カトル" }],
            nexuses: [{ card: ALTAR, label: "祭壇", cores: 1 }],
            hand: [LUMI],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.カトル.場所: フィールド → なし",
        "自分.手札: 光帝リュミエール → なし",
        "自分.トラッシュ: なし → アルカナファイター・カトル",
        "自分.トラッシュのコア: 0 → 6",
        "自分.リザーブ: 10 → 4",
        "自分.光帝リュミエール.場所: なし → フィールド",
        "自分.光帝リュミエール.疲労: なし → false",
        "自分.光帝リュミエール.コア: なし → 1",
        "自分.光帝リュミエール.Lv: なし → 1",
        "自分.光帝リュミエール.BP: なし → 4000",
    ],
})

console.log("=== 13. 転召の祭壇：相手のアタックステップでは同系統にコスト+3されない ===")
scenario({
    name: "altar-out",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: {
            spirits: [
                { card: OZ, label: "オズ", cores: 2 },
                { card: CATOR, label: "カトル" },
                { card: RHINO, label: "犀" },
            ],
            nexuses: [{ card: ALTAR, label: "祭壇", cores: 1 }],
            hand: [LUMI],
        },
        opp: { spirits: [{ card: VANATK, label: "攻撃竜", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃竜") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("オズ") })
        t.closeFlash()
        drain(
            t,
            (pc) => {
                if (pc.kind === "card") return { type: "resolveChoice", cardIndex: pc.cardIndices![0]! }
                if (pc.kind === "target") {
                    assert(
                        !pc.candidates.includes(t.id("カトル")),
                        "altar-out: コスト4のカトルは転召（コスト5以上）の候補に入らない",
                    )
                    return { type: "resolveChoice", instanceId: t.id("犀") }
                }
                return { type: "resolveChoice" }
            },
            "altar-out",
        )
    },
    expect: [
        "自分.オズ.場所: フィールド → なし",
        "自分.犀.場所: フィールド → なし",
        "自分.手札: 光帝リュミエール → なし",
        "自分.トラッシュ: なし → アルカナマスター・オズ、スティラホーン",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 11",
        "自分.光帝リュミエール.場所: なし → フィールド",
        "自分.光帝リュミエール.疲労: なし → false",
        "自分.光帝リュミエール.コア: なし → 1",
        "自分.光帝リュミエール.Lv: なし → 1",
        "自分.光帝リュミエール.BP: なし → 4000",
        "相手.攻撃竜.疲労: false → true",
    ],
})

// ── 14. 光り輝く大銀河Lv1（手札の光導コスト5）：時間帯の中 ──
console.log("=== 14. 光り輝く大銀河：自分のメインステップでは手札の光導はコスト5 ===")
scenario({
    name: "galaxy-in",
    start: { me: { nexuses: [{ card: GALAXY, label: "銀河", cores: 0 }], hand: [CANCER] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        "自分.手札: 巨蟹武神キャンサード → なし",
        "自分.巨蟹武神キャンサード.場所: なし → フィールド",
        "自分.巨蟹武神キャンサード.疲労: なし → false",
        "自分.巨蟹武神キャンサード.コア: なし → 1",
        "自分.巨蟹武神キャンサード.Lv: なし → 1",
        "自分.巨蟹武神キャンサード.BP: なし → 6000",
    ],
})

// 時間帯の外：自分のターンでなければ手札の光導はコスト5にならない（相手が自分の光導をコスト5で召喚しない）
console.log("=== 15. 光り輝く大銀河：相手のメインステップでは相手の手札の光導はコスト5にならない ===")
scenario({
    name: "galaxy-out",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: GALAXY, label: "銀河", cores: 0 }] },
        opp: { hand: [CANCER] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.リザーブ: 10 → 3",
        "相手.トラッシュのコア: 0 → 6",
        "相手.手札: 巨蟹武神キャンサード → なし",
        "相手.巨蟹武神キャンサード.場所: なし → フィールド",
        "相手.巨蟹武神キャンサード.疲労: なし → false",
        "相手.巨蟹武神キャンサード.コア: なし → 1",
        "相手.巨蟹武神キャンサード.Lv: なし → 1",
        "相手.巨蟹武神キャンサード.BP: なし → 6000",
    ],
})

// ── 16. 海底に眠りし古代都市Lv1（異合の召喚でリザーブにコア1個）：時間帯の中 ──
console.log("=== 16. 海底に眠りし古代都市：自分のメインステップで異合を召喚するとリザーブにコア1個 ===")
scenario({
    name: "city-in",
    start: { me: { nexuses: [{ card: CITY, label: "都市", cores: 0 }], hand: [FATIGUE[4].id] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ブラックウガルルム → なし",
        "自分.ブラックウガルルム.場所: なし → フィールド",
        "自分.ブラックウガルルム.疲労: なし → false",
        "自分.ブラックウガルルム.コア: なし → 1",
        "自分.ブラックウガルルム.Lv: なし → 1",
        "自分.ブラックウガルルム.BP: なし → 3000",
    ],
})

console.log("=== 17. 海底に眠りし古代都市：相手のメインステップではリザーブにコアが増えない ===")
scenario({
    name: "city-out",
    start: {
        turn: "opp",
        me: { nexuses: [{ card: CITY, label: "都市", cores: 0 }] },
        opp: { hand: [FATIGUE[4].id] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 3",
        "相手.手札: ブラックウガルルム → なし",
        "相手.ブラックウガルルム.場所: なし → フィールド",
        "相手.ブラックウガルルム.疲労: なし → false",
        "相手.ブラックウガルルム.コア: なし → 1",
        "相手.ブラックウガルルム.Lv: なし → 1",
        "相手.ブラックウガルルム.BP: なし → 3000",
    ],
})

// ── 19. X011【合体時】Lv2『自分のアタックステップ』：時間帯の中（光導のBPを12000として扱う） ──
console.log("=== 19. ゾディアックアポロクリムゾン：自分のアタックステップでは光導のBPが12000 ===")
scenario({
    name: "x011-in",
    start: {
        me: {
            spirits: [
                { card: X011, label: "アポロ", cores: 5 },
                { card: CANCER, label: "蟹" },
            ],
            hand: [TUSKER],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("アポロ") })
        t.act("me", { type: "nextPhase" })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.手札: 激爪竜パワード・タスカー → なし",
        "自分.蟹.BP: 6000 → 12000",
        "自分.アポロ.BP: 24000 → 28000",
        "自分.激爪竜パワード・タスカー.場所: なし → 合体",
        "自分.激爪竜パワード・タスカー.疲労: なし → false",
        "自分.激爪竜パワード・タスカー.コア: なし → 0",
        "自分.激爪竜パワード・タスカー.Lv: なし → 1",
    ],
})

// ── 20. X011【合体時】：時間帯の外（自分のメインステップの間はBPは変わらない） ──
console.log("=== 20. ゾディアックアポロクリムゾン：自分のメインステップの間は光導のBPは変わらない ===")
scenario({
    name: "x011-out-main",
    start: {
        me: {
            spirits: [
                { card: X011, label: "アポロ", cores: 5 },
                { card: CANCER, label: "蟹" },
            ],
            hand: [TUSKER],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("アポロ") })
        assert(effectiveBp(t.state, t.me, t.inst("蟹")) === 6000, "x011-out-main: メインステップの間は蟹のBPは6000のまま")
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.手札: 激爪竜パワード・タスカー → なし",
        "自分.アポロ.BP: 24000 → 28000",
        "自分.激爪竜パワード・タスカー.場所: なし → 合体",
        "自分.激爪竜パワード・タスカー.疲労: なし → false",
        "自分.激爪竜パワード・タスカー.コア: なし → 0",
        "自分.激爪竜パワード・タスカー.Lv: なし → 1",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part762）")
