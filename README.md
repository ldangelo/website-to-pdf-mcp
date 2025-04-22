# Website to PDF MCP Server

This MCP server fetches websites (including those behind authentication) and converts them to PDF documents. It can also traverse links on a webpage and add them to the same PDF file.

## Features

- Convert a single webpage to PDF
- Traverse links on a webpage and convert multiple pages to a single PDF
- Support for authentication via username and password
- Configurable maximum page limit for link traversal

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

## Customization

You can customize the PDF generation by modifying the `websiteToPdf` function in `src/index.js`. The function supports:

- Custom page formats
- Background rendering
- Page margins
- And more through Puppeteer's options

## Authentication Handling

The default implementation assumes a simple username/password form. You may need to customize the authentication logic based on the specific websites you're targeting.