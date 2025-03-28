#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpError, ErrorCode, ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'; // Import schemas
import { parseOpenAPISpec } from './parser.js';
import { convertOpenAPIToMcTools } from './converter.js';
import { createListToolsHandler, createCallToolHandler } from './handlers.js';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
    console.error('Starting OpenAPI MCP Server...');

    // --- Argument Parsing ---
    const args = process.argv.slice(2);
    if (args.length < 1 || args.length > 2) {
        console.error('Usage: bun run ./dist/index.js <openapi-spec-path> [base-url]');
        process.exit(1);
    }

    // We've already checked args.length >= 1, so args[0] is guaranteed to exist.
    const openApiSpecPath = path.resolve(args[0]!); // Resolve to absolute path, assert non-null
    const baseUrlArg = args[1]; // Optional base URL override from argument

    console.error(`OpenAPI Spec Path: ${openApiSpecPath}`);
    if (baseUrlArg) {
        console.error(`Base URL Override (from arg): ${baseUrlArg}`);
    }

    if (!fs.existsSync(openApiSpecPath)) {
        console.error(`Error: OpenAPI spec file not found at ${openApiSpecPath}`);
        process.exit(1);
    }

    // --- Server Initialization ---
    const server = new Server(
        {
            // Dynamically generate name later? Maybe from spec title?
            name: `openapi-mcp-server-${path.basename(openApiSpecPath, path.extname(openApiSpecPath))}`,
            version: '0.1.0', // TODO: Get from package.json?
        },
        {
            capabilities: {
                resources: {}, // No resources defined for now
                tools: {},     // Tools will be added dynamically
            },
        }
    );

    server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
        console.error('Shutting down server...');
        await server.close();
        process.exit(0);
    });

    try {
        // --- OpenAPI Parsing & Tool Conversion ---
        console.error('Parsing OpenAPI spec...');
        const apiSpec = await parseOpenAPISpec(openApiSpecPath);
        console.error(`Parsed spec: ${apiSpec.info.title} v${apiSpec.info.version}`);

        // Determine the actual base URL to use
        // Priority: CLI arg > OpenAPI servers[0].url
        let effectiveBaseUrl: string; // Ensure it's typed as string

        if (baseUrlArg) {
            effectiveBaseUrl = baseUrlArg;
        // Refined check: Ensure apiSpec.servers is an array, has elements, the first element exists, and has a url property.
        } else if (apiSpec.servers && Array.isArray(apiSpec.servers) && apiSpec.servers.length > 0 && apiSpec.servers[0] && apiSpec.servers[0].url) {
            effectiveBaseUrl = apiSpec.servers[0].url;
            // Remove trailing slash if present, common issue
            if (effectiveBaseUrl.endsWith('/')) {
                effectiveBaseUrl = effectiveBaseUrl.slice(0, -1);
            }
            console.error(`Using base URL from OpenAPI spec: ${effectiveBaseUrl}`);
        } else {
            console.error('Error: No base URL provided via argument or found in OpenAPI spec servers list.');
            process.exit(1);
        }

        // Validate the determined base URL
        try {
            new URL(effectiveBaseUrl); // Validation happens here
        } catch (e) {
            console.error(`Error: Invalid base URL format determined: ${effectiveBaseUrl}`);
            process.exit(1);
        }


        console.error('Converting OpenAPI paths to MCP tools...');
        const mcpTools = convertOpenAPIToMcTools(apiSpec);
        console.error(`Generated ${mcpTools.length} MCP tools.`);

        // --- Register Handlers ---
        console.error('Registering MCP request handlers...');
        // Register ListTools handler
        server.setRequestHandler(
            ListToolsRequestSchema, // Pass the schema first
            createListToolsHandler(mcpTools)
        );
        // Register CallTool handler
        server.setRequestHandler(
            CallToolRequestSchema, // Pass the schema first
            createCallToolHandler(apiSpec, mcpTools, effectiveBaseUrl) // effectiveBaseUrl is now guaranteed to be a string
        );

        // --- Start Server ---
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('OpenAPI MCP server running on stdio.');

    } catch (error: any) {
        console.error('Failed to initialize server:', error.message || error);
        if (error instanceof McpError) {
            console.error(`MCP Error Code: ${error.code}`);
        }
        process.exit(1);
    }
}

main();
