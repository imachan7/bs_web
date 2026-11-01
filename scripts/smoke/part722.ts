// smoke パート722（プロモ 白・黄の組21枚の期待値。効果文だけから書いた場面テスト。docs/design/PROMO_PLAN.md §2）
// 実装前は落ちてよい。選択の応答は drain で汎用に行う（ラベルの正確な文言は実装側が決めるので正規表現で当てる）
import { assert, effectiveBp, getCard } from "./helpers"
import type { GameAction } from "./helpers"
import { instColors } from "../../shared/rules/level"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const VAN = "BS01-002" // ロクケラトプス（赤・地竜・Lv1=1コア/1000・Lv2=2コア/3000・効果なし）
const KUJAKU = "BS04-009" // 炎皇クジャラク（赤・皇獣/空牙・コスト6・Lv1=2コア/5000・Lv2=3コア/6000）
const ZUN = "BS12-002" // ズンガリープ（赤・空牙・コスト2・Lv1=1コア/2000・Lv2=2コア/5000）
const KAMOME = "BS10-024" // カモメーヴェ（緑・爪鳥・効果なし）
const MORA = "BS06-039" // 浮遊魚モラモラー（白・空魚・コスト2・Lv1=1コア/1000）
const KUSUI = "BS10-036" // 水晶魚クリスティール（白・空魚/星魂・コスト4・Lv1/4000）
const IJI = "BS16-035" // 樹氷竜シルバー・ライム（白・甲竜・コスト6・Lv1/5000）
const GAT = "BS01-084" // ガトリングスタンド（白・武装・コスト3・Lv1/3000）
const DONG = "BS03-051" // ドングリン（黄・楽族・コスト2・Lv1/1000）
const PONI = "BS03-063" // ポニサス（黄・想獣・コスト5・Lv1/4000）
const DWAFF = "BS05-045" // ドワッフー・セブン（黄・コスト7）
const YURI = "BS07-040" // 百合の妖精ユリィ（黄・コスト3）
const STON = "BS03-073" // ストン・スタチュー（青・コスト1。召喚時に相手のデッキを1枚破棄）
const EMERALD = "BS01-063" // エメラルドシーザー（緑・コスト4。召喚時に相手のスピリット1体を疲労）
const WILD = "BS01-133" // ワイルドパワー（緑・コスト2・フラッシュ：スピリット1体BP+2000）
const DOUBLE = "BS01-117" // ダブルドロー（赤・コスト4・軽減赤赤・メイン：2枚ドロー／フラッシュ：BP+2000）
const JUNGLE = "BS04-100" // ジャングルロウ（緑・コスト6・メイン：Lv1スピリットすべてを疲労）
const BUSTER = "BS01-120" // バスターファランクス（赤・コスト5・メイン：ネクサスすべてを破壊）
const WHITEHOLE = "BS06-106" // ホワイトホール（白・コスト6・メイン：ネクサスすべてを持ち主の手札に戻す）
const SENRAN = "P082" // 戦嵐（赤白・コスト8・メイン：相手のスピリット2体を手札に戻す）
const SHINING = "BS10-109" // シャイニングアロー（黄・コスト3・メイン：トラッシュの【聖命】スピリット1枚を手札に戻す）
const HAMMER = "BS03-144" // マジックハンマー（青・コスト4・軽減青青・メイン：相手のデッキを上から5枚破棄）
const OZ = "BS16-081" // マジック・オブ・オズ（黄）
const NOENTRY = "BS07-080" // ノーエントリー（黄）
const YARD = "BS01-099" // 百識の谷（赤・ネクサス。ドローステップだけに働く）
const BINDING = "BS01-140" // バインディングウッズ（緑・コスト7・メイン：色をひとつ選び、その色を持つスピリットすべてを疲労）
const TOWER = "BS02-086" // 螺旋の塔（黄・ネクサス）
const P020 = "P020" // 大龍皇ジークムンド（赤）
const P036 = "P036" // 月光竜機クレセントール（白・コスト4・軽減 白白緑黄）

const NAMES: Record<string, string> = {
    [VAN]: "ロクケラトプス", [KUJAKU]: "炎皇クジャラク", [ZUN]: "ズンガリープ", [KAMOME]: "カモメーヴェ", [MORA]: "浮遊魚モラモラー",
    [KUSUI]: "水晶魚クリスティール", [IJI]: "樹氷竜シルバー・ライム", [GAT]: "ガトリングスタンド", [DONG]: "ドングリン", [PONI]: "ポニサス",
    [DWAFF]: "ドワッフー・セブン", [YURI]: "百合の妖精ユリィ", [STON]: "ストン・スタチュー", [EMERALD]: "エメラルドシーザー", [WILD]: "ワイルドパワー",
    [DOUBLE]: "ダブルドロー", [JUNGLE]: "ジャングルロウ", [BUSTER]: "バスターファランクス", [WHITEHOLE]: "ホワイトホール", [SENRAN]: "戦嵐",
    [SHINING]: "シャイニングアロー", [HAMMER]: "マジックハンマー", [OZ]: "マジック・オブ・オズ", [NOENTRY]: "ノーエントリー", [TOWER]: "螺旋の塔", [BINDING]: "バインディングウッズ", [YARD]: "百識の谷",
    [P020]: "大龍皇ジークムンド", [P036]: "月光竜機クレセントール",
    P007: "天使ドミニア", P008: "ミミズック", P015: "メタルアングラー", P016: "鋼鉄竜ニヴルヘイム", P021: "龍騎士ワーグナー", P026: "盾竜イージ・オニス",
    P028: "銀装合体シールド・ドラゴン", P037: "月光妖精ゲッカ", P041: "ヴィクトリー・ホワイト・ドラゴン", P045: "導化姫ブラックスター",
    P053: "お掃除妖精マルチーズ", P056: "鋭守氷槍牙", P063: "サンク・シャイン", P075: "ザン・トライ", P079: "激翔", P084: "アイドル天使 天海春香",
    PX02: "極甲王グラン・トルタス", PX05: "翼神王グリフィ・オール", PX10: "導魔神姫ジェラルディー", PX11: "天戒機神グロリアス・ソリュート", PX17: "白亜元帥レイ・ザウラー",
}

console.log("=== 前提: カードの機械確認 ===")
{
    for (const [id, name] of Object.entries(NAMES)) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(KUJAKU).family.includes("空牙") && getCard(ZUN).family.includes("空牙") && !getCard(VAN).family.includes("空牙"), "空牙はクジャラクとズンガリープだけ（ロクケラトプスは違う）")
    assert(getCard(MORA).family.includes("空魚") && getCard(KAMOME).family.includes("爪鳥") && getCard(IJI).family.includes("甲竜"), "系統の確認")
    assert(getCard(JUNGLE).colors.join() === "green" && getCard(BUSTER).colors.join() === "red" && getCard(WHITEHOLE).colors.join() === "white", "マジックの色の確認")
    assert(getCard(SENRAN).colors.includes("red") && getCard(SENRAN).colors.includes("white"), "戦嵐は赤と白")
    assert(getCard(P036).name.includes("月光") && getCard(P036).colors.join() === "white", "月光竜機は白で名前に月光を含む")
    assert(getCard(KUSUI).cost >= 4 && getCard(GAT).cost === 3 && getCard(DWAFF).cost === 7, "コストの確認")
}

// 選択待ちを答え切る。option は正規表現で当て（無ければ先頭）、target は label で当てる（無ければ先頭）、card は先頭
function drain(t: ScenarioCtx, opt?: RegExp, tgt?: string): void {
    for (let i = 0; i < 12 && t.state.pendingChoice; i++) {
        const p = t.state.pendingChoice
        const side: Side = p.pid === t.me ? "me" : "opp"
        let a: GameAction
        if (p.kind === "option") {
            const o = (opt && p.options?.find((x) => opt.test(x))) ?? p.options?.[0]
            a = { type: "resolveChoice", option: o } as GameAction
        } else if (p.kind === "target") {
            a = { type: "resolveChoice", instanceId: tgt ? t.id(tgt) : p.candidates[0] } as GameAction
        } else {
            a = { type: "resolveChoice", cardIndex: p.cardIndices?.[0] } as GameAction
        }
        t.act(side, a)
    }
}
const meAtk = (t: ScenarioCtx, label: string) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(label) })
}
const oppAtk = (t: ScenarioCtx, label: string) => {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id(label) })
}
// 自分のアタックを受け、相手がライフで受ける
const meHit = (t: ScenarioCtx) => {
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
const oppHit = (t: ScenarioCtx) => {
    t.closeFlash()
    t.act("me", { type: "takeLife" })
}
const meBlockedBy = (t: ScenarioCtx, label: string) => {
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(label) })
}
// フラッシュの優先権が相手側にあれば、相手がパスしてから撃つ
const flash = (t: ScenarioCtx, side: Side, action: GameAction) => {
    const pid = side === "me" ? t.me : t.opp
    if (t.state.isFlashTiming && t.state.priorityPlayer !== pid) t.act(side === "me" ? "opp" : "me", { type: "pass" })
    t.act(side, action)
}
const born = (k: "自分" | "相手", name: string, cores: number, lv: number, bp: number): string[] => [
    `${k}.${name}.場所: なし → フィールド`, `${k}.${name}.疲労: なし → false`, `${k}.${name}.コア: なし → ${cores}`, `${k}.${name}.Lv: なし → ${lv}`, `${k}.${name}.BP: なし → ${bp}`,
]
const meHitLines = ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]
const oppHitLines = ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"]
const spent = (k: "自分" | "相手", reserve: [number, number], core: number, magic?: string): string[] => [
    `${k}.リザーブ: ${reserve[0]} → ${reserve[1]}`, `${k}.トラッシュのコア: 0 → ${core}`, ...(magic ? [`${k}.トラッシュ: なし → ${magic}`, `${k}.手札: ${magic} → なし`] : []),
]

console.log("=== P007 天使ドミニア：BPを+するマジックの対象にされたとき、さらにBP+1000（アタック時なのでバトルの間だけ） ===")
scenario({
    name: "p007-targeted",
    start: { me: { spirits: [{ card: "P007", label: "天使ドミニア" }], hand: [WILD] } },
    steps(t) {
        meAtk(t, "天使ドミニア")
        flash(t, "me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("天使ドミニア") })
        drain(t)
        assert(effectiveBp(t.state, t.me, t.inst("天使ドミニア")) === 5000, "バトル中は 2000+2000+1000=5000")
        meHit(t)
    },
    expect: ["自分.天使ドミニア.疲労: false → true", "自分.天使ドミニア.BP: 2000 → 4000", ...spent("自分", [10, 8], 2, "ワイルドパワー"), ...meHitLines],
})
scenario({
    name: "p007-other-targeted",
    start: { me: { spirits: [{ card: "P007", label: "天使ドミニア" }, { card: VAN, label: "ロクケラトプス" }], hand: [WILD] } },
    steps(t) {
        meAtk(t, "天使ドミニア")
        flash(t, "me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ロクケラトプス") })
        drain(t)
        assert(effectiveBp(t.state, t.me, t.inst("天使ドミニア")) === 2000, "対象にされていないので+1000されない")
        meHit(t)
    },
    expect: ["自分.天使ドミニア.疲労: false → true", "自分.ロクケラトプス.BP: 1000 → 3000", ...spent("自分", [10, 8], 2, "ワイルドパワー"), ...meHitLines],
})

console.log("=== P008 ミミズック：Lv2・Lv3の破壊時、爪鳥の自分のスピリット1体を回復 ===")
const p008 = (cores: number, recovers: boolean) =>
    scenario({
        name: `p008-cores${cores}`,
        start: {
            me: { spirits: [{ card: "P008", label: "ミミズック", cores }, { card: KAMOME, label: "カモメーヴェ", rested: true }] },
            opp: { spirits: [{ card: KUJAKU, label: "炎皇クジャラク", cores: 2 }] },
            turn: "opp",
        },
        steps(t) {
            oppAtk(t, "炎皇クジャラク")
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("ミミズック") })
            t.closeFlash()
        },
        expect: [
            "自分.ミミズック.場所: フィールド → なし", "自分.トラッシュ: なし → ミミズック", `自分.リザーブ: 10 → ${10 + cores}`,
            "相手.炎皇クジャラク.疲労: false → true", ...(recovers ? ["自分.カモメーヴェ.疲労: true → false"] : []),
        ],
    })
p008(3, true) // Lv2（3コア）
p008(1, false) // Lv1 は破壊時の効果なし

console.log("=== P015 メタルアングラー：Lv2の相手のアタックステップ、空魚の自分のスピリットすべてBP+1000（自身も空魚） ===")
scenario({
    name: "p015-lv2-opp-attack-step",
    start: { turn: "opp", me: { spirits: [{ card: "P015", label: "メタルアングラー", cores: 4 }, { card: MORA, label: "浮遊魚モラモラー" }, { card: VAN, label: "ロクケラトプス" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
    },
    expect: ["自分.メタルアングラー.BP: 4000 → 5000", "自分.浮遊魚モラモラー.BP: 1000 → 2000"],
})
scenario({
    name: "p015-lv1-opp-attack-step",
    start: { turn: "opp", me: { spirits: [{ card: "P015", label: "メタルアングラー" }, { card: MORA, label: "浮遊魚モラモラー" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
    },
    expect: [],
})
scenario({
    name: "p015-lv2-own-attack-step",
    start: { me: { spirits: [{ card: "P015", label: "メタルアングラー", cores: 4 }, { card: MORA, label: "浮遊魚モラモラー" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: [],
})

console.log("=== P016 鋼鉄竜ニヴルヘイム：【装甲：緑】相手の緑のマジックの効果を受けない（自分の緑には効く） ===")
scenario({
    name: "p016-opp-green-magic",
    start: { turn: "opp", me: { spirits: [{ card: "P016", label: "鋼鉄竜ニヴルヘイム" }, { card: MORA, label: "浮遊魚モラモラー" }] }, opp: { hand: [JUNGLE] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        drain(t)
    },
    expect: ["自分.浮遊魚モラモラー.疲労: false → true", ...spent("相手", [10, 4], 6, "ジャングルロウ")],
})
scenario({
    name: "p016-own-green-magic",
    start: { me: { spirits: [{ card: "P016", label: "鋼鉄竜ニヴルヘイム" }, { card: MORA, label: "浮遊魚モラモラー" }], hand: [JUNGLE] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drain(t)
    },
    expect: ["自分.鋼鉄竜ニヴルヘイム.疲労: false → true", "自分.浮遊魚モラモラー.疲労: false → true", ...spent("自分", [10, 4], 6, "ジャングルロウ")],
})

console.log("=== P021 龍騎士ワーグナー：アタック時、トラッシュから［大龍皇ジークムンド］1枚を手札に戻す ===")
scenario({
    name: "p021-returns",
    start: { me: { spirits: [{ card: "P021", label: "龍騎士ワーグナー" }], trash: [P020] } },
    steps(t) {
        meAtk(t, "龍騎士ワーグナー")
        drain(t)
        meHit(t)
    },
    expect: ["自分.龍騎士ワーグナー.疲労: false → true", "自分.手札: なし → 大龍皇ジークムンド", "自分.トラッシュ: 大龍皇ジークムンド → なし", ...meHitLines],
})
scenario({
    name: "p021-no-target",
    start: { me: { spirits: [{ card: "P021", label: "龍騎士ワーグナー" }], trash: [VAN] } },
    steps(t) {
        meAtk(t, "龍騎士ワーグナー")
        drain(t)
        meHit(t)
    },
    expect: ["自分.龍騎士ワーグナー.疲労: false → true", ...meHitLines],
})

console.log("=== P026 盾竜イージ・オニス ===")
scenario({
    name: "p026-opp-attack-step-bp",
    start: { turn: "opp", me: { spirits: [{ card: "P026", label: "盾竜イージ・オニス" }, { card: IJI, label: "樹氷竜シルバー・ライム" }, { card: VAN, label: "ロクケラトプス" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
    },
    expect: ["自分.盾竜イージ・オニス.BP: 3000 → 4000", "自分.樹氷竜シルバー・ライム.BP: 5000 → 6000"],
})
scenario({
    name: "p026-lv3-block-bounces-kuga",
    start: { turn: "opp", me: { spirits: [{ card: "P026", label: "盾竜イージ・オニス", cores: 6 }] }, opp: { spirits: [{ card: ZUN, label: "ズンガリープ" }] } },
    steps(t) {
        oppAtk(t, "ズンガリープ")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("盾竜イージ・オニス") })
        drain(t)
        t.closeFlash()
    },
    expect: [
        "自分.盾竜イージ・オニス.BP: 7000 → 8000", "自分.盾竜イージ・オニス.疲労: false → true",
        "相手.ズンガリープ.場所: フィールド → なし", "相手.手札: なし → ズンガリープ", "相手.リザーブ: 10 → 11",
    ],
})
scenario({
    name: "p026-lv3-block-not-kuga",
    start: { turn: "opp", me: { spirits: [{ card: "P026", label: "盾竜イージ・オニス", cores: 6 }] }, opp: { spirits: [{ card: VAN, label: "ロクケラトプス" }] } },
    steps(t) {
        oppAtk(t, "ロクケラトプス")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("盾竜イージ・オニス") })
        drain(t)
        t.closeFlash()
    },
    expect: [
        "自分.盾竜イージ・オニス.BP: 7000 → 8000", "自分.盾竜イージ・オニス.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P053 お掃除妖精マルチーズ：Lv2・Lv3の破壊時、自分のバーストをセットしているなら疲労状態で残る ===")
const BURST_NOT_TRIGGERED = "P063" // 自分のライフ減少後。この場面ではライフが減らないので誘発しない
const p053 = (burst: boolean) =>
    scenario({
        name: `p053-burst-${burst}`,
        start: {
            turn: "opp",
            me: { spirits: [{ card: "P053", label: "お掃除妖精マルチーズ", cores: 2 }], ...(burst ? { burst: BURST_NOT_TRIGGERED } : {}) },
            opp: { spirits: [{ card: KUJAKU, label: "炎皇クジャラク", cores: 2 }] },
        },
        steps(t) {
            oppAtk(t, "炎皇クジャラク")
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("お掃除妖精マルチーズ") })
            t.closeFlash()
        },
        expect: [
            "相手.炎皇クジャラク.疲労: false → true",
            ...(burst
                ? ["自分.お掃除妖精マルチーズ.疲労: false → true"]
                : ["自分.お掃除妖精マルチーズ.場所: フィールド → なし", "自分.トラッシュ: なし → お掃除妖精マルチーズ", "自分.リザーブ: 10 → 12"]),
        ],
    })
p053(true)
p053(false)

console.log("=== P063 サンク・シャイン ===")
scenario({
    name: "p063-burst-summon",
    start: { interactive: true, turn: "opp", me: { spirits: [{ card: VAN, label: "ロクケラトプス" }], burst: "P063" }, opp: { spirits: [{ card: VAN, label: "ロクケラトプス" }] } },
    steps(t) {
        oppAtk(t, "相手.ロクケラトプス")
        oppHit(t)
        drain(t)
    },
    expect: [
        "自分.ライフ: 5 → 4", "自分.バースト: サンク・シャイン → なし", "自分.ロクケラトプス.BP: 1000 → 4000", "相手.ロクケラトプス.疲労: false → true",
        ...born("自分", "サンク・シャイン", 1, 1, 6000),
    ],
})
scenario({
    name: "p063-block-core",
    start: { turn: "opp", me: { spirits: [{ card: "P063", label: "サンク・シャイン" }] }, opp: { spirits: [{ card: VAN, label: "ロクケラトプス" }] } },
    steps(t) {
        oppAtk(t, "ロクケラトプス")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("サンク・シャイン") })
        drain(t)
        t.closeFlash()
    },
    expect: [
        "自分.サンク・シャイン.疲労: false → true", "自分.サンク・シャイン.コア: 1 → 2", "自分.サンク・シャイン.Lv: 1 → 2", "自分.サンク・シャイン.BP: 3000 → 7000",
        "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
    ],
})
const p063rested = (name: string, cores: number, attacker: string, ok: boolean) =>
    scenario({
        name,
        start: { turn: "opp", me: { spirits: [{ card: "P063", label: "サンク・シャイン", cores, rested: true }] }, opp: { spirits: [{ card: attacker, label: "攻撃側" }] } },
        steps(t) {
            oppAtk(t, "攻撃側")
            t.closeFlash()
            if (ok) {
                t.act("me", { type: "block", instanceId: t.id("サンク・シャイン") })
                drain(t)
                t.closeFlash()
            } else {
                t.actRejected("me", { type: "block", instanceId: t.id("サンク・シャイン") })
                t.act("me", { type: "takeLife" })
            }
        },
        expect: ok
            ? [
                  "自分.サンク・シャイン.コア: 2 → 3", "相手.攻撃側.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11",
              ]
            : ["相手.攻撃側.疲労: false → true", ...oppHitLines],
    })
p063rested("p063-rested-block-ok", 2, VAN, true) // Lv2・コスト以下（コスト1 ≤ 6）
p063rested("p063-rested-block-lv1", 1, VAN, false) // Lv1 は疲労状態でブロックできない
p063rested("p063-rested-block-over-cost", 2, DWAFF, false) // コスト7 > 6

console.log("=== P075 ザン・トライ ===")
const p075Magic = (name: string, magic: string, negated: boolean) =>
    scenario({
        name,
        start: { interactive: true, turn: "opp", me: { spirits: [{ card: "P075", label: "ザン・トライ" }], nexuses: [{ card: TOWER, label: "螺旋の塔", cores: 0 }] }, opp: { hand: [magic] } },
        steps(t) {
            t.act("opp", { type: "castMagic", handIndex: 0 })
            drain(t)
        },
        expect: [
            ...(negated
                ? ["自分.ザン・トライ.疲労: false → true"]
                : ["自分.螺旋の塔.場所: ネクサス → なし", "自分.手札: なし → 螺旋の塔"]),
            ...spent("相手", [10, 10 - getCard(magic).cost], getCard(magic).cost, NAMES[magic]),
        ],
    })
p075Magic("p075-ice-wall-red", BUSTER, true) // 赤のマジックの効果は疲労で無効にできる
p075Magic("p075-ice-wall-white", WHITEHOLE, false) // 白は氷壁の対象外
scenario({
    name: "p075-opp-hand-increase",
    start: { interactive: true, turn: "opp", me: { spirits: [{ card: "P075", label: "ザン・トライ" }] }, opp: { hand: [SHINING], trash: [YURI] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0 })
        drain(t)
    },
    expect: ["相手.手札: シャイニングアロー → なし", "相手.トラッシュ: 百合の妖精ユリィ → シャイニングアロー、百合の妖精ユリィ", "相手.リザーブ: 10 → 7", "相手.トラッシュのコア: 0 → 3"],
})
scenario({
    name: "p075-own-hand-increase",
    start: { interactive: true, me: { spirits: [{ card: "P075", label: "ザン・トライ" }], hand: [SHINING], trash: [YURI] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drain(t)
    },
    expect: ["自分.手札: シャイニングアロー → 百合の妖精ユリィ", "自分.トラッシュ: 百合の妖精ユリィ → シャイニングアロー", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3"],
})

console.log("=== P079 激翔 ===")
scenario({
    name: "p079-main-color",
    start: { interactive: true, me: { spirits: [{ card: VAN, label: "ロクケラトプス" }], hand: ["P079"] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drain(t, /青|blue/)
        const colors = instColors(t.inst("ロクケラトプス"))
        assert(colors.includes("red") && colors.length === 2, "本来の赤に加えて、もう1色を得る")
    },
    expect: spent("自分", [10, 8], 2, "激翔"),
})
scenario({
    name: "p079-flash-recover-blocker",
    start: {
        interactive: true,
        turn: "opp",
        me: { spirits: [{ card: IJI, label: "樹氷竜シルバー・ライム" }, { card: ZUN, label: "ズンガリープ", rested: true }], hand: ["P079"] },
        opp: { spirits: [{ card: VAN, label: "ロクケラトプス" }] },
    },
    steps(t) {
        oppAtk(t, "ロクケラトプス")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("樹氷竜シルバー・ライム") })
        assert(t.inst("樹氷竜シルバー・ライム").isRested, "ブロックで疲労している")
        flash(t, "me", { type: "castMagic", handIndex: 0, timing: "flash" })
        drain(t)
        assert(!t.inst("樹氷竜シルバー・ライム").isRested, "ブロックしているスピリットが回復する")
        assert(t.inst("ズンガリープ").isRested, "ブロックしていない疲労スピリットは回復しない")
        t.closeFlash()
    },
    expect: [...spent("自分", [10, 9], 1, "激翔"), "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

console.log("=== P084 アイドル天使 天海春香 ===")
scenario({
    name: "p084-own-attack-step",
    start: { me: { spirits: [{ card: "P084", label: "アイドル天使 天海春香" }, { card: VAN, label: "ロクケラトプス" }, { card: MORA, label: "浮遊魚モラモラー" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: ["自分.ロクケラトプス.BP: 1000 → 3000", "自分.浮遊魚モラモラー.BP: 1000 → 3000"],
})
scenario({
    name: "p084-opp-attack-step",
    start: { turn: "opp", me: { spirits: [{ card: "P084", label: "アイドル天使 天海春香" }, { card: VAN, label: "ロクケラトプス" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
    },
    expect: [],
})
const p084 = (cores: number, toHand: boolean) =>
    scenario({
        name: `p084-destroyed-cores${cores}`,
        start: { turn: "opp", me: { spirits: [{ card: "P084", label: "アイドル天使 天海春香", cores }] }, opp: { spirits: [{ card: KUJAKU, label: "炎皇クジャラク", cores: 2 }] } },
        steps(t) {
            oppAtk(t, "炎皇クジャラク")
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("アイドル天使 天海春香") })
            drain(t)
            t.closeFlash()
        },
        expect: [
            "自分.アイドル天使 天海春香.場所: フィールド → なし", `自分.リザーブ: 10 → ${10 + cores}`,
            toHand ? "自分.手札: なし → アイドル天使 天海春香" : "自分.トラッシュ: なし → アイドル天使 天海春香",
            ...(toHand ? [] : ["相手.炎皇クジャラク.疲労: false → true"]),
            ...(toHand ? ["相手.炎皇クジャラク.場所: フィールド → なし", "相手.トラッシュ: なし → 炎皇クジャラク", "相手.リザーブ: 10 → 12"] : []),
        ],
    })
p084(3, true) // Lv3（BP5000 同士で相打ち）：手札に戻る
p084(2, false) // Lv2（BP4000 < 5000）：トラッシュへ

console.log("=== PX02 極甲王グラン・トルタス ===")
const px02 = (name: string, cores: number, attacker: string, attackerCores: number, rests: boolean, bp: number) =>
    scenario({
        name,
        start: { turn: "opp", me: { spirits: [{ card: "PX02", label: "極甲王グラン・トルタス", cores }] }, opp: { spirits: [{ card: attacker, label: "攻撃側", cores: attackerCores }] } },
        steps(t) {
            oppAtk(t, "攻撃側")
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("極甲王グラン・トルタス") })
            drain(t)
            assert(effectiveBp(t.state, t.me, t.inst("極甲王グラン・トルタス")) === bp, `ブロック中のBPは ${bp}`)
            t.closeFlash()
        },
        expect: [
            ...(rests ? ["自分.極甲王グラン・トルタス.疲労: false → true"] : []),
            "相手.攻撃側.場所: フィールド → なし", `相手.トラッシュ: なし → ${NAMES[attacker]}`, `相手.リザーブ: 10 → ${10 + attackerCores}`,
        ],
    })
px02("px02-lv2-vs-lv1", 2, VAN, 1, false, 14000) // Lv1をブロックしたら疲労しない・Lv2はBP+4000
px02("px02-lv1-vs-lv1", 1, VAN, 1, false, 6000) // Lv1 は疲労しないが +4000 はない
px02("px02-lv2-vs-lv2", 2, ZUN, 2, true, 14000) // Lv2をブロックしたら疲労する

console.log("=== PX05 翼神王グリフィ・オール ===")
scenario({
    name: "px05-summon-yellow-magic",
    start: { me: { reserve: 12, hand: ["PX05"], trash: [WILD, OZ, NOENTRY] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        drain(t)
    },
    expect: [
        "自分.手札: 翼神王グリフィ・オール → ノーエントリー、マジック・オブ・オズ", "自分.トラッシュ: ノーエントリー、マジック・オブ・オズ、ワイルドパワー → ワイルドパワー",
        "自分.リザーブ: 12 → 3", "自分.トラッシュのコア: 0 → 8", ...born("自分", "翼神王グリフィ・オール", 1, 1, 4000),
    ],
})
const px05Atk = (cores: number, free: boolean) =>
    scenario({
        name: `px05-attack-cores${cores}`,
        start: { interactive: true, me: { spirits: [{ card: "PX05", label: "翼神王グリフィ・オール", cores }], hand: [WILD] } },
        steps(t) {
            meAtk(t, "翼神王グリフィ・オール")
            flash(t, "me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("翼神王グリフィ・オール") })
            drain(t, /支払わ|使用|はい/)
            meHit(t)
        },
        expect: [
            "自分.翼神王グリフィ・オール.疲労: false → true", `自分.翼神王グリフィ・オール.BP: ${cores === 2 ? 6000 : 4000} → ${cores === 2 ? 8000 : 6000}`,
            "自分.手札: ワイルドパワー → なし", "自分.トラッシュ: なし → ワイルドパワー", ...(free ? [] : ["自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2"]), ...meHitLines,
        ],
    })
px05Atk(2, true) // Lv2：アタック中はコストを支払わずにフラッシュで使える
px05Atk(1, false) // Lv1：能力がないので通常どおり払う
scenario({
    name: "px05-attack-not-attacking",
    start: { interactive: true, me: { spirits: [{ card: "PX05", label: "翼神王グリフィ・オール", cores: 2 }, { card: VAN, label: "ロクケラトプス" }], hand: [WILD] } },
    steps(t) {
        meAtk(t, "ロクケラトプス")
        flash(t, "me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ロクケラトプス") })
        drain(t, /支払わ|使用|はい/)
        meHit(t)
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "自分.ロクケラトプス.BP: 1000 → 3000", "自分.手札: ワイルドパワー → なし", "自分.トラッシュ: なし → ワイルドパワー", "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2", ...meHitLines],
})

console.log("=== PX10 導魔神姫ジェラルディー ===")
scenario({
    name: "px10-deck-not-discarded",
    start: {
        turn: "opp",
        me: { spirits: [{ card: "PX10", label: "導魔神姫ジェラルディー" }], deck: [WILD, ...Array.from({ length: 39 }, () => VAN)] },
        opp: { hand: [STON, HAMMER] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        drain(t)
        t.act("opp", { type: "castMagic", handIndex: 0 })
        drain(t)
    },
    expect: [
        "自分.デッキ枚数: 40 → 39", "自分.トラッシュ: なし → ワイルドパワー", "相手.手札: ストン・スタチュー、マジックハンマー → なし", "相手.トラッシュ: なし → マジックハンマー",
        "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...born("相手", "ストン・スタチュー", 1, 1, 2000),
    ],
})
scenario({
    name: "px10-no-px10-discards",
    start: {
        turn: "opp",
        me: { spirits: [{ card: VAN, label: "ロクケラトプス" }], deck: [WILD, ...Array.from({ length: 39 }, () => VAN)] },
        opp: { hand: [STON, HAMMER] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        drain(t)
        t.act("opp", { type: "castMagic", handIndex: 0 })
        drain(t)
    },
    expect: [
        "自分.デッキ枚数: 40 → 34", "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ワイルドパワー",
        "相手.手札: ストン・スタチュー、マジックハンマー → なし", "相手.トラッシュ: なし → マジックハンマー",
        "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...born("相手", "ストン・スタチュー", 1, 1, 2000),
    ],
})
const px10Fushi = (name: string, blocker: string, bp: number, revive: boolean) =>
    scenario({
        name,
        start: {
            interactive: true,
            turn: "opp",
            me: { spirits: [{ card: blocker, label: "身代わり" }], trash: ["PX10"] },
            opp: { spirits: [{ card: KUJAKU, label: "炎皇クジャラク", cores: 2 }] },
        },
        steps(t) {
            oppAtk(t, "炎皇クジャラク")
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("身代わり") })
            t.closeFlash()
            drain(t)
        },
        expect: [
            "自分.身代わり.場所: フィールド → なし", "相手.炎皇クジャラク.疲労: false → true",
            ...(revive
                ? ["自分.トラッシュ: 導魔神姫ジェラルディー → " + NAMES[blocker], "自分.リザーブ: 10 → 3", "自分.トラッシュのコア: 0 → 7", ...born("自分", "導魔神姫ジェラルディー", 1, 1, 6000)]
                : ["自分.トラッシュ: 導魔神姫ジェラルディー → " + [NAMES[blocker], "導魔神姫ジェラルディー"].sort().join("、"), "自分.リザーブ: 10 → 11"]),
        ],
    })
px10Fushi("px10-fushi-cost3", GAT, 3000, true) // コスト3の自分のスピリットが破壊されたとき、トラッシュから召喚できる
px10Fushi("px10-fushi-cost5", PONI, 4000, false) // コスト5は対象外
const px10Battle = (name: string, trash: string[], moves: boolean) =>
    scenario({
        name,
        start: {
            interactive: true,
            me: { spirits: [{ card: "PX10", label: "導魔神姫ジェラルディー", cores: 2 }], trash },
            opp: { spirits: [{ card: ZUN, label: "ズンガリープ", cores: 3 }] },
        },
        steps(t) {
            meAtk(t, "導魔神姫ジェラルディー")
            drain(t)
            meHit(t)
        },
        expect: [
            "自分.導魔神姫ジェラルディー.疲労: false → true", "相手.ライフ: 5 → 4",
            ...(moves
                ? ["自分.トラッシュ: ロクケラトプス → なし", "自分.デッキ枚数: 40 → 41", "相手.ズンガリープ.コア: 3 → 1", "相手.ズンガリープ.Lv: 2 → 1", "相手.ズンガリープ.BP: 5000 → 2000", "相手.リザーブ: 10 → 13"]
                : ["相手.リザーブ: 10 → 11"]),
        ],
    })
px10Battle("px10-battle-pay", [VAN], true)
px10Battle("px10-battle-no-trash", [], false)

console.log("=== PX11 天戒機神グロリアス・ソリュート ===")
scenario({
    name: "px11-summon-bounce",
    start: {
        me: { reserve: 12, hand: ["PX11"] },
        opp: { spirits: [{ card: VAN, label: "ロクケラトプス" }, { card: ZUN, label: "ズンガリープ", cores: 2 }, { card: KUJAKU, label: "炎皇クジャラク", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        drain(t)
    },
    expect: [
        "自分.手札: 天戒機神グロリアス・ソリュート → なし", "自分.リザーブ: 12 → 6", "自分.トラッシュのコア: 0 → 7", ...born("自分", "天戒機神グロリアス・ソリュート", 1, 1, 6000),
        "相手.ロクケラトプス.場所: フィールド → なし", "相手.ズンガリープ.場所: フィールド → なし", "相手.手札: なし → ズンガリープ、ロクケラトプス", "相手.リザーブ: 10 → 13",
    ],
})
const immune = (name: string, card: string, label: string) => {
    scenario({
        name: `${name}-opp-spirit-effect`,
        start: { turn: "opp", me: { spirits: [{ card, label }, { card: VAN, label: "ロクケラトプス" }] }, opp: { hand: [EMERALD] } },
        steps(t) {
            t.act("opp", { type: "summon", handIndex: 0 })
            drain(t)
        },
        expect: ["自分.ロクケラトプス.疲労: false → true", "相手.手札: エメラルドシーザー → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 4", ...born("相手", "エメラルドシーザー", 1, 1, 3000)],
    })
    scenario({
        name: `${name}-opp-magic`,
        start: { turn: "opp", me: { spirits: [{ card, label }] }, opp: { hand: [JUNGLE] } },
        steps(t) {
            t.act("opp", { type: "castMagic", handIndex: 0 })
            drain(t)
        },
        expect: [`自分.${label}.疲労: false → true`, ...spent("相手", [10, 4], 6, "ジャングルロウ")],
    })
}
immune("px11", "PX11", "天戒機神グロリアス・ソリュート")
const px11Life = (name: string, blocked: boolean) =>
    scenario({
        name,
        start: { me: { spirits: [{ card: "PX11", label: "天戒機神グロリアス・ソリュート", cores: 3 }] }, opp: { spirits: blocked ? [{ card: VAN, label: "ロクケラトプス" }] : [] } },
        steps(t) {
            meAtk(t, "天戒機神グロリアス・ソリュート")
            t.closeFlash()
            if (blocked) {
                t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
                t.closeFlash()
            } else t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.天戒機神グロリアス・ソリュート.疲労: false → true",
            ...(blocked
                ? ["相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
                : ["自分.ライフ: 5 → 6", ...meHitLines]),
        ],
    })
px11Life("px11-seimei-hit", false)
px11Life("px11-seimei-blocked", true)

console.log("=== PX17 白亜元帥レイ・ザウラー ===")
immune("px17", "PX17", "白亜元帥レイ・ザウラー")
scenario({
    name: "px17-designate-cannot-attack",
    start: {
        interactive: true,
        turn: "opp",
        me: { spirits: [{ card: "PX17", label: "白亜元帥レイ・ザウラー" }] },
        opp: { spirits: [{ card: KUJAKU, label: "炎皇クジャラク", cores: 2 }, { card: ZUN, label: "ズンガリープ" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        drain(t, /指定|はい/, "相手.ズンガリープ")
        t.actRejected("opp", { type: "attack", instanceId: t.id("ズンガリープ") })
        t.act("opp", { type: "attack", instanceId: t.id("炎皇クジャラク") })
        oppHit(t)
    },
    expect: ["相手.炎皇クジャラク.疲労: false → true", ...oppHitLines],
})
const px17Recover = (name: string, other: string, label: string, returns: boolean) =>
    scenario({
        name,
        start: { interactive: true, me: { spirits: [{ card: "PX17", label: "白亜元帥レイ・ザウラー", cores: 2 }, { card: other, label }] } },
        steps(t) {
            meAtk(t, "白亜元帥レイ・ザウラー")
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
            drain(t, /回復|はい|戻す/, returns ? label : undefined)
        },
        expect: [
            ...meHitLines,
            ...(returns
                ? [`自分.${label}.場所: フィールド → なし`, `自分.手札: なし → ${NAMES[other]}`, "自分.リザーブ: 10 → 11"]
                : ["自分.白亜元帥レイ・ザウラー.疲労: false → true"]),
        ],
    })
px17Recover("px17-recover-white", MORA, "浮遊魚モラモラー", true) // 白の自分のスピリットを戻して回復（行き先は手札・コアはリザーブ）
px17Recover("px17-recover-no-white", VAN, "ロクケラトプス", false) // 白がいなければ回復しない

console.log("=== P028 / P041 合体時の装甲・重装甲（ホスト＋ブレイヴの合体スピリットが相手の色の効果を受けない） ===")
{
    assert(getCard(BINDING).name === "バインディングウッズ" && getCard(BINDING).colors.join() === "green", "BINDINGは緑のバインディングウッズ")
    assert(getCard("P028").braveLevels !== undefined || getCard("P028").type === "brave", "P028 はブレイヴ")
}
// ホスト（水晶魚）にブレイヴを合体させてターンを終え、相手のターンに相手がマジックを撃つ。相手のターン開始でデッキ1枚→手札・コア1個→リザーブ
const armor = (name: string, brave: string, braveName: string, magic: string, protectedHost: boolean) => {
    const cost = getCard(magic).cost
    const h = "水晶魚クリスティール"
    scenario({
        name,
        start: {
            interactive: true,
            me: { spirits: [{ card: KUSUI, label: h }, { card: brave, label: braveName }, { card: MORA, label: "浮遊魚モラモラー" }] },
            opp: { hand: [magic] },
        },
        steps(t) {
            t.act("me", { type: "combineBrave", braveInstanceId: t.id(braveName), hostInstanceId: t.id(h) })
            t.act("me", { type: "endTurn" })
            t.act("opp", { type: "castMagic", handIndex: 0 })
            drain(t, /白|white/)
        },
        expect: [
            `自分.${h}.BP: 4000 → 9000`, `自分.${h}.Lv: 1 → 2`, `自分.${h}.コア: 1 → 2`, `自分.${braveName}.BP: 3000 → なし`, `自分.${braveName}.コア: 1 → 0`, `自分.${braveName}.場所: フィールド → 合体`,
            "相手.デッキ枚数: 40 → 39", `相手.手札: ${NAMES[magic]} → ロクケラトプス`, `相手.トラッシュ: なし → ${NAMES[magic]}`, `相手.リザーブ: 10 → ${11 - cost}`, `相手.トラッシュのコア: 0 → ${cost}`,
            ...(magic === SENRAN
                ? ["自分.浮遊魚モラモラー.場所: フィールド → なし", "自分.手札: なし → 浮遊魚モラモラー", "自分.リザーブ: 10 → 11"]
                : ["自分.浮遊魚モラモラー.疲労: false → true"]),
            ...(magic === SENRAN || protectedHost ? [] : [`自分.${h}.疲労: false → true`]),
        ],
    })
}
armor("p028-white-magic-blocked", "P028", "銀装合体シールド・ドラゴン", SENRAN, true) // 戦嵐は白でもある
armor("p028-green-magic-not-blocked", "P028", "銀装合体シールド・ドラゴン", BINDING, false) // 緑は装甲：白の対象外
armor("p041-red-magic-blocked", "P041", "ヴィクトリー・ホワイト・ドラゴン", SENRAN, true) // 戦嵐は赤でもある
armor("p041-green-magic-not-blocked", "P041", "ヴィクトリー・ホワイト・ドラゴン", BINDING, false) // 緑は重装甲：赤/紫の対象外

console.log("=== P037 月光妖精ゲッカ ===")
{
    const summonA = (name: string, hand: string, spirits: { card: string; label: string; cores?: number }[], cost: number, pairLife: boolean, pre?: (t: ScenarioCtx) => void, extra: string[] = []) =>
        scenario({
            name,
            start: { me: { spirits, hand: [hand] } },
            steps(t) {
                pre?.(t)
                t.act("me", { type: "summon", handIndex: 0 })
                drain(t)
            },
            expect: [
                `自分.手札: ${NAMES[hand]!} → なし`, `自分.リザーブ: 10 → ${10 - cost - 1}`, `自分.トラッシュのコア: 0 → ${cost}`,
                ...born("自分", NAMES[hand]!, 1, 1, getCard(hand).levels![0]!.bp), ...(pairLife ? ["自分.ライフ: 5 → 6"] : []), ...extra,
            ],
        })
    // 月光の名前のスピリットを召喚するとき白のシンボル2つ：月光竜機（軽減 白白緑黄）は 白2+黄1=3 軽減されてコスト1
    summonA("p037-gekko-summon-reduces", P036, [{ card: "P037", label: "月光妖精ゲッカ" }], 1, false)
    summonA("p037-non-gekko-summon", GAT, [{ card: "P037", label: "月光妖精ゲッカ" }], 3, false) // 月光でなければ白は加わらない（ガトリングの軽減は白白）
    summonA("p037-lv3-alone-no-life", P036, [{ card: "P037", label: "月光妖精ゲッカ", cores: 3 }], 1, false)
    summonA(
        "p037-lv3-combined-core-to-life", P036, [{ card: "P037", label: "月光妖精ゲッカ", cores: 3 }, { card: "P028", label: "銀装合体シールド・ドラゴン" }], 1, true,
        (t) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("銀装合体シールド・ドラゴン"), hostInstanceId: t.id("月光妖精ゲッカ") }),
        ["自分.月光妖精ゲッカ.BP: 5000 → 8000", "自分.月光妖精ゲッカ.コア: 3 → 4", "自分.銀装合体シールド・ドラゴン.BP: 3000 → なし", "自分.銀装合体シールド・ドラゴン.コア: 1 → 0", "自分.銀装合体シールド・ドラゴン.場所: フィールド → 合体"],
    )
}

console.log("=== P045 導化姫ブラックスター ===")
const p045Summon = (name: string, prefer: RegExp, toHand: boolean) =>
    scenario({
        name,
        start: { interactive: true, me: { reserve: 12, hand: ["P045"], trash: [WILD] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0 })
            drain(t, prefer)
        },
        expect: [
            "自分.リザーブ: 12 → 4", "自分.トラッシュのコア: 0 → 7", "自分.トラッシュ: ワイルドパワー → なし",
            toHand ? "自分.手札: 導化姫ブラックスター → ワイルドパワー" : "自分.手札: 導化姫ブラックスター → なし", ...(toHand ? [] : ["自分.デッキ枚数: 40 → 41"]),
            ...born("自分", "導化姫ブラックスター", 1, 1, 5000),
        ],
    })
p045Summon("p045-summon-to-hand", /手札/, true)
p045Summon("p045-summon-to-deck-top", /デッキ/, false)
const p045Reduce = (name: string, cores: number, cost: number) =>
    scenario({
        name,
        start: { me: { spirits: [{ card: "P045", label: "導化姫ブラックスター", cores }, { card: DONG, label: "ドングリン" }], hand: [DOUBLE] } },
        steps(t) {
            meAtk(t, "ドングリン")
            flash(t, "me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ドングリン") })
            drain(t)
            meHit(t)
        },
        expect: ["自分.ドングリン.疲労: false → true", "自分.ドングリン.BP: 1000 → 3000", ...spent("自分", [10, 10 - cost], cost, "ダブルドロー"), ...meHitLines],
    })
p045Reduce("p045-lv2-attack-step-yellow-reduction", 3, 2) // Lv2：赤赤の軽減が黄黄になり、黄のシンボル2つ（本体＋ドングリン）で2軽減
p045Reduce("p045-lv1-no-reduction", 1, 4) // Lv1 は能力なし：赤のシンボルが無いので軽減されない
scenario({
    name: "p045-lv2-main-step-no-reduction",
    start: { me: { spirits: [{ card: "P045", label: "導化姫ブラックスター", cores: 3 }, { card: DONG, label: "ドングリン" }], hand: [DOUBLE] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
        drain(t)
    },
    expect: ["自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", "自分.トラッシュ: なし → ダブルドロー", "自分.手札: ダブルドロー → ロクケラトプス、ロクケラトプス", "自分.デッキ枚数: 40 → 38"],
})

console.log("=== P056 鋭守氷槍牙（バースト：相手による自分のスピリット破壊後） ===")
scenario({
    name: "p056-burst",
    start: {
        interactive: true,
        turn: "opp",
        me: { spirits: [{ card: VAN, label: "ロクケラトプス" }], burst: "P056" },
        opp: { spirits: [{ card: KUJAKU, label: "炎皇クジャラク", cores: 2 }], nexuses: [{ card: YARD, label: "百識の谷", cores: 0 }] },
    },
    steps(t) {
        oppAtk(t, "炎皇クジャラク")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        drain(t, /発動|支払|はい|する/)
    },
    expect: [
        "自分.ロクケラトプス.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス、鋭守氷槍牙", "自分.バースト: 鋭守氷槍牙 → なし",
        "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 3",
        "相手.炎皇クジャラク.場所: フィールド → なし", "相手.百識の谷.場所: ネクサス → なし", "相手.手札: なし → 炎皇クジャラク、百識の谷", "相手.リザーブ: 10 → 12",
    ],
})
scenario({
    name: "p056-no-trigger-when-opp-spirit-destroyed",
    start: {
        interactive: true,
        turn: "opp",
        me: { spirits: [{ card: KUJAKU, label: "炎皇クジャラク", cores: 2 }], burst: "P056" },
        opp: { spirits: [{ card: VAN, label: "ロクケラトプス" }] },
    },
    steps(t) {
        oppAtk(t, "ロクケラトプス")
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("炎皇クジャラク") })
        t.closeFlash()
        drain(t)
    },
    expect: ["自分.炎皇クジャラク.疲労: false → true", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part722）")
