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
