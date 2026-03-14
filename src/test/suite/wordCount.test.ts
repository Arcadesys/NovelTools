import * as assert from 'assert';
import { countWords } from '../../wordCount/counter';

suite('countWords', () => {
  test('counts words in plain text', () => {
    assert.strictEqual(countWords('Hello world'), 2);
    assert.strictEqual(countWords('one two three four five'), 5);
  });

  test('returns 0 for empty string', () => {
    assert.strictEqual(countWords(''), 0);
  });

  test('returns 0 for whitespace-only string', () => {
    assert.strictEqual(countWords('   \n\t  '), 0);
  });

  test('handles multiple spaces between words', () => {
    assert.strictEqual(countWords('hello    world'), 2);
  });

  test('handles newlines and tabs as delimiters', () => {
    assert.strictEqual(countWords('hello\nworld\tfoo'), 3);
  });

  test('counts markdown text without stripping', () => {
    const text = '# Heading\n\nSome **bold** and *italic* text.';
    const count = countWords(text);
    assert.ok(count > 0, 'should count words in markdown');
    // With markdown: #, Heading, Some, **bold**, and, *italic*, text. = 7 tokens
    assert.strictEqual(count, 7);
  });

  test('strips markdown when option is true', () => {
    const text = '# Heading\n\nSome **bold** and *italic* text.';
    const countWithMarkdown = countWords(text, false);
    const countStripped = countWords(text, true);
    // Stripping removes #, ** and * markers — word count may change
    assert.ok(countStripped > 0, 'should still count words after stripping');
    // After stripping: "Heading", "Some", "bold", "and", "italic", "text." = 6
    // The heading marker "#" is removed, reducing count
    assert.ok(countStripped <= countWithMarkdown, 'stripped count should be <= raw count');
  });

  test('strips markdown links', () => {
    const text = 'Visit [Google](https://google.com) for search.';
    const count = countWords(text, true);
    // After strip: "Visit Google for search." = 4
    assert.strictEqual(count, 4);
  });

  test('strips inline code', () => {
    const text = 'Use `console.log` for debugging.';
    const count = countWords(text, true);
    // After strip: "Use  for debugging." = 3
    assert.strictEqual(count, 3);
  });

  test('strips bold markers', () => {
    const text = '**bold text** here';
    const count = countWords(text, true);
    // After strip: "bold text here" = 3
    assert.strictEqual(count, 3);
  });

  test('strips italic markers', () => {
    const text = '*italic text* here';
    const count = countWords(text, true);
    // After strip: "italic text here" = 3
    assert.strictEqual(count, 3);
  });

  test('strips underscore bold and italic', () => {
    const text = '__bold__ and _italic_';
    const count = countWords(text, true);
    // After strip: "bold and italic" = 3
    assert.strictEqual(count, 3);
  });

  test('strips heading markers', () => {
    const text = '## Chapter Title\n\nSome content.';
    const count = countWords(text, true);
    // After strip: "Chapter Title", "Some content." = 4
    assert.strictEqual(count, 4);
  });

  test('strips list markers', () => {
    const text = '- item one\n- item two\n* item three';
    const count = countWords(text, true);
    // After strip: "item one", "item two", "item three" = 6
    assert.strictEqual(count, 6);
  });

  test('strips numbered list markers', () => {
    const text = '1. first item\n2. second item';
    const count = countWords(text, true);
    // After strip: "first item", "second item" = 4
    assert.strictEqual(count, 4);
  });

  test('handles realistic prose paragraph', () => {
    const prose = `
She walked through the garden, trailing her fingers along the rose bushes.
The thorns caught at her sleeves, but she didn't mind. The evening air was
cool against her skin, carrying the scent of jasmine and fresh-cut grass.
    `.trim();
    const count = countWords(prose);
    assert.ok(count > 30, `Expected 30+ words, got ${count}`);
    assert.ok(count < 50, `Expected <50 words, got ${count}`);
  });
});
