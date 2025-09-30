#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base URL for Sleeper API
const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

// Helper function to make API requests
async function fetchFromAPI(url) {
  try {
    console.log(`Fetching: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✓ Successfully fetched data from ${url}`);
    return data;
  } catch (error) {
    console.error(`✗ Error fetching ${url}:`, error.message);
    throw error;
  }
}

// Helper function to write JSON file
function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`✓ Written to ${filePath}`);
  } catch (error) {
    console.error(`✗ Error writing to ${filePath}:`, error.message);
    throw error;
  }
}

// Helper function to read league.json and extract league_id
function getLeagueInfo(year) {
  const leaguePath = path.join(__dirname, '..', 'src', 'data', year.toString(), 'league.json');
  
  if (!fs.existsSync(leaguePath)) {
    throw new Error(`League file not found for year ${year}: ${leaguePath}`);
  }
  
  const leagueData = JSON.parse(fs.readFileSync(leaguePath, 'utf8'));
  return {
    league_id: leagueData.league_id
  };
}

// Get the most recent valid matchup week for a league
async function getMostRecentValidWeek(leagueId) {
  try {
    // Try to get current week from league info
    const leagueUrl = `${SLEEPER_BASE_URL}/league/${leagueId}`;
    const leagueData = await fetchFromAPI(leagueUrl);
    
    // The league data should have information about the current week
    const currentWeek = leagueData.settings?.leg || 1;
    
    // For safety, we'll fetch the most recent week that has data
    // We'll try weeks in reverse order until we find one with data
    for (let week = currentWeek; week >= 1; week--) {
      try {
        const testUrl = `${SLEEPER_BASE_URL}/league/${leagueId}/matchups/${week}`;
        const response = await fetch(testUrl);
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            console.log(`Found most recent valid week: ${week}`);
            return week;
          }
        }
      } catch (error) {
        // Continue to next week
        continue;
      }
    }
    
    // Fallback to week 1 if nothing found
    console.log('No valid weeks found, defaulting to week 1');
    return 1;
  } catch (error) {
    console.error('Error determining most recent valid week:', error.message);
    return 1;
  }
}

// Fetch matchup data for a specific week
async function fetchMatchupData(leagueId, year, week) {
  const matchupUrl = `${SLEEPER_BASE_URL}/league/${leagueId}/matchups/${week}`;
  const matchupData = await fetchFromAPI(matchupUrl);
  
  const matchupDir = path.join(__dirname, '..', 'src', 'data', year.toString(), 'matchups');
  writeJsonFile(path.join(matchupDir, `${week}.json`), matchupData);
  
  return matchupData;
}

// Get the most recent year from the data directory
function getMostRecentYear() {
  const dataDir = path.join(__dirname, '..', 'src', 'data');
  const yearDirs = fs.readdirSync(dataDir)
    .filter(dir => fs.statSync(path.join(dataDir, dir)).isDirectory())
    .filter(dir => /^\d{4}$/.test(dir))
    .map(dir => parseInt(dir))
    .sort((a, b) => b - a);
  
  if (yearDirs.length === 0) {
    throw new Error('No year directories found in src/data');
  }
  
  return yearDirs[0]; // Most recent year
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    year: null,
    week: null,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--year':
      case '-y':
        const year = parseInt(args[++i]);
        if (isNaN(year)) {
          throw new Error('Invalid year provided');
        }
        options.year = year;
        break;
        
      case '--week':
      case '-w':
        const week = parseInt(args[++i]);
        if (isNaN(week)) {
          throw new Error('Invalid week provided');
        }
        options.week = week;
        break;
        
      case '--help':
      case '-h':
        options.help = true;
        break;
        
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
    }
  }
  
  return options;
}

// Display help information
function showHelp() {
  console.log(`
🏈 Sleeper Matchup Fetcher

Usage: node fetch-matchup.js [options]

Options:
  -y, --year <year>        Specify year (defaults to most recent year)
  -w, --week <week>        Specify week (defaults to most recent valid week)
  -h, --help               Show this help message

Examples:
  # Fetch most recent valid matchup for current season
  node fetch-matchup.js

  # Fetch specific week for current season
  node fetch-matchup.js --week 5

  # Fetch specific week for specific year
  node fetch-matchup.js --year 2024 --week 10

  # Fetch most recent valid matchup for specific year
  node fetch-matchup.js --year 2024
`);
}

// Main execution
async function main() {
  try {
    const options = parseArgs();
    
    if (options.help) {
      showHelp();
      return;
    }
    
    // Determine year to fetch
    const year = options.year || getMostRecentYear();
    console.log(`Using year: ${year}`);
    
    // Get league info
    const { league_id } = getLeagueInfo(year);
    console.log(`League ID: ${league_id}`);
    
    // Determine week to fetch
    let week;
    if (options.week) {
      week = options.week;
      console.log(`Using specified week: ${week}`);
    } else {
      week = await getMostRecentValidWeek(league_id);
      console.log(`Using most recent valid week: ${week}`);
    }
    
    console.log(`\n🏈 Fetching matchup data for ${year}, week ${week}...`);
    
    // Fetch the matchup data
    await fetchMatchupData(league_id, year, week);
    
    console.log(`\n✅ Successfully fetched matchup data for ${year}, week ${week}!`);
    
  } catch (error) {
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();



