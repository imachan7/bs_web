// 構築済みデッキ（/api/deck-recipes）。選択欄に並べるだけなので、読み込み完了まで空
export const recipes = $state<{ list: { key: string; label: string; cards: Record<string, number> }[] }>({ list: [] })

export async function loadRecipes(): Promise<void> {
    try {
        const res = await fetch("/api/deck-recipes")
        if (!res.ok) return
        const data = (await res.json()) as Record<string, { label: string; cards: Record<string, number> }>
        recipes.list = Object.entries(data).map(([key, v]) => ({ key, ...v }))
    } catch (e) {
        console.warn("deck-recipes の取得に失敗", e)
    }
}
