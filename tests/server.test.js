const request = require('supertest');
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

// Import the Express app after setting up mocks
const app = require('../src/index');

describe('Website to PDF/Markdown MCP Server', () => {
  // Create output directory for testing
  const outputDir = path.join(__dirname, '../output');
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks
    fs.existsSync.mockReturnValue(false);
  });

  describe('PDF Conversion Endpoint', () => {
    test('should convert a URL to PDF', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({
          url: 'https://example.com',
          filename: 'test.pdf'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Website converted to PDF successfully');
      expect(response.body.filePath).toContain('test.pdf');
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('should return error when URL is missing', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({
          filename: 'test.pdf'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('URL is required');
    });

    test('should handle link traversal', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({
          url: 'https://example.com',
          filename: 'test_traversed.pdf',
          traverseLinks: true,
          maxPages: 2
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Website and linked pages converted to PDF successfully');
    });
  });

  describe('Markdown Conversion Endpoint', () => {
    test('should convert a URL to Markdown', async () => {
      const response = await request(app)
        .post('/api/to-markdown')
        .send({
          url: 'https://example.com',
          filename: 'test.md'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Website converted to Markdown successfully');
      expect(response.body.filePath).toContain('test.md');
    });

    test('should return error when URL is missing', async () => {
      const response = await request(app)
        .post('/api/to-markdown')
        .send({
          filename: 'test.md'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('URL is required');
    });

    test('should handle link traversal in markdown conversion', async () => {
      const response = await request(app)
        .post('/api/to-markdown')
        .send({
          url: 'https://example.com',
          filename: 'test_traversed.md',
          traverseLinks: true,
          maxPages: 2
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Website and linked pages converted to Markdown successfully');
    });
  });

  describe('URL Traversal Endpoint', () => {
    test('should traverse URLs and return list', async () => {
      const response = await request(app)
        .post('/api/traverse')
        .send({
          url: 'https://example.com',
          maxPages: 2
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Website traversed successfully');
      expect(Array.isArray(response.body.urls)).toBe(true);
      expect(response.body.urls.length).toBeGreaterThan(0);
    });

    test('should return error when URL is missing', async () => {
      const response = await request(app)
        .post('/api/traverse')
        .send({
          maxPages: 2
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('URL is required');
    });

    test('should respect maxPages parameter', async () => {
      const response = await request(app)
        .post('/api/traverse')
        .send({
          url: 'https://example.com',
          maxPages: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Since we're mocking, we'll have at most 1 URL due to maxPages=1
      expect(response.body.urls.length).toBeLessThanOrEqual(1);
    });
  });
});