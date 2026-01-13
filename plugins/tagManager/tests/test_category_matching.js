/**
 * Unit tests for category matching functions.
 * Run with: node plugins/tagManager/tests/test_category_matching.js
 */

// Mock localTags for testing
const localTags = [
  { id: '1', name: 'Action', aliases: ['Acts'], parent_count: 0 },
  { id: '2', name: 'CATEGORY: Action', aliases: [], parent_count: 0 },
  { id: '3', name: 'Activities', aliases: ['Action'], parent_count: 0 },
  { id: '4', name: 'Comedy', aliases: [], parent_count: 0 },
  { id: '5', name: 'Some Child Tag', aliases: [], parent_count: 1 },
];

// Copy of findLocalParentMatches for testing
function findLocalParentMatches(categoryName) {
  if (!categoryName) return [];

  const lowerCategoryName = categoryName.toLowerCase();
  const matches = [];

  for (const tag of localTags) {
    const isChild = tag.parent_count > 0;

    if (tag.name.toLowerCase() === lowerCategoryName) {
      matches.push({ tag, matchType: 'exact', score: isChild ? 95 : 100 });
      continue;
    }

    if (tag.name.toLowerCase().includes(lowerCategoryName)) {
      matches.push({ tag, matchType: 'contains', score: isChild ? 85 : 90 });
      continue;
    }

    if (tag.aliases?.some(a => a.toLowerCase() === lowerCategoryName)) {
      matches.push({ tag, matchType: 'alias', score: isChild ? 80 : 85 });
      continue;
    }

    if (tag.name.toLowerCase().startsWith(lowerCategoryName.slice(0, 3)) &&
        tag.name.length < categoryName.length + 5) {
      matches.push({ tag, matchType: 'fuzzy', score: isChild ? 60 : 70 });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5);
}

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
  }
}

// Tests
console.log('\n=== findLocalParentMatches tests ===\n');

test('finds exact name match with highest score', () => {
  const matches = findLocalParentMatches('Action');
  assertEqual(matches[0].tag.id, '1');
  assertEqual(matches[0].matchType, 'exact');
  assertEqual(matches[0].score, 100);
});

test('finds tag containing category name', () => {
  const matches = findLocalParentMatches('Action');
  const containsMatch = matches.find(m => m.tag.id === '2');
  assertEqual(containsMatch.matchType, 'contains');
});

test('finds alias match', () => {
  const matches = findLocalParentMatches('Acts');
  assertEqual(matches[0].tag.id, '1');
  assertEqual(matches[0].matchType, 'alias');
});

test('returns empty for no match', () => {
  const matches = findLocalParentMatches('NonexistentCategory');
  assertEqual(matches.length, 0);
});

test('returns empty for null/empty input', () => {
  assertEqual(findLocalParentMatches(null).length, 0);
  assertEqual(findLocalParentMatches('').length, 0);
});

test('case insensitive matching', () => {
  const matches = findLocalParentMatches('ACTION');
  assertEqual(matches[0].tag.id, '1');
});

test('limits results to 5', () => {
  // Add more matching tags temporarily
  for (let i = 10; i < 20; i++) {
    localTags.push({ id: String(i), name: `Action${i}`, aliases: [], parent_count: 0 });
  }
  const matches = findLocalParentMatches('Action');
  assertEqual(matches.length <= 5, true);
});

// Summary
console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
