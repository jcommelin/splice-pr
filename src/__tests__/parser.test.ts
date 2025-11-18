import { parseInstruction, generatePrDescription } from '../parser';

describe('parseInstruction', () => {
  it('parses simple splice-bot command', () => {
    const result = parseInstruction('splice-bot');
    expect(result).toEqual({});
  });

  it('parses splice-bot with quoted title', () => {
    const result = parseInstruction('splice-bot "My PR title"');
    expect(result).toEqual({ title: 'My PR title' });
  });

  it('parses splice-bot with key:value options', () => {
    const result = parseInstruction('splice-bot title:"My title" base:main labels:bug,fix');
    expect(result).toEqual({
      title: 'My title',
      base: 'main',
      labels: ['bug', 'fix'],
    });
  });

  it('parses --draft flag', () => {
    const result = parseInstruction('splice-bot --draft');
    expect(result).toEqual({ draft: true });
  });

  it('parses --entire-hunk flag', () => {
    const result = parseInstruction('splice-bot --entire-hunk');
    expect(result).toEqual({ entireHunk: true });
  });

  it('parses --entire-file flag', () => {
    const result = parseInstruction('splice-bot --entire-file');
    expect(result).toEqual({ entireFile: true });
  });

  it('parses reviewers and strips @ prefix', () => {
    const result = parseInstruction('splice-bot reviewers:@alice,bob,@charlie');
    expect(result).toEqual({
      reviewers: ['alice', 'bob', 'charlie'],
    });
  });

  it('returns null for non-splice-bot comments', () => {
    const result = parseInstruction('This is a regular comment');
    expect(result).toBeNull();
  });
});

describe('generatePrDescription', () => {
  const defaultOptions = {
    originalPrNumber: 123,
    originalPrTitle: 'Original PR',
    path: 'src/file.ts',
    startLine: 10,
    endLine: 20,
    commentId: 456789,
    authorLogin: 'testuser',
  };

  it('generates description with all required fields', () => {
    const result = generatePrDescription(defaultOptions);

    expect(result).toContain('Spliced from #123 (Original PR)');
    expect(result).toContain('**File**: `src/file.ts` at lines 10-20');
    expect(result).toContain('@testuser');
    expect(result).toContain('view comment');
  });

  it('includes machine-readable metadata footer', () => {
    const result = generatePrDescription(defaultOptions);

    // Check for JSON metadata in HTML comment
    expect(result).toContain('<!-- {"splice-bot":{"original-pr":123,"comment-id":456789}} -->');
  });

  it('formats single line correctly', () => {
    const result = generatePrDescription({
      ...defaultOptions,
      startLine: 15,
      endLine: 15,
    });

    expect(result).toContain('at line 15');
    expect(result).not.toContain('lines 15-15');
  });

  it('includes custom description when provided', () => {
    const result = generatePrDescription({
      ...defaultOptions,
      customDescription: 'This is a custom description',
    });

    expect(result).toContain('This is a custom description');
  });

  it('metadata can be parsed back correctly', () => {
    const result = generatePrDescription(defaultOptions);

    // Extract and parse the metadata
    const match = result.match(/<!--\s*(\{"splice-bot":.+?\})\s*-->/);
    expect(match).not.toBeNull();

    const metadata = JSON.parse(match![1]);
    expect(metadata['splice-bot']['original-pr']).toBe(123);
    expect(metadata['splice-bot']['comment-id']).toBe(456789);
  });
});
