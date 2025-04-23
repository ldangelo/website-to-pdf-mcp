const fs = require('fs');
const path = require('path');

// Mock puppeteer and other dependencies
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockImplementation(() => ({
    newPage: jest.fn().mockImplementation(() => ({
      goto: jest.fn().mockResolvedValue(true),
      type: jest.fn().mockResolvedValue(true),
      click: jest.fn().mockResolvedValue(true),
      waitForTimeout: jest.fn().mockResolvedValue(true),
      content: jest.fn().mockResolvedValue('<html><head><title>Test Page</title></head><body><h1>Test</h1><a href="https://example.com/page1">Link 1</a></body></html>'),
      title: jest.fn().mockResolvedValue('Test Page'),
      evaluate: jest.fn().mockResolvedValue(['https://example.com/page1']),
      pdf: jest.fn().mockResolvedValue(Buffer.from('mock pdf content')),
    })),
    close: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('chromium', () => ({
  path: '/mock/chromium/path',
}));

jest.mock('pdf-lib', () => ({
  PDFDocument: {
    create: jest.fn().mockResolvedValue({
      copyPages: jest.fn().mockResolvedValue(['page1']),
      addPage: jest.fn(),
      save: jest.fn().mockResolvedValue(Buffer.from('mock merged pdf')),
    }),
    load: jest.fn().mockResolvedValue({
      getPageIndices: jest.fn().mockReturnValue([0]),
    }),
  },
}));

jest.mock('turndown', () => {
  return jest.fn().mockImplementation(() => ({
    turndown: jest.fn().mockReturnValue('# Test\n\nMarkdown content'),
  }));
});

// Mock file system operations
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('mock file content')),
  unlinkSync: jest.fn(),
  renameSync: jest.fn(),
}));

// Directly import the functions we want to test
// Since we're mocking all external dependencies, we need to reset 
// the module cache to ensure our mocks are used
jest.isolateModules(() => {
  // Import the functions we're testing
  const { 
    websiteToPdf, 
    websiteToMarkdown 
  } = require('../src/functions.test-helper');

  describe('Core Functions Unit Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('websiteToPdf function', () => {
      test('should generate PDF from a URL', async () => {
        const result = await websiteToPdf(
          'https://example.com', 
          null, 
          null, 
          '/output/test.pdf', 
          false, 
          1
        );

        expect(result).toBe('/output/test.pdf');
        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      test('should handle link traversal', async () => {
        const result = await websiteToPdf(
          'https://example.com', 
          null, 
          null, 
          '/output/test.pdf', 
          true, 
          2
        );

        expect(result).toBe('/output/test.pdf');
        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      test('should handle authentication', async () => {
        const result = await websiteToPdf(
          'https://example.com', 
          'username', 
          'password', 
          '/output/test.pdf', 
          false, 
          1
        );

        expect(result).toBe('/output/test.pdf');
      });
    });

    describe('websiteToMarkdown function', () => {
      test('should generate Markdown from a URL', async () => {
        const result = await websiteToMarkdown(
          'https://example.com', 
          null, 
          null, 
          '/output/test.md', 
          false, 
          1
        );

        expect(result).toBe('/output/test.md');
        expect(fs.writeFileSync).toHaveBeenCalled();
      });

      test('should handle link traversal', async () => {
        const result = await websiteToMarkdown(
          'https://example.com', 
          null, 
          null, 
          '/output/test.md', 
          true, 
          2
        );

        expect(result).toBe('/output/test.md');
        expect(fs.writeFileSync).toHaveBeenCalledTimes(3); // One for each page + merged file
      });

      test('should handle authentication', async () => {
        const result = await websiteToMarkdown(
          'https://example.com', 
          'username', 
          'password', 
          '/output/test.md', 
          false, 
          1
        );

        expect(result).toBe('/output/test.md');
      });
    });
  });
});