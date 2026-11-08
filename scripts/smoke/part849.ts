// smoke パート849（BS23-047 ミゴー：スタートステップのバースト確認・異合の大型スピリットの軽減をすべて満たす）
// 公式Q&A Q4565（見たら戻す）・Q4566（召喚するカードを提示した後）（docs/design/BS23_PLAN.md §1）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const MIGO = "BS23-047" // ミゴー（青・コスト2・異合・Lv2 コア2）
const LUXION = "BS21-X06" // 異海神ディスト・ルクシオン（異合・コスト8・軽減青4）
const HYDRAS = "BS04-074" // 異合竜ハイドラス（異合・コスト7）
const YAMATA = "BS16-X06" // 霊峰魔龍ヤマタノヒドラ（異合でない・コスト8）
const BURST = "BS17-078" // ウォークライ（相手がセットするバースト）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MIGO).name === "ミゴー" && getCard(MIGO).family.includes("異合"), "MIGO")
    assert(getCard(LUXION).name === "異海神ディスト・ルクシオン" && getCard(LUXION).cost === 8 && getCard(LUXION).family.includes("異合"), "LUXION")
    assert(getCard(HYDRAS).name === "異合竜ハイドラス" && getCard(HYDRAS).cost === 7 && getCard(HYDRAS).family.includes("異合"), "HYDRAS")
    assert(getCard(YAMATA).name === "霊峰魔龍ヤマタノヒドラ" && getCard(YAMATA).cost === 8 && !getCard(YAMATA).family.includes("異合"), "YAMATA")
    assert(getCard(BURST).name === "ウォークライ" && getCard(VANILLA).name === "ロクケラトプス", "BURST / VANILLA")
}

// 自分のターン終了→相手のターン→相手が終了→自分のスタートステップ。通常のターン進行で変わる分
const TURN_FLOW = [
    "自分.デッキ枚数: 40 → 39", "自分.リザーブ: 10 → 11", "自分.手札: なし → ロクケラトプス",
    "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス",
]

const pending = (t: ScenarioCtx) => t.state.pendingChoice
function toMyStartStep(t: ScenarioCtx): void {
    t.act("me", { type: "endTurn" })
    assert(pending(t) === null, "相手のスタートステップでは自分のミゴーは何も聞かない")
    t.act("opp", { type: "endTurn" })
}
// 「〜できる」は確認を出す（SEMANTICS_AUDIT §3.2）。承認は確認の選択肢の先頭、断るのは無指定の resolveChoice
function answer(t: ScenarioCtx, accept: boolean): void {
    const pc = pending(t)
    assert(pc !== null && pc.pid === t.me, "自分のスタートステップにミゴーの確認が出る")
    if (pc === null) return
    t.act("me", accept ? { type: "resolveChoice", option: pc.options?.[0] ?? "" } : { type: "resolveChoice" })
    assert(pending(t) === null, "確認に答えたあとは選択待ちが残らない")
}

console.log("=== 1. Lv1：スタートステップで相手のバーストを見られる（見たら戻す＝盤面は変わらない） ===")
scenario({
    name: "migo-look-lv1",
    start: { me: { spirits: [{ card: MIGO, cores: 1 }] }, opp: { burst: BURST } },
    steps: (t) => {
        toMyStartStep(t)
        answer(t, true)
    },
    expect: TURN_FLOW,
})

console.log("=== 2. Lv2：見ないと答えても何も変わらない ===")
scenario({
    name: "migo-look-decline",
    start: { me: { spirits: [{ card: MIGO, cores: 2 }] }, opp: { burst: BURST } },
    steps: (t) => {
        toMyStartStep(t)
        answer(t, false)
    },
    expect: TURN_FLOW,
})

console.log("=== 3. 相手のバーストがセットされていなければ何も起きない ===")
scenario({
    name: "migo-look-noburst",
    start: { me: { spirits: [{ card: MIGO, cores: 2 }] } },
    steps: (t) => {
        toMyStartStep(t)
        assert(pending(t) === null, "見るバーストが無いので確認は出ない")
    },
    expect: TURN_FLOW,
})

console.log("=== 4. Lv2：ミゴーを破壊して、異合のコスト8以上の軽減をすべて満たす ===")
// ルクシオンの軽減は青4。通常はミゴーの青1つぶんしか軽減されないが、すべて満たした扱いで 8-4=4 を払う
// ミゴーのコア2個はリザーブへ戻る（破壊の通常処理）ので、リザーブは 12+2-4-1（維持コア）= 9
scenario({
    name: "migo-reduction-all",
    start: { me: { reserve: 12, hand: [LUXION, VANILLA], spirits: [{ card: MIGO, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, substituteInstanceId: t.id("ミゴー") }),
    expect: [
        "自分.ミゴー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ミゴー",
        "自分.手札: ロクケラトプス、異海神ディスト・ルクシオン → ロクケラトプス",
        "自分.リザーブ: 12 → 9",
        "自分.トラッシュのコア: 0 → 4",
        "自分.異海神ディスト・ルクシオン.場所: なし → フィールド",
        "自分.異海神ディスト・ルクシオン.疲労: なし → false",
        "自分.異海神ディスト・ルクシオン.コア: なし → 1",
        "自分.異海神ディスト・ルクシオン.Lv: なし → 1",
        "自分.異海神ディスト・ルクシオン.BP: なし → 6000",
    ],
})

console.log("=== 5. 使えない場面（Lv1／コスト7以下／異合でない） ===")
for (const [name, cores, card] of [["migo-reduction-lv1", 1, LUXION], ["migo-reduction-cost7", 2, HYDRAS], ["migo-reduction-notigou", 2, YAMATA]] as const) {
    scenario({
        name,
        start: { me: { reserve: 12, hand: [card], spirits: [{ card: MIGO, cores }] } },
        steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, substituteInstanceId: t.id("ミゴー") }),
        expect: [],
    })
}

console.log("すべてのチェックに合格しました 🎉（part849）")
