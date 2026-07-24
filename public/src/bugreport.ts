function initBugReport() {
    const form = document.getElementById("bug-report-form") as HTMLFormElement
    const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement
    const resultDiv = document.getElementById("report-result") as HTMLDivElement

    if (!form || !submitBtn || !resultDiv) return

    form.addEventListener("submit", async (e) => {
        e.preventDefault()

        const category = (document.getElementById("category") as HTMLSelectElement).value
        const summary = (document.getElementById("summary") as HTMLInputElement).value
        const detail = (document.getElementById("detail") as HTMLTextAreaElement).value
        const contact = (document.getElementById("contact") as HTMLInputElement).value

        submitBtn.disabled = true
        submitBtn.textContent = "送信中..."
        resultDiv.className = ""
        resultDiv.style.display = "none"

        try {
            const response = await fetch("/api/bug-report", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ category, summary, detail, contact }),
            })

            const data = await response.json()

            if (response.ok && data.ok) {
                resultDiv.className = "success"
                resultDiv.textContent = "報告ありがとうございました！内容を確認させていただきます。"
                form.reset()
            } else {
                resultDiv.className = "error"
                resultDiv.textContent = data.error || "送信に失敗しました。"
            }
        } catch (err) {
            resultDiv.className = "error"
            resultDiv.textContent = "通信エラーが発生しました。"
        } finally {
            submitBtn.disabled = false
            submitBtn.textContent = "送信する"
            resultDiv.style.display = "block"
        }
    })
}

document.addEventListener("DOMContentLoaded", initBugReport)
