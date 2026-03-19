import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';

const POSTS_DIR = path.resolve('src/posts');
const IMAGES_DIR = path.resolve('src/images');
const REPORT_PATH = path.resolve('scripts/scrape-report.json');

const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const remoteUrl = args[args.indexOf('--remote') + 1] || null;

async function verifyLocal() {
  console.log('🔍 Running local verification...\n');

  let report = {};
  if (await fs.pathExists(REPORT_PATH)) {
    report = await fs.readJson(REPORT_PATH);
  }

  // 1. Count posts
  const postFiles = (await fs.readdir(POSTS_DIR)).filter(f => f.endsWith('.md'));
  const expectedPosts = report.totalPostsFromApi || 'unknown';
  const postMatch = postFiles.length === expectedPosts;
  console.log(`📝 Posts: ${postFiles.length}/${expectedPosts} ${postMatch ? '✅' : '⚠️  MISMATCH'}`);

  // 2. Check image references in markdown files
  let totalRefs = 0;
  let brokenRefs = 0;
  const brokenList = [];

  for (const file of postFiles) {
    const content = await fs.readFile(path.join(POSTS_DIR, file), 'utf-8');
    // Match markdown images and frontmatter featuredImage
    const imageRefs = [];

    // Frontmatter featured image
    const featuredMatch = content.match(/featuredImage:\s*(.+)/);
    if (featuredMatch && featuredMatch[1].trim()) {
      imageRefs.push(featuredMatch[1].trim());
    }

    // Markdown image syntax ![alt](url)
    const mdImages = content.matchAll(/!\[.*?\]\(([^)]+)\)/g);
    for (const m of mdImages) {
      imageRefs.push(m[1]);
    }

    for (const ref of imageRefs) {
      totalRefs++;
      // Convert web path to file path: /images/uploads/... → src/images/uploads/...
      const filePath = path.join('src', ref);
      if (!(await fs.pathExists(filePath))) {
        brokenRefs++;
        brokenList.push({ file, ref });
      }
    }
  }

  console.log(`🖼️  Image references: ${totalRefs} total, ${brokenRefs} broken ${brokenRefs === 0 ? '✅' : '⚠️'}`);

  if (brokenList.length > 0 && brokenList.length <= 20) {
    console.log('\n  Broken image references:');
    brokenList.forEach(({ file, ref }) => {
      console.log(`    ${file} → ${ref}`);
    });
  } else if (brokenList.length > 20) {
    console.log(`\n  First 20 broken references:`);
    brokenList.slice(0, 20).forEach(({ file, ref }) => {
      console.log(`    ${file} → ${ref}`);
    });
    console.log(`    ... and ${brokenList.length - 20} more`);
  }

  // 3. Count total images on disk
  let imageCount = 0;
  async function countImages(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await countImages(path.join(dir, entry.name));
      } else if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(entry.name)) {
        imageCount++;
      }
    }
  }
  if (await fs.pathExists(IMAGES_DIR)) {
    await countImages(IMAGES_DIR);
  }
  console.log(`📁 Images on disk: ${imageCount}`);

  // 4. Report summary
  if (report.failedImages?.length > 0) {
    console.log(`\n⚠️  Failed image downloads: ${report.failedImages.length}`);
    report.failedImages.slice(0, 10).forEach(url => console.log(`    ${url}`));
  }

  console.log(`\n📊 Posts without featured image: ${report.postsWithNoFeaturedImage || 'unknown'}`);
  console.log(`📊 Tags: ${report.totalTags || 'unknown'}`);

  // Verdict
  const issues = [];
  if (!postMatch) issues.push('Post count mismatch');
  if (brokenRefs > 0) issues.push(`${brokenRefs} broken image references`);

  if (issues.length === 0) {
    console.log('\n✅ Local verification PASSED');
  } else {
    console.log(`\n⚠️  Local verification found issues: ${issues.join(', ')}`);
  }
}

async function verifyRemote() {
  if (!remoteUrl) {
    console.error('❌ Please provide a URL: node verify.mjs --remote https://your-site.netlify.app');
    process.exit(1);
  }

  console.log(`🔍 Running remote verification against ${remoteUrl}...\n`);

  // Read all post slugs from local files
  const postFiles = (await fs.readdir(POSTS_DIR)).filter(f => f.endsWith('.md'));
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < postFiles.length; i++) {
    const content = await fs.readFile(path.join(POSTS_DIR, postFiles[i]), 'utf-8');
    const slugMatch = content.match(/permalink:\s*(.+)/);
    if (!slugMatch) continue;

    const permalink = slugMatch[1].trim();
    const url = `${remoteUrl.replace(/\/$/, '')}${permalink}`;

    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.ok) {
        passed++;
      } else {
        failed++;
        failures.push({ url, status: res.status });
      }
    } catch (err) {
      failed++;
      failures.push({ url, status: err.message });
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Checked ${i + 1}/${postFiles.length}...`);
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${postFiles.length} URLs`);

  if (failures.length > 0) {
    console.log('\n⚠️  Failed URLs:');
    failures.forEach(({ url, status }) => {
      console.log(`    ${status} — ${url}`);
    });
  }

  if (failed === 0) {
    console.log('\n✅ Remote verification PASSED');
  } else {
    console.log(`\n⚠️  Remote verification found ${failed} broken URLs`);
  }
}

if (isRemote) {
  verifyRemote().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });
} else {
  verifyLocal().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });
}
