(async function () {
    const statusEl = document.getElementById("status");
    const appEl = document.getElementById("app");

    function setStatus(msg) {
        if (statusEl) statusEl.textContent = msg;
    }

    // ---- helpers ----
    const escapeHtml = (s) =>
        String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const norm = (s) =>
        String(s ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");


    const uniq = (arr) => Array.from(new Set(arr)).filter(Boolean);

    function buildOptionList(values, placeholder) {
        const opts = [`<option value="">${escapeHtml(placeholder)}</option>`];
        for (const v of values) {
            opts.push(`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`);
        }
        return opts.join("");
    }

    function matchesFilters(q, filters) {
        // search: check question + answer + tags
        if (filters.search) {
            const hay = norm(
                `${q.question ?? ""} ${q.answer ?? ""} ${(q.tags || []).join(" ")} ${q.author ?? ""} ${q.categoryLabel ?? ""}`
            );
            if (!hay.includes(filters.search)) return false;
        }

        if (filters.categoryKey && q.categoryKey !== filters.categoryKey) return false;

        if (filters.difficulty) {
            if (Number(q.difficulty) !== Number(filters.difficulty)) return false;
        }

        if (filters.author && (q.author ?? "") !== filters.author) return false;

        return true;
    }

    async function copyTextToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fallback
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand("copy");
                document.body.removeChild(ta);
                return true;
            } catch {
                document.body.removeChild(ta);
                return false;
            }
        }
    }

    function renderQuestionCard(q) {
        const tags = (q.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
        return `
      <article class="qcard" data-qid="${escapeHtml(q.id)}">
        <div class="qhead">
          <div class="qmeta">
            <span class="pill">${escapeHtml(q.categoryLabel || q.categoryKey || "Uncategorized")}</span>
            <span class="pill">Difficulty: ${escapeHtml(q.difficulty)}</span>
            <span class="pill">Author: ${escapeHtml(q.author || "Unknown")}</span>
          </div>
          <div class="qactions">
            <button class="btn copy-btn" type="button">Copy</button>
            <button class="btn reveal-btn" type="button">Reveal answer</button>
        </div>
        </div>

        <h3 class="qtext">${escapeHtml(q.question)}</h3>

        <div class="answer" hidden>
          <div class="answer-label">Answer</div>
          <div class="answer-text">${escapeHtml(q.answer)}</div>
        </div>

        ${tags ? `<div class="tags">${tags}</div>` : ""}
      </article>
    `;
    }

    function injectStylesOnce() {
        if (document.getElementById("qbank-styles")) return;
        const style = document.createElement("style");
        style.id = "qbank-styles";
        style.textContent = `
      #status { margin: 8px 0 18px; font-size: 14px; }
      .toolbar {
        display: grid;
        grid-template-columns: 1.4fr 1fr 0.7fr 1fr auto;
        gap: 10px;
        align-items: end;
        margin: 18px 0 16px;
      }
      .field label { display:block; font-size:12px; margin-bottom:6px; opacity:0.75; }
      .field input, .field select {
        width: 100%;
        padding: 10px 10px;
        border: 1px solid #ddd;
        border-radius: 10px;
        font-size: 14px;
        background: #fff;
      }
      .btn {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid #ddd;
        background: #fff;
        cursor: pointer;
        font-size: 14px;
      }
      .btn:hover { background: #f6f6f6; }
      .summary { font-size: 13px; opacity: 0.8; margin: 8px 0 14px; }

      .list { display: grid; gap: 12px; }

      .qcard {
        border: 1px solid #e6e6e6;
        border-radius: 14px;
        padding: 14px 14px 12px;
        background: #fff;
      }
      .qhead { display:flex; justify-content: space-between; gap: 10px; }
      .qmeta { display:flex; flex-wrap:wrap; gap: 8px; }
      .pill {
        display:inline-block;
        font-size: 12px;
        padding: 5px 9px;
        border-radius: 999px;
        background: #f2f2f2;
        border: 1px solid #e8e8e8;
      }
      .qtext { margin: 12px 0 10px; font-size: 16px; line-height: 1.35; }
      .answer {
        border-top: 1px dashed #e2e2e2;
        margin-top: 10px;
        padding-top: 10px;
      }
      .answer-label { font-size: 12px; opacity: 0.7; margin-bottom: 4px; }
      .answer-text { font-size: 15px; }
      .tags { margin-top: 10px; display:flex; flex-wrap:wrap; gap: 6px; }
      .tag {
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 999px;
        background: #fafafa;
        border: 1px solid #eee;
      }

      @media (max-width: 900px) {
        .toolbar { grid-template-columns: 1fr 1fr; }
        .toolbar .wide { grid-column: 1 / -1; }
      }
    `;
        document.head.appendChild(style);
    }

    try {
        injectStylesOnce();
        setStatus("Loading manifest…");

        // ---- Load manifest ----
        const manifestRes = await fetch("./data/manifest.json", { cache: "no-store" });
        if (!manifestRes.ok) throw new Error(`Manifest fetch failed: ${manifestRes.status}`);
        const manifest = await manifestRes.json();

        const categories = manifest.categories || [];
        if (!Array.isArray(categories) || categories.length === 0) {
            throw new Error("manifest.json has no categories[]");
        }

        setStatus(`Loading ${categories.length} category file(s)…`);

        // ---- Load categories ----
        const results = await Promise.all(
            categories.map(async (c) => {
                const res = await fetch(`./${c.file}`.replace(/^\.\//, ""), { cache: "no-store" });
                if (!res.ok) throw new Error(`Failed to load ${c.file}: ${res.status}`);
                const arr = await res.json();
                if (!Array.isArray(arr)) throw new Error(`${c.file} is not a JSON array`);

                return arr.map((q) => ({
                    ...q,
                    categoryKey: c.key,
                    categoryLabel: c.label
                }));
            })
        );

        const allQuestions = results.flat();

        // Expose for debugging / later features
        window.QBANK = { categories, allQuestions };

        // ---- Build filter option lists ----
        const categoryOptions = categories.map((c) => ({ key: c.key, label: c.label }));
        const authors = uniq(allQuestions.map((q) => q.author)).sort((a, b) => String(a).localeCompare(String(b)));

        // ---- UI shell ----
        appEl.innerHTML = `
      <div class="toolbar">
        <div class="field wide">
          <label>Search</label>
          <input id="f-search" type="text" placeholder="Search questions, answers, tags, author…" />
        </div>

        <div class="field">
          <label>Category</label>
          <select id="f-category">
            <option value="">All categories</option>
            ${categoryOptions
                .map((c) => `<option value="${escapeHtml(c.key)}">${escapeHtml(c.label)}</option>`)
                .join("")}
          </select>
        </div>
        <div class="field">
            <label>Sort</label>
            <select id="f-sort">
                <option value="category">Category (A→Z)</option>
                <option value="difficulty">Difficulty (1→3)</option>
                <option value="author">Author (A→Z)</option>
                <option value="question">Question (A→Z)</option>
                <option value="random">Random</option>
            </select>
        </div>

        <div class="field">
          <label>Difficulty</label>
          <select id="f-difficulty">
            ${buildOptionList(["1", "2", "3"], "All difficulties")}
          </select>
        </div>

        <div class="field">
          <label>Author</label>
          <select id="f-author">
            ${buildOptionList(authors, "All authors")}
          </select>
        </div>

        <button class="btn" id="f-clear" type="button">Clear</button>
      </div>

      <div class="summary" id="summary"></div>
      <div class="list" id="list"></div>
    `;

        const els = {
            search: document.getElementById("f-search"),
            category: document.getElementById("f-category"),
            difficulty: document.getElementById("f-difficulty"),
            author: document.getElementById("f-author"),
            clear: document.getElementById("f-clear"),
            summary: document.getElementById("summary"),
            list: document.getElementById("list"),
            sort: document.getElementById("f-sort"),
        };

        const state = {
            search: "",
            categoryKey: "",
            difficulty: "",
            author: "",
            sort: "category",
        };

        function applyFiltersAndRender() {
            const filtered = allQuestions.filter((q) => matchesFilters(q, state));

            function cmpStr(a, b) {
                return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
            }

            if (state.sort === "category") {
                filtered.sort((a, b) => cmpStr(a.categoryLabel, b.categoryLabel) || cmpStr(a.question, b.question));
            } else if (state.sort === "difficulty") {
                filtered.sort((a, b) => Number(a.difficulty) - Number(b.difficulty) || cmpStr(a.question, b.question));
            } else if (state.sort === "author") {
                filtered.sort((a, b) => cmpStr(a.author, b.author) || cmpStr(a.question, b.question));
            } else if (state.sort === "question") {
                filtered.sort((a, b) => cmpStr(a.question, b.question));
            } else if (state.sort === "random") {
                // Fisher–Yates shuffle
                for (let i = filtered.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
                }
            }

            els.summary.textContent = `Showing ${filtered.length} of ${allQuestions.length} question(s).`;

            // Render cards
            els.list.innerHTML = filtered.map(renderQuestionCard).join("");

            // Wire reveal buttons (event delegation)
            // (Buttons exist after innerHTML replacement)
        }

        function readStateFromUI() {
            state.search = norm(els.search.value.trim());
            state.categoryKey = els.category.value;
            state.difficulty = els.difficulty.value;
            state.author = els.author.value;
            state.sort = els.sort.value;
        }

        // Event listeners
        els.search.addEventListener("input", () => {
            readStateFromUI();
            applyFiltersAndRender();
        });
        els.category.addEventListener("change", () => {
            readStateFromUI();
            applyFiltersAndRender();
        });
        els.difficulty.addEventListener("change", () => {
            readStateFromUI();
            applyFiltersAndRender();
        });
        els.author.addEventListener("change", () => {
            readStateFromUI();
            applyFiltersAndRender();
        });
        els.clear.addEventListener("click", () => {
            els.search.value = "";
            els.category.value = "";
            els.difficulty.value = "";
            els.author.value = "";
            els.sort.value = "category";
            readStateFromUI();
            applyFiltersAndRender();
        });
        els.sort.addEventListener("change", () => {
            readStateFromUI();
            applyFiltersAndRender();
        });
        // Reveal answer + copy: event delegation on the list
        els.list.addEventListener("click", async (e) => {

            // ---------- COPY BUTTON ----------
            const copyBtn = e.target.closest(".copy-btn");
            if (copyBtn) {
                const card = e.target.closest(".qcard");
                if (!card) return;

                const qid = card.getAttribute("data-qid");
                const q = window.QBANK.allQuestions.find(x => x.id === qid);
                if (!q) return;

                const text =
                    `${q.categoryLabel || q.categoryKey}
Difficulty: ${q.difficulty} | Author: ${q.author || "Unknown"}

Q: ${q.question}
A: ${q.answer}
`;

                const ok = await copyTextToClipboard(text);

                const original = copyBtn.textContent;
                copyBtn.textContent = ok ? "Copied!" : "Copy failed";
                setTimeout(() => {
                    copyBtn.textContent = original;
                }, 900);

                return; // IMPORTANT: stop here so reveal logic doesn't run
            }

            // ---------- REVEAL BUTTON ----------
            const btn = e.target.closest(".reveal-btn");
            if (!btn) return;

            const card = e.target.closest(".qcard");
            if (!card) return;

            const ans = card.querySelector(".answer");
            const isHidden = ans.hasAttribute("hidden");

            if (isHidden) {
                ans.removeAttribute("hidden");
                btn.textContent = "Hide answer";
            } else {
                ans.setAttribute("hidden", "");
                btn.textContent = "Reveal answer";
            }
        });

        // Initial render
        setStatus(`Loaded ${allQuestions.length} question(s) from ${categories.length} categories.`);
        applyFiltersAndRender();
    } catch (err) {
        console.error(err);
        setStatus("Error loading question bank. Check console.");
        if (appEl) appEl.innerHTML = `<pre style="white-space:pre-wrap">${String(err.message || err)}</pre>`;
    }
})();