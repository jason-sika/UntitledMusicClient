<script>
  import { tick } from "svelte";
  import { playbackSync } from "$lib/stores/playbackSync";
  import * as m from "$lib/paraglide/messages.js";
  import Playback3 from "$lib/components/playback3.svelte";
  import { lyrics } from "$lib/stores/lyrics";

  // ── PROPS ──────────────────────────────────────────────────────────────────

  let { src = "", ttmlString = "" } = $props();

  // ── REACTIVE STATE ─────────────────────────────────────────────────────────

  let lines = $state([]);
  let loading = $state(true);
  let error = $state("");
  let containerEl = $state(null);
  let lineEls = $state([]);
  let isWordLevelData = $state(false);
  let isWordLevelSync = $state(false);
  let lyr = $state({ song: "", artist: "", transcriber: "", songwriters: "" });
  let debug = $state(false);
  let isFlipping = $state(false);
  let displayedImage = $state(null);
  let displayedAnimatedArt = $state(null);
  let translation = $state(true);
  let submenuOpen = $state(false);
  let videoEl = $state(null);
  let stringshown = $state(false);
  let displayedLyr = $state({
    song: "",
    artist: "",
    transcriber: "",
    songwriters: "",
  });
  let visibleToggle = $state(true);
  let sidebarVisible = $state(true);
  let lastActiveIndex = $state(-1);

  // ── DERIVED FROM STORES ────────────────────────────────────────────────────

  // playbackSync is the single source of truth — device-first, Last.fm fallback
  let {
    elapsed,
    duration,
    progress,
    matched,
    device,
    song,
    artist,
    album,
    album_art,
    animated_art,
  } = $derived($playbackSync);

  let songDisplay = $derived(song || device?.title || "Loading...");
  let artistDisplay = $derived(artist || device?.artist || "—");

  let lyricsState = $derived($lyrics);
  let lyricsMatchDevice = $derived(
    device?.title && device?.artist
      ? `${device.title}::${device.artist}::${device.album || ""}` ===
          lyricsState.currentKey
      : false,
  );
  let parsedMeta = $derived(
    src ? null : ttmlString ? parseMeta(ttmlString) : null,
  );
  let hasEmbeddedTranslations = $derived(
    lines.some((l) => l.embeddedTranslation),
  );

  // ── DERIVED FROM elapsed + lines ───────────────────────────────────────────

  let activeIndices = $derived.by(() => {
    const t = $playbackSync.elapsed;
    const next = new Set();
    lines.forEach((line, i) => {
      if (t >= line.begin && t < line.end) next.add(i);
    });
    return next;
  });

  let backActiveIndices = $derived.by(() => {
    const t = $playbackSync.elapsed;
    const backActive = new Set();
    lines.forEach((line, i) => {
      if (line.isBackground) {
        const nextMainLine = lines.slice(i + 1).find((l) => !l.isBackground);
        if (t >= line.end && (!nextMainLine || t < nextMainLine.begin))
          backActive.add(i);
      }
    });
    return backActive;
  });

  let maxBackActive = $derived(
    backActiveIndices.size > 0 ? Math.max(...backActiveIndices) : -1,
  );
  let activeIndex = $derived(
    activeIndices.size > 0 ? Math.max(...activeIndices) : -1,
  );
  let lastMinActive = Infinity;

  let minActive = $derived.by(() => {
    if (activeIndices.size > 0) {
      const val = Math.min(...activeIndices);
      lastMinActive = val;
      return val;
    }
    return lastMinActive;
  });

  let maxActive = $derived(
    Math.max(
      activeIndices.size > 0 ? Math.max(...activeIndices) : -1,
      maxBackActive,
    ),
  );

  let lyricsExist = $derived(lines.length > 0 && !loading && !error);
  let lyricsVisible = $derived(lyricsExist && visibleToggle);

  let showDots = $derived(
    lyricsExist &&
      activeIndices.size === 0 &&
      lastActiveIndex < lines.length - 1,
  );

  // ── TTML PARSING ───────────────────────────────────────────────────────────

  function parseMeta(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const getMeta = (key) => {
      const lower = key.toLowerCase();
      const metas = doc.querySelectorAll("meta, [key]");
      for (const m of Array.from(metas)) {
        if (m.getAttribute("key")?.toLowerCase() === lower) {
          return m.getAttribute("value");
        }
      }
      return null;
    };
    const songwriters = Array.from(doc.querySelectorAll("songwriter"))
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .join(", ");
    return {
      song: getMeta("musicName"),
      artist: getMeta("artists"),
      transcriber: getMeta("transcribers") || getMeta("transcriber"),
      songwriters,
    };
  }

  function timeToSec(t) {
    if (!t) return 0;
    if (t.endsWith("s") && !t.includes(":")) return parseFloat(t);
    const parts = t.split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parseFloat(t);
  }

  function descendants(el, tag) {
    return Array.from(el.querySelectorAll("*")).filter(
      (n) => n.localName === tag,
    );
  }

  function isWordLevel(doc) {
    return doc.querySelector("p span[begin]") !== null;
  }

  function isMajorityWordLevel(doc) {
    const paragraphs = descendants(doc, "p");
    if (!paragraphs.length) return false;
    const wordLevelCount = paragraphs.filter((p) =>
      p.querySelector("span[begin]"),
    ).length;
    return wordLevelCount > paragraphs.length / 2;
  }

  function parseTtml(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = descendants(doc, "p");
    const result = [];
    const wordLevel = isWordLevel(doc);

    for (const p of paragraphs) {
      const begin = timeToSec(p.getAttribute("begin"));
      const end = timeToSec(p.getAttribute("end"));
      const agent = p.getAttribute("ttm:agent") || "v1";
      const isDuet = agent === "v2";

      if (!wordLevel) {
        const text = p.textContent.trim();
        if (text) {
          result.push({
            begin,
            end,
            syllables: [
              {
                text,
                begin,
                end,
                dur: Math.max(end - begin, 0.18),
                trailingSpace: false,
              },
            ],
            isBackground: false,
            isDuet,
          });
        }
        continue;
      }

      const translationSpan = Array.from(p.children).find(
        (el) => el.getAttribute("ttm:role") === "x-translation",
      );
      const embeddedTranslation = translationSpan?.textContent?.trim() || null;

      let syllables = [];
      let bgSyllables = [];
      let bgEmbeddedTranslation = null;

      const pushWords = (
        arr,
        text,
        sBegin,
        sEnd,
        hasTrailingSpace,
        wordIsDuet = isDuet,
      ) => {
        const words = text.trim().split(/\s+/);
        words.forEach((word, wi) => {
          if (word) {
            arr.push({
              text: word,
              begin: sBegin,
              end: sEnd,
              dur: Math.max(sEnd - sBegin, 0.18),
              trailingSpace: wi < words.length - 1 || hasTrailingSpace,
              isDuet: wordIsDuet,
            });
          }
        });
      };

      for (const node of p.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const trimmed = node.textContent.trim();
          if (trimmed) {
            pushWords(syllables, trimmed, begin, end, false, isDuet);
          }
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.localName === "span"
        ) {
          if (node.getAttribute("ttm:role") === "x-translation") continue;

          if (node.getAttribute("ttm:role") === "x-bg") {
            const bgBegin = timeToSec(node.getAttribute("begin")) || begin;
            const bgEnd = timeToSec(node.getAttribute("end")) || end;

            const bgTranslationEl = Array.from(node.children).find(
              (el) => el.getAttribute("ttm:role") === "x-translation",
            );
            bgEmbeddedTranslation =
              bgTranslationEl?.textContent?.trim() || null;

            for (const child of node.childNodes) {
              if (child.nodeType === Node.TEXT_NODE) {
                const t = child.textContent.trim();
                if (t)
                  pushWords(
                    bgSyllables,
                    t,
                    bgBegin,
                    bgEnd,
                    child.textContent.endsWith(" "),
                    isDuet,
                  );
              } else if (
                child.nodeType === Node.ELEMENT_NODE &&
                child.localName === "span"
              ) {
                if (child.getAttribute("ttm:role") === "x-translation")
                  continue;
                const sText = child.textContent;
                const sBegin =
                  timeToSec(child.getAttribute("begin")) || bgBegin;
                const sEnd = timeToSec(child.getAttribute("end")) || bgEnd;
                const hasInternalTrailingSpace = sText.endsWith(" ");
                const words = sText.trim().split(/\s+/);

                words.forEach((word, wi) => {
                  if (word) {
                    bgSyllables.push({
                      text: word,
                      begin: sBegin,
                      end: sEnd,
                      dur: Math.max(sEnd - sBegin, 0.18),
                      trailingSpace:
                        wi < words.length - 1 ||
                        (wi === words.length - 1 && hasInternalTrailingSpace),
                      noAutoSpace: false,
                      isDuet,
                    });
                  }
                });

                const nextSib = child.nextSibling;
                if (nextSib && nextSib.nodeType === Node.TEXT_NODE) {
                  if (
                    nextSib.textContent.includes(" ") &&
                    bgSyllables.length > 0
                  ) {
                    bgSyllables[bgSyllables.length - 1].trailingSpace = true;
                  } else if (bgSyllables.length > 0) {
                    bgSyllables[bgSyllables.length - 1].noAutoSpace = true;
                  }
                } else if (
                  nextSib &&
                  nextSib.nodeType === Node.ELEMENT_NODE &&
                  bgSyllables.length > 0
                ) {
                  bgSyllables[bgSyllables.length - 1].noAutoSpace = true;
                }
              }
            }
          } else {
            const sText = node.textContent;
            const sBegin = timeToSec(node.getAttribute("begin")) || begin;
            const sEnd = timeToSec(node.getAttribute("end")) || end;
            const hasInternalTrailingSpace = sText.endsWith(" ");
            const words = sText.trim().split(/\s+/);

            words.forEach((word, wi) => {
              if (word) {
                syllables.push({
                  text: word,
                  begin: sBegin,
                  end: sEnd,
                  dur: Math.max(sEnd - sBegin, 0.18),
                  trailingSpace:
                    wi < words.length - 1 ||
                    (wi === words.length - 1 && hasInternalTrailingSpace),
                  noAutoSpace: false,
                  isDuet,
                });
              }
            });

            const nextSib = node.nextSibling;
            if (nextSib && nextSib.nodeType === Node.TEXT_NODE) {
              if (nextSib.textContent.includes(" ") && syllables.length > 0) {
                syllables[syllables.length - 1].trailingSpace = true;
              } else if (syllables.length > 0) {
                syllables[syllables.length - 1].noAutoSpace = true;
              }
            } else if (
              nextSib &&
              nextSib.nodeType === Node.ELEMENT_NODE &&
              syllables.length > 0
            ) {
              syllables[syllables.length - 1].noAutoSpace = true;
            }
          }
        }
      }

      [syllables, bgSyllables].forEach((arr) => {
        arr.forEach((s, i) => {
          if (arr[i + 1] && !s.trailingSpace && !s.noAutoSpace) {
            const lastChar = s.text[s.text.length - 1];
            const nextFirstChar = arr[i + 1].text[0];
            const isCJK = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(
              lastChar,
            );
            const nextIsCJK = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(
              nextFirstChar,
            );
            if (!isCJK && !nextIsCJK && !s.text.endsWith("-"))
              s.trailingSpace = true;
          }
        });
      });

      if (syllables.length > 0) {
        result.push({
          begin: Math.min(...syllables.map((s) => s.begin)),
          end: Math.max(...syllables.map((s) => s.end)),
          syllables,
          isBackground: false,
          isDuet,
          embeddedTranslation,
        });
      }
      if (bgSyllables.length > 0) {
        result.push({
          begin: Math.min(...bgSyllables.map((s) => s.begin)),
          end: Math.max(...bgSyllables.map((s) => s.end)),
          syllables: bgSyllables,
          isBackground: true,
          isDuet,
          embeddedTranslation: bgEmbeddedTranslation,
        });
      }
    }

    return result.sort((a, b) => a.begin - b.begin);
  }

  // ── TRANSLATION ────────────────────────────────────────────────────────────

  function lineTextForTranslation(line) {
    return line.syllables
      .reduce((text, syl, i) => {
        const next = line.syllables[i + 1];
        const spacer =
          syl.trailingSpace || (next && !syl.noAutoSpace) ? " " : "";
        return `${text}${syl.text}${spacer}`;
      }, "")
      .trim();
  }

  function normalizeLinesForTranslation(lineTexts, sourceLang = null) {
    if (sourceLang && sourceLang !== "fr") return lineTexts;
    return lineTexts.map((text, i) => {
      let normalized = text.replace(/^fais,\s+vivre\b/i, "Laisse vivre");
      if (
        /^parler\s+/i.test(normalized) &&
        /^fais,\s+vivre\b/i.test(lineTexts[i - 1] || "")
      ) {
        normalized = normalized.replace(/^parler\b/i, "Laisse parler");
      }
      return normalized;
    });
  }

  function buildTranslationGroups(
    lineTexts,
    maxLinesPerGroup = 6,
    maxCharsPerGroup = 300,
  ) {
    const groups = [];
    let start = 0;
    let charCount = 0;

    lineTexts.forEach((text, i) => {
      charCount += text.length + 1; // +1 for the newline joiner
      const lineEndsPhrase = /[.!?…:;]$/.test(text.trim());
      const groupTooBig =
        i - start + 1 >= maxLinesPerGroup || charCount >= maxCharsPerGroup;
      const nextIsFarAway = i === lineTexts.length - 1;

      if (lineEndsPhrase || groupTooBig || nextIsFarAway) {
        groups.push({ start, end: i + 1 });
        console.log(
          `[translateLines] group ${groups.length - 1}: lines ${start}-${i} ` +
            `(${i - start + 1} lines, ${charCount} chars, endedBy=${
              lineEndsPhrase ? "punctuation" : groupTooBig ? "size-cap" : "eof"
            })`,
        );
        start = i + 1;
        charCount = 0;
      }
    });

    return groups;
  }

  function cleanTranslatedLine(text, sourceText) {
    const trimmed = text.trim();
    if (/[.!?…:;]$/.test(sourceText)) return trimmed;
    return trimmed.replace(/\.$/, "");
  }

  function splitTranslatedBlock(raw) {
    return raw.split(/<br\s*\/?>|\n/i).map((line) => line.trim());
  }

  function translationMarker(index) {
    return `@@LYRIC_LINE_${String(index).padStart(4, "0")}@@`;
  }

  async function googleTranslateBlock(text, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    return {
      detectedLang: data[2],
      text: data[0].map((item) => item[0]).join(""),
    };
  }

  function splitMarkedTranslation(raw, lineCount) {
    const markerPattern = /@@\s*LYRIC[\s_-]*LINE[\s_-]*(\d{1,4})\s*@@/gi;
    const matches = [...raw.matchAll(markerPattern)];
    if (!matches.length) return null;
    const translated = Array(lineCount).fill("");
    matches.forEach((match, i) => {
      const index = Number(match[1]) - 1;
      const start = match.index + match[0].length;
      const end = matches[i + 1]?.index ?? raw.length;
      if (index >= 0 && index < lineCount) {
        translated[index] = raw.slice(start, end).trim();
      }
    });
    return translated;
  }

  function isLikelyUntranslated(source, translated, targetLang) {
    if (!translated) return true;
    const normalize = (s) => s.trim().toLowerCase();
    return targetLang !== "fr" && normalize(source) === normalize(translated);
  }

  async function translateLines(parsed, targetLang) {
    const result = parsed.map((line) => ({
      ...line,
      translation: "",
      detectedLang: null,
    }));
    const embeddedLines = parsed
      .map((line, i) => ({ i, text: line.embeddedTranslation }))
      .filter((line) => line.text);
    const plainLines = parsed
      .map((line, i) => ({ i, text: lineTextForTranslation(line) }))
      .filter(({ i }) => !parsed[i].embeddedTranslation);

    if (embeddedLines.length) {
      const { detectedLang, text: rawEmbeddedTranslation } =
        await googleTranslateBlock(
          embeddedLines.map((line) => line.text).join("\n"),
          targetLang,
        );
      const embeddedTranslations = splitTranslatedBlock(rawEmbeddedTranslation);
      const embeddedOk = embeddedTranslations.length === embeddedLines.length;

      embeddedLines.forEach(({ i, text }, idx) => {
        if (detectedLang === targetLang) {
          result[i].translation = text;
        } else if (embeddedOk) {
          result[i].translation = embeddedTranslations[idx]?.trim() || "";
        }
        result[i].detectedLang = detectedLang;
      });
    }

    const lineTexts = plainLines.map((line) => line.text);
    const detectedLangs = Array(lineTexts.length).fill(null);
    const translated = Array(lineTexts.length).fill("");
    const groups = buildTranslationGroups(lineTexts);

    for (const group of groups) {
      const sourceLines = lineTexts.slice(group.start, group.end);
      const block = normalizeLinesForTranslation(
        lineTexts.slice(group.start, group.end),
      ).join("\n");
      const { detectedLang, text: rawBlockTranslation } =
        await googleTranslateBlock(block, targetLang);

      for (let i = group.start; i < group.end; i++)
        detectedLangs[i] = detectedLang;

      if (detectedLang === targetLang) {
        sourceLines.forEach((line, i) => {
          translated[group.start + i] = line;
        });
        continue;
      }

      const blockTranslations = splitTranslatedBlock(rawBlockTranslation);

      if (blockTranslations.length === sourceLines.length) {
        blockTranslations.forEach((line, i) => {
          const cleaned = cleanTranslatedLine(line, sourceLines[i] || "");
          if (isLikelyUntranslated(sourceLines[i], cleaned, targetLang)) {
            console.warn(
              `[translateLines] group ${group.start}-${group.end - 1} line ${i} ` +
                `looks untranslated, leaving blank for retry:`,
              sourceLines[i],
            );
            translated[group.start + i] = ""; // force into retry pass below
          } else {
            translated[group.start + i] = cleaned;
          }
        });
      }
    }

    if (translated.some((line) => !line)) {
      const markedLyrics = lineTexts
        .map((text, i) => `${translationMarker(i + 1)} ${text}`)
        .join("\n");
      const { text: rawMarkedTranslation } = await googleTranslateBlock(
        markedLyrics,
        targetLang,
      );
      const fallback =
        splitMarkedTranslation(rawMarkedTranslation, lineTexts.length) ??
        rawMarkedTranslation
          .split("\n")
          .map((line) =>
            line
              .replace(/@@\s*LYRIC[\s_-]*LINE[\s_-]*\d{1,4}\s*@@/gi, "")
              .trim(),
          );
      fallback.forEach((line, i) => {
        if (!translated[i]) translated[i] = line;
      });
    }

    plainLines.forEach(({ i }, plainIndex) => {
      result[i].translation = translated[plainIndex]?.trim() || "";
      result[i].detectedLang = detectedLangs[plainIndex] || null;
    });

    // ── FINAL PER-LINE RETRY PASS ──────────────────────────────────────────
    // Catches anything still blank (misaligned groups, marker fallback
    // failures) AND anything that came back identical to source (likely
    // content-filtered), since that was reset to "" above.
    const stillEmpty = result
      .map((line, i) => ({ i, line }))
      .filter(({ line }) => !line.translation);

    for (const { i, line } of stillEmpty) {
      const sourceText =
        line.embeddedTranslation || lineTextForTranslation(line);
      if (!sourceText.trim()) continue;

      try {
        const { detectedLang, text } = await googleTranslateBlock(
          sourceText,
          targetLang,
        );
        const translation =
          detectedLang === targetLang ? sourceText : text.trim();

        if (isLikelyUntranslated(sourceText, translation, targetLang)) {
          console.warn(
            `[translateLines] line ${i} still untranslated after retry, keeping source text`,
            sourceText,
          );
        }

        result[i].translation = translation;
        result[i].detectedLang = detectedLang;
      } catch (e) {
        console.warn(`Line ${i} translation retry failed:`, e);
      }
    }

    return result;
  }

  function isVideoUrl(url) {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return (
      clean.endsWith(".mp4") ||
      clean.endsWith(".webm") ||
      clean.endsWith(".mov")
    );
  }

  // ── EFFECTS ────────────────────────────────────────────────────────────────

  $effect(() => {
    const targetLang = navigator.language.split("-")[0] || "fr";

    if (src) {
      lines = [];
      lyr = { song: "", artist: "", transcriber: "", songwriters: "" };
      loading = true;
      error = "";
      fetch(src)
        .then((r) => r.text())
        .then((xml) => {
          const doc = new DOMParser().parseFromString(xml, "application/xml");
          lyr = parseMeta(xml);
          isWordLevelSync = isMajorityWordLevel(doc);
          isWordLevelData = isWordLevel(doc);
          const parsed = parseTtml(xml);
          return translateLines(parsed, targetLang);
        })
        .then((l) => {
          lines = l;
          loading = false;
        })
        .catch((e) => {
          error = e.message;
          loading = false;
        });
    } else if (ttmlString) {
      lines = [];
      lyr = { song: "", artist: "", transcriber: "", songwriters: "" };
      loading = true;
      error = "";
      const doc = new DOMParser().parseFromString(
        ttmlString,
        "application/xml",
      );
      isWordLevelSync = isMajorityWordLevel(doc);
      isWordLevelData = isWordLevel(doc);
      lyr = parseMeta(ttmlString);
      const parsed = parseTtml(ttmlString);
      translateLines(parsed, targetLang)
        .then((l) => {
          lines = l;
          loading = false;
        })
        .catch((e) => {
          error = e.message;
          loading = false;
        });
    }
  });

  let lastScrolled = -1;
  $effect(() => {
    const scrollTarget = Math.max(activeIndex, maxBackActive);
    if (scrollTarget !== lastScrolled && scrollTarget >= 0) {
      lastScrolled = scrollTarget;
      tick().then(() => {
        const el = lineEls[scrollTarget];
        if (!el) return;
        if (window.innerWidth <= 1079) {
          containerEl.scrollTo({ top: el.offsetTop - 300, behavior: "smooth" });
        } else {
          el.scrollIntoView({ block: "center" });
        }
      });
    }
  });

  $effect(() => {
    lines;
    lastScrolled = -1;
  });

  $effect(() => {
    if (activeIndex >= 0) lastActiveIndex = activeIndex;
  });

  $effect(() => {
    if (lyr.song && lyr.song !== displayedLyr.song) displayedLyr = { ...lyr };
  });

  // ── ARTWORK SYNC — playbackSync owns enrichment, we just mirror it ─────────

  $effect(() => {
    const newImage = album_art ?? null;
    const newAnimatedArt = animated_art || null; // coerce "" to null

    isFlipping = true;
    displayedAnimatedArt = null; // ← clear immediately so the old video unmounts
    displayedImage = null;

    const timer = setTimeout(() => {
      displayedImage = newImage;
      displayedAnimatedArt = newAnimatedArt;
      setTimeout(() => (isFlipping = false), 650);
    }, 300);

    return () => clearTimeout(timer);
  });

  // Keep the no-art guard as-is
  $effect(() => {
    if (!displayedImage && !displayedAnimatedArt) {
      isFlipping = false;
    }
  });
</script>

<!-- ── LYRIC WORD SNIPPET ────────────────────────────────────────────────── -->

{#snippet lyricWord(syl, elapsed, isLong, isLongest, lineIndex, line)}
  {@const isLineUpcoming = lineIndex > maxActive}
  {@const isLineActive = activeIndices.has(lineIndex)}
  {@const progress = isLineUpcoming
    ? 0
    : elapsed < syl.begin
      ? 0
      : elapsed >= syl.end
        ? 1
        : (elapsed - syl.begin) / (syl.end - syl.begin)}
  {@const isPast = elapsed >= syl.end}

  <span
    class="lyric-word"
    class:is-past={lineIndex < minActive ||
      line.isMeta ||
      (isWordLevelData && elapsed >= syl.end && !isLineUpcoming)}
    class:is-active={activeIndices.has(lineIndex) &&
      !line.isMeta &&
      (!isWordLevelData || (elapsed >= syl.begin && elapsed < syl.end))}
    class:is-upcoming={lineIndex > maxActive && !line.isMeta}
    class:is-long={isLong && isLongest}
    class:is-word-level={isWordLevelData}
    class:is-duet={syl.isDuet}
    style="--progress: {progress}; --dur: {syl.dur}s; --word-dur: {syl.dur}s"
  >
    {#if isLong && isLongest}
      <span class="lyric-word-letters lyric-word-letters-base">
        {#each syl.text.split("") as letter, li (li)}
          <span class="lyric-letter" style="--letter-index: {li}">{letter}</span
          >
        {/each}
      </span>
      <span
        class="lyric-word-letters lyric-word-letters-fill"
        aria-hidden="true"
      >
        {#each syl.text.split("") as letter, li (li)}
          <span class="lyric-letter" style="--letter-index: {li}">{letter}</span
          >
        {/each}
      </span>
    {:else}
      <span class="lyric-word-base">{syl.text}</span>
      <span class="lyric-word-fill">{syl.text}</span>
    {/if}
  </span>

  {#if syl.trailingSpace || syl.text.endsWith(" ")}
    <span class="lyric-space">&nbsp;</span>
  {/if}
{/snippet}

<!-- ── HERO / ROOT ────────────────────────────────────────────────────────── -->
<div class="music-page">
  <div class="hero">
    <!-- Background layers -->
    <div class="blur" style="opacity: 0.5;">
      {#if displayedImage}<img src={displayedImage} alt="album art" />{/if}
      <div class="shadow"></div>
    </div>
    <div class="blurbg" style="opacity: 0.5;">
      {#if displayedImage}<img src={displayedImage} alt="album art" />{/if}
    </div>
    <video
      class="overlayvideo"
      src="/videos/3.mp4"
      autoplay
      loop
      muted
      playsinline
      bind:this={videoEl}
      oncanplay={() => (videoEl.playbackRate = 1)}
    />
    <div class="floor"></div>

    <!-- Main display -->
    <div class="lyrics-display">
      <!-- ── NOW PLAYING BAR ── -->
      <div class="now-playing" class:isLoading={!lyricsVisible}>
        <div class="artworkwrap">
          <div
            class="artwork"
            style="will-change: transform;"
            class:flipping={isFlipping}
          >
            {#if displayedAnimatedArt || isVideoUrl(displayedImage)}
              {@const videoSrc = displayedAnimatedArt ?? displayedImage}
              <video
                src={videoSrc.includes("?v=1") ? videoSrc : `${videoSrc}?v=1`}
                autoplay
                loop
                muted
                playsinline
              ></video>
            {:else if displayedImage}
              <img src={displayedImage} alt="album art" />
            {/if}
            <div class="shadow"></div>
            <div class="shadow2"></div>
          </div>
          <div
            class="artwork2"
            style="will-change: transform;"
            class:flipping={isFlipping}
          >
            {#if displayedImage}
              {#if isVideoUrl(displayedImage)}
                <video src={displayedImage} autoplay loop muted playsinline
                ></video>
              {:else}
                <img src={displayedImage} alt="album art" />
              {/if}
            {/if}
            <div class="shadow"></div>
            <div class="shadow2"></div>
          </div>
        </div>
      </div>

      <!-- ── CENTER: LYRICS ── -->
      {#if sidebarVisible}
        <div
          class="center"
          class:nolyrics={loading || lines.length === 0 || !lyricsVisible}
        >
          <div class="info">
            <p
              class="song"
              style={loading || lines.length === 0 || !lyricsVisible
                ? "font-size: 5rem; transition: all 0.5s ease; white-space: normal; text-overflow: unset; text-align: left; width: 100%;"
                : "transition: all 0.5s ease; text-align: left; width: 100%;"}
            >
              {songDisplay}
            </p>
            <p class="artist">{artistDisplay}</p>
            <p
              class="transcriber"
              class:hidden={loading || lines.length === 0 || !lyricsVisible}
              style="text-align: left;"
            >
              {isWordLevelSync
                ? `Lyrics synced by ${lyr.transcriber || "Jason Sika or Akuro (Mockup)"}`
                : "Lyrics from LRCLIB"} <br />
              {hasEmbeddedTranslations
                ? `Translated by ${lyr.transcriber || "Jason Sika or Akuro (Mockup)"}`
                : "Translated with Google Translate"}
            </p>
          </div>
          {#if lyricsVisible || !loading}
            <div
              class="lyrics-safe"
              class:hidden={loading || lines.length === 0 || !lyricsVisible}
            >
              <div
                class="lyrics-root"
                bind:this={containerEl}
                class:hidden={loading || lines.length === 0 || !lyricsVisible}
              >
                {#if error}
                  <div class="lyrics-status lyrics-error">{error}</div>
                {:else}
                  <ul class="lyrics-list">
                    {#if lyricsExist && activeIndices.size === 0 && lastActiveIndex === -1}
                      <li class="lyrics-gap-dots">
                        <span></span><span></span><span></span>
                      </li>
                    {/if}
                    {#each lines as line, i}
                      {@const longestIdx = line.syllables.reduce(
                        (bi, s, idx) =>
                          s.end - s.begin >
                          line.syllables[bi].end - line.syllables[bi].begin
                            ? idx
                            : bi,
                        0,
                      )}
                      {@const lineState = activeIndices.has(i)
                        ? "active"
                        : i <= lastActiveIndex
                          ? "past"
                          : "upcoming"}
                      {@const nextLine = lines[i + 1]}
                      {@const gapAfter =
                        nextLine &&
                        nextLine.begin - line.end > 2 &&
                        $playbackSync.elapsed >= line.end &&
                        $playbackSync.elapsed < nextLine.begin}
                      <li
                        bind:this={lineEls[i]}
                        class="lyrics-line"
                        class:is-active={lineState === "active"}
                        class:is-back-active={backActiveIndices.has(i)}
                        class:is-past={lineState === "past"}
                        class:is-upcoming={lineState === "upcoming"}
                        class:is-background={line.isBackground}
                        class:is-oneliner={!isWordLevelData}
                        class:is-duet={line.isDuet}
                      >
                        <div class="lyrics-text">
                          {#each line.syllables as syl, si}
                            {@const isLong =
                              isWordLevelData && syl.end - syl.begin > 0.5}
                            {@const isLongest =
                              isWordLevelData && si === longestIdx && isLong}
                            {@render lyricWord(
                              syl,
                              $playbackSync.elapsed,
                              isLong,
                              isLongest,
                              i,
                              line,
                            )}
                          {/each}
                        </div>
                        {#if line.translation}
                          <div
                            class="lyrics-translation"
                            class:disabled-trad={!translation}
                          >
                            {line.translation}
                          </div>
                        {/if}
                      </li>
                      {#if gapAfter}
                        <li class="lyrics-gap-dots">
                          <span></span><span></span><span></span>
                        </li>
                      {/if}
                    {/each}
                    {#if lyr.songwriters}
                      <div class="lyrics-songwriters">
                        <span class="lyrics-songwriters-label">Written by</span>
                        <span class="lyrics-songwriters-names"
                          >{lyr.songwriters}</span
                        >
                      </div>
                    {/if}
                  </ul>
                {/if}
              </div>
            </div>
          {/if}
          <div class="center-bottom">
            <!-- <div class="buttonwrap">
              {#if !loading}
                <a
                  class="translation-toggle"
                  onclick={() => (translation = !translation)}
                >
                  {#if !translation}
                     - Trad
                  {:else}
                     - Trad
                  {/if}
                </a>
              {/if}
              <a class="debug-toggle" onclick={() => (debug = !debug)}
                >⁂ - Debug</a
              >
              <a
                class="lyrics-toggle"
                onclick={() => (visibleToggle = !visibleToggle)}
              >
                {visibleToggle ? " - Lyrics" : "🄰 - Lyrics"}
              </a>
            </div> -->
            <Playback3 />
            <div class="wrapper1" class:menushy={!submenuOpen}>
              <div class="buttonwrap">
                <a href="/">↖ - Home</a>
                {#if !loading}
                  <a
                    class="sidebar-toggle"
                    onclick={() => (sidebarVisible = !sidebarVisible)}
                  >
                    {sidebarVisible ? " - Info" : " - Info"}
                  </a>
                  <a
                    class="translation-toggle"
                    onclick={() => (translation = !translation)}
                  >
                    {#if !translation}
                       - Trad
                    {:else}
                       - Trad
                    {/if}
                  </a>
                {/if}
                <a class="debug-toggle" onclick={() => (debug = !debug)}
                  >⁂ - Debug</a
                >
                <a
                  class="lyrics-toggle"
                  onclick={() => (visibleToggle = !visibleToggle)}
                >
                  {visibleToggle ? " - Lyrics" : "🄰 - Lyrics"}
                </a>
              </div>
              <p class="herodetail" style="width: 100%;">
                {m.music_detail4()}
              </p>
            </div>
          </div>
        </div>
      {/if}

      {#if debug}
        <p
          style="font-size:10px;
          width:50dvw;
          color:red;
          position:fixed;
          top:0;
          z-index:999;
          gap: 5px;
          display: flex;
          flex-direction: column;"
        >
          match: {lyricsMatchDevice} <br />
          key: {lyricsState.currentKey} <br />
          device: {device.title}::{device.artist}::{device.album}
          isPlaying: {device.isPlaying} <br />
          lines: {lines.length} <br />
          loading: {loading}
          src: {!!src} <br />
          ttml: {!!ttmlString} <br />
          song: {songDisplay} <br />
          image: {displayedImage} <br />
          <a class="stringifier" onclick={() => (stringshown = !stringshown)}>
            {stringshown ? " String" : " String"}
          </a>
          {#if stringshown}
            stringify: {JSON.stringify($lyrics, null, 2)}
          {/if}
        </p>
      {/if}
    </div>

    <!-- ── FOOTER ── -->
  </div>
</div>

<style>
  @import "src/app.css";

  /* ── LAYOUT & CONTAINERS ────────────────────────────────────────────────── */

  .music-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100dvh;
    gap: 20px;
    transition: all 0.5s ease;
  }

  .hero {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #000 0%, #000 100%);
    height: 100dvh;
    overflow: hidden;
    width: 100%;
    transition: all 0.5s ease;
    z-index: 5;
  }

  .lyrics-display {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 20px;
    z-index: 5;
    width: 85dvw;
    height: 30dvw !important;
    align-self: center;
    justify-self: center;
    box-sizing: border-box;
    overflow: visible;
  }

  .now-playing {
    display: flex;
    flex-direction: column;
    gap: 32px;
    height: 30dvw !important;
    width: 30dvw !important;
    overflow: visible;
    aspect-ratio: 1/1 !important;
    transition: all 0.5s ease;
  }

  .now-playing.isLoading {
    position: relative;
    top: unset;
    left: unset;
    right: unset;
    padding: unset;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: unset;
    transition: all 0.5s ease;
  }

  .now-playing.isLoading .artworkwrap {
    width: 30dvw !important;
    height: 30dvw !important;
    transition: all 0.5s ease;
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    width: 50%;
    height: 30dvw;
    overflow: visible;
    mix-blend-mode: plus-lighter !important;
    transition: all 0.5s ease;
  }

  .nolyrics {
    justify-content: flex-end !important;
    gap: 30px;
  }

  .lyrics-safe {
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    z-index: 5;
    transition: all 0.5s ease;
  }
  /* ── STATUS & GAP INDICATOR ─────────────────────────────────────────────── */

  .lyrics-gap-dots {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 0;
    opacity: 1;
    list-style: none;
  }

  .lyrics-gap-dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fff;
    animation: dot-pulse 1.2s ease-in-out infinite;
  }

  .lyrics-gap-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .lyrics-gap-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes dot-pulse {
    0%,
    100% {
      transform: scale(0.8) translateY(-1px);
      opacity: 0.3;
      filter: blur(1px);
    }
    50% {
      transform: scale(0.9) translateY(2px);
      opacity: 1;
      filter: blur(0px);
    }
  }

  /* ── ARTWORK ────────────────────────────────────────────────────────────── */

  .artworkwrap {
    position: relative;
    width: 30dvw;
    height: 15dvw;
    flex-shrink: 0;
    mix-blend-mode: plus-lighter;
    z-index: 7;
    perspective: 800px;
    transform-style: preserve-3d;
  }

  .shadow {
    position: absolute;
    width: 100%;
    height: 100%;
    box-shadow: 0 0 0 2px inset #ffffff31;
    top: 0;
    left: 0;
    z-index: 10;
    mix-blend-mode: plus-lighter;
    border-radius: 20px;
  }

  .shadow2 {
    position: absolute;
    width: 100%;
    height: 100%;
    box-shadow: 0 0 0 2px #00000039;
    top: 0;
    left: 0;
    z-index: 10;
    mix-blend-mode: multiply;
    border-radius: 20px;
  }

  .artwork2 {
    will-change: auto;
    position: relative;
    width: 30dvw;
    height: 15dvw;
    background: #ffffff;
    flex-shrink: 0;
    mix-blend-mode: plus-lighter;
    z-index: 7;
    border-radius: 20px;
    mask: linear-gradient(to bottom, #00000051, #0000 70%);
    filter: blur(5px);
  }

  .artwork2 > img,
  .artwork2 > video {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: fill;
    transform: rotate(180deg) scaleX(-1);
    z-index: 7;
    border-radius: 20px;
  }

  .artwork {
    will-change: auto;
    position: relative;
    width: 30dvw;
    height: 30dvw;
    background: #ffffff;
    flex-shrink: 0;
    mix-blend-mode: plus-lighter;
    z-index: 7;
    border-radius: 20px;
  }

  .artwork img,
  .artwork video {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 7;
    border-radius: 20px;
  }

  .flipping {
    animation: flip 0.6s ease;
  }

  @keyframes flip {
    0% {
      transform: rotateY(0deg);
      filter: blur(0px) brightness(1) saturate(1);
    }
    50% {
      transform: rotateY(180deg);
      filter: blur(20px) brightness(2) saturate(2);
    }
    100% {
      transform: rotateY(360deg);
      filter: blur(0px) brightness(1) saturate(1);
    }
  }

  /* ── TYPOGRAPHY ─────────────────────────────────────────────────────────── */

  .info {
    display: flex;
    width: 25dvw;
    height: fit-content;
    width: 100%;
    flex-direction: column;
    align-items: start;
    justify-content: start;
    gap: 0px;
    transition: all 0.5s ease;
  }

  .info p {
    text-align: center;
  }

  .song {
    font-size: 35px;
    font-weight: 700;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: linear-gradient(to bottom, #ffffff, #ffffff69);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    mix-blend-mode: plus-lighter;
  }

  .artist {
    font-size: 20px;
    font-weight: 500;
    color: #ffffff61;
    mix-blend-mode: plus-lighter;
    margin: 0;
    opacity: 0.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .transcriber {
    font-size: 12px;
    color: #ffffff7f;
    margin: 0;
  }

  .herodetail {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    color: #ffffff40;
    font-size: 10px;
    font-weight: 600;
    max-width: 400px;
    line-height: 120%;
    gap: 20px;
    z-index: 10;
  }

  .wrapper1 {
    display: flex;
    flex-direction: column;
    align-items: start;
    justify-content: center;
    color: #ffffff40;
    font-size: 10px;
    font-weight: 600;
    width: 100%;
    padding-top: 20px;
    line-height: 120%;
    gap: 10px;
    z-index: 10;
    transition: all 0.5s ease;
  }

  .buttonwrap {
    display: flex;
    flex-direction: row;
    gap: 10px;
    align-items: start;
    justify-content: start;
    flex-wrap: wrap;
    font-size: 10px;
    font-weight: 600;
  }

  /* ── LYRICS ROOT & LIST ─────────────────────────────────────────────────── */

  .lyrics-root {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
    overflow-y: auto;
    overflow-x: clip;
    scrollbar-width: none;
    scroll-behavior: smooth;
    background: transparent;
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 10%,
      black 85%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 10%,
      black 85%,
      transparent 100%
    );
    transition: all 0.5s linear;
    mix-blend-mode: plus-lighter;
    z-index: 5;
    width: 100%;
  }

  .hidden {
    display: none;
  }

  .lyrics-list {
    list-style: none;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    box-sizing: border-box;
    overflow: visible;
    width: 100%;
    padding-top: 45vh;
    padding-bottom: 45vh;
    padding-inline: 0;
  }

  /* ── LYRICS LINES ───────────────────────────────────────────────────────── */

  .lyrics-line {
    transition:
      opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1),
      filter 0.5s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: left center;
    overflow: visible;
  }

  .lyrics-line.is-upcoming {
    opacity: 0.7;
    transform: scale(0.9);
  }
  .lyrics-line.is-past {
    opacity: 0;
    transform: scale(0.9);
  }

  .lyrics-line.is-background.is-upcoming {
    opacity: 0 !important;
    transform: translateY(-10px) translateX(-10px);
    max-height: 0;
    transition: all 0.5s ease;
  }

  .lyrics-line.is-background.is-active {
    opacity: 0.5 !important;
    transform: translateY(10px) translateX(10px);
    max-height: 100px;
    transition: all 0.2s ease;
    margin-bottom: 20px;
  }

  .lyrics-line.is-background.is-past {
    opacity: 0 !important;
    transform: translateY(-10px) translateX(-10px);
    max-height: 0;
    transition: all 0.5s ease;
    margin-bottom: 20px;
  }

  .lyrics-line.is-duet.is-background.is-active {
    transform: translateY(10px) translateX(-10px);
    transition: all 0.2s ease;
  }
  .lyrics-line.is-duet.is-background.is-past {
    transform: translateY(-10px) translateX(+10px);
    transition: all 0.5s ease;
  }

  .lyrics-line.is-active .lyrics-translation {
    opacity: 0.3;
    transform: translateY(10px) translateX(-2px);
    max-height: 200px;
    transition: all 0.2s ease;
    margin-bottom: 20px;
  }

  .lyrics-line.is-past .lyrics-translation {
    opacity: 0;
    transform: translateY(-10px);
    max-height: 0;
    transition: all 0.5s ease;
    margin-bottom: 0px;
  }

  .lyrics-line.is-active {
    opacity: 1;
    transform: translateX(10px) scale(1.02);
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.69))
      drop-shadow(0 0 7px rgba(255, 255, 255, 0.32));
  }

  .lyrics-line.is-duet {
    transform-origin: right center;
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: flex-end;
  }

  .lyrics-line.is-duet .lyrics-text {
    max-width: 80%;
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: flex-end;
    justify-self: flex-end;
    align-self: flex-end;
  }

  .lyrics-line.is-duet .lyrics-translation {
    text-align: right;
  }
  .lyrics-line.is-duet.is-active {
    transform: translateX(-10px) scale(1.02);
  }

  .lyrics-line.is-duet.is-upcoming {
    transform: translateX(-10px) scale(0.9);
  }
  .lyrics-line.is-duet.is-past {
    transform: translateX(-10px) scale(0.9);
  }
  .lyrics-line.is-duet.is-active {
    transform: translateX(-10px) scale(1.02);
  }

  .lyrics-line.is-duet .lyric-word-fill {
    -webkit-mask-image: linear-gradient(
      to right,
      black var(--pos),
      transparent calc(var(--pos) + var(--feather))
    );
    mask-image: linear-gradient(
      to right,
      black var(--pos),
      transparent calc(var(--pos) + var(--feather))
    );
  }

  .lyrics-line.is-background {
    flex-wrap: nowrap !important;
    opacity: 0.5;
  }

  .lyrics-line.is-background.is-upcoming {
    opacity: 0.3;
    transition: all 0.5s ease;
    font-weight: 100 !important;
  }

  .lyrics-line.is-background.is-back-active {
    font-weight: 600 !important;
    font-size: calc(var(--lyrics-font-size) * 0.75) !important;
    display: block !important;
    opacity: 0.7;
    transition: all 0.5s ease;
  }

  .is-background > .lyrics-text {
    font-weight: 600 !important;
    font-size: calc(var(--lyrics-font-size) * 0.75) !important;
  }

  /* ── LYRICS TEXT & WORDS ────────────────────────────────────────────────── */

  .lyrics-text {
    max-width: 80%;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15em 0;
    font-size: var(--lyrics-font-size);
    font-weight: 700;
    /* font-weight: 500; */
    line-height: 1.15;
    overflow: visible;
  }

  .lyrics-translation {
    font-size: calc(var(--lyrics-font-size) * 0.55);
    font-weight: 500;
    color: var(--lyrics-upcoming-color);
    margin-top: 4px;
    line-height: 1.2;
    letter-spacing: 0.01em;
    opacity: 0;
    transform: translateY(-10px);
    max-height: 0;
    overflow: hidden;
    transition: all 0.5s ease;
  }

  .disabled-trad {
    display: none;
  }

  .lyrics-line.is-active .lyrics-translation {
    color: var(--lyrics-past-color);
  }

  .lyric-word {
    position: relative;
    display: inline-flex;
    align-items: baseline;
    overflow: visible;
    transition: transform 0.8s cubic-bezier(0.34, 1.2, 0.64, 1);
  }

  .lyric-word.is-active {
    transform: scale(1.02) translateX(2px);
    transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
    /* filter: drop-shadow(0px 0px calc(var(--progress) * 8px) #ffffff2f);
    font-weight: calc(500 + var(--progress) * 200) !important;
    letter-spacing: calc(0.01em + var(--progress) * 0.02em) !important; */
  }

  .lyric-word.is-past {
    transform: scale(1);
    filter: drop-shadow(0 0 0 rgba(255, 255, 255, 0));
    transition: all 0.4s ease-out;
  }

  .is-upcoming {
    opacity: 0.7;
  }

  .lyric-space {
    display: inline-block;
    width: 0.32em;
    white-space: normal;
  }

  .lyric-word-base {
    color: var(--lyrics-upcoming-color);
    white-space: normal;
    overflow: visible;
  }

  .lyric-word-fill {
    position: absolute;
    inset: 0;
    width: inherit !important;
    color: var(--active-word);
    white-space: normal;
    --feather: 20px;
    --pos: -500px;
    -webkit-mask-image: linear-gradient(
      to right,
      black var(--pos),
      transparent calc(var(--pos) + var(--feather))
    );
    mask-image: linear-gradient(
      to right,
      black var(--pos),
      transparent calc(var(--pos) + var(--feather))
    );
    mask-size: 200%;
  }

  .lyric-word.is-upcoming .lyric-word-fill {
    --pos: -500px;
  }
  .lyric-word.is-active .lyric-word-fill {
    --pos: calc(var(--progress) * 110% - 5%);
  }
  .lyric-word.is-past .lyric-word-fill {
    --pos: 110%;
    transition: --pos 0.5s linear;
  }

  /* ── LONG WORDS & LETTER ANIMATION ─────────────────────────────────────── */

  .lyric-word-letters {
    display: inline-flex;
    align-items: baseline;
    overflow: visible;
    white-space: normal;
  }

  .lyric-word-letters-fill {
    position: absolute;
    inset: 0;
    color: var(--active-word);
    --feather: 20px;
    --pos: -500px;
    -webkit-mask-image: linear-gradient(
      to right,
      black var(--pos),
      transparent calc(var(--pos) + var(--feather))
    );
    mask-image: linear-gradient(
      to right,
      black var(--pos),
      transparent calc(var(--pos) + var(--feather))
    );
  }

  .lyric-word.is-long.is-upcoming .lyric-word-letters-fill {
    --pos: -500px;
  }
  .lyric-word.is-long.is-active .lyric-word-letters-fill {
    --pos: calc(var(--progress) * 110% - 5%);
  }
  .lyric-word.is-long.is-past .lyric-word-letters-fill {
    -webkit-mask-image: none;
    mask-image: none;
  }

  .lyric-word-letters-base {
    color: var(--lyrics-upcoming-color);
  }

  .lyric-letter {
    display: inline-block !important;
    position: relative;
    transform-origin: center;
    flex-shrink: 0;
    overflow: visible;
    will-change: transform;
  }

  .lyric-word.is-long.is-active .lyric-word-letters-base .lyric-letter,
  .lyric-word.is-long.is-active .lyric-word-letters-fill .lyric-letter {
    animation: letter-bloom calc(var(--word-dur) * 1.5)
      cubic-bezier(0.05, 0.93, 0.28, 1) forwards;
    animation-delay: calc(60ms + (var(--letter-index) * 38ms));
  }

  .lyrics-line.is-oneliner .lyric-word,
  .lyrics-line.is-oneliner .lyric-word-base,
  .lyrics-line.is-oneliner .lyric-word-fill {
    animation: none !important;
    transition: none !important;
  }

  .lyrics-line.is-oneliner .lyric-word-fill {
    -webkit-mask-image: none !important;
    mask-image: none !important;
    opacity: 0;
  }

  .lyrics-line.is-oneliner.is-active .lyric-word-fill,
  .lyrics-line.is-oneliner.is-past .lyric-word-fill {
    opacity: 1;
  }

  span.lyric-letter,
  span.lyric-space,
  span.lyric-word-base,
  span.lyric-word-fill {
    display: inline-block !important;
  }

  /* ── BACKGROUND BLUR LAYERS ─────────────────────────────────────────────── */

  .blur {
    position: fixed;
    top: 0;
    right: 0;
    width: 100dvw;
    height: 100dvh;
    background: #000;
    flex-shrink: 0;
    overflow: hidden;
    filter: blur(50px) saturate(1) brightness(0.1);
    opacity: 1;
    z-index: 2;
    scale: 3;
    animation: rotate 100s infinite;
  }

  .overlayvideo {
    position: fixed;
    top: 0;
    right: 0;
    width: 100dvw;
    height: 100dvh;
    mix-blend-mode: plus-lighter;
    z-index: 5;
    opacity: 0.2;
    object-fit: cover;
  }

  .floor {
    position: fixed;
    top: 0;
    right: 0;
    transform: translateY(50%);
    width: 100dvw;
    height: 100dvh;
    border-radius: 10000px;
    background: linear-gradient(to bottom, #81818145, #71717111 20%);
    mix-blend-mode: plus-lighter;
    flex-shrink: 0;
    overflow: hidden;
    filter: blur(10px);
    z-index: 2;
    scale: 2;
    animation: floor-pulse 7s ease-in-out infinite alternate;
  }

  @keyframes floor-pulse {
    0% {
      opacity: 0.3;
    }
    100% {
      opacity: 0.8;
    }
  }

  .blur img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.7;
  }

  .blurbg {
    position: fixed;
    top: 0;
    right: 0;
    width: 100dvw;
    height: 100dvh;
    background: #000;
    flex-shrink: 0;
    overflow: hidden;
    filter: blur(50px) saturate(5) brightness(0.5);
    opacity: 1;
    z-index: 1;
  }

  .blurbg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.7;
  }

  /* ── KEYFRAMES ──────────────────────────────────────────────────────────── */

  @keyframes rotate {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes letter-bloom {
    0% {
      transform: translateY(0) scale(1);
    }
    30% {
      transform: translateY(-4px) scale(1.1);
    }
    70% {
      transform: translateY(-2px) scale(1.1);
    }
    100% {
      transform: translateY(+2.2px) scale(1);
    }
  }

  @keyframes word-jitter {
    0% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-5px);
    }
    100% {
      transform: translateY(0);
    }
  }

  /* ── SONGWRITERS ────────────────────────────────────────────────────────── */

  .lyrics-songwriters {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 32px 0 0;
    opacity: 0.4;
    transition: opacity 0.4s ease;
  }

  .lyrics-songwriters:hover {
    opacity: 0.7;
  }

  .lyrics-songwriters-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fff;
  }

  .lyrics-songwriters-names {
    font-size: 13px;
    font-weight: 400;
    color: #fff;
    line-height: 1.5;
  }

  /* ── RESPONSIVE (≤ 1079px) ──────────────────────────────────────────────── */

  @media (max-width: 1079px) {
    :root {
      --lyrics-font-size: 40px !important;
    }

    .lyrics-display {
      position: fixed;
      inset: 0;
      height: 100dvh !important;
      width: 100%;
      min-height: 0;
      max-height: none;
      transform: none;
      padding: 0 16px 12px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .center {
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      align-items: stretch;
    }

    .nolyrics {
      flex: unset !important;
      gap: 10px;
      height: fit-content;
      justify-content: center;
      align-items: center;
    }

    .nolyrics > .info {
      justify-content: center;
      align-items: center;
      padding-left: 0px !important;
      padding-top: 0px !important;
      width: 60dvw !important;
    }

    .nolyrics > .info > .song {
      font-size: 30px !important;
      text-align: center !important;
    }

    .nolyrics > .info > .artist {
      font-size: 20px !important;
      text-align: center !important;
    }

    .playback-column {
      padding: 10px 0px;
      flex: 0 0 auto;
      align-self: center;
      min-width: max-content;
    }

    .lyrics-safe {
      flex: 1 1 0;
      width: auto;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .lyrics-root {
      flex: 1 1 0;
      width: 100% !important;
      height: auto !important;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-left: 10px;
    }

    .now-playing {
      position: absolute;
      top: 0px;
      left: 0;
      right: 0;
      margin-inline: none;
      width: 100dvw;
      height: auto;
      flex-shrink: 0;
      padding: 30px;
      padding-top: 50px;
      gap: 12px;
      box-sizing: border-box;
      overflow: visible;
      z-index: 20;
      flex-direction: row;
      align-items: start;
      justify-content: flex-start;
    }

    .artworkwrap {
      width: 90px !important;
      height: 90px !important;
      border-radius: 5px;
    }

    .artwork {
      width: 90px;
      height: 90px;
      flex-shrink: 0;
      border-radius: 5px;
    }

    .artwork > img,
    .artwork > video {
      width: 90px;
      height: 90px;
      object-fit: cover;
      border-radius: 5px;
    }

    .shadow {
      width: 90px;
      height: 90px;
      border-radius: 5px;
    }

    .shadow2 {
      width: 90px;
      height: 90px;
      border-radius: 5px;
    }

    .artwork2 {
      display: none;
    }

    .artworkbg {
      display: none;
    }

    .info {
      width: 100%;
      min-width: 0;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      height: fit-content !important;
      padding-left: 120px;
      padding-top: 60px;
    }

    .song {
      text-align: left !important;
      font-size: 15px;
      width: 100%;
    }

    .transcriber {
      text-align: left !important;
      font-size: 12px;
      width: 100%;
    }

    .artist {
      text-align: left !important;
      font-size: 12px;
      width: 100%;
    }

    .lyrics-list {
      padding-top: 30dvh;
      padding-bottom: 30dvh;
    }

    .wrapper1 {
      display: flex;
      flex-direction: column;
      padding: 20px;
      justify-content: center;
      align-items: center;
      transition: all 0.5s ease;
    }

    .nolyrics > .center-bottom {
      width: 60dvw;
      display: flex;
      flex-direction: column;
    }

    .nolyrics > .center-bottom > .wrapper1 {
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ffffff40;
      font-size: 10px;
      font-weight: 600;
      width: 100dvw;
      padding: 30px;
      line-height: 120%;
      gap: 10px;
      z-index: 10;
      transition: all 0.5s ease;
    }

    .buttonwrap {
      display: flex;
      flex-direction: row;
      justify-content: center;
      align-items: center;
      gap: 5px;
      width: 100%;
    }

    a {
      z-index: 10;
    }

    a:hover {
      margin-block: 5px;
      transform: scale(1.05);
    }

    .wrapper1 p {
      width: 100% !important;
      text-align: center;
      max-width: 400px;
    }

    .now-playing.isLoading {
      position: relative;
      top: unset;
      left: unset;
      right: unset;
      width: 60dvw !important;
      height: 60dvw !important;
      flex-shrink: 0;
      padding: unset;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 32px;
      z-index: unset;
      transition: all 0.5s ease;
    }

    .now-playing.isLoading .artworkwrap {
      width: 60dvw !important;
      height: 60dvw !important;
      transition: all 0.5s ease;
    }
    .now-playing.isLoading .artwork {
      width: 60dvw;
      height: 60dvw;
      transition: all 0.5s ease;
    }
    .now-playing.isLoading .artwork2 {
      opacity: 0.3;
      width: 60dvw;
      height: 15dvw;
      display: block;
      transition: all 0.5s ease;
    }
  }
</style>
