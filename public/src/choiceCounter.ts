// トグル選択の「選んだ量／上限」表示。上限ちょうどで見た目を変えるのは、これ以上選べないと一目で分かるようにするため
export function choiceCounterView(c: { label: string; current: number; max: number }): { text: string; full: boolean } {
    return { text: `${c.label}　${c.current}／${c.max}`, full: c.current >= c.max }
}
