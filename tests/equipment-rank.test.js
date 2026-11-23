'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const dataScript = fs.readFileSync(path.join(root, 'equipment-data.js'), 'utf8');

function dataContext(fetch) {
  const context = vm.createContext({ fetch });
  vm.runInContext(dataScript, context);
  return context;
}

test('stage data determines the highest rank from either drop', () => {
  const context = dataContext();
  const text = '34-1\t101_鎧10\t97_魔法武器9\n35-1  91_鎧9  111_鎧11';
  context.text = text;
  assert.equal(vm.runInContext('analyzeData(parseData(text)).maxRank', context), 11);
  context.text = text.split('\n')[0];
  assert.equal(vm.runInContext('analyzeData(parseData(text)).maxRank', context), 10);
});

test('stage loading reports failed and empty responses', async () => {
  const failed = dataContext(async () => ({ ok: false, status: 404 }));
  await assert.rejects(vm.runInContext('loadEquipmentData()', failed), /404/);
  const empty = dataContext(async () => ({ ok: true, text: async () => 'invalid' }));
  await assert.rejects(vm.runInContext('loadEquipmentData()', empty), /有効な装備データがありません/);
});

test('rank 10 equipment and reserves require 64 rank 10 blueprints only', () => {
  const html = fs.readFileSync(path.join(root, 'equipment_calc.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const element = { addEventListener() {} };
  const context = vm.createContext({
    document: { getElementById: () => element, querySelectorAll: () => [] },
    analyzeData() {},
    loadEquipmentData: () => new Promise(() => {}),
  });
  vm.runInContext(script, context);
  const result = vm.runInContext(`(() => {
    MAX_RANK = 10;
    selfState.req01 = { '0_10': 2, '0_9': 1 };
    selfState.reserveEquipment = { physical: 1 };
    const totals = computeBlueprintTotals();
    return [totals[0][10], totals[0][9], totals[0][8]];
  })()`, context);
  assert.deepEqual(Array.from(result), [192, 104, 86]);
});
