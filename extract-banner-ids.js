#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ================================
// CONFIGURATION - UPDATE THESE PATHS
// ================================
const PROJECT_PATH = '../gca_mobile_ui/projects/mobGCA/src';
const TRANSLATION_FILE_PATH = '../gca_mobile_ui/projects/mobGCA/src/assets/i18n/en_US.json';

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
 * Pattern: this.translateService.stream($a,...).subscribe(...this.alertService.setAlert(..., ..., $b, ..., $c))
 * @param {string} content - File content to search
 * @returns {Array} Array of found pattern matches with $a, $b, $c
 */
function extractStreamPatterns(content) {
  // Remove comments and clean content for better matching
  const cleanContent = content
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, ''); // Remove line comments

  const patterns = [];

  // Split into multiple regex patterns to handle different code styles
  const regexPatterns = [
    // Pattern 1: Multi-line with braces
    /(?:this\.)?translateService\s*\.stream\s*\(\s*['"`]([^'"`]+)['"`][^)]*\)[\s\S]*?\.subscribe\s*\(\s*[^{]*\{[\s\S]*?(?:this\.)?alertService\s*\.setAlert\s*\(\s*[^,]+\s*,\s*[^,]+\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*[^,]+\s*,\s*([^,\);\s]+)/g,

    // Pattern 2: Single line with arrow function
    /(?:this\.)?translateService\s*\.stream\s*\(\s*['"`]([^'"`]+)['"`][^)]*\)[\s\S]*?\.subscribe\s*\(\s*[^=]*=>\s*[^{]*(?:this\.)?alertService\s*\.setAlert\s*\(\s*[^,]+\s*,\s*[^,]+\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*[^,]+\s*,\s*([^,\);\s]+)/g,

    // Pattern 3: Inline arrow function
    /(?:this\.)?translateService\s*\.stream\s*\(\s*['"`]([^'"`]+)['"`][^)]*\)[\s\S]*?\.subscribe\s*\(\s*[^=]*=>\s*\{?[\s\S]*?(?:this\.)?alertService\s*\.setAlert\s*\(\s*[^,]+\s*,\s*[^,]+\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*[^,]+\s*,\s*([^,\);\s]+)/g
  ];

  regexPatterns.forEach((regex, patternIndex) => {
    let match;
    while ((match = regex.exec(cleanContent)) !== null) {
      const newPattern = {
        a: match[1].trim(), // Translation key from .stream()
        b: match[2].trim(), // Alert container from .setAlert() (3rd param)
        c: match[3].trim(), // Alert type from .setAlert() (5th param)
        fullMatch: match[0],
        patternType: patternIndex + 1,
        // Extract line number for reference
        lineNumber: (cleanContent.substring(0, match.index).match(/\n/g) || []).length + 1
      };

      // Check for duplicates (same line number and translation key)
      const isDuplicate = patterns.some(p =>
        p.lineNumber === newPattern.lineNumber && p.a === newPattern.a
      );

      if (!isDuplicate) {
        patterns.push(newPattern);
      }
    }
  });

  // Sort by line number
  patterns.sort((a, b) => a.lineNumber - b.lineNumber);

  return patterns;
}

/**
 * Recursively flattens nested JSON object into dot-notation keys
 * @param {Object} obj - The JSON object to flatten
 * @param {string} prefix - Current key prefix
 * @param {Object} result - Accumulator for flattened keys
 * @returns {Object} Flattened object with dot-notation keys
 */
function flattenTranslationKeys(obj, prefix = '', result = {}) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        // Recursively flatten nested objects
        flattenTranslationKeys(obj[key], newKey, result);
      } else {
        // Add leaf values to result
        result[newKey] = obj[key];
      }
    }
  }
  return result;
}

/**
 * Reads and processes the translation JSON file
 * @param {string} translationFilePath - Path to the translation JSON file
 * @returns {Object} Flattened translation keys
 */
function loadTranslationFile(translationFilePath) {
  try {
    if (!fs.existsSync(translationFilePath)) {
      console.error(`❌ Translation file not found: ${translationFilePath}`);
      return {};
    }

    console.log(`📖 Reading translation file: ${translationFilePath}`);
    const content = fs.readFileSync(translationFilePath, 'utf8');
    const jsonData = JSON.parse(content);

    // Flatten the nested structure
    const flattened = flattenTranslationKeys(jsonData);
    console.log(`✅ Found ${Object.keys(flattened).length} translation keys`);

    return flattened;
  } catch (error) {
    console.error(`❌ Error reading translation file: ${error.message}`);
    return {};
  }
}

/**
 * Main function to extract patterns and match with translations
 */
function extractAndMatchPatterns() {
  console.log('🔍 Complete Translation Pattern Extractor & Matcher');
  console.log('='.repeat(70));
  console.log(`📁 Project Path: ${PROJECT_PATH}`);
  console.log(`📖 Translation File: ${TRANSLATION_FILE_PATH}`);
  console.log('='.repeat(70));

  // Check if the projects directory exists
  if (!fs.existsSync(PROJECT_PATH)) {
    console.error(`❌ Project directory does not exist: ${PROJECT_PATH}`);
    process.exit(1);
  }

  // Load translation keys
  const translations = loadTranslationFile(TRANSLATION_FILE_PATH);

  // Find all TypeScript files
  const tsFiles = findTsFiles(PROJECT_PATH);
  console.log(`📄 Found ${tsFiles.length} TypeScript files\n`);

  if (tsFiles.length === 0) {
    console.log('❌ No TypeScript files found in the specified directory.');
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
          const translationValue = translations[pattern.a] || null;

          allPatterns.push({
            translationKey: pattern.a,
            translationValue: translationValue,
            alertContainer: pattern.b,
            alertType: pattern.c,
            filePath: filePath.replace(path.resolve(PROJECT_PATH), ''), // Relative path
            lineNumber: pattern.lineNumber,
            fullPattern: pattern.fullMatch.replace(/\s+/g, ' ').trim(),
            hasTranslation: translationValue !== null
          });
        });
      }
    } catch (error) {
      console.error(`❌ Error reading file ${filePath}:`, error.message);
    }
  });

  // Display results
  if (fileResults.length === 0) {
    console.log('❌ No stream/subscribe/setAlert patterns found in any TypeScript files.');
    return;
  }

  // Create comprehensive analysis
  const uniqueKeys = [...new Set(allPatterns.map(p => p.translationKey))];
  const matchedKeys = uniqueKeys.filter(key => translations[key] !== undefined);
  const missingKeys = uniqueKeys.filter(key => translations[key] === undefined);

  // Console output
  console.log('📊 EXTRACTION RESULTS:');
  console.log('-'.repeat(70));
  console.log(`🔤 Total patterns found: ${allPatterns.length}`);
  console.log(`🔑 Unique translation keys: ${uniqueKeys.length}`);
  console.log(`✅ Keys with translations: ${matchedKeys.length}`);
  console.log(`❌ Missing translations: ${missingKeys.length}`);
  console.log(`📁 Files with patterns: ${fileResults.length}/${tsFiles.length}`);

  if (missingKeys.length > 0) {
    console.log('\n❌ MISSING TRANSLATIONS:');
    console.log('-'.repeat(40));
    missingKeys.forEach(key => {
      const count = allPatterns.filter(p => p.translationKey === key).length;
      console.log(`🔑 ${key} (used ${count}x)`);
    });
  }

  console.log('\n✅ TOP MATCHED TRANSLATIONS:');
  console.log('-'.repeat(40));
  const keyUsage = {};
  allPatterns.forEach(p => {
    if (p.hasTranslation) {
      keyUsage[p.translationKey] = (keyUsage[p.translationKey] || 0) + 1;
    }
  });

  Object.entries(keyUsage)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([key, count]) => {
      console.log(`${count}x ${key}: "${translations[key]}"`);
    });

  // Create comprehensive output object
  const output = {
    metadata: {
      extractedAt: new Date().toISOString(),
      projectPath: PROJECT_PATH,
      translationFile: TRANSLATION_FILE_PATH,
      totalFiles: tsFiles.length,
      filesWithPatterns: fileResults.length,
      totalPatterns: allPatterns.length,
      uniqueTranslationKeys: uniqueKeys.length,
      matchedTranslations: matchedKeys.length,
      missingTranslations: missingKeys.length,
      uniqueAlertContainers: [...new Set(allPatterns.map(p => p.alertContainer))].length,
      uniqueAlertTypes: [...new Set(allPatterns.map(p => p.alertType))].length
    },
    patterns: allPatterns,
    summary: {
      matchedKeys: matchedKeys.map(key => ({
        key: key,
        value: translations[key],
        usageCount: allPatterns.filter(p => p.translationKey === key).length
      })),
      missingKeys: missingKeys.map(key => ({
        key: key,
        usageCount: allPatterns.filter(p => p.translationKey === key).length,
        usedInFiles: [...new Set(allPatterns.filter(p => p.translationKey === key).map(p => p.filePath))]
      })),
      alertContainers: [...new Set(allPatterns.map(p => p.alertContainer))].sort(),
      alertTypes: [...new Set(allPatterns.map(p => p.alertType))].sort()
    },
    fileResults: fileResults.map(result => ({
      file: result.file,
      patternCount: result.patterns.length,
      patterns: result.patterns.map(p => ({
        line: p.lineNumber,
        translationKey: p.a,
        translationValue: translations[p.a] || 'MISSING',
        alertContainer: p.b,
        alertType: p.c,
        hasTranslation: translations[p.a] !== undefined
      }))
    }))
  };

  // Save to JSON file with timestamp
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
  const outputFileName = `complete-translation-analysis-${dateStr}-${timeStr.substring(0, 4)}.json`; // YYYY-MM-DD-HHMM

  try {
    fs.writeFileSync(outputFileName, JSON.stringify(output, null, 2), 'utf8');
    console.log(`\n✅ Complete analysis saved to: ${outputFileName}`);
  } catch (error) {
    console.error(`❌ Error saving JSON file: ${error.message}`);
  }

  // Generate CSV for easy Excel import
  const csvFileName = `complete-translation-analysis-${dateStr}-${timeStr.substring(0, 4)}.csv`;
  try {
    let csv = 'Translation Key,English Value,Alert Container,Alert Type,File Path,Line Number,Status,Usage Count\n';

    allPatterns.forEach(pattern => {
      const usageCount = allPatterns.filter(p => p.translationKey === pattern.translationKey).length;
      const status = pattern.hasTranslation ? 'MATCHED' : 'MISSING';
      const value = pattern.translationValue || 'MISSING TRANSLATION';

      csv += `"${pattern.translationKey}","${value}","${pattern.alertContainer}","${pattern.alertType}","${pattern.filePath}",${pattern.lineNumber},"${status}",${usageCount}\n`;
    });

    fs.writeFileSync(csvFileName, csv, 'utf8');
    console.log(`✅ CSV report saved to: ${csvFileName}`);
  } catch (error) {
    console.error(`❌ Error saving CSV: ${error.message}`);
  }

  console.log(`\n🎉 Analysis complete! Check the generated files for detailed results.`);
}

// Display configuration and run
console.log('\n📋 CONFIGURATION:');
console.log(`Project Path: ${PROJECT_PATH}`);
console.log(`Translation File: ${TRANSLATION_FILE_PATH}`);
console.log('\nTo change these paths, edit the constants at the top of this script.\n');

// Run the complete analysis
extractAndMatchPatterns();