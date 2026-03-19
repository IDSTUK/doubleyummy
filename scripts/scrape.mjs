import fetch from 'node-fetch';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import he from 'he';

const BASE_URL = 'https://doubleyummy.uk';
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const OUTPUT_DIR = path.resolve('src');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images', 'uploads');
const POSTS_DIR = path.join(OUTPUT_DIR, 'posts');
const PAGES_DIR = path.join(OUTPUT_DIR, 'pages');
const DATA_DIR = path.join(OUTPUT_DIR, '_data');
const REPORT_PATH = path.resolve('scripts', 'scrape-report.json');

const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 80;
const REQUEST_DELAY_MS = 150;
const IMAGE_CONCURRENCY = 5;

// Track stats for verification
const report = {
  totalPostsFromApi: 0,
  totalPostsScraped: 0,
  totalPagesScraped: 0,
  totalTags: 0,
  totalImagesDownloaded: 0,
  failedImages: [],
  postsWithNoFeaturedImage: 0,
  skippedImages: [],
};

// --- Turndown setup ---
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.use(gfm);

// Custom rule: promote bold text that looks like recipe section headers
const RECIPE_HEADERS = [
  'ingredients', 'method', 'instructions', 'directions', 'preparation',
  'serves', 'serving', 'notes', 'tips', 'variations', 'nutrition',
  'equipment', 'storage', 'freezing', 'to serve', 'topping', 'toppings',
  'for the', 'you will need', 'what you need', 'makes',
];

turndown.addRule('boldToHeading', {
  filter: (node) => {
    if (node.nodeName !== 'B' && node.nodeName !== 'STRONG') return false;
    const text = node.textContent.trim().toLowerCase().replace(/:$/, '');
    return RECIPE_HEADERS.some(h => text.startsWith(h));
  },
  replacement: (content) => {
    const cleaned = content.replace(/:$/, '').trim();
    return `\n\n### ${cleaned}\n\n`;
  },
});

// --- Helper functions ---

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 400) return { data: [], headers: res.headers, done: true };
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const data = await res.json();
  return { data, headers: res.headers, done: false };
}

async function fetchAllPaginated(endpoint, perPage = 100) {
  const all = [];
  let page = 1;
  let totalFromHeader = null;

  while (true) {
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`;
    console.log(`  Fetching ${url}`);
    const { data, headers, done } = await fetchJson(url);
    if (done || data.length === 0) break;

    if (page === 1 && headers.get('x-wp-total')) {
      totalFromHeader = parseInt(headers.get('x-wp-total'), 10);
    }

    all.push(...data);
    if (data.length < perPage) break;
    page++;
    await delay(REQUEST_DELAY_MS);
  }

  return { items: all, totalFromHeader };
}

// Extract image URLs from HTML content
function extractImageUrls(html) {
  const urls = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    let url = match[1];
    // Only process images from the WordPress uploads directory
    if (url.includes('/wp-content/uploads/')) {
      // Skip WordPress-generated size variants (e.g., -225x300.jpg, -1024x768.jpg)
      if (/-\d+x\d+\.\w+$/.test(url)) {
        // Try to get the original by removing the size suffix
        url = url.replace(/-\d+x\d+(\.\w+)$/, '$1');
      }
      urls.push(url);
    }
  }
  // Deduplicate
  return [...new Set(urls)];
}

// Download and optimize a single image
async function downloadImage(imageUrl) {
  try {
    // Ensure absolute URL
    const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${BASE_URL}${imageUrl}`;

    // Determine local path: /wp-content/uploads/2016/06/file.jpg → src/images/uploads/2016/06/file.jpg
    const uploadsMatch = fullUrl.match(/\/wp-content\/uploads\/(.+)$/);
    if (!uploadsMatch) {
      console.warn(`  ⚠ Skipping non-uploads image: ${fullUrl}`);
      report.skippedImages.push(fullUrl);
      return null;
    }

    const relativePath = uploadsMatch[1];
    const localPath = path.join(IMAGES_DIR, relativePath);
    const localWebPath = `/images/uploads/${relativePath}`;

    // Skip if already downloaded
    if (await fs.pathExists(localPath)) {
      return localWebPath;
    }

    await fs.ensureDir(path.dirname(localPath));

    const res = await fetch(fullUrl);
    if (!res.ok) {
      console.warn(`  ⚠ Image 404: ${fullUrl}`);
      report.failedImages.push(fullUrl);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    // Optimize with sharp
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();

      if (metadata.width && metadata.width > MAX_IMAGE_WIDTH) {
        // Resize and compress
        const ext = path.extname(localPath).toLowerCase();
        if (ext === '.png') {
          await image.resize(MAX_IMAGE_WIDTH).png({ quality: JPEG_QUALITY }).toFile(localPath);
        } else if (ext === '.gif') {
          // Don't process GIFs (might be animated)
          await fs.writeFile(localPath, buffer);
        } else {
          // Default to JPEG
          await image.resize(MAX_IMAGE_WIDTH).jpeg({ quality: JPEG_QUALITY }).toFile(localPath);
        }
      } else {
        // Already small enough, just compress
        const ext = path.extname(localPath).toLowerCase();
        if (ext === '.png') {
          await image.png({ quality: JPEG_QUALITY }).toFile(localPath);
        } else if (ext === '.gif') {
          await fs.writeFile(localPath, buffer);
        } else {
          await image.jpeg({ quality: JPEG_QUALITY }).toFile(localPath);
        }
      }
    } catch (sharpErr) {
      // If sharp fails (e.g., unsupported format), save raw
      console.warn(`  ⚠ Sharp failed for ${fullUrl}, saving raw: ${sharpErr.message}`);
      await fs.writeFile(localPath, buffer);
    }

    report.totalImagesDownloaded++;
    return localWebPath;
  } catch (err) {
    console.warn(`  ⚠ Failed to download ${imageUrl}: ${err.message}`);
    report.failedImages.push(imageUrl);
    return null;
  }
}

// Process images with concurrency limit
async function downloadImagesWithConcurrency(urls) {
  const results = new Map();
  const queue = [...urls];
  const workers = [];

  for (let i = 0; i < IMAGE_CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        const localPath = await downloadImage(url);
        results.set(url, localPath);
        await delay(50); // Small delay between image downloads
      }
    })());
  }

  await Promise.all(workers);
  return results;
}

// Rewrite image URLs in HTML before Turndown conversion
function rewriteImageUrls(html, imageMap) {
  let result = html;
  for (const [originalUrl, localPath] of imageMap) {
    if (localPath) {
      // Replace all variants (with and without size suffixes) that map to this original
      const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace exact URL
      result = result.replace(new RegExp(escapedUrl, 'g'), localPath);
      // Also replace any size variants
      const baseName = originalUrl.replace(/(\.\w+)$/, '');
      const ext = originalUrl.match(/(\.\w+)$/)?.[1] || '';
      const variantRegex = new RegExp(
        baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d+x\\d+' + ext.replace('.', '\\.'),
        'g'
      );
      result = result.replace(variantRegex, localPath);
    }
  }
  return result;
}

// Generate frontmatter YAML
function generateFrontmatter(post, tagNames, featuredImagePath) {
  const title = he.decode(post.title.rendered).replace(/"/g, '\\"');
  const excerpt = he.decode(post.excerpt.rendered.replace(/<[^>]+>/g, '')).trim();

  const lines = [
    '---',
    `title: "${title}"`,
    `date: ${post.date}`,
    `slug: ${post.slug}`,
    `author: Rach`,
  ];

  if (tagNames.length > 0) {
    lines.push('tags:');
    for (const tag of tagNames) {
      // Quote tags that contain YAML-special characters
      if (/[:#@\[\]{}|>*&!%'",?]/.test(tag)) {
        lines.push(`  - "${tag.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`  - ${tag}`);
      }
    }
  }

  if (featuredImagePath) {
    lines.push(`featuredImage: ${featuredImagePath}`);
  }

  lines.push(`excerpt: "${excerpt.substring(0, 200).replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
  lines.push(`permalink: /${post.slug}/`);
  lines.push('layout: layouts/post.njk');
  lines.push('---');

  return lines.join('\n');
}

// --- Main scraping flow ---

async function scrapeAll() {
  console.log('🔄 Starting WordPress content scrape...\n');

  // 1. Fetch all tags first (needed for ID → name mapping)
  console.log('📂 Fetching tags...');
  const { items: tags } = await fetchAllPaginated(`${API_URL}/tags`);
  const tagMap = new Map(tags.map(t => [t.id, t.name]));
  report.totalTags = tags.length;
  console.log(`  Found ${tags.length} tags\n`);

  // Save tag data
  await fs.ensureDir(DATA_DIR);
  const tagData = tags.map(t => ({
    name: t.name,
    slug: t.slug,
    count: t.count,
  }));
  await fs.writeJson(path.join(DATA_DIR, 'tagMeta.json'), tagData, { spaces: 2 });

  // 2. Fetch all posts
  console.log('📝 Fetching posts...');
  const { items: posts, totalFromHeader } = await fetchAllPaginated(
    `${API_URL}/posts?_embed`
  );
  report.totalPostsFromApi = totalFromHeader || posts.length;
  console.log(`  Fetched ${posts.length} posts (API reports ${report.totalPostsFromApi} total)\n`);

  // 3. Fetch pages
  console.log('📄 Fetching pages...');
  const { items: pages } = await fetchAllPaginated(`${API_URL}/pages?_embed`);
  console.log(`  Fetched ${pages.length} pages\n`);

  // 4. Process each post
  console.log('🔧 Processing posts...\n');
  await fs.ensureDir(POSTS_DIR);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const title = he.decode(post.title.rendered);
    console.log(`  [${i + 1}/${posts.length}] ${title}`);

    // Resolve tag IDs to names
    const tagNames = (post.tags || [])
      .map(id => tagMap.get(id))
      .filter(Boolean);

    // Get featured image
    let featuredImagePath = null;
    if (post.featured_media && post._embedded?.['wp:featuredmedia']?.[0]) {
      const media = post._embedded['wp:featuredmedia'][0];
      if (media.source_url) {
        featuredImagePath = await downloadImage(media.source_url);
      }
    }
    if (!featuredImagePath && post.featured_media) {
      report.postsWithNoFeaturedImage++;
    }
    if (!post.featured_media) {
      report.postsWithNoFeaturedImage++;
    }

    // Extract and download inline images
    const contentHtml = post.content.rendered;
    const imageUrls = extractImageUrls(contentHtml);
    const imageMap = await downloadImagesWithConcurrency(imageUrls);

    // Also add featured image to the map for URL rewriting
    if (post._embedded?.['wp:featuredmedia']?.[0]?.source_url && featuredImagePath) {
      imageMap.set(post._embedded['wp:featuredmedia'][0].source_url, featuredImagePath);
    }

    // Rewrite image URLs in HTML
    const rewrittenHtml = rewriteImageUrls(contentHtml, imageMap);

    // Convert to Markdown
    const markdown = turndown.turndown(rewrittenHtml);

    // Generate frontmatter
    const frontmatter = generateFrontmatter(post, tagNames, featuredImagePath);

    // Write file
    const filePath = path.join(POSTS_DIR, `${post.slug}.md`);
    await fs.writeFile(filePath, `${frontmatter}\n\n${markdown}\n`);
    report.totalPostsScraped++;
  }

  // 5. Process pages
  console.log('\n🔧 Processing pages...\n');
  await fs.ensureDir(PAGES_DIR);

  for (const page of pages) {
    const title = he.decode(page.title.rendered);
    console.log(`  Page: ${title}`);

    const contentHtml = page.content.rendered;
    const imageUrls = extractImageUrls(contentHtml);
    const imageMap = await downloadImagesWithConcurrency(imageUrls);
    const rewrittenHtml = rewriteImageUrls(contentHtml, imageMap);
    const markdown = turndown.turndown(rewrittenHtml);

    const lines = [
      '---',
      `title: "${title.replace(/"/g, '\\"')}"`,
      `slug: ${page.slug}`,
      `permalink: /${page.slug}/`,
      'layout: layouts/page.njk',
      '---',
    ];

    const filePath = path.join(PAGES_DIR, `${page.slug}.md`);
    await fs.writeFile(filePath, `${lines.join('\n')}\n\n${markdown}\n`);
    report.totalPagesScraped++;
  }

  // 6. Write report
  await fs.writeJson(REPORT_PATH, report, { spaces: 2 });

  console.log('\n✅ Scraping complete!\n');
  console.log('📊 Report:');
  console.log(`  Posts: ${report.totalPostsScraped}/${report.totalPostsFromApi}`);
  console.log(`  Pages: ${report.totalPagesScraped}`);
  console.log(`  Tags: ${report.totalTags}`);
  console.log(`  Images downloaded: ${report.totalImagesDownloaded}`);
  console.log(`  Failed images: ${report.failedImages.length}`);
  console.log(`  Posts without featured image: ${report.postsWithNoFeaturedImage}`);

  if (report.failedImages.length > 0) {
    console.log('\n⚠ Failed images:');
    report.failedImages.forEach(url => console.log(`  - ${url}`));
  }
}

scrapeAll().catch(err => {
  console.error('❌ Scraping failed:', err);
  process.exit(1);
});
