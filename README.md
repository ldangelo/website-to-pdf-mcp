# Website to PDF MCP Server

This MCP server fetches websites (including those behind authentication) and converts them to PDF documents. It can also traverse links on a webpage and add them to the same PDF file or return the discovered URLs.

## Features

- Convert a single webpage to PDF
- Traverse links on a webpage and convert multiple pages to a single PDF
- Support for authentication via username and password
- Configurable maximum page limit for link traversal
- Traverse website links and return URLs without PDF conversion

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the sample environment file:
   ```
   cp .env.example .env
   ```
4. Start the server:
   ```
   npm start
   ```

## API Endpoints

### Convert Website to PDF

```
POST /api/convert
```

**Request Body:**

```json
{
  "url": "https://example.com",
  "username": "optional-username",
  "password": "optional-password",
  "filename": "optional-custom-filename.pdf",
  "traverseLinks": true,
  "maxPages": 10
}
```

**Parameters:**

- `url`: (Required) The URL to convert to PDF
- `username`: (Optional) Username for authentication
- `password`: (Optional) Password for authentication
- `filename`: (Optional) Custom filename for the output PDF (default: "output.pdf")
- `traverseLinks`: (Optional) Whether to traverse links on the page (default: false)
- `maxPages`: (Optional) Maximum number of pages to process when traversing links (default: 10)

**Response:**

```json
{
  "success": true,
  "message": "Website and linked pages converted to PDF successfully (up to 10 pages)",
  "filePath": "/path/to/output.pdf"
}
```

### Traverse Website and Return URLs

```
POST /api/traverse
```

**Request Body:**

```json
{
  "url": "https://example.com",
  "username": "optional-username",
  "password": "optional-password",
  "maxPages": 10
}
```

**Parameters:**

- `url`: (Required) The URL to start traversal from
- `username`: (Optional) Username for authentication
- `password`: (Optional) Password for authentication
- `maxPages`: (Optional) Maximum number of pages to traverse (default: 10)

**Response:**

```json
{
  "success": true,
  "message": "Website traversed successfully (found 8 URLs)",
  "urls": [
    "https://example.com",
    "https://example.com/page1",
    "https://example.com/page2",
    ...
  ]
}
```

## Customization

You can customize the PDF generation by modifying the `websiteToPdf` function in `src/index.js`. The function supports:

- Custom page formats
- Background rendering
- Page margins
- And more through Puppeteer's options

## Authentication Handling

The default implementation assumes a simple username/password form. You may need to customize the authentication logic based on the specific websites you're targeting.

## Using as a Claude MCP

This server is configured as a Claude MCP (Managed Claude Plugin) that can be used directly with Claude. To use it:

### Self-Hosting Setup

1. Host this server on a platform like Heroku, Vercel, or your own infrastructure
2. Make sure the server is publicly accessible via HTTPS
3. Add an icon.png file to your repository

### Installing in Claude

1. Open Claude in your browser and navigate to the Plugins section
2. Click "Create a plugin"
3. Enter the URL where your MCP server is hosted
4. Claude will discover the API endpoints and create the plugin interface
5. Save and enable the plugin

### Usage in Claude

Once installed, you can use the MCP directly in your conversations with Claude:

- "Convert example.com to a PDF"
- "Get all the URLs from example.com"
- "Convert the website with authentication using username 'myuser' and password 'mypass'"

The plugin provides two main functions:
1. Converting websites to PDF
2. Traversing websites and returning discovered URLs

### Local Development

For local development, you can use tools like ngrok to expose your local server to the internet:

```
npm start
# In a separate terminal
ngrok http 3000
```

Then use the ngrok URL when setting up the MCP in Claude.