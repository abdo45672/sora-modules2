const PROXY = "https://sc-proxy-lun2.vercel.app";
const BASE  = "https://altadefinizionestreaming.com";
const SID   = "890ca8133da39c493f462525c8a5f109b008a8ac96436e36d38f7b6cd23936c2";

async function proxyFetch(path) {
    const url = `${PROXY}/api/proxy?url=${encodeURIComponent(BASE + path)}`;
    try {
        const r = await fetchv2(url, { "Accept": "application/json, text/html, */*" }, 'GET', null);
        if (r) return r;
    } catch {}
    try { return await fetch(url); } catch { return null; }
}

async function directFetch(path) {
    const url = BASE + path;
    try {
        const r = await fetchv2(url, {
            "Accept": "application/json",
            "Cookie": `sid=${SID}`,
            "Referer": BASE + "/",
        }, 'GET', null);
        if (r) return r;
    } catch {}
    try {
        return await fetch(url, {
            headers: { "Accept": "application/json", "Cookie": `sid=${SID}`, "Referer": BASE + "/" }
        });
    } catch { return null; }
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
async function search(keyword) {
    try {
        const res = await proxyFetch(`/api/search-live?q=${encodeURIComponent(keyword)}`);
        if (!res) return JSON.stringify([]);

        const text = await res.text();
        
        // Parse the outer JSON first
        let html = "";
        try {
            const data = JSON.parse(text);
            html = data.html || "";
        } catch {
            html = text;
        }

        // Unescape the HTML (the JSON encoding escapes quotes and newlines)
        html = html
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\\//g, '/');

        const results = [];
        const tmdbIds = [...html.matchAll(/data-tmdb-id="(\d+)"/g)].map(x => x[1]);
        const titles  = [...html.matchAll(/data-title="([^"]+)"/g)].map(x => x[1]);
        const urls    = [...html.matchAll(/data-url="([^"]+)"/g)].map(x => x[1]);
        const posters = [...html.matchAll(/data-poster="([^"]+)"/g)].map(x => x[1]);

        for (let i = 0; i < tmdbIds.length; i++) {
            results.push({
                href:  BASE + (urls[i] || `/film/${tmdbIds[i]}`),
                title: titles[i] || "",
                image: posters[i] || "",
            });
        }

        return JSON.stringify(results.filter(r => r.title));
    } catch (e) {
        console.log("search error:", e);
        return JSON.stringify([]);
    }
}

// ── DETAILS ──────────────────────────────────────────────────────────────────
async function extractDetails(url) {
    try {
        const path = url.replace(BASE, "");
        const res  = await proxyFetch(path);
        if (!res) return JSON.stringify([]);
        const html = await res.text();

        const desc = (html.match(/data-plot="([^"]+)"/) || [])[1] ||
                     (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || "N/A";
        const year = (html.match(/data-year="(\d{4})"/) || [])[1] || "N/A";

        return JSON.stringify([{
            description: desc.replace(/\\n/g, ' '),
            aliases: "N/A",
            airdate: year,
        }]);
    } catch (e) {
        console.log("details error:", e);
        return JSON.stringify([]);
    }
}

// ── EPISODES ─────────────────────────────────────────────────────────────────
async function extractEpisodes(url) {
    try {
        const path = url.replace(BASE, "");
        const res  = await proxyFetch(path);
        if (!res) return JSON.stringify([]);
        const html = await res.text();

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
            if (!sRes) continue;
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
        console.log("episodes error:", e);
        return JSON.stringify([]);
    }
}

// ── STREAM URL ────────────────────────────────────────────────────────────────
async function extractStreamUrl(url) {
    try {
        const path = url.replace(BASE, "");
        const res  = await directFetch(path);
        if (!res) return null;

        const data = await res.json();
        if (!data.sources || data.sources.length === 0) return null;

        const cdn = data.sources
            .filter(s => s.provider === "cdn" && s.url)
            .sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];

        if (cdn) return cdn.url;

        const any = data.sources.find(s => s.url);
        return any ? any.url : null;
    } catch (e) {
        console.log("stream error:", e);
        return null;
    }
}
