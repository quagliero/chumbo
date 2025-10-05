#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Valid fantasy football positions
const VALID_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// Years to process
const YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

console.log('🏈 Starting players.json optimization...');

function filterPlayersFile(filePath, description) {
  console.log(`\n📖 Processing ${description}...`);
  
  try {
    // Read the file
    const playersData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    console.log(`📊 ${description} contains ${Object.keys(playersData).length} players`);
    
    // Filter players by valid positions
    const filteredPlayers = {};
    let removedCount = 0;
    
    for (const [playerId, player] of Object.entries(playersData)) {
      // Check if player has a valid position
      const hasValidPosition = player.fantasy_positions?.some(pos => VALID_POSITIONS.includes(pos)) ||
                              VALID_POSITIONS.includes(player.position);
      
      if (hasValidPosition) {
        filteredPlayers[playerId] = player;
      } else {
        removedCount++;
      }
    }
    
    console.log(`✅ Filtered to ${Object.keys(filteredPlayers).length} players`);
    console.log(`🗑️  Removed ${removedCount} players with invalid positions`);
    
    // Calculate size reduction
    const originalSize = fs.statSync(filePath).size;
    const originalSizeMB = (originalSize / (1024 * 1024)).toFixed(2);
    
    // Create backup
    const backupPath = filePath.replace('.json', '_backup.json');
    console.log('💾 Creating backup...');
    fs.copyFileSync(filePath, backupPath);
    
    // Write filtered data
    const outputPath = filePath.replace('.json', '_filtered.json');
    console.log('💾 Writing filtered file...');
    fs.writeFileSync(outputPath, JSON.stringify(filteredPlayers, null, 2));
    
    const newSize = fs.statSync(outputPath).size;
    const newSizeMB = (newSize / (1024 * 1024)).toFixed(2);
    const reductionPercent = (((originalSize - newSize) / originalSize) * 100).toFixed(1);
    
    console.log(`📈 ${description} Results:`);
    console.log(`   Original size: ${originalSizeMB} MB`);
    console.log(`   New size: ${newSizeMB} MB`);
    console.log(`   Reduction: ${reductionPercent}%`);
    
    return {
      originalSize,
      newSize,
      originalCount: Object.keys(playersData).length,
      filteredCount: Object.keys(filteredPlayers).length,
      removedCount
    };
    
  } catch (error) {
    console.log(`⚠️  ${description} not found or error: ${error.message}`);
    return null;
  }
}

try {
  const results = [];
  
  // Process root-level players.json
  const rootPath = path.join(projectRoot, 'src/data/players.json');
  const rootResult = filterPlayersFile(rootPath, 'Root players.json');
  if (rootResult) results.push({ file: 'Root players.json', ...rootResult });
  
  // Process year-specific players.json files
  for (const year of YEARS) {
    const yearPath = path.join(projectRoot, `src/data/${year}/players.json`);
    const yearResult = filterPlayersFile(yearPath, `${year} players.json`);
    if (yearResult) results.push({ file: `${year} players.json`, ...yearResult });
  }
  
  // Summary
  console.log('\n🎯 Summary:');
  let totalOriginalSize = 0;
  let totalNewSize = 0;
  let totalOriginalCount = 0;
  let totalFilteredCount = 0;
  let totalRemovedCount = 0;
  
  results.forEach(result => {
    totalOriginalSize += result.originalSize;
    totalNewSize += result.newSize;
    totalOriginalCount += result.originalCount;
    totalFilteredCount += result.filteredCount;
    totalRemovedCount += result.removedCount;
    
    console.log(`   ${result.file}: ${result.filteredCount}/${result.originalCount} players kept`);
  });
  
  const totalReductionPercent = (((totalOriginalSize - totalNewSize) / totalOriginalSize) * 100).toFixed(1);
  const totalOriginalSizeMB = (totalOriginalSize / (1024 * 1024)).toFixed(2);
  const totalNewSizeMB = (totalNewSize / (1024 * 1024)).toFixed(2);
  
  console.log(`\n📊 Overall Results:`);
  console.log(`   Total original size: ${totalOriginalSizeMB} MB`);
  console.log(`   Total new size: ${totalNewSizeMB} MB`);
  console.log(`   Total reduction: ${totalReductionPercent}%`);
  console.log(`   Total players kept: ${totalFilteredCount}/${totalOriginalCount}`);
  console.log(`   Total players removed: ${totalRemovedCount}`);
  
  console.log('\n🎯 Next steps:');
  console.log('   1. Review the filtered files');
  console.log('   2. Replace originals with filtered versions:');
  console.log('      mv src/data/players_filtered.json src/data/players.json');
  console.log('      mv src/data/2025/players_filtered.json src/data/2025/players.json');
  console.log('   3. Test the application');
  console.log('   4. Remove backups if everything works:');
  console.log('      rm src/data/players_backup.json');
  console.log('      rm src/data/2025/players_backup.json');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
