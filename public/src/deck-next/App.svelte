<script lang="ts">
    let count: number | null = $state(null)
    fetch("/api/cards")
        .then((r) => r.json())
        .then((cards: unknown[]) => (count = cards.length))
</script>

<p>{count === null ? "読み込み中" : `カード ${count} 枚を読み込みました`}</p>
