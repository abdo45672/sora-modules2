const PROXY = "https://sc-proxy-lun2.vercel.app";
const BASE  = "https://altadefinizionestreaming.com";

async function scFetch(path) {
    const url = `${PROXY}/api/proxy?url=${encodeURIComponent(BASE + path)}`;
    try {
        const r = await fetchv2(url, {}, 'GET', null);
        if (r) return r;
    } catch {}
    try { return await fetch(url); } catch { return null; }
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
async function search(keyword) {
    try {
        const res = await scFetch(`/?s=${encodeURIComponent(keyword)}`);
        if (!res) return JSON.stringify([]);
        const html = await res.text();

        const results = [];
        // Each result card: <article ...> with link, title, image inside
        const cardRegex = /<article[^>]*>([\s\S]*?)<\/article>/g;
        let card;
        while ((card = cardRegex.exec(html)) !== null) {
            const block = card[1];

            const hrefMatch  = block.match(/href="(https:\/\/altadefinizionestreaming\.com\/(?:film|serie)[^"]+)"/);
            const titleMatch = block.match(/(?:title|alt)="([^"]+)"/);
            const imgMatch   = block.match(/<img[^>]+src="([^"]+)"/);

            if (hrefMatch && titleMatch) {
                results.push({
                    title: titleMatch[1].trim(),
                    href:  hrefMatch[1],
                    image: imgMatch ? imgMatch[1] : "",
                });
            }
        }
        return JSON.stringify(results);
    } catch (e) {
        console.log("search error:", e);
        return JSON.stringify([]);
    }
}

// ── DETAILS ──────────────────────────────────────────────────────────────────
async function extractDetails(url) {
    try {
        const path = url.replace(BASE, "");
        const res  = await scFetch(path);
        if (!res) return JSON.stringify([]);
        const html = await res.text();

        const desc    = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || "N/A";
        const airdate = (html.match(/(\d{4})/) || [])[1] || "N/A";

        return JSON.stringify([{ description: desc, aliases: "N/A", airdate }]);
    } catch (e) {
        console.log("details error:", e);
        return JSON.stringify([]);
    }
}

// ── EPISODES ─────────────────────────────────────────────────────────────────
async function extractEpisodes(url) {
    try {
        const path = url.replace(BASE, "");
        const res  = await scFetch(path);
        if (!res) return JSON.stringify([]);
        const html = await res.text();

        // Extract TMDB id from the page
        const tmdbMatch = html.match(/tmdbId["\s:]+(\d+)/) ||
                          html.match(/data-tmdb["\s:]+(\d+)/) ||
                          html.match(/\/api\/(\d+)/);
        if (!tmdbMatch) return JSON.stringify([]);
        const tmdbId = tmdbMatch[1];

        const isSeries = url.includes("/serie");

        if (!isSeries) {
            // Movie — single episode pointing to stream API
            return JSON.stringify([{
                href:   `${BASE}/api/${tmdbId}`,
                number: 1,
            }]);
        }

        // Series — find seasons + episodes
        const episodes = [];
        const seasonMatches = [...html.matchAll(/data-season="(\d+)"/g)];
        const seasons = [...new Set(seasonMatches.map(m => m[1]))];
        if (seasons.length === 0) seasons.push("1");

        for (const season of seasons) {
            const sRes  = await scFetch(`/?tmdbId=${tmdbId}&season=${season}`);
            const sHtml = sRes ? await sRes.text() : "";
            const epMatches = [...sHtml.matchAll(/data-episode="(\d+)"/g)];
            const eps = [...new Set(epMatches.map(m => m[1]))];
            if (eps.length === 0) eps.push("1");

            for (const ep of eps) {
                episodes.push({
                    href:   `${BASE}/api/${tmdbId}?type=tv&season=${season}&episode=${ep}`,
                    number: parseInt(ep),
                });
            }
        }

        return JSON.stringify(episodes.length ? episodes : [{
            href:   `${BASE}/api/${tmdbId}?type=tv&season=1&episode=1`,
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
        // url is already /api/{tmdbId} or /api/{tmdbId}?type=tv&...
        const path = url.replace(BASE, "");
        const res  = await scFetch(path);
        if (!res) return null;

        const data = await res.json();
        if (!data.sources || data.sources.length === 0) return null;

        // Pick highest priority CDN mp4 source
        const cdn = data.sources
            .filter(s => s.provider === "cdn" && s.url)
            .sort((a, b) => a.priority - b.priority)[0];

        if (cdn) return cdn.url;

        // Fallback to first available source
        return data.sources[0].url || null;
    } catch (e) {
        console.log("stream error:", e);
        return null;
    }
}
