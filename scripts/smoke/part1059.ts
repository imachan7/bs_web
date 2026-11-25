// smoke パート1059（#708：何枚でも入れられるカードの上限。デッキビルダーとサーバーが同じ deckCopyLimit を使う）
import { assert, getCard, validateDeckCards } from "./helpers"
import { deckCopyLimit } from "../../shared/deckLimit"
import { validateImport } from "../../public/src/deck/logic/deckImport"

const MINIS = "CP13-01" // ミニーズ特攻隊（デッキに何枚でも入れられる）
const VANILLA = "BS01-002" // ロクケラトプス

assert(getCard(MINIS).name === "ミニーズ特攻隊", "CP13-01 はミニーズ特攻隊")
assert(getCard(VANILLA).name === "ロクケラトプス", "BS01-002 はロクケラトプス")

assert(deckCopyLimit(getCard(MINIS)) === Infinity, "ミニーズ特攻隊は何枚でも入れられる")
assert(deckCopyLimit(getCard(VANILLA)) === 3, "ふつうのカードは3枚まで")

const nameLimit = (name: string): number => (name === getCard(MINIS).name ? deckCopyLimit(getCard(MINIS)) : deckCopyLimit(getCard(VANILLA)))
const minis = validateImport({ name: "t", cards: { [MINIS]: 10 } }, getCard, nameLimit)
assert(minis.errors.length === 0, `デッキビルダーの読み込みで、ミニーズ特攻隊10枚が通る（${minis.errors.join("、")}）`)
const four = validateImport({ name: "t", cards: { [VANILLA]: 4 } }, getCard, nameLimit)
assert(four.errors.length === 1, "ふつうのカード4枚は読み込みで弾かれる")
assert(validateDeckCards({ [MINIS]: 40 }) === null, "サーバーの検証でもミニーズ特攻隊40枚が通る")

console.log("すべてのチェックに合格しました 🎉（part1059）")
