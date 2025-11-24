import { extractHunkForLineRange, applyHunk } from '../diff';

describe('extractHunkForLineRange', () => {
  const samplePatch = `@@ -10,7 +10,9 @@
 function foo() {
   const x = 1;
-  const y = 2;
+  const y = 3;
+  const z = 4;
+  const w = 5;
   return x + y;
 }`;

  it('extracts the full hunk when all lines selected', () => {
    // New file lines: 10 (function), 11 (const x), 12-14 (additions), 15 (return), 16 (})
    const hunk = extractHunkForLineRange(samplePatch, 10, 16);
    expect(hunk).not.toBeNull();
    expect(hunk!.newStart).toBe(10);
    expect(hunk!.newLines).toBe(7); // 4 context + 3 additions
  });

  it('extracts only selected lines from middle of hunk', () => {
    // Select the additions at lines 12-14 in new file
    // Line 12: +  const y = 3;
    // Line 13: +  const z = 4;
    // Line 14: +  const w = 5;
    const hunk = extractHunkForLineRange(samplePatch, 12, 14);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+  const y = 3;');
    expect(hunk!.content).toContain('+  const z = 4;');
    expect(hunk!.content).toContain('+  const w = 5;');
    // Should also include the deletion that was replaced
    expect(hunk!.content).toContain('-  const y = 2;');
    // Should NOT include context lines outside selection
    expect(hunk!.content).not.toContain('function foo()');
    expect(hunk!.content).not.toContain('return x + y');
  });

  it('extracts single line', () => {
    // Line 13 is +  const z = 4;
    const hunk = extractHunkForLineRange(samplePatch, 13, 13);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+  const z = 4;');
    expect(hunk!.newLines).toBe(1);
  });

  it('returns null for lines outside any hunk', () => {
    const hunk = extractHunkForLineRange(samplePatch, 100, 105);
    expect(hunk).toBeNull();
  });

  it('handles multiple hunks in patch', () => {
    const multiHunkPatch = `@@ -5,3 +5,4 @@
 line 5
 line 6
+new line 7
 line 7
@@ -20,3 +21,4 @@
 line 20
 line 21
+new line 22
 line 22`;

    // Select from first hunk
    const hunk1 = extractHunkForLineRange(multiHunkPatch, 7, 7);
    expect(hunk1).not.toBeNull();
    expect(hunk1!.content).toContain('+new line 7');

    // Select from second hunk
    const hunk2 = extractHunkForLineRange(multiHunkPatch, 23, 23);
    expect(hunk2).not.toBeNull();
    expect(hunk2!.content).toContain('+new line 22');
  });

  it('includes context lines when selected', () => {
    // Select a context line (11) and an addition (12)
    // Line 11: const x = 1; (context)
    // Line 12: +  const y = 3; (addition)
    const hunk = extractHunkForLineRange(samplePatch, 11, 12);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('   const x = 1;');
    expect(hunk!.content).toContain('+  const y = 3;');
  });
});

describe('applyHunk', () => {
  it('applies a simple addition', () => {
    const baseContent = `line 1
line 2
line 3`;

    const hunk = {
      oldStart: 2,
      oldLines: 1,
      newStart: 2,
      newLines: 2,
      content: `@@ -2,1 +2,2 @@
 line 2
+new line`,
    };

    const result = applyHunk(baseContent, hunk);
    expect(result).toBe(`line 1
line 2
new line
line 3`);
  });

  it('applies a deletion', () => {
    const baseContent = `line 1
line 2
line 3`;

    const hunk = {
      oldStart: 2,
      oldLines: 1,
      newStart: 2,
      newLines: 0,
      content: `@@ -2,1 +2,0 @@
-line 2`,
    };

    const result = applyHunk(baseContent, hunk);
    expect(result).toBe(`line 1
line 3`);
  });

  it('applies a replacement', () => {
    const baseContent = `line 1
old line
line 3`;

    const hunk = {
      oldStart: 2,
      oldLines: 1,
      newStart: 2,
      newLines: 1,
      content: `@@ -2,1 +2,1 @@
-old line
+new line`,
    };

    const result = applyHunk(baseContent, hunk);
    expect(result).toBe(`line 1
new line
line 3`);
  });
});

describe('extractHunkForLineRange - new files', () => {
  // For new files, the patch starts with @@ -0,0 +1,N @@
  const newFilePatch = `@@ -0,0 +1,5 @@
+export const foo = 1;
+export const bar = 2;
+export const baz = 3;
+export const qux = 4;
+export const quux = 5;`;

  it('extracts line 4 from new file correctly', () => {
    // Line 4 should be "export const qux = 4;"
    const hunk = extractHunkForLineRange(newFilePatch, 4, 4);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const qux = 4;');
    expect(hunk!.newStart).toBe(4);
    expect(hunk!.newLines).toBe(1);
  });

  it('extracts line 3 from new file correctly', () => {
    // Line 3 should be "export const baz = 3;"
    const hunk = extractHunkForLineRange(newFilePatch, 3, 3);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const baz = 3;');
    expect(hunk!.newStart).toBe(3);
  });

  it('extracts line 1 from new file correctly', () => {
    // Line 1 should be "export const foo = 1;"
    const hunk = extractHunkForLineRange(newFilePatch, 1, 1);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const foo = 1;');
    expect(hunk!.newStart).toBe(1);
  });

  it('extracts range from new file correctly', () => {
    // Lines 2-4
    const hunk = extractHunkForLineRange(newFilePatch, 2, 4);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const bar = 2;');
    expect(hunk!.content).toContain('+export const baz = 3;');
    expect(hunk!.content).toContain('+export const qux = 4;');
    expect(hunk!.content).not.toContain('+export const foo = 1;');
    expect(hunk!.content).not.toContain('+export const quux = 5;');
    expect(hunk!.newStart).toBe(2);
    expect(hunk!.newLines).toBe(3);
  });
});

describe('extractHunkForLineRange - complex patch with deletions and additions', () => {
  // This reproduces the bug from PR #3 in splice-pr main repo
  // Original file had 3 lines, PR adds a comment, keeps middle line, replaces last two
  // New file after changes:
  // Line 1: // Test file for post-merge callback
  // Line 2: export const foo = 1;
  // Line 3: export const bar = 2;
  // Line 4: export const baz = 3;
  const complexPatch = `@@ -1,3 +1,4 @@
-export const bar = 2;
+// Test file for post-merge callback
 export const foo = 1;
-export const bar = 2;
+export const bar = 2;
+export const baz = 3;`;

  it('extracts line 4 (export const baz) correctly', () => {
    // Line 4 in new file is "export const baz = 3;"
    const hunk = extractHunkForLineRange(complexPatch, 4, 4);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const baz = 3;');
    expect(hunk!.content).not.toContain('+// Test file');
    expect(hunk!.content).not.toContain('+export const bar = 2;');
    expect(hunk!.newStart).toBe(4);
    expect(hunk!.newLines).toBe(1);
  });

  it('extracts line 1 (comment) correctly', () => {
    const hunk = extractHunkForLineRange(complexPatch, 1, 1);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+// Test file for post-merge callback');
    expect(hunk!.newStart).toBe(1);
  });

  it('extracts line 3 (export const bar) correctly', () => {
    // Line 3 in new file is "export const bar = 2;"
    const hunk = extractHunkForLineRange(complexPatch, 3, 3);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const bar = 2;');
    expect(hunk!.content).not.toContain('+export const baz = 3;');
    expect(hunk!.newStart).toBe(3);
  });
});

describe('extractHunkForLineRange - reproduced bug from test-splice PR #28', () => {
  // After merging a spliced PR, the remaining changes have this diff:
  // Base (master) has: foo, bar
  // PR branch has: foo, bar, baz, qux
  // The diff shows: context for foo, deletion of old bar (no newline), addition of bar, baz, qux
  const buggyPatch = `@@ -1,2 +1,4 @@
 export const foo = 1;
-export const bar = 2;
+export const bar = 2;
+export const baz = 3;
+export const qux = 4;`;

  it('extracts line 3 (baz) correctly', () => {
    // Line 3 in new file is "export const baz = 3;"
    // The deletion (-export const bar) is in the OLD file, not the new file
    const hunk = extractHunkForLineRange(buggyPatch, 3, 3);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const baz = 3;');
    // Should NOT include bar since that's line 2
    expect(hunk!.content).not.toContain('+export const bar = 2;');
    expect(hunk!.newStart).toBe(3);
    expect(hunk!.newLines).toBe(1);
    // Critical: oldStart should be 3 (after old line 2) for correct insertion
    expect(hunk!.oldStart).toBe(3);
  });

  it('extracts line 4 (qux) correctly', () => {
    const hunk = extractHunkForLineRange(buggyPatch, 4, 4);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const qux = 4;');
    expect(hunk!.content).not.toContain('+export const baz = 3;');
    expect(hunk!.newStart).toBe(4);
    expect(hunk!.newLines).toBe(1);
    // oldStart should be 3 (after old line 2)
    expect(hunk!.oldStart).toBe(3);
  });

  it('extracts line 2 (bar) correctly', () => {
    // Line 2 is the bar line - it's being modified (deletion + addition)
    const hunk = extractHunkForLineRange(buggyPatch, 2, 2);
    expect(hunk).not.toBeNull();
    expect(hunk!.content).toContain('+export const bar = 2;');
    // May also include the deletion since it's a replacement
    expect(hunk!.content).not.toContain('+export const baz = 3;');
    expect(hunk!.newStart).toBe(2);
  });

  it('applies extracted line 3 to base correctly', () => {
    // Base content (what's on master)
    const baseContent = `export const foo = 1;
export const bar = 2;`;

    // Extract line 3
    const hunk = extractHunkForLineRange(buggyPatch, 3, 3);
    expect(hunk).not.toBeNull();

    // Apply to base - should add baz at the end
    const result = applyHunk(baseContent, hunk!);
    expect(result).toBe(`export const foo = 1;
export const bar = 2;
export const baz = 3;`);
  });
});
