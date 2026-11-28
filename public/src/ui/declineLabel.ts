// 断るボタンの既定の文言。「発動しますか」型の確認（confirm）は、選択肢の動詞の打ち消しにする（「発動する」→「発動しない」、「戻す」→「戻さない」）。
// 「選ばない」だと何をしないのか分からなかった（2026-11-28 ユーザー合意）。
// ponytail: 「る」は一段動詞とみなす（今の確認の選択肢「置き換える」などはすべて当てはまる）。五段の「〜る」が来たら打ち消しを辞書で持つ
export function declineLabelOf(pc: { confirm?: boolean; options?: string[] } | null): string {
    const only = pc?.confirm && pc.options?.length === 1 ? pc.options[0]! : undefined
    if (only === undefined) return "選ばない"
    if (only.endsWith("する")) return only.slice(0, -2) + "しない"
    if (only.endsWith("す")) return only.slice(0, -1) + "さない"
    if (only.endsWith("る")) return only.slice(0, -1) + "ない"
    return "選ばない"
}
