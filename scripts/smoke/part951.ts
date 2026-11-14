// smoke パート951（待機状態の印は CardInstance.waiting の1つだけ。読む側は shared/rules/waiting.ts を通す。PENDING_STATE.md §3）
import { execSync } from "node:child_process"
import { assert, createInstance } from "./helpers"
import { isReturnWaiting, isTrashWaiting, isVanishWaiting, isWaiting } from "../../shared/rules/waiting"

console.log("=== 待機の種類ごとの判定 ===")
{
    const inst = createInstance("BS01-002", 1, 1)
    assert(!isWaiting(inst) && !isTrashWaiting(inst) && !isReturnWaiting(inst), "通常：どれでもない")
    inst.waiting = { kind: "destroy" }
    assert(isWaiting(inst) && isTrashWaiting(inst) && !isVanishWaiting(inst) && !isReturnWaiting(inst), "破壊：トラッシュ行きの待機")
    inst.waiting = { kind: "vanish" }
    assert(isWaiting(inst) && isTrashWaiting(inst) && isVanishWaiting(inst) && !isReturnWaiting(inst), "消滅：トラッシュ行きの待機で、消滅でもある")
    inst.waiting = { kind: "return", to: "hand" }
    assert(isWaiting(inst) && !isTrashWaiting(inst) && isReturnWaiting(inst), "戻す：トラッシュ行きではない")
    assert(!isWaiting(undefined) && !isTrashWaiting(null), "個体が無ければ待機でない")
}

console.log("=== 旧い印の名前が残っていない ===")
{
    // 印を3つに分けて持っていた頃の名前。別々に読み書きすると、待機の種類ごとに扱いがばらける
    const hits = execSync("grep -rnwE 'pending(Destruction|Vanish|VanishByOpponent|Bounce)' server/src shared public/src || true", { encoding: "utf8" }).trim()
    assert(hits === "", `server・shared・public に旧い印の名前が無い${hits === "" ? "" : `\n${hits}`}`)
}

console.log("すべてのチェックに合格しました 🎉（part951）")
