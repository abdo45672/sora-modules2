const PROXY = "https://sc-proxy-lun2.vercel.app";
const BASE  = "https://altadefinizionestreaming.com";
const SID   = "890ca8133da39c493f462525c8a5f109b008a8ac96436e36d38f7b6cd23936c2";

async function proxyFetch(path) {
    const url = `${PROXY}/api/proxy?url=${encodeURIComponent(BASE + path)}`;
    const response = await fetchv2(url, {
        "Accept": "application/json, text/html, */*"
    });
    return response;
}

async function directFetch(path) {
    const url = BASE + path;
    const response = await fetchv2(url, {
        "Accept": "application/json",
        "Cookie": `sid=${SID}`,
        "Referer": BASE + "/",
    });
    return response;
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
async function searchResults(keyword) {
    try {
        const response = await proxyFetch(`/api/search-live?q=${encodeURIComponent(keyword)}`);
        const text = await response.text();

        // Parse raw escaped JSON string directly
        const tmdbIds = [...text.matchAll(/data-tmdb-id=\\"(\d+)\\"/g)].map(x => x[1]);
        const titles  = [...text.matchAll(/data-title=\\"([^"\\]+)\\"/g)].map(x => x[1]);
        const urls    = [...text.matchAll(/data-url=\\"([^"\\]+)\\"/g)].map(x => x[1]);
        const posters = [...text.matchAll(/data-poster=\\"([^"\\]+)\\"/g)].map(x => x[1]);

        const results = [];
        for (let i = 0; i < tmdbIds.length; i++) {
            if (!titles[i]) continue;
            results.push({
                title: titles[i],
                image: posters[i] || "",
                href:  BASE + (urls[i] || `/film/${tmdbIds[i]}`),
            });
        }

        return JSON.stringify(results);
    } catch (e) {
        console.log("searchResults error:", e);
        return JSON.stringify([]);
    }
}

// ── DETAILS ──────────────────────────────────────────────────────────────────
async function extractDetails(url) {
    try {
        const path = url.replace(BASE, "");
        const response = await proxyFetch(path);
        const html = await response.text();

        const desc = (html.match(/data-plot="([^"]+)"/) || [])[1] ||
                     (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || "N/A";
        const year = (html.match(/data-year="(\d{4})"/) || [])[1] || "N/A";

        return JSON.stringify([{
            description: desc,
            aliases: "N/A",
            airdate: year,
        }]);
    } catch (e) {
        console.log("extractDetails error:", e);
        return JSON.stringify([]);
    }
}

// ── EPISODES ─────────────────────────────────────────────────────────────────
async function extractEpisodes(url) {
    try {
        const path = url.replace(BASE, "");
        const response = await proxyFetch(path);
        const html = await response.text();

        const tmdbId = (html.match(/data-tmdb-id="(\d+)"/) || [])[1] ||
                       (html.match(/"tmdbId"\s*:\s*(\d+)/) || [])[1];
        if (!tmdbId) return JSON.stringify([]);

        const isSeries = url.includes("/serie");

        if (!isSeries) {
            return JSON.stringify([{
                href:   `${BASE}/api/player-sources/movie/${tmdbId}`,
                number: 1,
            }]);
        }

        const episodes = [];
        const seasonNums = [...html.matchAll(/data-season-number="(\d+)"/g)].map(m => m[1]);
        const seasons = seasonNums.length ? [...new Set(seasonNums)] : ["1"];

        for (const season of seasons) {
            const sRes  = await proxyFetch(`/api/season/${tmdbId}?season=${season}`);
            const sData = await sRes.json();
            const eps   = sData.episodes || [];

            for (const ep of eps) {
                const epNum = ep.number || ep.episode_number || 1;
                episodes.push({
                    href:   `${BASE}/api/player-sources/tv/${tmdbId}?season=${season}&episode=${epNum}`,
                    number: epNum,
                });
            }
        }

        return JSON.stringify(episodes.length ? episodes : [{
            href:   `${BASE}/api/player-sources/tv/${tmdbId}?season=1&episode=1`,
            number: 1,
        }]);
    } catch (e) {
        console.log("extractEpisodes error:", e);
        return JSON.stringify([]);
    }
}

// ── STREAM URL ────────────────────────────────────────────────────────────────
async function extractStreamUrl(url) {
    try {
        const path = url.replace(BASE, "");
        const response = await directFetch(path);
        const data = await response.json();

        if (!data.sources || data.sources.length === 0) return null;

        const cdn = data.sources
            .filter(s => s.provider === "cdn" && s.url)
            .sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];

        if (cdn) return cdn.url;

        const any = data.sources.find(s => s.url);
        return any ? any.url : null;
    } catch (e) {
        console.log("extractStreamUrl error:", e);
        return null;
    }
}
