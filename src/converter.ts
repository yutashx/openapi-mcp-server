// Import OpenAPIV3 as a value, not just a type
import { OpenAPIV3 } from 'openapi-types';
// Import the correct Tool type from the SDK
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema'; // For inputSchema

// Helper function to convert OpenAPI schema object to JSON Schema 7
// This is a simplified version and might need expansion for complex cases
function openApiSchemaToJsonSchema(
    oaSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined
): JSONSchema7Definition | undefined {
    if (!oaSchema) {
        return undefined;
    }

    // Handle Reference Objects (assuming they are dereferenced by the parser)
    if ('$ref' in oaSchema) {
        console.warn(`Encountered a $ref in schema conversion: ${oaSchema.$ref}. Assuming pre-dereferenced.`);
        // If parser didn't dereference, this would need resolution logic
        return {}; // Or attempt to resolve if parser allows non-dereferenced
    }

    // Basic type mapping
    const jsSchema: JSONSchema7 = {};
    if (oaSchema.type) {
        // Map OpenAPI types to JSON Schema types (adjust as needed)
        switch (oaSchema.type) {
            case 'integer':
                jsSchema.type = 'integer';
                break;
            case 'number':
                jsSchema.type = 'number';
                break;
            case 'string':
                jsSchema.type = 'string';
                if (oaSchema.format === 'byte' || oaSchema.format === 'binary') {
                    jsSchema.contentEncoding = oaSchema.format === 'byte' ? 'base64' : undefined; // Indicate binary content
                    jsSchema.description = `${oaSchema.description || ''} (Note: Binary content expected as base64 string)`.trim();
                }
                if (oaSchema.enum) {
                    jsSchema.enum = oaSchema.enum;
                }
                break;
            case 'boolean':
                jsSchema.type = 'boolean';
                break;
            case 'array':
                jsSchema.type = 'array';
                if (oaSchema.items) {
                    const itemsSchema = openApiSchemaToJsonSchema(oaSchema.items);
                    // Only assign if the conversion was successful
                    if (itemsSchema !== undefined) {
                        jsSchema.items = itemsSchema;
                    } else {
                         console.warn("Failed to convert items schema for array type.");
                         // Optionally define items as empty schema or allow any type
                         // jsSchema.items = {};
                    }
                }
                break;
            case 'object':
                jsSchema.type = 'object';
                if (oaSchema.properties) {
                    jsSchema.properties = {};
                    for (const propName in oaSchema.properties) {
                        const propSchema = openApiSchemaToJsonSchema(oaSchema.properties[propName]);
                        // Only assign if the conversion was successful
                        if (propSchema !== undefined) {
                            jsSchema.properties[propName] = propSchema;
                        } else {
                            console.warn(`Failed to convert property schema for '${propName}' in object.`);
                            // Optionally define as empty schema or allow any type
                            // jsSchema.properties[propName] = {};
                        }
                    }
                }
                if (oaSchema.required) {
                    jsSchema.required = oaSchema.required;
                }
                // Handle additionalProperties if needed
                break;
            default:
                console.warn(`Unsupported OpenAPI schema type: ${oaSchema.type}`);
                // Fallback to allowing any type?
                // jsSchema.type = ['string', 'number', 'boolean', 'object', 'array', 'null'];
                break;
        }
    } else {
        // If no type is specified, it could be anything according to JSON Schema
        // console.warn("Schema object has no type, allowing any type.");
    }


    if (oaSchema.description) {
        jsSchema.description = jsSchema.description || oaSchema.description; // Keep existing description if added for binary
    }
    if (oaSchema.default) {
        jsSchema.default = oaSchema.default;
    }
    // Add other mappings: format, minimum, maximum, etc. as needed

    return jsSchema;
}


// Helper to generate a unique and descriptive tool name
function generateToolName(method: string, path: string, operationId?: string): string {
    if (operationId) {
        // Sanitize operationId: replace non-alphanumeric with underscores
        return operationId.replace(/[^a-zA-Z0-9_]/g, '_');
    }
    // Fallback: Generate name from method and path
    const pathParts = path.replace(/[^a-zA-Z0-9_]/g, '_').split('_').filter(p => p);
    return `${method.toLowerCase()}_${pathParts.join('_')}`;
}

/**
 * Converts an OpenAPI V3 specification into an array of MCP Tool Definitions.
 *
 * @param apiSpec The parsed and validated OpenAPI V3 Document.
 * @returns An array of Tool objects.
 */
export function convertOpenAPIToMcTools(apiSpec: OpenAPIV3.Document): Tool[] { // Return Tool[]
    const tools: Tool[] = []; // Use Tool[]

    if (!apiSpec.paths) {
        console.warn('OpenAPI spec has no paths defined.');
        return tools;
    }

    for (const path in apiSpec.paths) {
        const pathItem = apiSpec.paths[path];
        if (!pathItem) continue;

        // Iterate over HTTP methods (get, post, put, etc.)
        for (const method in pathItem) {
            // Check if it's a valid HTTP method defined in OpenAPIV3.HttpMethods
            if (!Object.values(OpenAPIV3.HttpMethods).includes(method as OpenAPIV3.HttpMethods)) {
                continue;
            }

            const operation = pathItem[method as keyof typeof pathItem] as OpenAPIV3.OperationObject;
            if (!operation) continue;

            const toolName = generateToolName(method, path, operation.operationId);
            const description = operation.summary || operation.description || `Perform ${method.toUpperCase()} on ${path}`;

            const inputSchema: JSONSchema7 = {
                type: 'object',
                properties: {},
                required: [],
            };

            // Process parameters (path, query, header, cookie)
            if (operation.parameters) {
                for (const param of operation.parameters) {
                    if ('$ref' in param) {
                        console.warn(`Encountered $ref in parameters: ${param.$ref}. Assuming pre-dereferenced.`);
                        continue; // Skip if not dereferenced
                    }

                    const paramSchema = openApiSchemaToJsonSchema(param.schema);
                    if (paramSchema) {
                        // Add description from parameter level if schema level doesn't have one
                        if (param.description && !(paramSchema as JSONSchema7).description) {
                            (paramSchema as JSONSchema7).description = param.description;
                        }
                        // Add parameter location info to description
                        (paramSchema as JSONSchema7).description = `${(paramSchema as JSONSchema7).description || ''} (in: ${param.in})`.trim();

                        inputSchema.properties![param.name] = paramSchema;
                        if (param.required) {
                            inputSchema.required!.push(param.name);
                        }
                    }
                }
            }

            // Process requestBody
            if (operation.requestBody) {
                if ('$ref' in operation.requestBody) {
                    console.warn(`Encountered $ref in requestBody: ${operation.requestBody.$ref}. Assuming pre-dereferenced.`);
                } else {
                    // Prioritize application/json content type
                    const jsonContent = operation.requestBody.content?.['application/json'];
                    if (jsonContent?.schema) {
                        const requestBodySchema = openApiSchemaToJsonSchema(jsonContent.schema);
                        if (requestBodySchema) {
                            // Add a top-level property for the request body
                            const bodyPropName = 'requestBody'; // Or choose a more specific name?
                            inputSchema.properties![bodyPropName] = requestBodySchema;
                            if (operation.requestBody.required) {
                                inputSchema.required!.push(bodyPropName);
                            }
                             // Add description if missing
                            if (!(requestBodySchema as JSONSchema7).description) {
                                (requestBodySchema as JSONSchema7).description = operation.requestBody.description || 'The request body (JSON)';
                            }
                        }
                    } else {
                        // Handle other content types if necessary (e.g., form-data, xml)
                        console.warn(`Unsupported requestBody content type for ${toolName}. Only application/json is currently handled.`);
                        // Could potentially add a generic 'requestBodyContent' string property?
                    }
                }
            }

            // Clean up empty required array
            if (inputSchema.required?.length === 0) {
                delete inputSchema.required;
            }

            // Ensure the final inputSchema conforms to the SDK's expected structure.
            // The base 'inputSchema' is already { type: 'object', ... },
            // so this cast reassures TypeScript.
            tools.push({
                name: toolName,
                description: description,
                inputSchema: inputSchema as Tool['inputSchema'], // Cast to the expected type
                // outputSchema is not explicitly defined in MCP Tool,
                // but the description should guide the AI on expected output.
                // We could potentially add expected output structure to the description.
            });
        }
    }

    return tools;
}
