// smoke パート227（維持コアを下回るコアの取り除きを、承知のうえなら通す。2026-08-23 ユーザー要望）
//
// これまで「-」ボタンは維持コア（Lv1）を下回るとサーバーが拒否していた。
// そのため、コアがスピリットに乗り切っているとリザーブへ引き上げる手段が無く、
// 召喚コストや他のスピリットへ回せなかった。
// クライアントが確認を取ったうえで confirmDeplete を立てて送ると、取り除きを通し、
// 維持コアを下回ったスピリットは消滅する（残りのコアはリザーブへ戻る）。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SCOUT = "BS01-004" // ドラグノ偵察兵：Lv1=1コア / Lv2=2コア
const GORADON = "BS01-001" // ゴラドン：Lv1=1コア / Lv2=3コア

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// 自分のメインステップ（コア移動ができるタイミング）で始める
function setup(name: string): GameState {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 0
    return s
}

console.log("=== 従来どおり：確認なしでは維持コアを下回る取り除きを拒否する ===")
{
    const s = setup("core-remove-refused")
    const id = putSpirit(s, "p1", SCOUT, 1) // Lv1（1コア）ちょうど
    const err = act(s, "p1", { type: "moveCore", instanceId: id, direction: "remove" })
    assert(
        err === "維持コア（Lv1）を下回るためコアを取り除けません",
        `拒否される（実際は${err}）`,
    )
    assert(s.players.p1.field.spirits.length === 1, "スピリットは残っている")
    assert(s.players.p1.reserve === 0, "リザーブは増えていない")
}

console.log("=== 承知のうえなら取り除けて、そのスピリットは消滅する ===")
{
    const s = setup("core-remove-confirmed")
    const id = putSpirit(s, "p1", SCOUT, 1)
    assert(
        act(s, "p1", { type: "moveCore", instanceId: id, direction: "remove", confirmDeplete: true }) === null,
        "confirmDeplete なら通る",
    )
    assert(s.players.p1.field.spirits.length === 0, "維持コアを下回ったので消滅した")
    assert(s.players.p1.reserve === 1, `取り除いたコアがリザーブへ戻る（実際は${s.players.p1.reserve}）`)
    assert(s.players.p1.trashCards.includes(SCOUT), "消滅したスピリットはトラッシュへ")
}

console.log("=== 残っていたコアもまとめてリザーブへ戻る ===")
{
    const s = setup("core-remove-multi")
    // ゴラドンをLv2（3コア）で置く。1個取り除くと2個になりLv2を割るが、Lv1（1コア）は満たすので消滅しない
    const id = putSpirit(s, "p1", GORADON, 3)
    assert(act(s, "p1", { type: "moveCore", instanceId: id, direction: "remove" }) === null, "Lv2→Lv1は確認なしで通る")
    assert(s.players.p1.field.spirits.length === 1, "Lv1を満たすので消滅しない")
    assert(s.players.p1.reserve === 1, "1個だけリザーブへ")

    // ここから2個残り。confirmDeplete で1個取り除くと1個になり…Lv1(1コア)は満たすのでまだ消えない
    assert(act(s, "p1", { type: "moveCore", instanceId: id, direction: "remove" }) === null, "もう1個も通る")
    assert(s.players.p1.field.spirits.length === 1, "コア1個でLv1を満たすので消滅しない")
    assert(s.players.p1.reserve === 2, "リザーブは2個")

    // 最後の1個は維持コア割れになる
    assert(
        act(s, "p1", { type: "moveCore", instanceId: id, direction: "remove", confirmDeplete: true }) === null,
        "最後の1個は confirmDeplete で通る",
    )
    assert(s.players.p1.field.spirits.length === 0, "消滅した")
    assert(s.players.p1.reserve === 3, `コアはすべてリザーブへ（実際は${s.players.p1.reserve}）`)
}

console.log("=== コアが0のスピリットには効かない（従来どおり） ===")
{
    const s = setup("core-remove-empty")
    const id = putSpirit(s, "p1", SCOUT, 0)
    const err = act(s, "p1", { type: "moveCore", instanceId: id, direction: "remove", confirmDeplete: true })
    assert(err === "コアが置かれていません", `取り除くコアが無い（実際は${err}）`)
}

console.log("=== ネクサスは従来どおり0まで戻せる（確認は要らない） ===")
{
    const s = setup("core-remove-nexus")
    const nexus = createInstance("BS01-098", s.turn, 1) // 燃えさかる戦場（ネクサス。Lv1は0コア）
    s.players.p1.field.nexuses.push(nexus)
    assert(
        act(s, "p1", { type: "moveCore", instanceId: nexus.instanceId, direction: "remove" }) === null,
        "ネクサスは確認なしで0まで戻せる",
    )
    assert(s.players.p1.field.nexuses.length === 1, "ネクサスは消滅しない")
    assert(s.players.p1.reserve === 1, "コアはリザーブへ")
}
