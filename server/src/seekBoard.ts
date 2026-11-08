// 対戦募集（シーク）掲示板。統合ロビー設計メモ Phase 1 の実装。
//
// ランダムマッチの待機列（MatchQueue）が「先に待っていた2人を自動で当てる」のに対し、
// こちらは「募集を一覧に残し、来た人が選んで取る」ための受け皿。両者は対立する仕組み
// ではなく、同じ待機者プールの見せ方の違いとして index.ts 側で連携させる
// （募集の claim は待機列の成立と同じ経路でルームを作る）。
//
// **Phase 1 の範囲**: 永続化はしない。投稿者が接続している間だけ有効で、
// 切断したら募集は消える（オンライン限定）。アプリを閉じても残る募集と
// プッシュでの呼び戻しは Phase 2 で SeekStore を外部化してから扱う。
import { randomUUID } from "node:crypto"
import type { DeckSpec } from "./type"

export interface SeekEntry {
    seekId: string
    socketId: string
    name: string
    deck: DeckSpec
    // 掲示板の表示用ラベル（レシピ名 or「カスタムデッキ」）。デッキの中身は公開しない
    deckLabel: string
    createdAt: number
    expiresAt: number
}

// 掲示板に載せてよい形（socketId とデッキの中身は出さない）
export interface SeekView {
    seekId: string
    name: string
    deckLabel: string
    createdAt: number
    expiresAt: number
}

export class SeekBoard {
    private seeks = new Map<string, SeekEntry>()

    get size(): number {
        return this.seeks.size
    }

    has(socketId: string): boolean {
        return this.bySocket(socketId) !== null
    }

    bySocket(socketId: string): SeekEntry | null {
        for (const seek of this.seeks.values()) {
            if (seek.socketId === socketId) return seek
        }
        return null
    }

    get(seekId: string): SeekEntry | null {
        return this.seeks.get(seekId) ?? null
    }

    // 募集を出す。同じ socket が既に出していれば差し替える（有効な募集は1人1件まで）
    post(entry: Omit<SeekEntry, "seekId" | "createdAt" | "expiresAt"> & { ttlMs: number }): SeekEntry {
        const old = this.bySocket(entry.socketId)
        if (old) this.seeks.delete(old.seekId)
        const now = Date.now()
        const seek: SeekEntry = {
            seekId: `seek-${randomUUID().slice(0, 8)}`,
            socketId: entry.socketId,
            name: entry.name,
            deck: entry.deck,
            deckLabel: entry.deckLabel,
            createdAt: now,
            expiresAt: now + entry.ttlMs,
        }
        this.seeks.set(seek.seekId, seek)
        return seek
    }

    // 募集を取り下げる。取り下げたエントリを返す（無ければ null）
    remove(seekId: string): SeekEntry | null {
        const seek = this.seeks.get(seekId) ?? null
        if (seek) this.seeks.delete(seekId)
        return seek
    }

    removeBySocket(socketId: string): SeekEntry | null {
        const seek = this.bySocket(socketId)
        if (!seek) return null
        this.seeks.delete(seek.seekId)
        return seek
    }

    // 期限切れの募集を掃除し、掃除した分を返す（呼び出し側が投稿者へ通知する）
    expire(now: number): SeekEntry[] {
        const expired: SeekEntry[] = []
        for (const seek of this.seeks.values()) {
            if (seek.expiresAt <= now) expired.push(seek)
        }
        for (const seek of expired) this.seeks.delete(seek.seekId)
        return expired
    }

    // 掲示板表示用の一覧（古い募集から）
    list(): SeekView[] {
        return [...this.seeks.values()]
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((seek) => ({
                seekId: seek.seekId,
                name: seek.name,
                deckLabel: seek.deckLabel,
                createdAt: seek.createdAt,
                expiresAt: seek.expiresAt,
            }))
    }
}
