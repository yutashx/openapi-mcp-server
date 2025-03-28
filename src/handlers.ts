// Import OpenAPIV3 and ErrorCode as values
import { OpenAPIV3 } from 'openapi-types';
// Import correct handler types, McpError class, and ErrorCode enum
import {
    type Tool,
    type ListToolsRequest,
    // No ListToolsResponse needed
    type CallToolRequest,
    // No CallToolResponse needed
    McpError,
    ErrorCode,
    type TextContent,
    // No RequestHandler needed
} from '@modelcontextprotocol/sdk/types.js';
// Import RequestInit and JSONSchema7 as types only
import fetch, { Headers, type RequestInit, type Response } from 'node-fetch'; // Use node-fetch
import { URLSearchParams } from 'node:url';
import type { JSONSchema7 } from 'json-schema'; // For potential validation (though SDK might handle basic)

// Store mapping from tool name to its corresponding OpenAPI path and method
// This avoids searching through the spec again during CallTool
interface ToolOperationMapping {
    path: string;
    method: OpenAPIV3.HttpMethods;
    operation: OpenAPIV3.OperationObject;
    toolDefinition: Tool;
}

// Simple in-memory store for the mapping
let operationMap: Map<string, ToolOperationMapping> | null = null;

// Function to build the map (called once in index.ts after conversion)
function buildOperationMap(apiSpec: OpenAPIV3.Document, tools: Tool[]): Map<string, ToolOperationMapping> {
    const map = new Map<string, ToolOperationMapping>();
    if (!apiSpec.paths) return map;

    const toolMapByName = new Map(tools.map(t => [t.name, t]));

    for (const path in apiSpec.paths) {
        const pathItem = apiSpec.paths[path];
        if (!pathItem) continue;

        for (const method in pathItem) {
            if (!Object.values(OpenAPIV3.HttpMethods).includes(method as OpenAPIV3.HttpMethods)) {
                continue;
            }
            const operation = pathItem[method as keyof typeof pathItem] as OpenAPIV3.OperationObject;
            if (!operation) continue;

            // Regenerate the name using the same logic as converter.ts
            // TODO: Refactor generateToolName into utils.ts to avoid duplication
            let toolName = operation.operationId?.replace(/[^a-zA-Z0-9_]/g, '_');
            if (!toolName) {
                 const pathParts = path.replace(/[^a-zA-Z0-9_]/g, '_').split('_').filter(p => p);
                 toolName = `${method.toLowerCase()}_${pathParts.join('_')}`;
            }

            const toolDefinition = toolMapByName.get(toolName);
            if (toolDefinition) {
                 map.set(toolName, {
                    path: path,
                    method: method as OpenAPIV3.HttpMethods,
                    operation: operation,
                    toolDefinition: toolDefinition,
                });
            } else {
                console.warn(`Could not find matching tool definition for operation: ${method} ${path} (Generated name: ${toolName})`);
            }
        }
    }
    return map;
}


/**
 * Creates a request handler for the ListTools MCP request.
 *
 * @param tools The array of Tool definitions generated from the OpenAPI spec.
 * @returns An async function that handles ListTools requests.
 */
// Remove explicit RequestHandler/ListToolsResponse types
export function createListToolsHandler(tools: Tool[]) {
    console.error(`Creating ListTools handler with ${tools.length} tools.`);
    // Return the handler function directly
    return async (request: ListToolsRequest) => { // Return type is inferred
        console.error('Handling ListTools request...');
        return { tools };
    };
}

/**
 * Creates a request handler for the CallTool MCP request.
 *
 * @param apiSpec The parsed OpenAPI V3 Document.
 * @param tools The array of Tool definitions.
 * @param baseUrl The base URL for the API.
 * @returns An async function that handles CallTool requests.
 */
// Remove explicit RequestHandler/CallToolResponse types
export function createCallToolHandler(
    apiSpec: OpenAPIV3.Document,
    tools: Tool[],
    baseUrl: string
) {
    console.error('Creating CallTool handler...');
    // Build the operation map once when the handler is created
    if (!operationMap) {
        operationMap = buildOperationMap(apiSpec, tools);
        console.error(`Built operation map with ${operationMap.size} entries.`);
    }

    // Return the actual handler function
    return async (request: CallToolRequest) => { // Return type is inferred
        console.error(`Handling CallTool request for tool: ${request.params.name}`);
        const toolName = request.params.name;
        const args = request.params.arguments || {};

        if (!operationMap) {
             throw new Error("Operation map not initialized"); // Should not happen
        }

        const mapping = operationMap.get(toolName);
        if (!mapping) {
            // Use McpError constructor
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Tool '${toolName}' not found.`
            );
        }

        const { path: rawPath, method, operation, toolDefinition } = mapping;

        // --- Parameter Processing ---
        let processedPath = rawPath;
        const queryParams = new URLSearchParams();
        const headers = new Headers({
             'Accept': 'application/json', // Default to accepting JSON
             // Add other default headers if needed
        });
        let body: any = undefined;

        // Iterate through parameters defined in the OpenAPI operation
        if (operation.parameters) {
            for (const param of operation.parameters) {
                 if ('$ref' in param) continue; // Skip refs if not dereferenced

                 const argValue = args[param.name];

                 // Basic validation: Check required params are present
                 if (param.required && argValue === undefined) {
                     // Use McpError constructor
                     throw new McpError(
                         ErrorCode.InvalidParams,
                         `Missing required parameter '${param.name}' for tool '${toolName}'.`
                     );
                 }

                 if (argValue !== undefined) {
                     switch (param.in) {
                         case 'path':
                             // Replace placeholder in path string
                             processedPath = processedPath.replace(`{${param.name}}`, encodeURIComponent(String(argValue)));
                             break;
                         case 'query':
                             // Add to query parameters
                             // Handle array/object serialization if needed (simple for now)
                             if (Array.isArray(argValue)) {
                                 argValue.forEach(val => queryParams.append(param.name, String(val)));
                             } else {
                                 queryParams.set(param.name, String(argValue));
                             }
                             break;
                         case 'header':
                             // Add to headers
                             headers.set(param.name, String(argValue));
                             break;
                         case 'cookie':
                             // Cookies are typically handled by agents/browsers, less common for direct API calls via server
                             console.warn(`Cookie parameter '${param.name}' not handled.`);
                             break;
                     }
                 }
            }
        }

        // --- Request Body Processing ---
        if (operation.requestBody) {
             if ('$ref' in operation.requestBody) {
                 console.warn("Skipping $ref in requestBody.");
             } else {
                 const requestBodyArg = args['requestBody']; // Using the name defined in converter.ts

                 if (operation.requestBody.required && requestBodyArg === undefined) {
                      // Use McpError constructor
                     throw new McpError(
                         ErrorCode.InvalidParams,
                         `Missing required requestBody for tool '${toolName}'.`
                     );
                 }

                 if (requestBodyArg !== undefined) {
                     // Assuming application/json based on converter logic
                     const jsonContent = operation.requestBody.content?.['application/json'];
                     if (jsonContent) {
                         headers.set('Content-Type', 'application/json');
                         try {
                             body = JSON.stringify(requestBodyArg);
                         } catch (e: any) {
                              // Use McpError constructor
                             throw new McpError(
                                 ErrorCode.InvalidParams,
                                 `Failed to stringify requestBody for tool '${toolName}': ${e.message}`
                             );
                         }
                     } else {
                         // Handle other content types if converter is expanded
                         console.warn(`Request body found for tool '${toolName}' but no 'application/json' content type defined in OpenAPI spec.`);
                         // Maybe attempt to send as plain text? Or throw error?
                         // headers.set('Content-Type', 'text/plain');
                         // body = String(requestBodyArg);
                          // Use McpError constructor
                         throw new McpError(
                             ErrorCode.InvalidParams,
                             `Unsupported request body content type for tool '${toolName}'. Only application/json is supported.`
                         );
                     }
                 }
             }
        }

        // --- API Request Execution ---
        const url = `${baseUrl}${processedPath}${queryParams.toString() ? `?${queryParams}` : ''}`;
        console.error(`Executing API call: ${method.toUpperCase()} ${url}`);
        if (body) {
            console.error(`Request Body: ${body}`); // Be careful logging sensitive data
        }

        const requestOptions: RequestInit = {
            method: method.toUpperCase(),
            headers: headers,
            body: body,
            // Add timeout, agent, etc. if needed
        };

        let response: Response;
        try {
             response = await fetch(url, requestOptions);
         } catch (error: any) {
             console.error(`API request failed for tool '${toolName}':`, error);
              // Use McpError constructor
             throw new McpError(
                 ErrorCode.InternalError, // Or a more specific code if possible
                 `API request failed: ${error.message}`
             );
         }

        console.error(`API Response Status: ${response.status} ${response.statusText}`);

        // --- Response Processing ---
        let responseBodyText: string;
        try {
            responseBodyText = await response.text(); // Get raw text first
        } catch (error: any) {
             console.error(`Failed to read API response body for tool '${toolName}':`, error);
             // Still return status info if body read fails
             return {
                 content: [{ type: 'text', text: `API call successful (${response.status} ${response.statusText}) but failed to read response body: ${error.message}` }],
                 isError: !response.ok, // Indicate error based on status code
             };
        }

        // Try to parse as JSON if content-type suggests it
        const contentType = response.headers.get('content-type');
        let formattedOutput = responseBodyText;
        if (contentType && contentType.includes('application/json') && responseBodyText) {
            try {
                const jsonResponse = JSON.parse(responseBodyText);
                formattedOutput = JSON.stringify(jsonResponse, null, 2); // Pretty print JSON
            } catch (e) {
                console.warn(`Failed to parse JSON response body for tool '${toolName}', returning raw text.`);
                // Keep formattedOutput as raw text
            }
        }

        const resultText = `Status: ${response.status} ${response.statusText}\nHeaders:\n${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}\n\nBody:\n${formattedOutput}`;

        const responseContent: TextContent = {
            type: 'text',
            text: resultText,
        };

        return {
            content: [responseContent],
            isError: !response.ok, // Set isError based on HTTP status code
        };
    };
}
