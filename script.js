async function getLandingWebsiteHref() {
    return "streaming-community.fans";
}

async function search(keyword) {
    const landingUrl = await getLandingWebsiteHref();

    const response = await soraFetch(
        `https://${landingUrl}/it/archive?search=${encodeURIComponent(keyword)}`, 
        {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia": "true"
            }
        }
    );
    
    if (!response) return JSON.stringify([]);
    const html = await response.text();

    const regex = /<div[^>]*id="app"[^>]*data-page="([^"]*)"/;
    let match = regex.exec(html);

    if (!match || !match[1]) {
        try {
            const parsedJson = JSON.parse(html);
            const titles = parsedJson.props?.titles || [];
            return parseTitles(titles, landingUrl);
        } catch(e) {
            return JSON.stringify([]);
        }
    }

    const dataPage = match[1].replaceAll(`&quot;`, `"`);
    const pageData = JSON.parse(dataPage);
    const titles = pageData.props?.titles || [];

    return parseTitles(titles, landingUrl);
}

function parseTitles(titles, landingUrl) {
    const results = titles
        .map((item) => {
            const posterImage = item.images?.find((img) => img.type === "poster");
            return {
                title: item.name?.replaceAll("amp;", "").replaceAll("&#39;", "'") || "",
                image: posterImage?.filename ?
                    `https://cdn.${landingUrl}/images/${posterImage.filename}` :
                    "",
                href: `https://${landingUrl}/it/titles/${item.id}-${item.slug}`,
            };
        })
        .filter((item) => item.image) || [];

    return JSON.stringify(results);
}

async function extractDetails(url) {
    const cleanUrl = url.replace(/\/season-\d+$/, "");
    const response = await soraFetch(`${cleanUrl}/season-1`, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "X-Requested-With": "XMLHttpRequest",
            "X-Inertia": "true"
        }
    });
    if (!response) return JSON.stringify([]);
    const html = await response.text();

    let titleData = null;
    const regex = /<div[^>]*id="app"[^>]*data-page="([^"]*)"/;
    const match = regex.exec(html);

    if (!match || !match[1]) {
        try {
            const parsedJson = JSON.parse(html);
            titleData = parsedJson.props?.title;
        } catch(e) {
            return JSON.stringify([]);
        }
    } else {
        const dataPage = match[1].replaceAll(`&quot;`, `"`);
        const pageData = JSON.parse(dataPage);
        titleData = pageData.props?.title;
    }

    if (!titleData) return JSON.stringify([]);

    return JSON.stringify([{
        description: titleData.plot?.replaceAll("amp;", "").replaceAll("&#39;", "'") || "N/A",
        aliases: titleData.original_name?.replaceAll("amp;", "").replaceAll("&#39;", "'") || "N/A",
        airdate: titleData.release_date || "N/A",
    }]);
}

async function extractEpisodes(url) {
    try {
        const landingUrl = await getLandingWebsiteHref();
        const episodes = [];
        const baseUrl = url.replace(/\/season-\d+$/, "");

        const response = await soraFetch(`${baseUrl}/season-1`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "X-Requested-With": "XMLHttpRequest",
                "X-Inertia": "true"
            }
        });
        if (!response) return JSON.stringify([]);
        const html = await response.text();

        let pageData = null;
        const regex = /<div[^>]*id="app"[^>]*data-page="([^"]*)"/;
        const match = regex.exec(html);

        if (!match?.[1]) {
            try {
                pageData = JSON.parse(html);
            } catch(e) {
                return JSON.stringify([]);
            }
        } else {
            pageData = JSON.parse(match[1].replaceAll(`&quot;`, `"`));
        }

        const titleData = pageData?.props?.title;
        if (!titleData) return JSON.stringify([]);

        const titleId = titleData.id;
        const totalSeasons = titleData.seasons_count || 1;
        let hasEpisodes = false;

        for (let season = 1; season <= totalSeasons; season++) {
            try {
                const seasonResponse = await soraFetch(`${baseUrl}/season-${season}`, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Inertia": "true"
                    }
                });
                if (!seasonResponse) continue;
                const seasonHtml = await seasonResponse.text();

                let seasonData = null;
                const seasonMatch = regex.exec(seasonHtml);

                if (!seasonMatch?.[1]) {
                    try {
                        seasonData = JSON.parse(seasonHtml);
                    } catch(e) {}
                } else {
                    seasonData = JSON.parse(seasonMatch[1].replaceAll(`&quot;`, `"`));
                }

                const seasonEpisodes = seasonData?.props?.loadedSeason?.episodes || [];

                if (seasonEpisodes.length > 0) {
                    hasEpisodes = true;
                    seasonEpisodes.forEach((episode) => {
                        episodes.push({
                            href: `https://${landingUrl}/it/iframe/${titleId}?episode_id=${episode.id}`,
                            number: episode.number || episodes.length + 1,
                        });
                    });
                }
            } catch (error) {
                console.log(`Error fetching season ${season}:`, error);
            }
        }

        if (!hasEpisodes) {
            episodes.push({
                href: `https://${landingUrl}/it/iframe/${titleId}`,
                number: 1,
            });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        let modifiedUrl = url;
        if (!url.includes("/it/iframe") && !url.includes("/en/iframe")) {
            modifiedUrl = url.replace("/iframe", "/it/iframe");
        }
        const response1 = await soraFetch(modifiedUrl);
        if (!response1) return null;
        const html1 = await response1.text();

        const iframeMatch = html1.match(/<iframe[^>]*src="([^"]*)"/);
        if (!iframeMatch) return null;

        const embedUrl = iframeMatch[1].replace(/amp;/g, "");
        const response2 = await soraFetch(embedUrl, {
            headers: { 'Referer': modifiedUrl }
        });
        if (!response2) return null;
        const html2 = await response2.text();

        let finalUrl = null;

        if (html2.includes("window.masterPlaylist")) {
            const urlMatch = html2.match(/url:\s*['"]([^'"]+)['"]/);
            const tokenMatch = html2.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
            const expiresMatch = html2.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);

            if (urlMatch && tokenMatch && expiresMatch) {
                const baseUrl = urlMatch[1];
                const token = tokenMatch[1];
                const expires = expiresMatch[1];
                finalUrl = baseUrl.includes("?b=1") ? `${baseUrl}&token=${token}&expires=${expires}&h=1` : `${baseUrl}?token=${token}&expires=${expires}&h=1`;
            }
        }

        if (!finalUrl) {
            const m3u8Match = html2.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
            if (m3u8Match) finalUrl = m3u8Match[1];
        }

        if (finalUrl) return finalUrl;
        return null;
    } catch (error) {
        return null;
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
