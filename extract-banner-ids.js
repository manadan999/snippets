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

        // Add to the array of all patterns
        allPatterns.push(...patterns.map(p => ({ ...p, file: filePath })));
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
      console.log(`   📍 $a: ${pattern.a}`);
      console.log(`   📍 $b: ${pattern.b}`);
      console.log(`   📍 $c: ${pattern.c}`);
      console.log(`   🔍 Context: ${pattern.fullMatch.substring(0, 150).replace(/\s+/g, ' ')}...`);
      console.log('   ' + '-'.repeat(50));
    });
  });

  console.log('\n' + '='.repeat(70));
  console.log('ALL EXTRACTED PATTERNS SUMMARY:');
  console.log('='.repeat(70));

  // Group by unique combinations
  const uniquePatterns = new Map();
  allPatterns.forEach((pattern, index) => {
    const key = `${pattern.a}|${pattern.b}|${pattern.c}`;
    if (!uniquePatterns.has(key)) {
      uniquePatterns.set(key, {
        ...pattern,
        count: 1,
        files: [pattern.file]
      });
    } else {
      const existing = uniquePatterns.get(key);
      existing.count++;
      if (!existing.files.includes(pattern.file)) {
        existing.files.push(pattern.file);
      }
    }
  });

  let patternIndex = 1;
  uniquePatterns.forEach((pattern, key) => {
    console.log(`\n${patternIndex.toString().padStart(3)}: `);
    console.log(`     $a: ${pattern.a}`);
    console.log(`     $b: ${pattern.b}`);
    console.log(`     $c: ${pattern.c}`);
    console.log(`     Found in: ${pattern.files.length} file(s) (${pattern.count} occurrence(s))`);
    patternIndex++;
  });

  console.log(`\n📊 Summary: Found ${allPatterns.length} total patterns (${uniquePatterns.size} unique combinations) across ${fileResults.length} files`);
}

// Get the projects path from command line argument or use default
const projectsPath = process.argv[2] || '../gca_mobile_ui/projects/mobGCA/src';

// Run the extraction
extractAllStreamPatterns(path.resolve(projectsPath));