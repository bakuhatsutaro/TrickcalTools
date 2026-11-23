'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'apostle_equipment.html'), 'utf8');
const itemTypes = html.match(/const ITEM_TYPES = \[[^\n]+/)[0];
const nonWeaponTypes = html.match(/const NON_WEAPON_TYPES = [^\n]+/)[0];
const actionFunction = html.slice(html.indexOf('    function applyEquipmentAction('), html.indexOf('    function addEquipmentActions('));
const context = vm.createContext({});
vm.runInContext(`${itemTypes}\n${nonWeaponTypes}\n${actionFunction}`, context);

function record(attackType, rank = '9') {
  return {
    name: 'テスト', rank, attackType,
    equipment: Object.fromEntries(['物理武器', '魔法武器', '鎧', '帽子', '煌めく装飾品', 'ブーツ', '華麗な装飾品'].map(type => [type, false])),
  };
}

test('equip and clear preserve the rank and use the correct weapon', () => {
  for (const type of ['物理', '魔法']) {
    const apostle = record(type);
    context.applyEquipmentAction(apostle, 'equip');
    assert.equal(apostle.rank, '9');
    assert.equal(apostle.equipment[`${type}武器`], true);
    assert.equal(apostle.equipment[type === '物理' ? '魔法武器' : '物理武器'], false);
    assert.equal(Object.values(apostle.equipment).filter(Boolean).length, 6);
    context.applyEquipmentAction(apostle, 'clear');
    assert.equal(apostle.rank, '9');
    assert.ok(Object.values(apostle.equipment).every(value => !value));
  }
});

test('rank up increments and clears equipment, but rejects an invalid rank without changes', () => {
  const apostle = record('物理');
  context.applyEquipmentAction(apostle, 'equip');
  context.applyEquipmentAction(apostle, 'rankUp');
  assert.equal(apostle.rank, '10');
  assert.ok(Object.values(apostle.equipment).every(value => !value));

  for (const rank of ['', '0', '-1', '1.5', String(Number.MAX_SAFE_INTEGER)]) {
    const invalid = record('物理', rank);
    invalid.equipment['鎧'] = true;
    assert.throws(() => context.applyEquipmentAction(invalid, 'rankUp'), /1以上の整数/);
    assert.equal(invalid.rank, rank);
    assert.equal(invalid.equipment['鎧'], true);
  }
});

test('JSON import distinguishes maid Speaki and preserves existing unknown records on append', () => {
  const importContext = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'apostles.js'), 'utf8'), importContext);
  vm.runInContext(itemTypes, importContext);
  vm.runInContext(html.slice(html.indexOf('    const isObject ='), html.indexOf('    function showImportError(')), importContext);
  vm.runInContext(html.slice(html.indexOf('    const blankEquipment ='), html.indexOf('    let parseWarnings =')), importContext);
  vm.runInContext(html.slice(html.indexOf('    function findRegisteredTarget('), html.indexOf('    function deleteUnknownRecord(')), importContext);

  const equipment = (weapon, armor) => Object.fromEntries([
    ['HP', armor], ['魔法攻撃', weapon], ['物理防御', false], ['魔法防御', false],
    ['会心/会心DMG', false], ['会心抵抗/会心DMG抵抗', false],
  ].map(([stat, enabled]) => [stat, { enabled }]));
  importContext.input = JSON.stringify({
    schema: 'trickcal-stat-state', version: 2, kind: 'slot',
    snapshot: { apostles: {
      Speaki: { rank: 9, equipment: equipment(false, true) },
      SpeakiMaid: { rank: 10, equipment: equipment(true, false) },
    } },
  });
  vm.runInContext(`
    unknownRecords.push({ name: 'SpeakiMaid', sourceId: 'SpeakiMaid', rank: '8',
      owned: true, equipment: blankEquipment() });
    const result = parseEquipmentJson(input);
    normalizeIncomingRecords(result.records);
    applyIncomingRecords(result.records, 'append');
  `, importContext);
  const result = vm.runInContext(`({
    records: result.records, warnings: result.warnings,
    normal: registeredRecords.find(record => record.sourceId === 'Speaki'),
    maid: registeredRecords.find(record => record.sourceId === 'Maid Speaki'),
    unknown: unknownRecords,
    legacyLookup: findApostle('SpeakiMaid'),
  })`, importContext);
  assert.equal(result.records[0].sourceId, 'Speaki');
  assert.equal(result.records[1].sourceId, 'Maid Speaki');
  assert.ok(!result.warnings.some(warning => warning.includes('人は使徒データベースに未登録')));
  assert.equal(result.normal.rank, '9');
  assert.equal(result.normal.equipment['鎧'], true);
  assert.equal(result.maid.rank, '10');
  assert.equal(result.maid.owned, true);
  assert.equal(result.maid.equipment['魔法武器'], true);
  assert.equal(result.maid.equipment['鎧'], false);
  assert.equal(result.unknown.length, 1);
  assert.equal(result.unknown[0].rank, '8');
  assert.equal(result.legacyLookup, undefined);
});
