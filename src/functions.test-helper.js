// Export the core functions for testing
// This is a helper file to allow testing the functions directly

const puppeteer = require('puppeteer');
const chromium = require('chromium');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const TurndownService = require('turndown');

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

// Function to convert website to Markdown
async function websiteToMarkdown(url, username, password, outputPath, traverseLinks = false, maxPages = 10) {
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
    const markdownFiles = [];
    
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
      
      // Create a markdown file with the page title and URL as header
      const fileContent = `# ${title}\n\nURL: ${currentUrl}\n\n${markdown}`;
      const filename = `${outputPath.replace('.md', '')}_${visitedUrls.size}.md`;
      fs.writeFileSync(filename, fileContent);
      
      markdownFiles.push(filename);
      
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
    
    // Merge markdown files into a single file if traversing links
    if (traverseLinks && markdownFiles.length > 1) {
      const mergedContent = markdownFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n\n---\n\n');
      fs.writeFileSync(outputPath, mergedContent);
      
      // Delete individual files
      markdownFiles.forEach(file => {
        if (file !== outputPath) {
          fs.unlinkSync(file);
        }
      });
      
      return outputPath;
    } else if (markdownFiles.length === 1) {
      // Rename the single file to the requested output path if needed
      if (markdownFiles[0] !== outputPath) {
        fs.renameSync(markdownFiles[0], outputPath);
      }
      return outputPath;
    }
    
    return null;
  } catch (error) {
    console.error("Error converting website to Markdown:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Function to collect URLs from a website (extracted from the traverse endpoint)
async function collectWebsiteUrls(url, username, password, maxPages = 10) {
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
    
    return urlList;
  } finally {
    await browser.close();
  }
}

module.exports = {
  websiteToPdf,
  websiteToMarkdown,
  collectWebsiteUrls
};