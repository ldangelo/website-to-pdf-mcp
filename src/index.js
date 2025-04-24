const express = require("express");
const puppeteer = require("puppeteer");
const chromium = require("chromium");
const path = require("path");
const fs = require("fs");
const TurndownService = require("turndown");
const { PDFDocument } = require("pdf-lib");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Simple in-memory cache for content
const cache = {
  pdf: new Map(),
  markdown: new Map(),
  traverse: new Map(),
  clearCache: function() {
    this.pdf.clear();
    this.markdown.clear();
    this.traverse.clear();
  },
  // Cache expires after 15 minutes
  CACHE_TTL: 15 * 60 * 1000
};

// Clear cache every hour
setInterval(() => cache.clearCache(), 60 * 60 * 1000);

app.use(express.json());

// Function to convert website to PDF
async function websiteToPdf(url, username, password, traverseLinks, maxPages) {
  // Create a cache key based on the parameters
  const cacheKey = JSON.stringify({ url, username, traverseLinks, maxPages });
  
  // Check if we have a cached result
  if (cache.pdf.has(cacheKey)) {
    const cachedResult = cache.pdf.get(cacheKey);
    const now = Date.now();
    
    // Return cached result if it's still valid
    if (now - cachedResult.timestamp < cache.CACHE_TTL) {
      console.log(`Using cached PDF for ${url}`);
      return cachedResult.data;
    }
    
    // Remove expired cache entry
    cache.pdf.delete(cacheKey);
  }

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: null,
    executablePath: String(chromium.path),
    ignoreDefaultArgs: ["--disable-sync"],
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-extensions"],
  });

  try {
    // Optimize page settings
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    
    // Block unnecessary resources to speed up page loading
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    const pdfOptions = {
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      },
    };

    const visitedUrls = new Set();
    const urlsToVisit = await traverseWebsite(
      url,
      username,
      password,
      traverseLinks,
      maxPages,
    );
    const pdfBuffers = [];
    const pageInfo = [];

    // Use Promise.all to process multiple pages in parallel when possible
    const processUrl = async (currentUrl, isFirstPage) => {
      if (visitedUrls.has(currentUrl)) return null;
      visitedUrls.add(currentUrl);
      
      console.log(`Visiting: ${currentUrl}`);
      
      // Navigate to the URL
      await page.goto(currentUrl, { 
        waitUntil: "networkidle2",
        timeout: 30000 // Increase timeout for better reliability
      });

      // Handle login if credentials are provided (only for first page)
      if (username && password && isFirstPage) {
        try {
          await page.type('input[name="username"]', username);
          await page.type('input[name="password"]', password);
          await Promise.all([page.click('button[type="submit"]')]);
          await page.waitForNavigation({ waitUntil: "networkidle2" });
        } catch (e) {
          console.warn("Login attempt failed:", e.message);
        }
      }

      // Wait for network to be idle
      await page.waitForNetworkIdle({idleTime: 500});

      // Get page title
      const title = await page.title();
      pageInfo.push({ url: currentUrl, title });

      // Generate PDF for this page
      return await page.pdf(pdfOptions);
    };

    // Process the first URL separately (for login handling)
    if (urlsToVisit.length > 0) {
      const firstUrl = urlsToVisit.shift();
      const firstPdf = await processUrl(firstUrl, true);
      if (firstPdf) pdfBuffers.push(firstPdf);
    }

    // Process remaining URLs with increased concurrency
    while (urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
      // Get a batch of URLs to process (up to 5 at a time)
      const batch = [];
      while (urlsToVisit.length > 0 && batch.length < 5 && visitedUrls.size + batch.length < maxPages) {
        batch.push(urlsToVisit.shift());
      }

      // Process the batch one by one (using the same page instance)
      for (const currentUrl of batch) {
        const pdf = await processUrl(currentUrl, false);
        if (pdf) pdfBuffers.push(pdf);
      }
    }

    // Merge PDFs into a single buffer
    if (pdfBuffers.length > 0) {
      const mergedPdf = await PDFDocument.create();

      for (const pdfBuffer of pdfBuffers) {
        const pdf = await PDFDocument.load(pdfBuffer);
        const copiedPages = await mergedPdf.copyPages(
          pdf,
          pdf.getPageIndices(),
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const result = {
        content: mergedPdfBytes,
        pages: pageInfo,
      };
      
      // Cache the result
      cache.pdf.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    }

    return { content: Buffer.from(""), pages: [] };
  } catch (error) {
    console.error("Error converting website to PDF:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

// MCP endpoint to convert website to PDF
app.post("/api/convert", async (req, res) => {
  try {
    const {
      url,
      username,
      password,
      traverseLinks = false,
      maxPages = 10,
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Convert website to PDF
    const result = await websiteToPdf(
      url,
      username,
      password,
      traverseLinks,
      maxPages,
    );

    // Set content-type for PDF response
    res.setHeader("Content-Type", "application/pdf");

    // Set a filename for the download
    const sanitizedUrl = url
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9]/gi, "_");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizedUrl}.pdf"`,
    );

    // Send the PDF content
    res.end(Buffer.from(result.content));
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({ error: "Failed to convert website to PDF" });
  }
});

// MCP endpoint to traverse website and return URLs
app.post("/api/traverse", async (req, res) => {
  try {
    const {
      url,
      username,
      password,
      traverseLinks = false,
      maxPages = 10,
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    urlList = await traverseWebsite(url, username, password, true, maxPages);

    res.json({
      success: true,
      message: `Website traversed successfully (found ${urlList.length} URLs)`,
      urls: urlList,
    });
  } catch (error) {
    console.error("Error traversing website:", error);
    res.status(500).json({ error: "Failed to traverse website" });
  }
});

// Function to traverse website and return a list of urls
async function traverseWebsite(
  url,
  username,
  password,
  traverseLinks,
  maxPages = 10,
) {
  // Create a cache key for traversal results
  const cacheKey = JSON.stringify({ url, username, traverseLinks, maxPages });
  
  // Check if we have a cached result
  if (cache.traverse.has(cacheKey)) {
    const cachedResult = cache.traverse.get(cacheKey);
    const now = Date.now();
    
    // Return cached result if it's still valid
    if (now - cachedResult.timestamp < cache.CACHE_TTL) {
      console.log(`Using cached URL list for ${url}`);
      return cachedResult.data;
    }
    
    // Remove expired cache entry
    cache.traverse.delete(cacheKey);
  }
  
  console.log("url: ", url, typeof url);
  console.log("traverseLinks: ", traverseLinks, typeof traverseLinks);
  console.log("maxPages: ", maxPages, typeof maxPages);

  try {
    if (!url) {
      throw new Error("URL is required");
    }

    // If not traversing links, just return the initial URL
    if (!traverseLinks) {
      const result = [url];
      cache.traverse.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      return result;
    }

    const browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: null,
      executablePath: String(chromium.path),
      ignoreDefaultArgs: ["--disable-sync"],
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-extensions"],
    });

    try {
      const page = await browser.newPage();
      
      // Optimize page settings
      await page.setRequestInterception(true);
      
      // Block unnecessary resources to speed up page loading
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      const visitedUrls = new Set();
      const urlsToVisit = [url];
      const urlList = [];

      while (urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
        const currentUrl = urlsToVisit.shift();

        if (visitedUrls.has(currentUrl)) continue;
        visitedUrls.add(currentUrl);
        urlList.push(currentUrl);

        console.log(`Traversing: ${currentUrl}`);

        try {
          // Navigate to the URL with optimized settings
          await page.goto(currentUrl, { 
            waitUntil: "networkidle2",
            timeout: 30000 // Increase timeout for better reliability
          });

          // Handle login if credentials are provided (only for first page)
          if (username && password && visitedUrls.size === 1) {
            try {
              await page.type('input[name="username"]', username);
              await page.type('input[name="password"]', password);
              await Promise.all([page.click('button[type="submit"]')]);
              await page.waitForNavigation({ waitUntil: "networkidle2" });
            } catch (e) {
              console.warn("Login attempt failed:", e.message);
            }
          }

          // Wait for network to be idle
          await page.waitForNetworkIdle({idleTime: 500});

          // Collect links from the page more efficiently
          const baseUrl = new URL(currentUrl).origin;
          const links = await page.evaluate((baseUrl) => {
            // Use more efficient DOM querying
            const linkElements = document.querySelectorAll("a[href]");
            const linksArray = [];
            const visited = new Set();
            
            for (let i = 0; i < linkElements.length; i++) {
              let href = linkElements[i].href;
              if (!href) continue;
              
              // Normalize URL
              if (href.startsWith("/")) {
                href = baseUrl + href;
              }
              
              // Skip already processed links
              if (visited.has(href)) continue;
              visited.add(href);
              
              // Apply filters
              if (href.startsWith(baseUrl) &&
                  !href.includes("#") &&
                  !href.endsWith(".pdf") &&
                  !href.endsWith(".zip") &&
                  !href.endsWith(".jpg") &&
                  !href.endsWith(".png") &&
                  !href.endsWith(".jpeg") &&
                  !href.endsWith(".gif") &&
                  !href.endsWith(".mp4") &&
                  !href.endsWith(".mp3")) {
                linksArray.push(href);
              }
            }
            
            return linksArray;
          }, baseUrl);

          // Add new links to the queue efficiently
          for (const link of links) {
            if (!visitedUrls.has(link) && !urlsToVisit.includes(link)) {
              urlsToVisit.push(link);
            }
          }
        } catch (pageError) {
          console.warn(`Error visiting ${currentUrl}:`, pageError.message);
          // Continue with next URL even if this one fails
        }
      }

      // Cache the result for future use
      cache.traverse.set(cacheKey, {
        data: urlList,
        timestamp: Date.now()
      });
      
      return urlList;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Error traversing website:", error);
    throw error;
  }
}

async function websiteToMarkdown(
  url,
  username,
  password,
  traverseLinks = false,
  maxPages = 10,
) {
  // Create a cache key based on the parameters
  const cacheKey = JSON.stringify({ url, username, traverseLinks, maxPages });
  
  // Check if we have a cached result
  if (cache.markdown.has(cacheKey)) {
    const cachedResult = cache.markdown.get(cacheKey);
    const now = Date.now();
    
    // Return cached result if it's still valid
    if (now - cachedResult.timestamp < cache.CACHE_TTL) {
      console.log(`Using cached Markdown for ${url}`);
      return cachedResult.data;
    }
    
    // Remove expired cache entry
    cache.markdown.delete(cacheKey);
  }

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: null,
    executablePath: String(chromium.path),
    ignoreDefaultArgs: ["--disable-sync"],
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-extensions"],
  });

  try {
    // Create a reusable turndown service with optimized settings
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_'
    });
    
    // Configure turndown to handle specific HTML elements more efficiently
    turndownService.addRule('removeScripts', {
      filter: ['script', 'style', 'noscript'],
      replacement: () => '' // Remove scripts and styles
    });
    
    turndownService.addRule('optimizeImages', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        return src ? `![${alt}](${src})` : '';
      }
    });

    // Set up page with performance optimizations
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    
    // Block unnecessary resources to speed up page loading
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    const visitedUrls = new Set();
    const urlsToVisit = await traverseWebsite(
      url,
      username,
      password,
      traverseLinks,
      maxPages,
    );
    const markdownContents = [];
    const pageInfo = [];

    // Define a function to process each URL
    const processUrl = async (currentUrl, isFirstPage) => {
      if (visitedUrls.has(currentUrl)) return null;
      visitedUrls.add(currentUrl);
      
      console.log(`Visiting for Markdown: ${currentUrl}`);
      
      // Navigate to the URL with optimized settings
      await page.goto(currentUrl, { 
        waitUntil: "networkidle2",
        timeout: 30000 // Increase timeout for better reliability
      });

      // Handle login if credentials are provided (only for first page)
      if (username && password && isFirstPage) {
        try {
          await page.type('input[name="username"]', username);
          await page.type('input[name="password"]', password);
          await Promise.all([page.click('button[type="submit"]')]);
          await page.waitForNavigation({ waitUntil: "networkidle2" });
        } catch (e) {
          console.warn("Login attempt failed:", e.message);
        }
      }

      // Wait for network to be idle
      await page.waitForNetworkIdle({idleTime: 500});

      // Get the page content and convert to markdown
      // Extract only the main content to improve performance
      const content = await page.evaluate(() => {
        // Try to find main content container
        const mainContent = document.querySelector('main') || 
                           document.querySelector('article') || 
                           document.querySelector('.content') || 
                           document.querySelector('#content') ||
                           document.body;
        return mainContent.outerHTML;
      });
      
      const title = await page.title();
      const markdown = turndownService.turndown(content);

      // Create markdown content with the page title and URL as header
      const pageMarkdown = `# ${title}\n\nURL: ${currentUrl}\n\n${markdown}`;
      pageInfo.push({ url: currentUrl, title });
      
      return pageMarkdown;
    };

    // Process the first URL separately (for login handling)
    if (urlsToVisit.length > 0) {
      const firstUrl = urlsToVisit.shift();
      const firstMarkdown = await processUrl(firstUrl, true);
      if (firstMarkdown) markdownContents.push(firstMarkdown);
    }

    // Process remaining URLs with increased concurrency
    while (urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
      // Get a batch of URLs to process (up to 5 at a time)
      const batch = [];
      while (urlsToVisit.length > 0 && batch.length < 5 && visitedUrls.size + batch.length < maxPages) {
        batch.push(urlsToVisit.shift());
      }

      // Process each URL in the batch
      for (const currentUrl of batch) {
        const markdown = await processUrl(currentUrl, false);
        if (markdown) markdownContents.push(markdown);
      }
    }

    // Merge markdown content
    if (markdownContents.length > 0) {
      const mergedContent = markdownContents.join("\n\n---\n\n");
      const result = {
        content: mergedContent,
        pages: pageInfo,
      };
      
      // Cache the result
      cache.markdown.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    }

    return { content: "", pages: [] };
  } catch (error) {
    console.error("Error converting website to Markdown:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

// MCP endpoint to convert website to Markdown
app.post("/api/to-markdown", async (req, res) => {
  try {
    const {
      url,
      username,
      password,
      traverseLinks = false,
      maxPages = 10,
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Convert website to Markdown
    const result = await websiteToMarkdown(
      url,
      username,
      password,
      traverseLinks,
      maxPages,
    );

    // Set content-type for text response
    res.setHeader("Content-Type", "text/markdown");

    // Set a filename for the download
    const sanitizedUrl = url
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9]/gi, "_");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizedUrl}.md"`,
    );

    // Send the Markdown content
    res.send(result.content);
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({ error: "Failed to convert website to Markdown" });
  }
});

// Start the server only if this file is run directly
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// Export the app for testing
module.exports = app;
