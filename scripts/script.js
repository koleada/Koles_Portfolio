// code block line numbers
document.querySelectorAll("pre code[class*='language-']").forEach((block) => {
    block.parentElement.classList.add("line-numbers");
});

document.addEventListener("DOMContentLoaded", () => {
    // Wait until Prism is loaded
    if (!window.Prism) {
        console.error("Prism not loaded yet");
        return;
    }

    // Loop through all pre tags with language-* class
    document.querySelectorAll("pre[class*='language-']").forEach((pre) => {
        // Avoid adding the label twice
        if (pre.querySelector(".lang-label")) return;

        // Determine language
        const langClass = Array.from(pre.classList).find((c) =>
            c.startsWith("language-")
        );
        if (!langClass) return;

        const lang = langClass.replace("language-", "");

        // Create label element
        const label = document.createElement("div");
        label.className = "lang-label";
        label.textContent = lang;

        // Insert at the top of pre
        pre.prepend(label);

        // Highlight code
        const codeBlock = pre.querySelector("code");
        if (codeBlock) Prism.highlightElement(codeBlock);
    });
});
