const { DateTime } = require('luxon');

module.exports = function (eleventyConfig) {
  // Passthrough copy
  eleventyConfig.addPassthroughCopy('src/images');
  eleventyConfig.addPassthroughCopy('src/assets');

  // Date filters
  eleventyConfig.addFilter('readableDate', (dateObj) => {
    return DateTime.fromJSDate(new Date(dateObj), { zone: 'utc' }).toFormat('d LLLL yyyy');
  });

  eleventyConfig.addFilter('isoDate', (dateObj) => {
    return DateTime.fromJSDate(new Date(dateObj), { zone: 'utc' }).toISO();
  });

  eleventyConfig.addFilter('year', (dateObj) => {
    return DateTime.fromJSDate(new Date(dateObj), { zone: 'utc' }).toFormat('yyyy');
  });

  eleventyConfig.addFilter('monthYear', (dateObj) => {
    return DateTime.fromJSDate(new Date(dateObj), { zone: 'utc' }).toFormat('LLLL yyyy');
  });

  eleventyConfig.addFilter('shortMonth', (dateObj) => {
    return DateTime.fromJSDate(new Date(dateObj), { zone: 'utc' }).toFormat('LLL yyyy');
  });

  // Limit filter for arrays
  eleventyConfig.addFilter('limit', (arr, count) => {
    return arr.slice(0, count);
  });

  // Excerpt filter — strip HTML and truncate
  eleventyConfig.addFilter('excerpt', (content) => {
    if (!content) return '';
    const stripped = content.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim();
    return stripped.length > 160 ? stripped.substring(0, 160) + '...' : stripped;
  });

  // Posts collection sorted by date (oldest first — chronological journey)
  // Excludes the "Start Here" post which lives in the homepage hero
  eleventyConfig.addCollection('posts', (collectionApi) => {
    return collectionApi
      .getFilteredByGlob('src/posts/*.md')
      .filter((post) => post.data.slug !== 'where-to-start')
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  // Start Here post (for homepage hero)
  eleventyConfig.addCollection('startHere', (collectionApi) => {
    return collectionApi
      .getFilteredByGlob('src/posts/*.md')
      .filter((post) => post.data.slug === 'where-to-start');
  });

  // Tag list collection (unique tags with counts, deduplicated by slug)
  eleventyConfig.addCollection('tagList', (collectionApi) => {
    const tagCount = {};
    collectionApi.getFilteredByGlob('src/posts/*.md').forEach((item) => {
      const tags = item.data.tags;
      if (!Array.isArray(tags)) return;
      tags.forEach((tag) => {
        if (typeof tag === 'string' && tag.trim()) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      });
    });
    // Deduplicate tags that produce the same slug
    // Simple slugify: lowercase, replace non-alphanumeric with hyphens
    function simpleSlug(s) {
      return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    const result = [];
    const seenSlugs = new Set();
    const entries = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of entries) {
      const slug = simpleSlug(name);
      if (!seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        result.push({ name, count });
      }
    }
    return result;
  });

  // Watch targets for dev
  eleventyConfig.addWatchTarget('src/assets/');

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    templateFormats: ['md', 'njk'],
  };
};
