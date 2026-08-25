// smoke パート237（ブレイヴ 段階1：型と置き場。docs/design/BRAVE.md §9）
//
// ブレイヴのカードはプールに1枚も無い（BS10以降が未取り込み）ため、
// 段階1で検証できるのは「器」と「発生源種別の扱い」の2点だけ。
//
// ⚠️ ここで押さえたい一般則（2026-08-25 ユーザー確認。BRAVE.md §12）:
//   **ブレイヴ自身の効果は【装甲】では防げない**。【装甲：色】の効果文は
//   「指定された色の相手の**スピリット/ネクサス/マジック**の効果を受けない」で、
//   ブレイヴを列挙していない（防ぐのは【重装甲】。プールに入ったら実装する）。
//   一方、合体中にブレイヴがホストへ付与している効果は発生源が
//   **合体スピリット＝"spirit"** で来るので、そちらは装甲で防がれる。
import { assert, createGame, createInstance, getCard } from "./helpers"
import { boardResistanceAgainst } from "../../shared/rules"
import type { CardType } from "../../server/src/type"

console.log("=== §A field.combinedBraves（合体中ブレイヴの置き場）が初期化されている ===")
{
    const s = createGame("brave-stage1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    for (const pid of ["p1", "p2"] as const) {
        assert(Array.isArray(s.players[pid].field.combinedBraves), `${pid} の combinedBraves が配列`)
        assert(s.players[pid].field.combinedBraves.length === 0, `${pid} の combinedBraves は空で始まる`)
    }
}

console.log("=== §B ブレイヴの効果は【装甲】では防げない（スピリット/ネクサス/マジックは防ぐ） ===")
{
    const s = createGame("brave-armor", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    // ラタトスカ（BS03-037）は【装甲：赤】。part58 と同じ個体を使う
    const armored = createInstance("BS03-037", 1, 1)
    assert(getCard("BS03-037").name === "アクア・ラタトスカ" || getCard("BS03-037").effect.includes("装甲"),
        "テスト前提: BS03-037 は【装甲：赤】を持つ")
    s.players.p1.field.spirits.push(armored)

    const attempt = (sourceType: CardType) =>
        boardResistanceAgainst(s, "p1", armored, {
            op: "destroy" as const,
            scope: "targeted" as const,
            actorPid: "p2" as const,
            sourceType,
            sourceColors: ["red" as const],
        })

    for (const t of ["spirit", "nexus", "magic"] as const) {
        const r = attempt(t)
        assert(r !== null && r.category === "armor", `相手の赤の${t}の効果は装甲で防がれる`)
    }
    assert(attempt("brave") === null, "相手の赤の**ブレイヴ**の効果は装甲では防げない（【重装甲】の領分）")

    // 合体中にホストへ付与された効果は "spirit" として来るので、上の spirit 行がそのまま根拠になる。
    // 発生源の色が装甲色を含まなければ、種別によらず防がれない
    const other = boardResistanceAgainst(s, "p1", armored, {
        op: "destroy", scope: "targeted", actorPid: "p2", sourceType: "spirit", sourceColors: ["blue"],
    })
    assert(other === null, "装甲色と違う色の発生源は種別によらず防げない")
}
