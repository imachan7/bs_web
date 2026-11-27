// − ＋ を出しているタイル。プールとデッキ欄に同じカードが並ぶので、cardId だけでなく置き場も含めて持つ
export const selection = $state({ key: "" })

export function toggleSelection(key: string): void {
    selection.key = selection.key === key ? "" : key
}
