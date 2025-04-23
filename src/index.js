const express = require("express");
const puppeteer = require("puppeteer");
const chromium = require("chromium");
const path = require("path");
const fs = require("fs");
const TurndownService = require("turndown");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Function to convert website to PDF
async function websiteToPdf(url, username, password, traverseLinks = false, maxPages = 10) {
  const browser = await puppeteer.launch({
    headless: "false",
    defaultViewport: null,
    executablePath: String(chromium.path),
    ignoreDefaultArgs: ["--disable-sync"],
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
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
    const urlsToVisit = [url];
    const pdfBuffers = [];
    const pageInfo = [];
    
    while (urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
      const currentUrl = urlsToVisit.shift();
      
      if (visitedUrls.has(currentUrl)) continue;
      visitedUrls.add(currentUrl);
      
      console.log(`Visiting: ${currentUrl}`);

      // Navigate to the URL
      await page.goto(currentUrl, { waitUntil: "networkidle2" });

      // Handle login if credentials are provided (only for first page)
      if (username && password && visitedUrls.size === 1) {
        // This is a simplified login flow and might need customization based on the target site
        await page.type('input[name="username"]', username);
        await page.type('input[name="password"]', password);
        await Promise.all([
          page.click('button[type="submit"]'),
        ]);
      }

      // Ensure the page is fully loaded
      await page.waitForTimeout(2000);

      // Get page title
      const title = await page.title();
      pageInfo.push({ url: currentUrl, title });

      // Generate PDF for this page
      const pdfBuffer = await page.pdf(pdfOptions);
      pdfBuffers.push(pdfBuffer);
      
      // If traversing links is enabled, collect links from the page
      if (traverseLinks) {
        const baseUrl = new URL(currentUrl).origin;
        const links = await page.evaluate((baseUrl) => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => {
              let href = a.href;
              if (href.startsWith('/')) {
                href = baseUrl + href;
              }
              return href;
            })
            .filter(href => 
              href.startsWith(baseUrl) && 
              !href.includes('#') && 
              !href.endsWith('.pdf') && 
              !href.endsWith('.zip') && 
              !href.endsWith('.jpg') && 
              !href.endsWith('.png')
            );
        }, baseUrl);
        
        // Add new links to the queue
        for (const link of links) {
          if (!visitedUrls.has(link) && !urlsToVisit.includes(link)) {
            urlsToVisit.push(link);
          }
        }
      }
    }
    
    // Merge PDFs into a single buffer
    if (pdfBuffers.length > 0) {
      const { PDFDocument } = require('pdf-lib');
      
      const mergedPdf = await PDFDocument.create();
      
      for (const pdfBuffer of pdfBuffers) {
        const pdf = await PDFDocument.load(pdfBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }
      
      const mergedPdfBytes = await mergedPdf.save();
      return {
        content: mergedPdfBytes,
        pages: pageInfo
      };
    }
    
    return { content: Buffer.from(''), pages: [] };
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
      maxPages = 10 
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Convert website to PDF
    const result = await websiteToPdf(url, username, password, traverseLinks, maxPages);

    // Set content-type for PDF response
    res.setHeader('Content-Type', 'application/pdf');
    
    // Set a filename for the download
    const sanitizedUrl = url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedUrl}.pdf"`);
    
    // Send the PDF content
    res.send(result.content);
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
      maxPages = 10 
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const browser = await puppeteer.launch({
      headless: "false",
      defaultViewport: null,
      executablePath: String(chromium.path),
      ignoreDefaultArgs: ["--disable-sync"],
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      const visitedUrls = new Set();
      const urlsToVisit = [url];
      const urlList = [];
      
      while (urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
        const currentUrl = urlsToVisit.shift();
        
        if (visitedUrls.has(currentUrl)) continue;
        visitedUrls.add(currentUrl);
        urlList.push(currentUrl);
        
        console.log(`Visiting: ${currentUrl}`);

        // Navigate to the URL
        await page.goto(currentUrl, { waitUntil: "networkidle2" });

        // Handle login if credentials are provided (only for first page)
        if (username && password && visitedUrls.size === 1) {
          await page.type('input[name="username"]', username);
          await page.type('input[name="password"]', password);
          await Promise.all([
            page.click('button[type="submit"]'),
          ]);
        }

        // Ensure the page is fully loaded
        await page.waitForTimeout(2000);
        
        // Collect links from the page
        const baseUrl = new URL(currentUrl).origin;
        const links = await page.evaluate((baseUrl) => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => {
              let href = a.href;
              if (href.startsWith('/')) {
                href = baseUrl + href;
              }
              return href;
            })
            .filter(href => 
              href.startsWith(baseUrl) && 
              !href.includes('#') && 
              !href.endsWith('.pdf') && 
              !href.endsWith('.zip') && 
              !href.endsWith('.jpg') && 
              !href.endsWith('.png')
            );
        }, baseUrl);
        
        // Add new links to the queue
        for (const link of links) {
          if (!visitedUrls.has(link) && !urlsToVisit.includes(link)) {
            urlsToVisit.push(link);
          }
        }
      }
      
      res.json({
        success: true,
        message: `Website traversed successfully (found ${urlList.length} URLs)`,
        urls: urlList
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Error traversing website:", error);
    res.status(500).json({ error: "Failed to traverse website" });
  }
});

// Function to convert website to Markdown
async function websiteToMarkdown(url, username, password, traverseLinks = false, maxPages = 10) {
  const browser = await puppeteer.launch({
    headless: "false",
    defaultViewport: null,
    executablePath: String(chromium.path),
    ignoreDefaultArgs: ["--disable-sync"],
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const turndownService = new TurndownService();
    
    const visitedUrls = new Set();
    const urlsToVisit = [url];
    const markdownContents = [];
    const pageInfo = [];
    
    while (urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
      const currentUrl = urlsToVisit.shift();
      
      if (visitedUrls.has(currentUrl)) continue;
      visitedUrls.add(currentUrl);
      
      console.log(`Visiting: ${currentUrl}`);

      // Navigate to the URL
      await page.goto(currentUrl, { waitUntil: "networkidle2" });

      // Handle login if credentials are provided (only for first page)
      if (username && password && visitedUrls.size === 1) {
        // This is a simplified login flow and might need customization based on the target site
        await page.type('input[name="username"]', username);
        await page.type('input[name="password"]', password);
        await Promise.all([
          page.click('button[type="submit"]'),
        ]);
      }

      // Ensure the page is fully loaded
      await page.waitForTimeout(2000);

      // Get the page content and convert to markdown
      const content = await page.content();
      const title = await page.title();
      const markdown = turndownService.turndown(content);
      
      // Create markdown content with the page title and URL as header
      const pageMarkdown = `# ${title}\n\nURL: ${currentUrl}\n\n${markdown}`;
      markdownContents.push(pageMarkdown);
      pageInfo.push({ url: currentUrl, title });
      
      // If traversing links is enabled, collect links from the page
      if (traverseLinks) {
        const baseUrl = new URL(currentUrl).origin;
        const links = await page.evaluate((baseUrl) => {
          return Array.from(document.querySelectorAll('a[href]'))
            .map(a => {
              let href = a.href;
              if (href.startsWith('/')) {
                href = baseUrl + href;
              }
              return href;
            })
            .filter(href => 
              href.startsWith(baseUrl) && 
              !href.includes('#') && 
              !href.endsWith('.pdf') && 
              !href.endsWith('.zip') && 
              !href.endsWith('.jpg') && 
              !href.endsWith('.png')
            );
        }, baseUrl);
        
        // Add new links to the queue
        for (const link of links) {
          if (!visitedUrls.has(link) && !urlsToVisit.includes(link)) {
            urlsToVisit.push(link);
          }
        }
      }
    }
    
    // Merge markdown content
    if (markdownContents.length > 0) {
      const mergedContent = markdownContents.join('\n\n---\n\n');
      return {
        content: mergedContent,
        pages: pageInfo
      };
    }
    
    return { content: '', pages: [] };
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
      maxPages = 10 
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Convert website to Markdown
    const result = await websiteToMarkdown(url, username, password, traverseLinks, maxPages);

    // Set content-type for text response
    res.setHeader('Content-Type', 'text/markdown');
    
    // Set a filename for the download
    const sanitizedUrl = url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedUrl}.md"`);
    
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
