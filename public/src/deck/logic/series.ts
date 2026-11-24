// 弾（シリーズ）の判定と表示名

const SERIES_LABELS: Record<string, string> = {
    "BS01": "第一弾",
    "BS02": "激翔",
    "BS03": "覇闘",
    "BS04": "龍帝",
    "BS05": "皇騎",
    "BS06": "爆神",
    "BS07": "天醒",
    "BS08": "戦嵐",
    "BS09": "超星",
    "BS10": "八星龍降臨",
    "BS11": "灼熱の太陽",
    "BS12": "月の咆哮",
    "BS13": "星空の王者",
    "BS14": "英雄龍の伝説",
    "BS15": "黄金の大地",
    "BS16": "爆烈の覇道",
    "BS17": "剣舞う世界",
    "BS18": "覇王大決戦",
    "BS19": "聖剣時代",
    "BS20": "乱剣戦記",
    "BS21": "光輝剣武",
    "BS22": "暗黒刃翼",
    "BS23": "剣刃神話",
    "SD01": "構築済みデッキ",
    "SD02": "構築済みデッキ",
    "SD04": "構築済みデッキ",
}

// プロモ（P001・PX01・X003A 等）は「-」が無く番号まで cardId なので、数字より前を弾とする
export function seriesOf(cardId: string): string {
    return cardId.includes("-") ? cardId.split("-")[0]! : cardId.replace(/\d.*$/, "")
}

// 弾の絞り込み用の枠。P13・SJ12・X003A のように年代や末尾の英字で割れるものを頭の英字にまとめる（seriesOf と画像の置き場は変えない）
export function seriesGroupOf(cardId: string): string {
    const s = seriesOf(cardId)
    return /^(P|SJ|X|CP)\d/.exec(s)?.[1] ?? s
}

export const MERGED_SERIES_LABELS: Record<string, string> = { P: "プロモ（P）", SJ: "最強ジャンプ（SJ）", X: "その他", CP: "CP" }

export function seriesLabel(series: string): string {
    if (series === "P" || series === "PX" || series === "X") return "プロモ"
    return SERIES_LABELS[series] ?? ""
}
