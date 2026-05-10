interface Env {
	TOKYO_INSIDER_BASE_URL: string;
}

interface AnimeInfo {
	id: string;
	title: string;
	types: {
		episode?: number;
		ova?: number;
		special?: number;
		movie?: number;
	};
}

interface DownloadLink {
	link: string;
	episode: string;
	filename?: string;
	type: string;
	size: string;
	downloads: number;
	uploader: string;
	date: string;
	status: string;
}

const HEADERS = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36',
	'Accept-Language': 'en-US, en;q=0.5'
};

const TYPE_MAP: Record<string, string> = {
	"episode": "Episodes",
	"ova": "OVAs",
	"special": "Specials",
	"movie": "Movies"
};

function convertSize(sizeStr: string): number {
	sizeStr = sizeStr.replace(/,/g, "").toUpperCase().trim();
	if (sizeStr.includes('GB')) {
		return parseFloat(sizeStr.replace('GB', '').trim()) * 1024;
	} else if (sizeStr.includes('MB')) {
		return parseFloat(sizeStr.replace('MB', '').trim());
	}
	return 0;
}

function convertDate(dateStr: string): Date {
	try {
		const parts = dateStr.split('/');
		const month = parseInt(parts[0], 10);
		const day = parseInt(parts[1], 10);
		let year = parseInt(parts[2], 10);
		if (year < 100) year += 2000;
		return new Date(year, month - 1, day);
	} catch {
		return new Date(0);
	}
}

async function searchAnime(query: string, baseUrl: string): Promise<AnimeInfo[]> {
	const autocompleteUrl = `${baseUrl}/upload/autocomplete.js`;

	try {
		const response = await fetch(autocompleteUrl, { headers: HEADERS });

		if (!response.ok) {
			throw new Error(`Search failed: ${response.status}`);
		}

		const jsContent = await response.text();
		const animeList: AnimeInfo[] = [];
		const queryLower = query.toLowerCase();
		const maxResults = 20;

		let pos = 0;
		while (animeList.length < maxResults && pos < jsContent.length - 100) {
			const foundIdx = jsContent.toLowerCase().indexOf(queryLower, pos);
			if (foundIdx === -1) break;

			const entryStart = jsContent.lastIndexOf('["', foundIdx);
			if (entryStart === -1) {
				pos = foundIdx + 1;
				continue;
			}

			let entryEnd = jsContent.indexOf('"]', foundIdx);
			if (entryEnd === -1 || entryEnd - entryStart > 200) {
				pos = foundIdx + 1;
				continue;
			}

			const entry = jsContent.substring(entryStart + 2, entryEnd);
			const commaIdx = entry.lastIndexOf('","');

			if (commaIdx > 0 && commaIdx < entry.length - 10) {
				const title = entry.substring(0, commaIdx);
				const pathWithEscapes = entry.substring(commaIdx + 3);
				const id = pathWithEscapes.replace(/\\/g, '').replace(/^\/anime\//, '/anime/');

				if (id.startsWith('/anime/') && title.length > 0) {
					animeList.push({ id, title, types: {} });
				}
			}

			pos = entryEnd + 2;
		}

		return animeList;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Search failed: ${error.message}`);
		}
		throw error;
	}
}

async function getAnimeDetails(animeId: string, baseUrl: string): Promise<{
	title: string;
	types: Record<string, { link: string; text: string }[]>;
	animeTitle: string;
}> {
	const url = `${baseUrl}${animeId}`;

	const response = await fetch(url, { headers: HEADERS });
	if (!response.ok) {
		throw new Error(`Failed to fetch anime: ${response.status}`);
	}

	const html = await response.text();

	// Get anime title - look for the title in the page
	const titleMatch = html.match(/<title>([^@<]+)/);
	const titleFromTitle = titleMatch ? titleMatch[1].trim().replace(/ @.*/, '') : 'Unknown';

	// Try to get from meta og:title
	const ogTitleMatch = html.match(/property="og:title" content="([^"]+)"/);
	const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : titleFromTitle;

	// Try h1
	const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
	const h1Title = h1Match ? h1Match[1].trim() : ogTitle;

	const title = h1Title;

	// Find all download links - they have class="download-link"
	// Format: <a class="download-link" href="/anime/B/Bleach_(TV)/episode/406">Bleach <em>episode</em> <strong>406</strong></a>
	const types: Record<string, { link: string; text: string }[]> = {
		episode: [],
		ova: [],
		special: [],
		movie: []
	};

	// Match download-link anchors
	const downloadLinkRegex = /<a[^>]+class="download-link"[^>]+href="(\/anime\/[^"]+)"[^>]*>[\s\S]*?<em>([^<]+)<\/em>[\s\S]*?<strong>([^<]+)<\/strong>/g;
	let match;

	while ((match = downloadLinkRegex.exec(html)) !== null) {
		const link = match[1];
		const typeStr = match[2].trim().toLowerCase(); // episode, ova, special, movie
		const episodeNum = match[3].trim();

		// Map the type string to our types
		let mappedType = 'episode';
		if (typeStr.includes('ova') || typeStr.includes('ova')) {
			mappedType = 'ova';
		} else if (typeStr.includes('special')) {
			mappedType = 'special';
		} else if (typeStr.includes('movie')) {
			mappedType = 'movie';
		} else if (typeStr.includes('episode')) {
			mappedType = 'episode';
		}

		// Check URL for type too
		if (link.includes('/episode/')) mappedType = 'episode';
		else if (link.includes('/ova/')) mappedType = 'ova';
		else if (link.includes('/special/')) mappedType = 'special';
		else if (link.includes('/movie/')) mappedType = 'movie';

		types[mappedType].push({ link, text: episodeNum });
	}

	// Sort each type by episode number (descending - newest first)
	for (const type of Object.keys(types)) {
		types[type].sort((a, b) => {
			const aNum = parseInt(a.text, 10) || 0;
			const bNum = parseInt(b.text, 10) || 0;
			return bNum - aNum; // descending
		});
	}

	return { title, types, animeTitle: title };
}

interface ParsedDownload {
	size: number;
	downloads: number;
	date: Date;
	uploader: string;
	downloadLink: string;
	filename: string;
}

async function processLink(link: string, type: string, choice: string): Promise<DownloadLink | null> {
	try {
		const response = await fetch(link, { headers: HEADERS });
		if (!response.ok) return null;

		const html = await response.text();

		const downloads: ParsedDownload[] = [];

		// Split by finfo sections - each finfo contains download info
		const finfoSections = html.split(/<div[^>]+class="finfo"[^>]*>/i);

		for (let i = 1; i < finfoSections.length; i++) {
			const sectionContent = finfoSections[i];

			// Find the closing </div> of finfo
			const finfoEnd = sectionContent.indexOf('</div>');
			if (finfoEnd === -1) continue;

			const finfoContent = sectionContent.substring(0, finfoEnd);

			// Extract size
			const sizeMatch = finfoContent.match(/Size:\s*<b>([^<]+)<\/b>/);
			const sizeStr = sizeMatch ? sizeMatch[1] : '0 MB';

			// Extract downloads count
			const downloadsCountMatch = finfoContent.match(/Downloads:\s*<b>(\d+)<\/b>/);
			const downloadsCount = downloadsCountMatch ? parseInt(downloadsCountMatch[1], 10) : 0;

			// Extract uploader
			const uploaderMatch = finfoContent.match(/Uploader:\s*<b>([^<]+)<\/b>/);
			const uploader = uploaderMatch ? uploaderMatch[1] : 'Unknown';

			// Extract date
			const dateMatch = finfoContent.match(/Added On:\s*<b>([^<]+)<\/b>/);
			const dateStr = dateMatch ? dateMatch[1] : '01/01/00';

			// The download link is in the next section after finfo - look for media.tokyoinsider.com href
			// We need to look in the original HTML around this finfo
			// Let's look backwards from finfo to find the download link
			const beforeFinfo = finfoSections[i - 1];
			const downloadLinkMatch = beforeFinfo.match(/href="(https:\/\/media\.tokyoinsider\.com[^"]+)"/);
			const downloadLink = downloadLinkMatch ? downloadLinkMatch[1] : '';

			// Extract filename
			const filenameMatch = beforeFinfo.match(/>([^<>]+)<\/a>/);
			const filename = filenameMatch ? filenameMatch[1] : '';

			if (downloadLink && downloadLink.includes('tokyoinsider')) {
				downloads.push({
					size: convertSize(sizeStr),
					downloads: downloadsCount,
					date: convertDate(dateStr),
					uploader,
					downloadLink,
					filename
				});
			}
		}

		if (downloads.length === 0) return null;

		// Sort based on choice
		switch (choice) {
			case 'biggest':
				downloads.sort((a, b) => b.size - a.size);
				break;
			case 'smallest':
				downloads.sort((a, b) => a.size - b.size);
				break;
			case 'most_downloaded':
				downloads.sort((a, b) => b.downloads - a.downloads);
				break;
			case 'least_downloaded':
				downloads.sort((a, b) => a.downloads - b.downloads);
				break;
			case 'latest':
				downloads.sort((a, b) => b.date.getTime() - a.date.getTime());
				break;
			case 'oldest':
				downloads.sort((a, b) => a.date.getTime() - b.date.getTime());
				break;
			default:
				downloads.sort((a, b) => b.downloads - a.downloads);
		}

		const selected = downloads[0];
		const epn = link.split('/').pop() || '';

		return {
			link: selected.downloadLink,
			episode: epn,
			type,
			size: selected.size.toFixed(2) + ' MB',
			downloads: selected.downloads,
			uploader: selected.uploader,
			date: selected.date.toLocaleDateString(),
			status: 'Success'
		};
	} catch (error) {
		return null;
	}
}

async function fetchDownloads(
	animeId: string,
	types: Record<string, { link: string; text: string }[]>,
	sortBy: string,
	episodeRanges: Record<string, string>,
	baseUrl: string
): Promise<DownloadLink[]> {
	const downloads: DownloadLink[] = [];

	const tasks: { link: string; type: string; episodeNum: string }[] = [];

	for (const [type, items] of Object.entries(types)) {
		const range = episodeRanges[type] || '';
		if (!range || range === '0') continue;

		const [start, end] = range.split('-').map(n => parseInt(n, 10));
		if (isNaN(start) || isNaN(end)) continue;

		// Items are sorted descending, so index 0 is highest episode number
		// Convert user range to actual indices
		// If user wants 1-10 and we have [406, 405, ..., 397]
		// index 0 = 406, index 1 = 405, ..., index 9 = 397
		// So user wants items[9] down to items[0]

		const totalItems = items.length;
		for (let i = start; i <= end && i <= totalItems; i++) {
			const idx = totalItems - i; // reverse index
			const item = items[idx];
			if (item) {
				tasks.push({ link: baseUrl + item.link, type, episodeNum: item.text });
			}
		}
	}

	// Process in batches
	const batchSize = 3;
	for (let i = 0; i < tasks.length; i += batchSize) {
		const batch = tasks.slice(i, i + batchSize);
		const results = await Promise.all(
			batch.map(task => processLink(task.link, task.type, sortBy))
		);

		for (let j = 0; j < results.length; j++) {
			const result = results[j];
			if (result) {
				// Use the episode number from the task
				result.episode = tasks[i + j].episodeNum;
				downloads.push(result);
			}
		}
	}

	// Sort by episode number
	downloads.sort((a, b) => {
		const aNum = parseInt(a.episode, 10) || 999;
		const bNum = parseInt(b.episode, 10) || 999;
		return aNum - bNum;
	});

	return downloads;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const baseUrl = env.TOKYO_INSIDER_BASE_URL || 'https://www.tokyoinsider.com';

		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/health') {
			return new Response(JSON.stringify({ status: 'ok' }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (path === '/api/search') {
			const query = url.searchParams.get('q');
			if (!query) {
				return new Response(JSON.stringify({ error: 'Missing search query' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			try {
				const results = await searchAnime(query, baseUrl);
				return new Response(JSON.stringify({ results }), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (error) {
				return new Response(JSON.stringify({
					error: error instanceof Error ? error.message : 'Search failed'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		if (path === '/api/anime') {
			const animeId = url.searchParams.get('id');
			if (!animeId) {
				return new Response(JSON.stringify({ error: 'Missing anime id' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			try {
				const details = await getAnimeDetails(animeId, baseUrl);
				return new Response(JSON.stringify({
					id: animeId,
					title: details.title,
					types: Object.fromEntries(
						Object.entries(details.types).map(([k, v]) => [k, v.length])
					)
				}), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (error) {
				return new Response(JSON.stringify({
					error: error instanceof Error ? error.message : 'Failed to fetch anime'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		if (path === '/api/download') {
			const animeId = url.searchParams.get('id');
			if (!animeId) {
				return new Response(JSON.stringify({ error: 'Missing anime id' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			const sortBy = url.searchParams.get('sort') || 'most_downloaded';
			const episodeRange = url.searchParams.get('episodes') || '';
			const nameTemplate = url.searchParams.get('template') || '';

			try {
				const details = await getAnimeDetails(animeId, baseUrl);

				const episodeRanges: Record<string, string> = {};
				if (episodeRange) {
					for (const type of Object.keys(TYPE_MAP)) {
						episodeRanges[type] = episodeRange;
					}
				} else {
					for (const [type, items] of Object.entries(details.types)) {
						if (items.length > 0) {
							episodeRanges[type] = `1-${items.length}`;
						}
					}
				}

				const downloads = await fetchDownloads(
					animeId,
					details.types,
					sortBy,
					episodeRanges,
					baseUrl
				);

				const formattedLinks = downloads.map(d => {
					let filename: string | undefined;
					if (nameTemplate && d.link) {
						filename = nameTemplate
							.replace('{anime}', details.title)
							.replace('{type}', d.type)
							.replace('{episode}', d.episode)
							.replace('{size}', d.size);
					}
					return {
						link: d.link,
						filename: filename || undefined,
						episode: d.episode,
						type: d.type,
						size: d.size,
						downloads: d.downloads,
						uploader: d.uploader,
						date: d.date,
						status: d.status
					};
				});

				return new Response(JSON.stringify({
					title: details.title,
					anime_id: animeId,
					downloads: formattedLinks,
					total: formattedLinks.length
				}), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (error) {
				return new Response(JSON.stringify({
					error: error instanceof Error ? error.message : 'Download fetch failed'
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		// Return nice HTML docs at root
		const html = `<!DOCTYPE html>
<html>
<head>
	<title>Tokyo Downloader API</title>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body {
			background: #000;
			color: #fff;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			max-width: 800px;
			margin: 0 auto;
			padding: 60px 20px;
			line-height: 1.6;
		}
		h1 {
			font-size: 3rem;
			font-weight: 700;
			margin-bottom: 10px;
			background: linear-gradient(90deg, #fff 0%, #888 100%);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			background-clip: text;
		}
		.subtitle { color: #666; font-size: 1.1rem; margin-bottom: 40px; }
		code {
			background: #111;
			color: #ff5f56;
			padding: 3px 8px;
			border-radius: 4px;
			font-size: 0.9rem;
		}
		pre {
			background: #0a0a0a;
			border: 1px solid #222;
			color: #a5d6ff;
			padding: 16px;
			border-radius: 8px;
			overflow-x: auto;
			font-size: 0.9rem;
			margin-bottom: 10px;
		}
		.endpoint { margin: 30px 0; }
		.endpoint h3 {
			font-size: 1.1rem;
			margin-bottom: 8px;
			color: #fff;
			font-weight: 600;
		}
		.endpoint p { color: #888; margin-bottom: 10px; }
		ul { color: #888; padding-left: 20px; }
		li { margin: 5px 0; }
		.params { margin-top: 15px; padding: 15px; background: #050505; border-radius: 8px; border: 1px solid #1a1a1a; }
		.params h4 { color: #666; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
		.tag {
			display: inline-block;
			background: #111;
			border: 1px solid #333;
			color: #fff;
			padding: 2px 8px;
			border-radius: 4px;
			font-size: 0.8rem;
			margin-right: 8px;
		}
		.tag.required { border-color: #ff5f56; color: #ff5f56; }
		hr { border: none; border-top: 1px solid #1a1a1a; margin: 40px 0; }
		.footer { color: #444; font-size: 0.85rem; }
	</style>
</head>
<body>
	<h1>Tokyo Downloader API</h1>
	<p class="subtitle">Fetch anime download links from Tokyo Insider</p>

	<div class="endpoint">
		<h3><span class="tag">GET</span> Search for anime</h3>
		<pre>/api/search?q=Naruto</pre>
		<p>Returns a list of anime matching your search query.</p>
	</div>

	<div class="endpoint">
		<h3><span class="tag">GET</span> Get anime details</h3>
		<pre>/api/anime?id=/anime/N/Naruto</pre>
		<p>Returns episode counts (episode, ova, special, movie).</p>
	</div>

	<div class="endpoint">
		<h3><span class="tag">GET</span> Get download links</h3>
		<pre>/api/download?id=/anime/B/Bleach_(TV)&sort=most_downloaded&episodes=1-10</pre>

		<div class="params">
			<h4>Parameters</h4>
			<ul>
				<li><code class="tag required">id</code> Anime ID (required)</li>
				<li><code class="tag">sort</code> biggest, smallest, most_downloaded, least_downloaded, latest, oldest</li>
				<li><code class="tag">episodes</code> Range like 1-10</li>
			</ul>
		</div>
	</div>

	<div class="endpoint">
		<h3><span class="tag">GET</span> Health check</h3>
		<pre>/health</pre>
	</div>

	<hr>

	<div class="footer">
		Built with Cloudflare Workers
	</div>
</body>
</html>`;

		return new Response(html, {
			headers: { 'Content-Type': 'text/html' }
		});
	}
};