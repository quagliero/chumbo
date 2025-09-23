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

// Helper function to read league.json and extract IDs
function getLeagueInfo(year) {
  const leaguePath = path.join(__dirname, '..', 'src', 'data', year.toString(), 'league.json');
  
  if (!fs.existsSync(leaguePath)) {
    throw new Error(`League file not found for year ${year}: ${leaguePath}`);
  }
  
  const leagueData = JSON.parse(fs.readFileSync(leaguePath, 'utf8'));
  return {
    league_id: leagueData.league_id,
    draft_id: leagueData.draft_id
  };
}

// Fetch draft data
async function fetchDraftData(draftId, year) {
  const draftUrl = `${SLEEPER_BASE_URL}/draft/${draftId}`;
  const picksUrl = `${SLEEPER_BASE_URL}/draft/${draftId}/picks`;
  
  const [draft, picks] = await Promise.all([
    fetchFromAPI(draftUrl),
    fetchFromAPI(picksUrl)
  ]);
  
  const yearDir = path.join(__dirname, '..', 'src', 'data', year.toString());
  
  writeJsonFile(path.join(yearDir, 'draft.json'), draft);
  writeJsonFile(path.join(yearDir, 'picks.json'), picks);
  
  return { draft, picks };
}

// Fetch roster and user data
async function fetchRosterData(leagueId, year) {
  const rostersUrl = `${SLEEPER_BASE_URL}/league/${leagueId}/rosters`;
  const usersUrl = `${SLEEPER_BASE_URL}/league/${leagueId}/users`;
  
  const [rosters, users] = await Promise.all([
    fetchFromAPI(rostersUrl),
    fetchFromAPI(usersUrl)
  ]);
  
  const yearDir = path.join(__dirname, '..', 'src', 'data', year.toString());
  
  writeJsonFile(path.join(yearDir, 'rosters.json'), rosters);
  writeJsonFile(path.join(yearDir, 'users.json'), users);
  
  return { rosters, users };
}

// Fetch matchup data for a specific week
async function fetchMatchupData(leagueId, year, week) {
  const matchupUrl = `${SLEEPER_BASE_URL}/league/${leagueId}/matchups/${week}`;
  const matchupData = await fetchFromAPI(matchupUrl);
  
  const matchupDir = path.join(__dirname, '..', 'src', 'data', year.toString(), 'matchups');
  writeJsonFile(path.join(matchupDir, `${week}.json`), matchupData);
  
  return matchupData;
}

// Fetch playoff bracket data
async function fetchBracketData(leagueId, year) {
  const winnersUrl = `${SLEEPER_BASE_URL}/league/${leagueId}/winners_bracket`;
  const losersUrl = `${SLEEPER_BASE_URL}/league/${leagueId}/losers_bracket`;
  
  const [winners, losers] = await Promise.all([
    fetchFromAPI(winnersUrl),
    fetchFromAPI(losersUrl)
  ]);
  
  const yearDir = path.join(__dirname, '..', 'src', 'data', year.toString());
  
  writeJsonFile(path.join(yearDir, 'winners_bracket.json'), winners);
  writeJsonFile(path.join(yearDir, 'losers_bracket.json'), losers);
  
  return { winners, losers };
}

// Get the most recent completed week (default behavior)
async function getLatestCompletedWeek(leagueId) {
  try {
    // Try to get current week from league info
    const leagueUrl = `${SLEEPER_BASE_URL}/league/${leagueId}`;
    const leagueData = await fetchFromAPI(leagueUrl);
    
    // The league data should have information about the current week
    // We'll use the 'leg' field which represents the current week
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
            console.log(`Found latest completed week: ${week}`);
            return week;
          }
        }
      } catch (error) {
        // Continue to next week
        continue;
      }
    }
    
    // Fallback to week 1 if nothing found
    console.log('No completed weeks found, defaulting to week 1');
    return 1;
  } catch (error) {
    console.error('Error determining latest completed week:', error.message);
    return 1;
  }
}

// Main function to fetch all data for a year
async function fetchYearData(year, options = {}) {
  console.log(`\n🏈 Fetching data for year ${year}...`);
  
  try {
    const { league_id, draft_id } = getLeagueInfo(year);
    console.log(`League ID: ${league_id}, Draft ID: ${draft_id}`);
    
    // Fetch draft and roster data (these are year-specific)
    await Promise.all([
      fetchDraftData(draft_id, year),
      fetchRosterData(league_id, year)
    ]);
    
    // Handle matchup data
    if (options.weeks && options.weeks.length > 0) {
      // Fetch specific weeks
      console.log(`Fetching matchups for weeks: ${options.weeks.join(', ')}`);
      await Promise.all(
        options.weeks.map(week => fetchMatchupData(league_id, year, week))
      );
    } else if (options.latestWeek) {
      // Fetch latest completed week
      const latestWeek = await getLatestCompletedWeek(league_id);
      console.log(`Fetching latest completed week: ${latestWeek}`);
      await fetchMatchupData(league_id, year, latestWeek);
    } else {
      // Fetch all weeks (1-17 for regular season, 18+ for playoffs)
      console.log('Fetching all weeks...');
      const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
      await Promise.all(
        weeks.map(week => fetchMatchupData(league_id, year, week))
      );
    }
    
    // Fetch bracket data if requested or if it's end of season
    if (options.brackets || options.endOfSeason) {
      console.log('Fetching playoff bracket data...');
      await fetchBracketData(league_id, year);
    }
    
    console.log(`✅ Successfully fetched all data for year ${year}`);
    
  } catch (error) {
    console.error(`❌ Error fetching data for year ${year}:`, error.message);
    throw error;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    years: [],
    weeks: [],
    latestWeek: false,
    brackets: false,
    endOfSeason: false,
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
        options.years.push(year);
        break;
        
      case '--week':
      case '-w':
        const week = parseInt(args[++i]);
        if (isNaN(week)) {
          throw new Error('Invalid week provided');
        }
        options.weeks.push(week);
        break;
        
      case '--latest':
      case '-l':
        options.latestWeek = true;
        break;
        
      case '--brackets':
      case '-b':
        options.brackets = true;
        break;
        
      case '--end-of-season':
      case '-e':
        options.endOfSeason = true;
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
🏈 Sleeper Data Fetcher

Usage: node fetch-sleeper-data.js [options]

Options:
  -y, --year <year>        Specify year(s) to fetch (can be used multiple times)
  -w, --week <week>        Specify week(s) to fetch (can be used multiple times)
  -l, --latest             Fetch only the latest completed week (default behavior)
  -b, --brackets           Fetch playoff bracket data
  -e, --end-of-season      Fetch all data including brackets (end of season)
  -h, --help               Show this help message

Examples:
  # Fetch latest week for most recent year
  node fetch-sleeper-data.js

  # Fetch latest week for specific year
  node fetch-sleeper-data.js --year 2024

  # Fetch specific weeks for 2024
  node fetch-sleeper-data.js --year 2024 --week 1 --week 2 --week 3

  # Fetch all data for end of season
  node fetch-sleeper-data.js --year 2024 --end-of-season

  # Fetch brackets only
  node fetch-sleeper-data.js --year 2024 --brackets

  # Fetch multiple years
  node fetch-sleeper-data.js --year 2023 --year 2024 --latest
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
    
    // Determine years to fetch
    let years = options.years;
    if (years.length === 0) {
      // Default to most recent year
      const dataDir = path.join(__dirname, '..', 'src', 'data');
      const yearDirs = fs.readdirSync(dataDir)
        .filter(dir => fs.statSync(path.join(dataDir, dir)).isDirectory())
        .filter(dir => /^\d{4}$/.test(dir))
        .map(dir => parseInt(dir))
        .sort((a, b) => b - a);
      
      if (yearDirs.length === 0) {
        throw new Error('No year directories found in src/data');
      }
      
      years = [yearDirs[0]]; // Most recent year
      console.log(`No year specified, using most recent: ${years[0]}`);
    }
    
    // Set default behavior if no specific options
    if (options.weeks.length === 0 && !options.latestWeek && !options.brackets && !options.endOfSeason) {
      options.latestWeek = true;
    }
    
    console.log(`\n🚀 Starting data fetch for years: ${years.join(', ')}`);
    console.log(`Options:`, {
      weeks: options.weeks.length > 0 ? options.weeks : 'latest',
      brackets: options.brackets,
      endOfSeason: options.endOfSeason
    });
    
    // Fetch data for each year
    for (const year of years) {
      await fetchYearData(year, options);
    }
    
    console.log('\n🎉 All data fetching completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
