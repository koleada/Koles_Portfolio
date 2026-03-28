async function loadPosts() {
    const res = await fetch("_site/posts.json");
    if (!res.ok) throw new Error("Failed to load posts.json");
    return await res.json();
}

function createPostCard(post) {
    const tags = (post.tags || [])
        .filter((t) => t !== "posts") // optional if you add a "posts" tag later
        .map((tag) => `<span class="blogTag">${tag}</span>`)
        .join("");

    return `
    <a class="blogCardLink" href="_site${post.url}index.html">
      <div class="blogCard">

        <img class="blogCardImg" src="${post.image}" alt="${post.title}">
        <div class="blogCardBody">
        <div class="titleDate">
            <h2 class="blogCardTitle">${post.title}</h2>
            <div class="blogCardDate">${post.date}</div>
        </div>
          <div class="blogCardDesc">${post.description}</div>

          <div class="blogTags">
            ${tags}
          </div>
        </div>
      </div>
    </a>
  `;
}

function renderPosts(posts) {
    const grid = document.getElementById("blogGrid");
    grid.innerHTML = posts.map(createPostCard).join("");
}

function setupSearch(posts) {
    const searchInput = document.getElementById("blogSearch");

    searchInput.addEventListener("input", () => {
        const q = searchInput.value.toLowerCase().trim();

        const filtered = posts.filter((post) => {
            const title = (post.title || "").toLowerCase();
            const desc = (post.description || "").toLowerCase();
            const tags = (post.tags || []).join(" ").toLowerCase();

            return title.includes(q) || desc.includes(q) || tags.includes(q);
        });

        renderPosts(filtered);
    });
}

(async function initWriteups() {
    try {
        const posts = await loadPosts();
        renderPosts(posts);
        setupSearch(posts);
    } catch (err) {
        console.error(err);
    }
})();

document.querySelectorAll("pre code[class*='language-']").forEach((block) => {
    block.parentElement.classList.add("line-numbers");
});
