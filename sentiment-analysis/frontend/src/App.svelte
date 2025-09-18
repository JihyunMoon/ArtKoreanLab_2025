<script lang="ts">
  import { onMount } from "svelte";

  type OutputJson = {
    file: string;
    data: {
      id: string;
      title: string;
      review?: { text?: string };
      sentimentScore?: number;
      sentimentCategory?: string;
      keywords?: string[];
      imagePath?: string;
    };
  };

  // Background images from outputs/images
  let images: string[] = [];
  let imgIndex = 0;
  let leftBg = "";
  let rightBg = "";

  // Poems
  let datasetPoem = "";
  let userPoem = "";

  // State
  let loading = false;
  let error = "";

  // Keywords
  let userKeyword = "";
  let datasetKeyword = ""; // always chosen from datasetKeywords
  let datasetKeywords: string[] = [];
  let datasetKwIndex = 0;

  // Dataset metadata
  let datasetTitle = "";
  let datasetSentimentScore: number | null = null;
  let datasetSentimentCategory = "";

  function setPairBackgrounds() {
    if (!images.length) {
      leftBg = rightBg = "";
      return;
    }
    leftBg = images[imgIndex % images.length] || "";
    rightBg = images[(imgIndex + 1) % images.length] || leftBg || "";
  }

  function nextPair() {
    if (!images.length) return;
    imgIndex = (imgIndex + 2) % images.length;
    setPairBackgrounds();
  }

  async function refreshOutputs() {
    const r = await fetch("/api/outputs");
    if (!r.ok) throw new Error("Failed to load outputs");
    const j: { images: string[]; jsonFiles: OutputJson[] } = await r.json();

    // Images
    images = j.images || [];
    if (images.length) {
      imgIndex = Math.floor(Math.random() * images.length);
      if (imgIndex % 2 === 1) imgIndex = (imgIndex + 1) % images.length;
    }
    setPairBackgrounds();

    // Dataset selection with keywords
    const candidates = (j.jsonFiles || []).filter(
      (it) => Array.isArray(it?.data?.keywords) && it.data.keywords!.length > 0
    );
    if (candidates.length) {
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      datasetKeywords = chosen.data.keywords || [];
      datasetTitle = chosen.data.title || chosen.file || "";
      datasetSentimentScore =
        typeof chosen.data.sentimentScore === "number"
          ? chosen.data.sentimentScore
          : null;
      datasetSentimentCategory = chosen.data.sentimentCategory || "";

      if (datasetKeywords.length) {
        datasetKwIndex = Math.floor(Math.random() * datasetKeywords.length);
        datasetKeyword = datasetKeywords[datasetKwIndex];
        if (!userKeyword) userKeyword = datasetKeyword; // optional: seed user input
      }
    }
  }

  async function generatePoem(keyword: string, target: "dataset" | "user") {
    loading = true;
    error = "";
    try {
      const r = await fetch("/api/poem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const j = await r.json();
      if (!r.ok || j.error)
        throw new Error(j.error || "Failed to generate poem");
      if (target === "dataset") {
        datasetPoem = j.poem || "";
      } else {
        userPoem = j.poem || "";
        nextPair(); // advance images on user generation
      }
    } catch (e: any) {
      error = e?.message || "Unknown error";
    } finally {
      loading = false;
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    // Re-read outputs/data and images so new files appear without reload
    try {
      await refreshOutputs();
    } catch (err) {
      // Keep going; generation can still proceed using previous state
      console.warn("Failed to refresh outputs before generate", err);
    }
    if (userKeyword?.trim()) await generatePoem(userKeyword.trim(), "user");
  }

  function nextDatasetKeyword(step = 1) {
    if (!datasetKeywords?.length) return;
    datasetKwIndex =
      (datasetKwIndex + step + datasetKeywords.length) % datasetKeywords.length;
    datasetKeyword = datasetKeywords[datasetKwIndex];
    // regenerate dataset poem strictly from dataset keyword
    generatePoem(datasetKeyword, "dataset");
  }

  onMount(async () => {
    await refreshOutputs();
    if (datasetKeyword) await generatePoem(datasetKeyword, "dataset");
  });
</script>

<div class="page">
  <div class="bg left" style="background-image: url({leftBg});"></div>
  <div class="bg right" style="background-image: url({rightBg});"></div>
  <div class="scrim"></div>

  <div class="content">
    <div class="card">
      <h1>Poem</h1>

      {#if loading}
        <div class="subtle">Generating poem…</div>
      {/if}
      {#if error}
        <div class="error">{error}</div>
      {/if}

      <div class="poems">
        <div class="poem-block">
          <div class="poem-title row between">
            <span>Dataset-seeded poem</span>
            <span class="row gap">
              <button
                class="ghost"
                type="button"
                on:click={() => nextDatasetKeyword(-1)}
                aria-label="Previous dataset keyword">◀</button
              >
              <button
                class="ghost"
                type="button"
                on:click={() => nextDatasetKeyword(1)}
                aria-label="Next dataset keyword">▶</button
              >
            </span>
          </div>
          {#if datasetPoem}
            <div class="poem">{datasetPoem}</div>
          {:else}
            <div class="subtle">No dataset poem yet.</div>
          {/if}
          <div class="meta">
            <div class="row small">
              <span class="label">Title:</span>
              <span class="title">{datasetTitle || "—"}</span>
              {#if datasetSentimentScore !== null}
                <span class="label">Score:</span>
                <span class="score">{datasetSentimentScore.toFixed(2)}</span>
              {/if}
              {#if datasetSentimentCategory}
                <span class="label">Sentiment:</span>
                <span class="cat">{datasetSentimentCategory}</span>
              {/if}
            </div>
            {#if datasetKeywords?.length}
              <div class="keywords">
                {#each datasetKeywords as kw}
                  <span class="chip">{kw}</span>
                {/each}
              </div>
            {/if}
            {#if datasetKeyword}
              <!-- <div class="caption subtle">
                Poem keyword: <span class="kw">{datasetKeyword}</span>
              </div> -->
            {/if}
          </div>
        </div>

        <div class="poem-block">
          <div class="poem-title">Your poem</div>
          {#if userPoem}
            <div class="poem">{userPoem}</div>
          {:else}
            <div class="subtle">Type a word and generate to see your poem.</div>
          {/if}
          {#if userKeyword}
            <div class="caption subtle">
              Keyword: <span class="kw">{userKeyword}</span>
            </div>
          {/if}
        </div>
      </div>

      <form on:submit|preventDefault={onSubmit}>
        <input
          type="text"
          placeholder="Type a word or feeling (e.g., longing, dawn, resilience)"
          bind:value={userKeyword}
        />
        <button type="submit" disabled={loading || !userKeyword.trim()}
          >Generate</button
        >
      </form>

      <div class="footer subtle">
        Current keyword: <span class="kw">{userKeyword || "—"}</span>
      </div>
    </div>
  </div>
</div>

<style>
  :root {
    --overlay-bg: rgba(0, 0, 0, 0.45);
  }
  .page {
    position: relative;
    min-height: 100vh;
    color: white;
    overflow: hidden;
    font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      Segoe UI,
      Roboto,
      Helvetica,
      Arial,
      "Apple Color Emoji",
      "Segoe UI Emoji";
  }
  .bg {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 50%;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    filter: blur(3px) brightness(0.7);
  }
  .bg.left {
    left: 0;
  }
  .bg.right {
    right: 0;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.5),
      transparent 20%,
      transparent 80%,
      rgba(0, 0, 0, 0.5)
    );
  }

  .content {
    position: relative;
    z-index: 10;
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 2rem;
  }
  .card {
    max-width: 800px;
    width: 100%;
    background: var(--overlay-bg);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(6px);
  }

  .poem {
    white-space: pre-wrap;
    line-height: 1.6;
    font-size: 1.1rem;
  }
  .poems {
    display: grid;
    gap: 16px;
  }
  .poem-block {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 12px;
    border-radius: 12px;
  }
  .poem-title {
    font-weight: 700;
    margin-bottom: 6px;
    opacity: 0.95;
  }
  .row.between {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .row.gap {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }

  .meta {
    margin-top: 8px;
    display: grid;
    gap: 6px;
  }
  .row.small {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
    opacity: 0.9;
  }
  .label {
    font-size: 0.8rem;
    opacity: 0.9;
  }
  .title {
    font-weight: 600;
  }
  .score {
    font-variant-numeric: tabular-nums;
  }
  .cat {
    font-weight: 600;
  }
  .keywords {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.25);
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 0.8rem;
  }

  .caption {
    margin-top: 6px;
    font-size: 0.85rem;
  }
  form {
    margin-top: 16px;
    display: flex;
    gap: 8px;
  }
  input[type="text"] {
    flex: 1;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(0, 0, 0, 0.3);
    color: white;
  }
  button {
    padding: 12px 16px;
    border-radius: 10px;
    border: none;
    background: #22c55e;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .ghost {
    background: rgba(255, 255, 255, 0.12);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    padding: 4px 8px;
    cursor: pointer;
  }
  .ghost:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .error {
    margin-top: 8px;
    color: #fda4af;
  }
  .subtle {
    opacity: 0.85;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 1.6rem;
  }
  .footer {
    margin-top: 12px;
    font-size: 0.85rem;
    opacity: 0.8;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .kw {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.35);
    padding: 4px 8px;
    border-radius: 8px;
  }
</style>
