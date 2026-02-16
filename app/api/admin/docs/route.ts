import { NextRequest, NextResponse } from "next/server";
import { generateOpenAPISpec } from "../../../../lib/docs/openapi-generator";

/**
 * GET /api/admin/docs
 * Serve OpenAPI/Swagger documentation
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const format = searchParams.get("format") || "json";

		const spec = generateOpenAPISpec();

		switch (format.toLowerCase()) {
			case "json":
				return NextResponse.json(spec, {
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": "public, max-age=3600", // Cache for 1 hour
					},
				});

			case "yaml":
				// Convert JSON to YAML
				const yaml = jsonToYaml(spec);
				return new NextResponse(yaml, {
					headers: {
						"Content-Type": "application/x-yaml",
						"Cache-Control": "public, max-age=3600",
					},
				});

			case "html":
				// Serve Swagger UI HTML
				const html = generateSwaggerUI();
				return new NextResponse(html, {
					headers: {
						"Content-Type": "text/html",
						"Cache-Control": "public, max-age=3600",
					},
				});

			default:
				return NextResponse.json(
					{
						success: false,
						error: {
							code: "INVALID_FORMAT",
							message: `Unsupported format: ${format}. Supported formats: json, yaml, html`,
							timestamp: new Date().toISOString(),
						},
					},
					{ status: 400 },
				);
		}
	} catch (error) {
		console.error("[API Docs] Error generating documentation:", error);

		return NextResponse.json(
			{
				success: false,
				error: {
					code: "DOCUMENTATION_ERROR",
					message: "Failed to generate API documentation",
					timestamp: new Date().toISOString(),
				},
			},
			{ status: 500 },
		);
	}
}

/**
 * Convert JSON object to YAML string
 */
function jsonToYaml(obj: any, indent: number = 0): string {
	const spaces = "  ".repeat(indent);

	if (obj === null) return "null";
	if (typeof obj === "boolean") return obj.toString();
	if (typeof obj === "number") return obj.toString();
	if (typeof obj === "string") {
		// Escape special characters and wrap in quotes if needed
		if (obj.includes("\n") || obj.includes('"') || obj.includes("'")) {
			return `"${obj.replace(/"/g, '\\"')}"`;
		}
		return obj;
	}

	if (Array.isArray(obj)) {
		if (obj.length === 0) return "[]";
		return obj.map((item) => `\n${spaces}- ${jsonToYaml(item, indent + 1)}`).join("");
	}

	if (typeof obj === "object") {
		const keys = Object.keys(obj);
		if (keys.length === 0) return "{}";

		return keys
			.map((key) => {
				const value = obj[key];
				const yamlValue = jsonToYaml(value, indent + 1);

				if (typeof value === "object" && value !== null && !Array.isArray(value)) {
					return `\n${spaces}${key}:${yamlValue}`;
				} else if (Array.isArray(value) && value.length > 0) {
					return `\n${spaces}${key}:${yamlValue}`;
				} else {
					return `\n${spaces}${key}: ${yamlValue}`;
				}
			})
			.join("");
	}

	return obj.toString();
}

/**
 * Generate Swagger UI HTML
 */
function generateSwaggerUI(): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatWit Queue Management API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.10.3/favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.10.3/favicon-16x16.png" sizes="16x16" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      background-color: #1f2937;
    }
    .swagger-ui .topbar .download-url-wrapper {
      display: none;
    }
    .custom-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      text-align: center;
      margin-bottom: 2rem;
    }
    .custom-header h1 {
      margin: 0;
      font-size: 2.5rem;
      font-weight: 300;
    }
    .custom-header p {
      margin: 0.5rem 0 0 0;
      font-size: 1.1rem;
      opacity: 0.9;
    }
    .api-info {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 0 2rem 2rem 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .api-info h3 {
      margin-top: 0;
      color: #374151;
    }
    .api-info ul {
      margin: 0;
      padding-left: 1.5rem;
    }
    .api-info li {
      margin: 0.5rem 0;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>ChatWit Queue Management API</h1>
    <p>Comprehensive BullMQ queue management with monitoring, alerting, and webhooks</p>
  </div>
  
  <div class="api-info">
    <h3>🚀 Quick Start</h3>
    <ul>
      <li><strong>Base URL:</strong> <code>https://api.chatwit.com</code></li>
      <li><strong>Authentication:</strong> Bearer token required for all endpoints</li>
      <li><strong>Rate Limits:</strong> 1000 requests/hour for authenticated users</li>
      <li><strong>Response Format:</strong> All responses follow a consistent JSON structure</li>
    </ul>
  </div>

  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/admin/docs?format=json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list",
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
        requestInterceptor: function(request) {
          // Add authentication header if available
          const token = localStorage.getItem('api_token');
          if (token) {
            request.headers['Authorization'] = 'Bearer ' + token;
          }
          return request;
        },
        responseInterceptor: function(response) {
          // Handle rate limiting headers
          if (response.headers['x-ratelimit-remaining']) {
            console.log('Rate limit remaining:', response.headers['x-ratelimit-remaining']);
          }
          return response;
        },
        onComplete: function() {
          // Add custom styling or functionality after load
          console.log('Swagger UI loaded successfully');
        }
      });

      // Add token input functionality
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        const tokenInput = document.createElement('div');
        tokenInput.innerHTML = \`
          <div style="display: flex; align-items: center; gap: 10px; margin-left: 20px;">
            <label style="color: white; font-size: 14px;">API Token:</label>
            <input 
              type="password" 
              id="api-token-input" 
              placeholder="Enter your API token"
              style="padding: 5px 10px; border: none; border-radius: 4px; width: 200px;"
            />
            <button 
              onclick="setApiToken()" 
              style="padding: 5px 15px; background: #4f46e5; color: white; border: none; border-radius: 4px; cursor: pointer;"
            >
              Set Token
            </button>
          </div>
        \`;
        topbar.appendChild(tokenInput);
      }

      window.setApiToken = function() {
        const input = document.getElementById('api-token-input');
        const token = input.value.trim();
        if (token) {
          localStorage.setItem('api_token', token);
          alert('API token set successfully! You can now test the endpoints.');
        } else {
          localStorage.removeItem('api_token');
          alert('API token cleared.');
        }
      };

      // Load saved token
      const savedToken = localStorage.getItem('api_token');
      if (savedToken) {
        const input = document.getElementById('api-token-input');
        if (input) {
          input.value = savedToken;
        }
      }
    };
  </script>
</body>
</html>
  `.trim();
}
