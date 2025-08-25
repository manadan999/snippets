#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Recursively finds all TypeScript files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} fileList - Array to store found files
 * @returns {string[]} Array of TypeScript file paths
 */
function findTsFiles(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        findTsFiles(filePath, fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
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
 * Extracts stream/subscribe/setAlert patterns from file content
 * Pattern: .stream($a,...).subscribe(...setAlert(..., ..., $b, ..., $c))
 * @param {string} content - File content to search
 * @returns {Array} Array of found pattern matches with $a, $b, $c
 */
function extractStreamPatterns(content) {
  // Remove comments and clean content for better matching
  const cleanContent = content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, ''); // Remove line comments

  // More precise regex based on the actual code pattern
  // Matches: .stream('$a', ...).subscribe(...setAlert(..., ..., '$b', ..., $c))
  const streamRegex = /\.stream\s*\(\s*['"`]([^'"`]+)['"`][^)]*\)[\s\S]*?\.subscribe\s*\([^{]*\{[\s\S]*?\.setAlert\s*\(\s*[^,]+\s*,\s*[^,]+\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*[^,]+\s*,\s*([^,\)]+)\s*\)/g;

  const patterns = [];
  let match;

  while ((match = streamRegex.exec(cleanContent)) !== null) {
    patterns.push({
      a: match[1].trim(), // First parameter of .stream()
      b: match[2].trim(), // Third parameter of .setAlert() (typically 'page-alert')
      c: match[3].trim(), // Fifth parameter of .setAlert() (typically AlertType.ERROR)
      fullMatch: match[0],
      // Also extract line number for reference
      lineNumber: (cleanContent.substring(0, match.index).match(/\n/g) || []).length + 1
    });
  }

  return patterns;
}

/**
 * Main function to process all files and extract stream patterns
 * @param {string} projectsPath - Path to the projects folder
 */
function extractAllStreamPatterns(projectsPath) {
  console.log(`Searching for stream/subscribe/setAlert patterns in: ${projectsPath}`);
  console.log('='.repeat(70));

  // Check if the projects directory exists
  if (!fs.existsSync(projectsPath)) {
    console.error(`Error: Directory '${projectsPath}' does not exist.`);
    process.exit(1);
  }

  // Find all TypeScript files
  const tsFiles = findTsFiles(projectsPath);
  console.log(`Found ${tsFiles.length} TypeScript files\n`);

  if (tsFiles.length === 0) {
    console.log('No TypeScript files found in the specified directory.');
    return;
  }

  const allPatterns = [];
  const fileResults = [];

  // Process each file
  tsFiles.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const patterns = extractStreamPatterns(content);

      if (patterns.length > 0) {
        fileResults.push({
          file: filePath,
          patterns: patterns
        });

        // Add to the array of all patterns with additional metadata
        patterns.forEach(pattern => {
          allPatterns.push({
            translationKey: pattern.a,
            alertContainer: pattern.b,
            alertType: pattern.c,
            filePath: filePath.replace(path.resolve(projectsPath), ''), // Relative path
            lineNumber: pattern.lineNumber,
            fullPattern: pattern.fullMatch.replace(/\s+/g, ' ').trim()
          });
        });
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
    }
  });

  // Display results
  if (fileResults.length === 0) {
    console.log('No stream/subscribe/setAlert patterns found in any TypeScript files.');
    return;
  }

  console.log('RESULTS BY FILE:');
  console.log('-'.repeat(70));
  fileResults.forEach(result => {
    console.log(`\n📁 ${result.file}`);
    result.patterns.forEach((pattern, index) => {
      console.log(`   Pattern ${index + 1} (Line ${pattern.lineNumber}):`);
      console.log(`   📍 Translation Key: ${pattern.a}`);
      console.log(`   📍 Alert Container: ${pattern.b}`);
      console.log(`   📍 Alert Type: ${pattern.c}`);
      console.log('   ' + '-'.repeat(50));
    });
  });

  // Create summary object for JSON export
  const jsonOutput = {
    metadata: {
      extractedAt: new Date().toISOString(),
      searchPath: projectsPath,
      totalFiles: tsFiles.length,
      filesWithPatterns: fileResults.length,
      totalPatterns: allPatterns.length,
      uniqueTranslationKeys: [...new Set(allPatterns.map(p => p.translationKey))].length,
      uniqueAlertContainers: [...new Set(allPatterns.map(p => p.alertContainer))].length,
      uniqueAlertTypes: [...new Set(allPatterns.map(p => p.alertType))].length
    },
    patterns: allPatterns,
    summary: {
      translationKeys: [...new Set(allPatterns.map(p => p.translationKey))].sort(),
      alertContainers: [...new Set(allPatterns.map(p => p.alertContainer))].sort(),
      alertTypes: [...new Set(allPatterns.map(p => p.alertType))].sort()
    }
  };

  // Save to JSON file with timestamp
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
  const outputFileName = `stream-patterns-${dateStr}-${timeStr.substring(0, 4)}.json`; // YYYY-MM-DD-HHMM
  try {
    fs.writeFileSync(outputFileName, JSON.stringify(jsonOutput, null, 2), 'utf8');
    console.log(`\n✅ Results saved to: ${outputFileName}`);
  } catch (error) {
    console.error(`❌ Error saving JSON file: ${error.message}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY:');
  console.log('='.repeat(70));
  console.log(`📊 Total patterns found: ${allPatterns.length}`);
  console.log(`📁 Files with patterns: ${fileResults.length}/${tsFiles.length}`);
  console.log(`🔑 Unique translation keys: ${jsonOutput.metadata.uniqueTranslationKeys}`);
  console.log(`📦 Unique alert containers: ${jsonOutput.metadata.uniqueAlertContainers}`);
  console.log(`⚠️  Unique alert types: ${jsonOutput.metadata.uniqueAlertTypes}`);

  console.log('\nTop Translation Keys:');
  const keyCount = {};
  allPatterns.forEach(p => {
    keyCount[p.translationKey] = (keyCount[p.translationKey] || 0) + 1;
  });
  Object.entries(keyCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([key, count]) => {
      console.log(`  ${count}x ${key}`);
    });
}

// Get the projects path from command line argument or use default
const projectsPath = process.argv[2] || '../gca_mobile_ui/projects/mobGCA/src';

// Run the extraction
extractAllStreamPatterns(path.resolve(projectsPath));