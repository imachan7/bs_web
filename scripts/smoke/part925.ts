// smoke パート925（席に戻る：接続が切れても、同じ端末の合言葉 playerRef で決着前の対局の席に戻れる。server/src/roomManager.ts）
import { assert, createGame } from "./helpers"
import { RoomManager } from "../../server/src/roomManager"

const REF_A = "ref-aaaaaaaaaaaaaaaa"
const REF_B = "ref-bbbbbbbbbbbbbbbb"

function started(): { rooms: RoomManager; roomId: string } {
    const rooms = new RoomManager()
    rooms.join("r", "s1", "アキラ", "sd01_blazing", REF_A)
    const joined = rooms.join("r", "s2", "ユウキ", "sd01_blazing", REF_B)
    assert("room" in joined, "2人目が座れる")
    if ("room" in joined) joined.room.game = createGame("r", { p1: "アキラ", p2: "ユウキ" }, { p1: "sd01_blazing", p2: "sd01_blazing" })
    return { rooms, roomId: "r" }
}

console.log("=== 1. 決着前の対局は、片方が切れても両方が切れても残り、同じ playerRef で席に戻れる ===")
{
    const { rooms, roomId } = started()
    rooms.leave("s1")
    assert(rooms.getRoom(roomId)?.players.p1?.connected === false, "切れた席は未接続になる")
    rooms.leave("s2")
    assert(rooms.getRoom(roomId) !== null, "両方が切れても対局は残る")
    const back = rooms.resume(REF_A, "s1-new")
    assert(back?.playerId === "p1" && back.replaced === null, "同じ playerRef なら元の席（p1）に戻る")
    assert(rooms.findBySocket("s1-new")?.playerId === "p1" && rooms.findBySocket("s1") === null, "席は新しい接続で引ける")
    assert(rooms.resume("ref-cccccccccccccccc", "s3") === null, "別の端末は席に座れない")
}

console.log("=== 2. 前の接続が生きて見えていても置き換える（前の接続を返す） ===")
{
    const { rooms } = started()
    const back = rooms.resume(REF_B, "s2-new")
    assert(back?.playerId === "p2" && back.replaced === "s2", "置き換えられた前の接続が返る")
    assert(rooms.leave("s2") === null, "前の接続の切断は、座り直した席に影響しない")
    assert(rooms.findBySocket("s2-new")?.room.players.p2?.connected === true, "座り直した席は接続中のまま")
}

console.log("=== 3. 決着後・開始前の部屋は従来どおり、全員が切れたら消える。戻れない ===")
{
    const { rooms, roomId } = started()
    rooms.getRoom(roomId)!.game!.winner = "p1"
    assert(rooms.resume(REF_A, "x") === null, "決着した対局には戻らない")
    rooms.leave("s1")
    rooms.leave("s2")
    assert(rooms.getRoom(roomId) === null, "決着後は全員が切れたら消える")

    const waiting = new RoomManager()
    waiting.join("w", "s1", "アキラ", "sd01_blazing", REF_A)
    waiting.leave("s1")
    assert(waiting.getRoom("w") === null, "相手待ちの部屋は切れたら消える")
}

console.log("=== 4. 全員が切れたまま猶予を過ぎた対局だけ片付ける ===")
{
    const { rooms, roomId } = started()
    rooms.leave("s1")
    const now = Date.now()
    rooms.sweepAbandoned(now + 60 * 60 * 1000, 15 * 60 * 1000)
    assert(rooms.getRoom(roomId) !== null, "片方が接続中なら、時間が経っても消さない")
    rooms.leave("s2")
    rooms.sweepAbandoned(now + 60 * 1000, 15 * 60 * 1000)
    assert(rooms.getRoom(roomId) !== null, "猶予の内は残る")
    rooms.sweepAbandoned(now + 16 * 60 * 1000, 15 * 60 * 1000)
    assert(rooms.getRoom(roomId) === null, "猶予を過ぎたら消える")
}

console.log("すべてのチェックに合格しました 🎉（part925）")
