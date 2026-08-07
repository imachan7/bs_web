// smoke パート114（コストを支払わない召喚でも【転召】は必ず行う）
//
// 公式Q&A（2024-10-31）:
//   「BS02-096 ディバインウィンドを使って【転召】を持つスピリットを召喚する場合、
//     召喚コストを支払わなくてもよいから【転召】も無視して召喚できる？」
//   →「いいえ、できません。コストを支払わずに召喚した場合でも、【転召】はしなければいけません。」
//
// したがって「この効果で召喚されたスピリットの『召喚時』効果は発揮されない」という記載は
// **転召を免除しない**。転召を免除するのは「【転召】を発揮したものとして」と明記された
// BS05-069 トランスマイグレーションだけ（そちらの検証は part113）。
//
// 検証する経路:
//   - summonFromHandFree（老賢樹トレントン／ディバインウィンド／天使長ソフィア 等）
//   - summonFromTrashFree（妖狐キュービック）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { hasKeyword } from "../../shared/rules"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS02-034").name === "老賢樹トレントン", "BS02-034 は老賢樹トレントン")
    assert(getCard("BS05-004").name === "妖狐キュービック", "BS05-004 は妖狐キュービック")
    assert(getCard("BS04-031").name === "陸帝フォン・ダシオン", "BS04-031 は陸帝フォン・ダシオン")
    assert(getCard("BS04-031").colors.includes("green"), "陸帝フォン・ダシオンは緑（トレントンの対象）")
    assert(hasKeyword("BS04-031", "tensho"), "陸帝フォン・ダシオンは【転召】を持つ")
    assert(getCard("BS04-020").name === "闇帝オプス・キュリテ", "BS04-020 は闇帝オプス・キュリテ")
    assert(getCard("BS04-020").colors.includes("purple") && getCard("BS04-020").cost === 6, "闇帝は紫コスト6（キュービックの対象）")
    assert(hasKeyword("BS04-020", "tensho"), "闇帝オプス・キュリテは【転召】を持つ")
}

console.log("=== summonFromHandFree（トレントン型）：無償召喚でも【転召】を行う ===")
{
    const s = createGame("free-summon-tensho-hand", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    const src = putSpirit(s, "p1", "BS01-050", 1)
    // 転召の対象になれる自分のスピリット（コスト5以上・コア3個）
    const victim = putSpirit(s, "p1", "BS04-031", 3) // 陸帝フォン・ダシオン（コスト6）
    s.players.p1.hand = ["BS04-031"] // 手札の緑スピリット＝転召持ち
    const trashCoresBefore = s.players.p1.trashCores
    resolveAction(s, "p1", src, { type: "summonFromHandFree", colorFilter: "green" })
    assert(s.players.p1.field.spirits.length >= 1, "召喚された")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === victim.instanceId),
        "【転召】でコアをすべて失った対象は維持コア割れで消滅する",
    )
    assert(
        s.players.p1.trashCores === trashCoresBefore + 3,
        `転召で移したコア3個がトラッシュへ（実際+${s.players.p1.trashCores - trashCoresBefore}）`,
    )
}

console.log("=== summonFromHandFree：転召の対象がいなければ不発（召喚自体は成立する） ===")
{
    const s = createGame("free-summon-tensho-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    const src = putSpirit(s, "p1", "BS01-050", 1) // コスト0＝転召（コスト5以上）の対象にならない
    s.players.p1.hand = ["BS04-031"]
    resolveAction(s, "p1", src, { type: "summonFromHandFree", colorFilter: "green" })
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === "BS04-031"),
        "対象がいなくても召喚自体は成立する",
    )
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === src.instanceId),
        "コスト条件を満たさないスピリットは転召の対象にならない",
    )
}

console.log("=== summonFromTrashFree（妖狐キュービック）：無償召喚でも【転召】を行う ===")
{
    const s = createGame("free-summon-tensho-trash", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    const src = putSpirit(s, "p1", "BS01-050", 1)
    const victim = putSpirit(s, "p1", "BS04-020", 3) // 闇帝オプス・キュリテ（コスト6）
    s.players.p1.trashCards = ["BS04-020"]
    const trashCoresBefore = s.players.p1.trashCores
    resolveAction(s, "p1", src, {
        type: "summonFromTrashFree",
        colorFilter: "purple",
        costFilter: { min: 5, max: 7 },
    })
    assert(
        s.players.p1.field.spirits.filter((x) => x.cardId === "BS04-020").length >= 1,
        "トラッシュから召喚された",
    )
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === victim.instanceId),
        "【転召】でコアをすべて失った対象は消滅する",
    )
    assert(
        s.players.p1.trashCores === trashCoresBefore + 3,
        `転召で移したコア3個がトラッシュへ（実際+${s.players.p1.trashCores - trashCoresBefore}）`,
    )
}

console.log("=== 転召を持たないスピリットの無償召喚では何も起きない ===")
{
    const s = createGame("free-summon-notensho", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    const src = putSpirit(s, "p1", "BS01-050", 1)
    const bystander = putSpirit(s, "p1", "BS04-031", 3) // コスト6だが転召を撃つ側ではない
    s.players.p1.hand = ["BS01-051"] // フライングミラージュ（緑・転召なし）
    resolveAction(s, "p1", src, { type: "summonFromHandFree", colorFilter: "green" })
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === bystander.instanceId),
        "転召を持たないスピリットの召喚では誰も犠牲にならない",
    )
    assert(bystander.cores === 3, "コアも減らない")
}
