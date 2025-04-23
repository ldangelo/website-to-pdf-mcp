const express = require("express");
const puppeteer = require("puppeteer");
const chromium = require("chromium");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Function to convert website to PDF
async function websiteToPdf(url, username, password, outputPath, traverseLinks = false, maxPages = 10) {
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
    const pdfs = [];
    
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

      // Generate PDF for this page
      const tempPdfPath = `${outputPath.replace('.pdf', '')}_temp_${visitedUrls.size}.pdf`;
      await page.pdf({
        ...pdfOptions,
        path: tempPdfPath,
      });
      
      pdfs.push(tempPdfPath);
      
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
    
    // Merge PDFs into a single file
    if (pdfs.length > 0) {
      const { PDFDocument } = require('pdf-lib');
      const fs = require('fs');
      
      const mergedPdf = await PDFDocument.create();
      
      for (const pdfPath of pdfs) {
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
        
        // Remove temp file
        fs.unlinkSync(pdfPath);
      }
      
      const mergedPdfBytes = await mergedPdf.save();
      fs.writeFileSync(outputPath, mergedPdfBytes);
    }

    return outputPath;
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
      filename = "output.pdf", 
      traverseLinks = false, 
      maxPages = 10 
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, "../output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, filename);

    // Convert website to PDF
    await websiteToPdf(url, username, password, outputPath, traverseLinks, maxPages);

    res.json({
      success: true,
      message: traverseLinks 
        ? `Website and linked pages converted to PDF successfully (up to ${maxPages} pages)` 
        : "Website converted to PDF successfully",
      filePath: outputPath,
    });
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

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
