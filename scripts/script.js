// code block line numbers
document.querySelectorAll("pre code[class*='language-']").forEach((block) => {
    block.parentElement.classList.add("line-numbers");
});

document.addEventListener("DOMContentLoaded", () => {
    if (!window.Prism) {
        console.error("Prism not loaded yet");
        return;
    }

    document
        .querySelectorAll("pre code[class*='language-']")
        .forEach((code) => {
            const pre = code.parentElement;

            // Prevent duplicates
            if (pre.querySelector(".code-header")) return;

            // Add line numbers if you still want them
            pre.classList.add("line-numbers");

            // Find language
            const langClass = Array.from(code.classList).find((c) =>
                c.startsWith("language-")
            );
            const lang = langClass
                ? langClass.replace("language-", "")
                : "text";

            // Header container
            const header = document.createElement("div");
            header.className = "code-header";

            // Language label
            const label = document.createElement("div");
            label.className = "lang-label";
            label.textContent = lang;

            // Copy button
            const copyBtn = document.createElement("div");
            copyBtn.className = "copy-btn";
            copyBtn.type = "button";
            copyBtn.textContent = "Copy";

            copyBtn.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(code.textContent);
                    copyBtn.textContent = "Copied!";
                    setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
                } catch (err) {
                    console.error("Copy failed:", err);
                    copyBtn.textContent = "Failed";
                    setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
                }
            });

            header.appendChild(label);
            header.appendChild(copyBtn);

            // Insert header at top of pre
            pre.prepend(header);

            Prism.highlightElement(code);
        });
});
