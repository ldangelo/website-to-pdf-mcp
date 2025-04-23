# Website to PDF/Markdown MCP Server

This MCP server fetches websites (including those behind authentication) and converts them to PDF or Markdown documents. It can also traverse links on a webpage and include them in the generated documents or return the discovered URLs.

## Features

- Convert a single webpage to PDF
- Convert a webpage to Markdown format
- Traverse links on a webpage and convert multiple pages to a single PDF or Markdown file
- Support for authentication via username and password
- Configurable maximum page limit for link traversal
- Traverse website links and return URLs without conversion

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
  "traverseLinks": true,
  "maxPages": 10
}
```

**Parameters:**

- `url`: (Required) The URL to convert to PDF
- `username`: (Optional) Username for authentication
- `password`: (Optional) Password for authentication
- `traverseLinks`: (Optional) Whether to traverse links on the page (default: false)
- `maxPages`: (Optional) Maximum number of pages to process when traversing links (default: 10)

**Response:**

The response will be the PDF document with appropriate content-type headers:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="example_com.pdf"
```

The binary PDF content is returned directly in the response body.

### Convert Website to Markdown

```
POST /api/to-markdown
```

**Request Body:**

```json
{
  "url": "https://example.com",
  "username": "optional-username",
  "password": "optional-password",
  "traverseLinks": true,
  "maxPages": 10
}
```

**Parameters:**

- `url`: (Required) The URL to convert to Markdown
- `username`: (Optional) Username for authentication
- `password`: (Optional) Password for authentication
- `traverseLinks`: (Optional) Whether to traverse links on the page (default: false)
- `maxPages`: (Optional) Maximum number of pages to process when traversing links (default: 10)

**Response:**

The response will be the Markdown document with appropriate content-type headers:
```
Content-Type: text/markdown
Content-Disposition: attachment; filename="example_com.md"
```

The Markdown content is returned directly in the response body.

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

You can customize the PDF and Markdown generation by modifying the relevant functions in `src/index.js`:

### PDF Generation

The `websiteToPdf` function supports:
- Custom page formats
- Background rendering
- Page margins
- And more through Puppeteer's options

### Markdown Generation

The `websiteToMarkdown` function uses the Turndown library which offers:
- Custom rules for conversion
- Ability to preserve certain HTML elements
- Options for handling code blocks, headings, and lists

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
- "Convert example.com to Markdown"
- "Get all the URLs from example.com"
- "Convert the website with authentication using username 'myuser' and password 'mypass'"

The plugin provides three main functions:
1. Converting websites to PDF
2. Converting websites to Markdown
3. Traversing websites and returning discovered URLs

### Local Development

For local development, you can use tools like ngrok to expose your local server to the internet:

```
npm start
# In a separate terminal
ngrok http 3000
```

Then use the ngrok URL when setting up the MCP in Claude.