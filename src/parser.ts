import SwaggerParser from "@apidevtools/swagger-parser";
// Use type-only import and import OpenAPIV3 for more specific typing
import type { OpenAPI, OpenAPIV3 } from "openapi-types";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml"; // To handle YAML specs

/**
 * Parses the OpenAPI specification file (JSON or YAML).
 * Uses @apidevtools/swagger-parser for validation and dereferencing.
 *
 * @param filePath Absolute path to the OpenAPI specification file.
 * @returns A promise that resolves to the parsed and validated OpenAPI V3 document.
 * @throws Throws an error if the file cannot be read or parsed.
 */
export async function parseOpenAPISpec(
  filePath: string,
): Promise<OpenAPIV3.Document> { // Return specific V3 Document
  console.error(`Attempting to parse OpenAPI spec from: ${filePath}`);
  try {
    // Read the file content
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        let specObject: any;

        // Determine if it's JSON or YAML and parse accordingly
        const fileExtension = path.extname(filePath).toLowerCase();
        if (fileExtension === '.yaml' || fileExtension === '.yml') {
            specObject = yaml.load(fileContent);
        } else if (fileExtension === '.json') {
            specObject = JSON.parse(fileContent);
        } else {
            throw new Error(`Unsupported file extension: ${fileExtension}. Please use .json, .yaml, or .yml.`);
        }

        // Validate and dereference the spec using SwaggerParser
        // Dereferencing resolves $ref pointers, making it easier to work with
        const api = await SwaggerParser.validate(specObject, {
             dereference: {
                 circular: 'ignore' // or 'throw' depending on desired behavior
             }
        });

    console.error("OpenAPI spec parsed and validated successfully.");
    // SwaggerParser.validate returns Promise<OpenAPI.Document>, which is a union type.
    // Check if it's a V3 document before casting.
    if (!('openapi' in api && typeof api.openapi === 'string' && api.openapi.startsWith('3.'))) {
       // It might be V2 or invalid. Throw an error as we require V3.
       throw new Error(`Parsed specification is not a valid OpenAPI V3 document. Version found: ${('openapi' in api) ? api.openapi : 'N/A'}`);
    }

    // Now we know it's OpenAPIV3.Document, so the cast is safe.
    console.error("OpenAPI spec parsed and validated successfully as V3.");
    return api as OpenAPIV3.Document;
  } catch (error: any) {
    console.error(`Error parsing OpenAPI spec at ${filePath}:`, error.message || error);
        // Re-throw the error to be caught by the main function in index.ts
        throw new Error(`Failed to parse OpenAPI spec: ${error.message}`);
    }
}
