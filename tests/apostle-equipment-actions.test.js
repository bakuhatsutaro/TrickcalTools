'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'apostle_equipment.html'), 'utf8');
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
