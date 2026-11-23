'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'equipment_planner.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function plannerContext() {
  const elements = {
    dropRateLow: { value: '84', validity: { badInput: false } },
    dropRate10: { value: '74', validity: { badInput: false } },
  };
  const storage = {};
  const context = vm.createContext({
    document: {
      getElementById: id => elements[id],
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    localStorage: {
      getItem: key => storage[key] ?? null,
      setItem: (key, value) => { storage[key] = value; },
    },
    loadEquipmentData: () => new Promise(() => {}),
  });
  vm.runInContext(script, context);
  return { context, elements, storage };
}

test('all models and result totals use the rate of each drop, including duplicate drops', () => {
  const { context } = plannerContext();
  const results = vm.runInContext(`(() => {
    const rates = readDropRates();
    const stages = [{ id: 'a', drops: [
      { type: '鎧', rank: 10 }, { type: '帽子', rank: 9 }, { type: '鎧', rank: 10 }
    ] }];
    const targets = [
      { key: '鎧_10', rank: 10, target: 74 },
      { key: '帽子_9', rank: 9, target: 84 }
    ];
    const normal = buildModelMinRuns(stages, targets, rates).variables.x_a;
    const short = buildModelMinShortfall(stages, targets, rates).variables.x_a;
    const advanced = buildModelPenalizedExcess(stages, targets, rates).variables.x_a;
    const actual = computeActuals(stages, { x_a: 100 }, rates);
    return [normal['min_鎧_10'], normal['min_帽子_9'], short['dev_鎧_10'],
      short['dev_帽子_9'], advanced['dev_鎧_10'], advanced['dev_帽子_9'],
      actual['鎧_10'], actual['帽子_9']];
  })()`, context);
  assert.deepEqual(Array.from(results), [1.48, 0.84, 1.48, 0.84, 1.48, 0.84, 148, 84]);
});

test('empty rates use defaults, custom rates persist, and invalid rates fail', () => {
  const { context, elements, storage } = plannerContext();
  elements.dropRateLow.value = '';
  elements.dropRate10.value = '';
  vm.runInContext('readDropRates()', context);
  assert.equal(elements.dropRateLow.value, '84');
  assert.equal(elements.dropRate10.value, '74');

  elements.dropRateLow.value = '50.5';
  elements.dropRate10.value = '0';
  vm.runInContext('saveFormState()', context);
  elements.dropRateLow.value = '84';
  elements.dropRate10.value = '74';
  vm.runInContext('loadFormState()', context);
  assert.equal(elements.dropRateLow.value, '50.5');
  assert.equal(elements.dropRate10.value, '0');

  storage['trickcalTools.formState.v1'] = JSON.stringify({ req: {}, calcMode: '1' });
  elements.dropRateLow.value = '84';
  elements.dropRate10.value = '74';
  vm.runInContext('loadFormState()', context);
  assert.equal(elements.dropRateLow.value, '84');
  assert.equal(elements.dropRate10.value, '74');

  elements.dropRate10.value = '101';
  assert.throws(() => vm.runInContext('readDropRates()', context), /0〜100/);
});

test('zero-probability drops are unreachable', () => {
  const { context, elements } = plannerContext();
  elements.dropRate10.value = '0';
  const count = vm.runInContext(`findUnreachableKeys(
    [{ drops: [{ type: '鎧', rank: 10 }, { type: '帽子', rank: 9 }] }],
    [{ key: '鎧_10', target: 1 }, { key: '帽子_9', target: 1 }],
    readDropRates()).length`, context);
  assert.equal(count, 1);
});
