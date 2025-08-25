#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

/**
 * Recursively finds all TypeScript files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} fileList - Array to store found files
 * @returns {string[]} Array of TypeScript file paths
 */
function findTsFiles(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        findTsFiles(filePath, fileList);
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        // Add TypeScript files to the list
        fileList.push(filePath);
      }
    });
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }

  return fileList;
}

/**
 * Extracts banner IDs from file content
 * @param {string} content - File content to search
 * @returns {string[]} Array of found banner IDs
 */
function extractBannerIds(content) {
  // Regex to match .banner('id') or .banner("id")
  // Handles both single and double quotes, and captures the ID
  const bannerRegex = /\.banner\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const ids = [];
  let match;

  while ((match = bannerRegex.exec(content)) !== null) {
    ids.push(match[1]); // match[1] is the captured group (the ID)
  }

  return ids;
}

/**
 * Main function to process all files and extract banner IDs
 * @param {string} projectsPath - Path to the projects folder
 */
function extractAllBannerIds(projectsPath) {
  console.log(`Searching for banner IDs in: ${projectsPath}`);
  console.log("=".repeat(50));

  // Check if the projects directory exists
  if (!fs.existsSync(projectsPath)) {
    console.error(`Error: Directory '${projectsPath}' does not exist.`);
    process.exit(1);
  }

  // Find all TypeScript files
  const tsFiles = findTsFiles(projectsPath);
  console.log(`Found ${tsFiles.length} TypeScript files\n`);

  if (tsFiles.length === 0) {
    console.log("No TypeScript files found in the specified directory.");
    return;
  }

  const allBannerIds = new Set(); // Use Set to avoid duplicates
  const fileResults = [];

  // Process each file
  tsFiles.forEach((filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const bannerIds = extractBannerIds(content);

      if (bannerIds.length > 0) {
        fileResults.push({
          file: filePath,
          ids: bannerIds,
        });

        // Add to the set of all unique IDs
        bannerIds.forEach((id) => allBannerIds.add(id));
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
    }
  });

  // Display results
  if (fileResults.length === 0) {
    console.log("No banner IDs found in any TypeScript files.");
    return;
  }

  console.log("RESULTS BY FILE:");
  console.log("-".repeat(50));
  fileResults.forEach((result) => {
    console.log(`\n📁 ${result.file}`);
    result.ids.forEach((id) => {
      console.log(`   🏷️  .banner('${id}')`);
    });
  });

  console.log("\n" + "=".repeat(50));
  console.log("ALL UNIQUE BANNER IDs:");
  console.log("=".repeat(50));
  const sortedIds = Array.from(allBannerIds).sort();
  sortedIds.forEach((id, index) => {
    console.log(`${(index + 1).toString().padStart(3)}: ${id}`);
  });

  console.log(
    `\n📊 Summary: Found ${allBannerIds.size} unique banner IDs across ${fileResults.length} files`
  );
}

// Get the projects path from command line argument or use default
const projectsPath = process.argv[2] || "./projects";

// Run the extraction
extractAllBannerIds(path.resolve(projectsPath));
