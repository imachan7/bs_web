// smoke パート859（BS23 緑バッチ後半：024 モルフォナイトの残り節・059 ハンミョール・060 日輪丸・069 蟲招く妖花の塔・077 クイックリーソード・078 グラスバインド）
// 期待値は効果文と公式Q&A（BS23_PLAN §1）だけから書いた。分身の基本は BS22_PLAN の B1 行
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { arrive, braved, bunshin, giveFlash, names, settle } from "./bs23green"

const MORPH = "BS23-024"
const JU = "BS23-025"
const HAMMY = "BS23-059"
const BRAVE = "BS23-060"
const TOWER = "BS23-069"
const QUICK = "BS23-077"
const GRASS = "BS23-078"
const BATTA = "BS23-020"
const ROK = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・BP3000）
const BLU = "BS17-046" // オリクス盗賊団（青・コスト1）
const MATANGO = "BS10-028" // マタンゴル（緑・コスト5・Lv1 BP6000・Lv2 BP8000）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・シンボル2つ）
const GIGA = "BS01-025" // 要塞龍ギガ（赤・コスト8・シンボル1つ）
const BAG = "BS04-030" // 食蟲花バグ・レシア（緑・Lv3 BP9000）
const BURST = "BS15-074" // 三札之術（赤・バースト：自分のライフ減少後 BP4000以下の相手のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認 ===")
{
    const n = (id: string) => getCard(id).name
    assert(n(MORPH) === "夜蝶剣聖モルフォナイト" && getCard(MORPH).family.includes("剣使"), "024は剣使")
    assert(n(HAMMY) === "ハンミョール" && getCard(HAMMY).type === "brave" && n(BRAVE) === "翡翠の小太刀 日輪丸", "059・060")
    assert(n(TOWER) === "蟲招く妖花の塔" && n(QUICK) === "クイックリーソード" && n(GRASS) === "グラスバインド", "069・077・078")
    assert(getCard(TARAN).cost === 6 && getCard(TARAN).symbol?.length === 2, "タランドーズはコスト6・シンボル2つ")
    assert(getCard(GIGA).cost === 8 && getCard(GIGA).symbol?.length === 1, "ギガはコスト8・シンボル1つ")
    assert(getCard(BATTA).effect.includes("神速") && getCard(BLU).colors[0] === "blue" && getCard(BAG).levels[2]!.bp === 9000, "脇役の属性")
    assert(getCard(BURST).type === "magic" && getCard(BURST).effect.includes("BP4000以下の相手のスピリット1体を破壊"), "BURST は BP4000以下を破壊するバースト")
}

console.log("=== 077 クイックリーソード＋024：疲労させ、このバトルの間 剣使に「相手のスピリットだけを破壊したら相手のライフのコア1個をリザーブへ」を与える。024は疲労のたびボイドからコア1個 ===")
// 077 のコスト3：024 の緑1つで軽減 → 2。アタック宣言に対するフラッシュで標的を疲労させ、防御役（BP1000）が024（BP3000）に負ける
function quick(name: string, attacker: string, withLifeCore: boolean): void {
    scenario({
        name,
        start: {
            me: { spirits: [{ card: attacker, label: "攻撃側" }], hand: [QUICK] },
            opp: { spirits: [{ card: ROK, label: "防御役" }, { card: ROK, label: "標的" }] },
        },
        steps(t) {
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("攻撃側") })
            giveFlash(t, "me")
            t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("標的") })
            settle(t)
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("防御役") })
            t.closeFlash()
            settle(t)
        },
        expect: [
            // 024：疲労させたとき +1。024 でなければ増えない
            `自分.リザーブ: 10 → ${attacker === MORPH ? 9 : 8}`, "自分.トラッシュのコア: 0 → 2", `自分.手札: ${names([QUICK])} → なし`, `自分.トラッシュ: なし → ${names([QUICK])}`,
            "自分.攻撃側.疲労: false → true",
            "相手.標的.疲労: false → true", "相手.防御役.場所: フィールド → なし", `相手.トラッシュ: なし → ${names([ROK])}`,
            // 防御役のコア1個＋（付与があれば）ライフのコア1個がリザーブへ
            `相手.リザーブ: 10 → ${withLifeCore ? 12 : 11}`,
            ...(withLifeCore ? ["相手.ライフ: 5 → 4"] : []),
        ],
    })
}
quick("quick-morph-attack-flash", MORPH, true)
console.log("=== 077：付与先の剣使がいなければライフのコアは動かない（024もいないのでコアも増えない） ===")
quick("quick-no-swordsman", SHOCK, false)

console.log("=== 024：お互いのアタックステップ限定なので、メインステップでの疲労ではコアは増えない ===")
scenario({
    name: "morph-core-main-step",
    start: { me: { spirits: [{ card: MORPH, label: "モルフォ" }], hand: [QUICK] }, opp: { spirits: [{ card: ROK, label: "標的" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("標的") })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 8", "自分.トラッシュのコア: 0 → 2", `自分.手札: ${names([QUICK])} → なし`, `自分.トラッシュ: なし → ${names([QUICK])}`,
        "相手.標的.疲労: false → true",
    ],
})

console.log("=== 024 Lv2：【合体時】合体アタック時に相手のスピリット1体を疲労させる（024のコア+1つき。Lv1 は【合体時】Lv2 なので疲労させない） ===")
// 日輪丸：024 の緑1つで軽減 → コスト3（合体召喚は維持コアなし）
function morphCombined(name: string, cores: number, bp: [number, number], rests: boolean): void {
    scenario({
        name,
        start: { me: { spirits: [{ card: MORPH, label: "モルフォ", cores }], hand: [BRAVE] }, opp: { spirits: [{ card: ROK, label: "標的" }] } },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("モルフォ") })
            settle(t)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("モルフォ") })
            settle(t)
        },
        expect: [
            `自分.リザーブ: 10 → ${rests ? 8 : 7}`, "自分.トラッシュのコア: 0 → 3", `自分.手札: ${names([BRAVE])} → なし`,
            "自分.モルフォ.疲労: false → true", `自分.モルフォ.BP: ${bp[0]} → ${bp[1]}`,
            ...braved("翡翠の小太刀 日輪丸"),
            ...(rests ? ["相手.標的.疲労: false → true"] : []),
        ],
    })
}
morphCombined("morph-lv2-combined-rest", 4, [6000, 9000], true)
morphCombined("morph-lv1-combined-no-rest", 1, [3000, 6000], false)

console.log("=== 059 ハンミョール：合体アタック時にコアを好きなだけトラッシュへ（1個につきBP+3000）。【連鎖】青：コスト2以下を破壊 ===")
function pickNumber(t: ScenarioCtx, n: number): void {
    // 「好きなだけ」の前に「発動する」の確認が出るので、数の選択肢が出るまで確認に答える
    for (let i = 0; i < 3; i++) {
        const pc = t.state.pendingChoice as unknown as { pid: string; options?: string[] } | null
        if (!pc) return
        const opts = pc.options ?? []
        const side = pc.pid === t.me ? "me" : "opp"
        const hit = opts.find((o) => o.replace(/\D/g, "") === String(n))
        if (hit !== undefined) {
            t.act(side, { type: "resolveChoice", option: hit })
            return
        }
        if (opts.length === 0) throw new Error("数を選ぶ選択肢が見つからない")
        t.act(side, { type: "resolveChoice", option: opts[0]! })
    }
    throw new Error("数を選ぶ選択肢が見つからない")
}
// 青シンボルあり：軽減2 → コスト1。なし：軽減1 → コスト2。置いた分のコアもトラッシュのコアに数える
function hammy(name: string, o: { blue: boolean; place: number; soul?: boolean }): void {
    const cost = o.blue ? 1 : 2
    const lvAfter = o.place >= 2 ? 1 : 2
    const bpAfter = (lvAfter === 1 ? 6000 : 8000) + 3000 + 3000 * o.place
    scenario({
        name,
        start: {
            interactive: true,
            me: {
                spirits: [{ card: MATANGO, label: "マタンゴル", cores: 3 }, ...(o.blue ? [{ card: BLU, label: "青味方" }] : [])],
                hand: [HAMMY],
                ...(o.soul ? { soulCore: "マタンゴル" } : {}),
            },
            opp: { spirits: [{ card: ROK, label: "標的" }] },
        },
        steps(t) {
            t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("マタンゴル") })
            settle(t)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id("マタンゴル") })
            pickNumber(t, o.place)
            settle(t)
        },
        expect: [
            `自分.リザーブ: 10 → ${10 - cost}`, `自分.トラッシュのコア: 0 → ${cost + o.place}`, `自分.手札: ${names([HAMMY])} → なし`,
            "自分.マタンゴル.疲労: false → true", `自分.マタンゴル.BP: 8000 → ${bpAfter}`,
            ...(o.place ? [`自分.マタンゴル.コア: 3 → ${3 - o.place}`] : []),
            ...(lvAfter === 1 ? ["自分.マタンゴル.Lv: 2 → 1"] : []),
            ...braved("ハンミョール"),
            ...(o.blue ? ["相手.標的.場所: フィールド → なし", `相手.トラッシュ: なし → ${names([ROK])}`, "相手.リザーブ: 10 → 11"] : []),
        ],
    })
}
hammy("hammy-place2-blue", { blue: true, place: 2 })
console.log("=== 059：コアを1個も置かなくても【連鎖】は出る（Q20347） ===")
hammy("hammy-place0-blue", { blue: true, place: 0 })
console.log("=== 059：青シンボルが無ければ【連鎖】は出ない ===")
hammy("hammy-place2-no-blue", { blue: false, place: 2 })
console.log("=== 059：ソウルコアありの場面（置くのは自分の効果。ソウルコアを残して2個をトラッシュへ置く） ===")
hammy("hammy-place2-soul-core", { blue: true, place: 2, soul: true })

console.log("=== 060 日輪丸：合体アタック時、相手はバーストを発動できず、このスピリットが持つ【分身】（JU）を発揮させる ===")
// 日輪丸：JU の緑1つで軽減1 → コスト3。10-3-1(分身)=6。シンボルはJU+日輪丸の2つでライフ-2
scenario({
    name: "brave060-combined-attack",
    start: { me: { spirits: [{ card: JU, label: "JU" }], hand: [BRAVE] }, opp: { reserve: 0, burst: BURST } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("JU") })
        settle(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("JU") })
        settle(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 3", `自分.手札: ${names([BRAVE])} → なし`, "自分.デッキ枚数: 40 → 39",
        "自分.JU.疲労: false → true", "自分.JU.BP: 3000 → 6000",
        ...braved("翡翠の小太刀 日輪丸"),
        ...bunshin(1, 1),
        "相手.ライフ: 5 → 3", "相手.リザーブ: 0 → 2",
    ],
})

console.log("=== 060：合体していなければバーストを止められない（JU 単独のアタックでバーストが発動し、JU が破壊される） ===")
scenario({
    name: "brave060-not-combined-burst-fires",
    start: { me: { spirits: [{ card: JU, label: "JU" }] }, opp: { reserve: 0, burst: BURST } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("JU") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        settle(t, "yes")
    },
    expect: [
        "相手.ライフ: 5 → 4", "相手.リザーブ: 0 → 1", "相手.バースト: 三札之術 → なし", `相手.トラッシュ: なし → ${names([BURST])}`,
        "自分.JU.場所: フィールド → なし", `自分.トラッシュ: なし → ${names([JU])}`, "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== 069 蟲招く妖花の塔：コスト7以下の相手のスピリットのアタックで自分のライフが減ったとき、ボイドからコア2個をリザーブへ ===")
// シンボル2つのアタックでライフ-2でも、置くのは2個だけ（Q22545）。リザーブ 10+2(ライフのコア)+2 = 14
scenario({
    name: "tower-life-lost-two-symbols",
    start: { turn: "opp", me: { nexuses: [{ card: TOWER, label: "塔", cores: 0 }] }, opp: { spirits: [{ card: TARAN, label: "攻撃役" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    expect: ["自分.ライフ: 5 → 3", "自分.リザーブ: 10 → 14", "相手.攻撃役.疲労: false → true"],
})

console.log("=== 069：コスト8のスピリットのアタックでは増えない ===")
scenario({
    name: "tower-cost8-attacker",
    start: { turn: "opp", me: { nexuses: [{ card: TOWER, label: "塔", cores: 0 }] }, opp: { spirits: [{ card: GIGA, label: "攻撃役" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        settle(t)
    },
    expect: ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.攻撃役.疲労: false → true"],
})

console.log("=== 069 Lv2：【神速】を持つ自分のスピリットが相手に破壊されたとき、疲労させて破壊されたスピリットを手札へ戻し、相手のスピリット1体を疲労させる ===")
// 破壊で戻ったバッタのコア1個がリザーブへ。手札へ戻るのでトラッシュには残らない
function towerShinsoku(name: string, o: { cores: number; blocker: string; fires: boolean }): void {
    const blockerName = getCard(o.blocker).name
    scenario({
        name,
        start: {
            turn: "opp",
            me: { nexuses: [{ card: TOWER, label: "塔", cores: o.cores }], spirits: [{ card: o.blocker, label: "壁", cores: 1 }] },
            opp: { spirits: [{ card: SHOCK, label: "攻撃役" }, { card: ROK, label: "標的" }] },
        },
        steps(t) {
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
            t.closeFlash()
            t.act("me", { type: "block", instanceId: t.id("壁") })
            t.closeFlash()
            settle(t, "yes", [t.id("標的")])
        },
        expect: [
            "自分.壁.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "相手.攻撃役.疲労: false → true",
            ...(o.fires
                ? ["自分.塔.疲労: false → true", `自分.手札: なし → ${names([o.blocker])}`, "相手.標的.疲労: false → true"]
                : [`自分.トラッシュ: なし → ${blockerName}`]),
        ],
    })
}
towerShinsoku("tower-lv2-shinsoku-destroyed", { cores: 2, blocker: BATTA, fires: true })
console.log("=== 069：【神速】を持たないスピリットが破壊されても、Lv1 のネクサスでも発動しない ===")
towerShinsoku("tower-lv2-not-shinsoku", { cores: 2, blocker: ROK, fires: false })
towerShinsoku("tower-lv1-shinsoku", { cores: 0, blocker: BATTA, fires: false })

console.log("=== 078 グラスバインド：BP8000以下の相手のスピリット2体を疲労させる（BP9000は対象外） ===")
scenario({
    name: "grass-two-targets",
    start: {
        me: { hand: [GRASS] },
        opp: { spirits: [{ card: ROK, label: "A" }, { card: ROK, label: "B" }, { card: BAG, label: "大型", cores: 5 }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${names([GRASS])} → なし`, `自分.トラッシュ: なし → ${names([GRASS])}`,
        "相手.A.疲労: false → true", "相手.B.疲労: false → true",
    ],
})

console.log("=== 078：対象が1体しかいなければ1体だけ疲労させる ===")
scenario({
    name: "grass-one-target",
    start: { me: { hand: [GRASS] }, opp: { spirits: [{ card: ROK, label: "A" }, { card: BAG, label: "大型", cores: 5 }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        settle(t)
    },
    expect: [
        "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5", `自分.手札: ${names([GRASS])} → なし`, `自分.トラッシュ: なし → ${names([GRASS])}`,
        "相手.A.疲労: false → true",
    ],
})

void arrive
console.log("すべてのチェックに合格しました 🎉（part859）")
