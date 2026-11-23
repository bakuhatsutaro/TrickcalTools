'use strict';

function parseItem(str) {
  str = str.trim();
  const uscore = str.indexOf('_');
  if (uscore === -1) return null;
  const id = parseInt(str.slice(0, uscore), 10);
  const typeAndRank = str.slice(uscore + 1);
  const match = typeAndRank.match(/(\d+)$/);
  if (!match) return null;
  const rank = parseInt(match[1], 10);
  const type = typeAndRank.slice(0, typeAndRank.length - match[1].length);
  return { id, type, rank };
}

function parseData(text) {
  const stages = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\t+|[ ]{2,}/);
    if (parts.length < 3) continue;
    const stage = parts[0].trim();
    const drop1 = parseItem(parts[1]);
    const drop2 = parseItem(parts[2]);
    if (drop1 && drop2) stages.push({ stage, id: `stage_${stages.length}`, drops: [drop1, drop2] });
  }
  return stages;
}

function analyzeData(stages) {
  let maxRank = 0, minRank = Infinity;
  for (const stage of stages) {
    for (const drop of stage.drops) {
      if (drop.rank > maxRank) maxRank = drop.rank;
      if (drop.rank < minRank) minRank = drop.rank;
    }
  }
  return { minRank, maxRank };
}

async function loadEquipmentData() {
  const response = await fetch('equipment.txt');
  if (!response.ok) throw new Error(`equipment.txt の読み込みに失敗しました (${response.status})`);
  const stages = parseData(await response.text());
  if (stages.length === 0) throw new Error('equipment.txt に有効な装備データがありません。');
  return stages;
}
