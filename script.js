// =============================================
// Archive.org Movies - Sora Module
// =============================================

// 1. SEARCH
// Called when the user types a search query in Sora.
// Input:  keyword (string) — the search term
// Output: JSON array of { title, image, href }
async function searchResults(keyword) {
    try {
        const encoded = encodeURIComponent(keyword);
        const response = await fetch(
            `https://archive.org/advancedsearch.php?q=${encoded}+AND+mediatype:movies&fl[]=identifier,title,description,year,subject&rows=20&output=json`
        );
        const data = JSON.parse(response);

        const results = data.response.docs.map(item => ({
            title: item.title || item.identifier,
            image: `https://archive.org/services/img/${item.identifier}`,
            href: `https://archive.org/details/${item.identifier}`
        }));

        return JSON.stringify(results);
    } catch (e) {
        console.log('searchResults error:', e);
        return JSON.stringify([]);
    }
}

// 2. DETAILS
// Called when the user taps on a search result.
// Input:  url (string) — the href from searchResults
// Output: JSON array of { description, aliases, airdate }
async function extractDetails(url) {
    try {
        const id = url.split('/details/')[1].split('?')[0];
        const response = await fetch(
            `https://archive.org/metadata/${id}`
        );
        const data = JSON.parse(response);
        const meta = data.metadata;

        const subject = meta.subject
            ? (Array.isArray(meta.subject) ? meta.subject.join(', ') : meta.subject)
            : 'N/A';

        return JSON.stringify([{
            description: meta.description || 'No description available.',
            aliases: subject,
            airdate: meta.year || meta.date || 'Unknown'
        }]);
    } catch (e) {
        console.log('extractDetails error:', e);
        return JSON.stringify([{
            description: 'Error loading description.',
            aliases: 'N/A',
            airdate: 'Unknown'
        }]);
    }
}

// 3. EPISODES
// Called to build the episode list.
// For movies there is only one item, so we return a single entry.
// Input:  url (string) — the detail page URL
// Output: JSON array of { href, number }
async function extractEpisodes(url) {
    try {
        return JSON.stringify([{
            href: url,
            number: "1"
        }]);
    } catch (e) {
        console.log('extractEpisodes error:', e);
        return JSON.stringify([]);
    }
}

// 4. STREAM URL
// Called when the user presses Play.
// Fetches the archive metadata and finds the best video file available.
// Input:  url (string) — the episode href
// Output: direct video URL (string) or null
async function extractStreamUrl(url) {
    try {
        const id = url.split('/details/')[1].split('?')[0];
        const response = await fetch(`https://archive.org/metadata/${id}`);
        const data = JSON.parse(response);

        const files = data.files || [];

        // Prefer MP4, fall back to AVI or MKV
        const video =
            files.find(f => f.name.endsWith('.mp4')) ||
            files.find(f => f.name.endsWith('.avi')) ||
            files.find(f => f.name.endsWith('.mkv'));

        if (video) {
            return `https://archive.org/download/${id}/${encodeURIComponent(video.name)}`;
        }

        console.log('No video file found for:', id);
        return null;
    } catch (e) {
        console.log('extractStreamUrl error:', e);
        return null;
    }
}
