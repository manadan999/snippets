#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration - Update these paths
const PROJECT_PATH = '../gca_mobile_ui/projects/mobGCA/src';
const TRANSLATION_FILE_PATH = '../gca_mobile_ui/projects/mobGCA/src/assets/i18n/en_US.json';

// Helper function to find all TypeScript files
function findTsFiles(dir, fileList) {
  if (!fileList) {
    fileList = [];
  }

  try {
    const files = fs.readdirSync(dir);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        findTsFiles(filePath, fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        fileList.push(filePath);
      }
    }
  } catch (error) {
    console.error('Error reading directory ' + dir + ': ' + error.message);
  }

  return fileList;
}

// Helper function to flatten nested translation JSON
function flattenTranslationKeys(obj, prefix, result) {
  if (!prefix) {
    prefix = '';
  }
  if (!result) {
    result = {};
  }

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? prefix + '.' + key : key;

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        flattenTranslationKeys(obj[key], newKey, result);
      } else {
        result[newKey] = obj[key];
      }
    }
  }
  return result;
}

// Helper function to load translation file
function loadTranslationFile(translationFilePath) {
  try {
    if (!fs.existsSync(translationFilePath)) {
      console.error('Translation file not found: ' + translationFilePath);
      return {};
    }

    console.log('Reading translation file: ' + translationFilePath);
    const content = fs.readFileSync(translationFilePath, 'utf8');
    const jsonData = JSON.parse(content);

    const flattened = flattenTranslationKeys(jsonData);
    console.log('Found ' + Object.keys(flattened).length + ' translation keys');

    return flattened;
  } catch (error) {
    console.error('Error reading translation file: ' + error.message);
    return {};
  }
}

// Main extraction function - completely rewritten for simplicity
function extractStreamPatterns(content) {
  const patterns = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Step 1: Find lines with .stream
    if (line.indexOf('.stream(') !== -1) {
      console.log('Found .stream on line ' + lineNumber);

      // Step 2: Extract translation key
      const streamIndex = line.indexOf('.stream(');
      const afterStream = line.substring(streamIndex);

      // Find the quote after .stream(
      let translationKey = null;
      let quoteStart = afterStream.indexOf("'");
      let quoteEnd = -1;
      let quoteChar = "'";

      if (quoteStart === -1) {
        quoteStart = afterStream.indexOf('"');
        quoteChar = '"';
      }

      if (quoteStart !== -1) {
        quoteEnd = afterStream.indexOf(quoteChar, quoteStart + 1);
        if (quoteEnd !== -1) {
          translationKey = afterStream.substring(quoteStart + 1, quoteEnd);
        }
      }

      if (translationKey) {
        console.log('  Translation key: ' + translationKey);

        // Step 3: Look for setAlert in following lines
        for (let j = i; j < Math.min(i + 20, lines.length); j++) {
          const searchLine = lines[j];

          if (searchLine.indexOf('.setAlert(') !== -1) {
            console.log('  Found .setAlert on line ' + (j + 1));

            // Step 4: Extract setAlert parameters
            const setAlertIndex = searchLine.indexOf('.setAlert(');
            const afterSetAlert = searchLine.substring(setAlertIndex);

            // Find all commas to identify parameters
            const paramText = afterSetAlert.substring(afterSetAlert.indexOf('(') + 1);
            const parts = paramText.split(',');

            if (parts.length >= 5) {
              // Extract 3rd parameter (alert container)
              let alertContainer = null;
              if (parts[2]) {
                const param3 = parts[2].trim();
                const quote3Start = Math.max(param3.indexOf("'"), param3.indexOf('"'));
                if (quote3Start !== -1) {
                  const quote3Char = param3.charAt(quote3Start);
                  const quote3End = param3.indexOf(quote3Char, quote3Start + 1);
                  if (quote3End !== -1) {
                    alertContainer = param3.substring(quote3Start + 1, quote3End);
                  }
                }
              }

              // Extract 5th parameter (alert type)
              let alertType = null;
              if (parts[4]) {
                alertType = parts[4].trim();
                // Remove closing parenthesis and semicolon
                alertType = alertType.replace(/[);]/g, '');
                alertType = alertType.trim();
              }

              if (alertContainer && alertType) {
                console.log('  Alert container: ' + alertContainer);
                console.log('  Alert type: ' + alertType);

                patterns.push({
                  a: translationKey,
                  b: alertContainer,
                  c: alertType,
                  lineNumber: lineNumber,
                  fullMatch: 'stream(' + translationKey + ') -> setAlert(..., ' + alertContainer + ', ..., ' + alertType + ')'
                });

                break; // Found the setAlert, stop looking
              }
            }
          }
        }
      }
    }
  }

  return patterns;
}

// Helper function to escape CSV values
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  const cleanValue = stringValue.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  const escapedValue = cleanValue.replace(/"/g, '""');

  return '"' + escapedValue + '"';
}

// Main function
function extractAndMatchPatterns() {
  console.log('Starting extraction...');
  console.log('Project path: ' + PROJECT_PATH);
  console.log('Translation file: ' + TRANSLATION_FILE_PATH);

  // Check if project directory exists
  if (!fs.existsSync(PROJECT_PATH)) {
    console.error('Project directory does not exist: ' + PROJECT_PATH);
    process.exit(1);
  }

  // Load translations
  const translations = loadTranslationFile(TRANSLATION_FILE_PATH);

  // Find TypeScript files
  const tsFiles = findTsFiles(PROJECT_PATH);
  console.log('Found ' + tsFiles.length + ' TypeScript files');

  if (tsFiles.length === 0) {
    console.log('No TypeScript files found.');
    return;
  }

  const allPatterns = [];

  // Process each file
  for (let i = 0; i < tsFiles.length; i++) {
    const filePath = tsFiles[i];

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const patterns = extractStreamPatterns(content);

      for (let j = 0; j < patterns.length; j++) {
        const pattern = patterns[j];
        const translationValue = translations[pattern.a] || null;

        allPatterns.push({
          translationKey: pattern.a,
          translationValue: translationValue,
          alertContainer: pattern.b,
          alertType: pattern.c,
          filePath: filePath.replace(path.resolve(PROJECT_PATH), ''),
          lineNumber: pattern.lineNumber,
          fullPattern: pattern.fullMatch,
          hasTranslation: translationValue !== null
        });
      }
    } catch (error) {
      console.error('Error reading file ' + filePath + ': ' + error.message);
    }
  }

  // Display results
  console.log('\nResults:');
  console.log('Total patterns found: ' + allPatterns.length);

  const uniqueKeys = [];
  const keySet = {};

  for (let i = 0; i < allPatterns.length; i++) {
    const key = allPatterns[i].translationKey;
    if (!keySet[key]) {
      keySet[key] = true;
      uniqueKeys.push(key);
    }
  }

  let matchedKeys = 0;
  let missingKeys = 0;

  for (let i = 0; i < uniqueKeys.length; i++) {
    if (translations[uniqueKeys[i]]) {
      matchedKeys++;
    } else {
      missingKeys++;
    }
  }

  console.log('Unique translation keys: ' + uniqueKeys.length);
  console.log('Keys with translations: ' + matchedKeys);
  console.log('Missing translations: ' + missingKeys);

  // Create output object
  const output = {
    metadata: {
      extractedAt: new Date().toISOString(),
      projectPath: PROJECT_PATH,
      translationFile: TRANSLATION_FILE_PATH,
      totalPatterns: allPatterns.length,
      uniqueTranslationKeys: uniqueKeys.length,
      matchedTranslations: matchedKeys,
      missingTranslations: missingKeys
    },
    patterns: allPatterns
  };

  // Save JSON file
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
  const outputFileName = 'translation-analysis-' + dateStr + '-' + timeStr.substring(0, 4) + '.json';

  try {
    fs.writeFileSync(outputFileName, JSON.stringify(output, null, 2), 'utf8');
    console.log('JSON saved to: ' + outputFileName);
  } catch (error) {
    console.error('Error saving JSON: ' + error.message);
  }

  // Save CSV file
  const csvFileName = 'translation-analysis-' + dateStr + '-' + timeStr.substring(0, 4) + '.csv';

  try {
    let csv = 'Translation Key,English Value,Alert Container,Alert Type,File Path,Line Number,Has Translation,Full Pattern\n';

    for (let i = 0; i < allPatterns.length; i++) {
      const pattern = allPatterns[i];
      const value = pattern.translationValue || 'MISSING TRANSLATION';
      const hasTranslation = pattern.hasTranslation ? 'YES' : 'NO';

      csv += escapeCsvValue(pattern.translationKey) + ',';
      csv += escapeCsvValue(value) + ',';
      csv += escapeCsvValue(pattern.alertContainer) + ',';
      csv += escapeCsvValue(pattern.alertType) + ',';
      csv += escapeCsvValue(pattern.filePath) + ',';
      csv += pattern.lineNumber + ',';
      csv += escapeCsvValue(hasTranslation) + ',';
      csv += escapeCsvValue(pattern.fullPattern) + '\n';
    }

    fs.writeFileSync(csvFileName, csv, 'utf8');
    console.log('CSV saved to: ' + csvFileName);
  } catch (error) {
    console.error('Error saving CSV: ' + error.message);
  }

  console.log('Analysis complete!');
}

// Run the analysis
extractAndMatchPatterns();