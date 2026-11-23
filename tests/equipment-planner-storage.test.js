'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'equipment_planner.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const key = 'trickcalTools.formState.v1';

function plannerContext(storage) {
  const elements = {
    formStorageWarning: { hidden: true, textContent: '' },
    dropRateLow: { value: '84' },
    dropRate10: { value: '74' },
  };
  elements.targetsGrid = {
    set innerHTML(html) {
      for (const match of html.matchAll(/id="(req_\d+_\d+)" value="([^"]*)"/g)) {
        elements[match[1]] = { id: match[1], value: match[2] };
      }
    },
  };
  const context = vm.createContext({
    document: {
      getElementById: id => elements[id] || null,
      querySelectorAll: selector => selector.startsWith('input[id^="req_"]')
        ? Object.values(elements).filter(element => element.id?.startsWith('req_')) : [],
      querySelector: () => null,
    },
    localStorage: {
      getItem: name => storage[name] ?? null,
      setItem: (name, value) => { storage[name] = value; },
    },
    console: { error() {} },
    loadEquipmentData: () => new Promise(() => {}),
  });
  vm.runInContext(script, context);
  return { context, elements };
}

test('new ranks start at zero while saved values stay at their original ranks', () => {
  const storage = {
    [key]: JSON.stringify({
      req: { req_0_9: '73', req_1_8: '23', req_2_11: '45' },
      rankVis: { rankVis_11: false }, rankScore: { rankScore_11: '7' },
      dropRates: { dropRateLow: '80', dropRate10: '70', futureRate: '60' },
      extra: 'preserve',
    }),
  };
  const first = plannerContext(storage);
  vm.runInContext('buildTargetInputs(2, 10); loadFormState()', first.context);
  assert.equal(first.elements.req_0_9.value, '73');
  assert.equal(first.elements.req_1_8.value, '23');
  assert.equal(first.elements.req_0_10.value, '0');
  assert.equal(first.elements.req_1_10.value, '0');
  vm.runInContext('saveFormState()', first.context);
  const saved = JSON.parse(storage[key]);
  assert.equal(saved.req.req_2_11, '45');
  assert.equal(saved.rankVis.rankVis_11, false);
  assert.equal(saved.rankScore.rankScore_11, '7');
  assert.equal(saved.dropRates.futureRate, '60');
  assert.equal(saved.extra, 'preserve');

  const upgraded = plannerContext(storage);
  vm.runInContext('buildTargetInputs(2, 11); loadFormState()', upgraded.context);
  assert.equal(upgraded.elements.req_2_11.value, '45');
  assert.equal(upgraded.elements.req_0_9.value, '73');
  assert.equal(upgraded.elements.req_1_8.value, '23');
  assert.equal(upgraded.elements.req_0_11.value, '0');
});

test('unreadable saved data displays zeros without overwriting the original', () => {
  for (const raw of ['{invalid json', JSON.stringify({ req: [] }), JSON.stringify({ calcMode: { bad: true } })]) {
    const storage = { [key]: raw };
    const { context, elements } = plannerContext(storage);
    vm.runInContext('buildTargetInputs(2, 10); loadFormState(); saveFormState()', context);
    assert.equal(elements.req_0_10.value, '0');
    assert.equal(elements.req_0_9.value, '0');
    assert.equal(storage[key], raw);
    assert.equal(elements.formStorageWarning.hidden, false);
  }
});

test('saving stops when another page changes the stored data', () => {
  const storage = { [key]: JSON.stringify({ req: { req_0_9: '5' } }) };
  const { context, elements } = plannerContext(storage);
  vm.runInContext('buildTargetInputs(2, 10); loadFormState()', context);
  const otherPageData = JSON.stringify({ req: { req_0_9: '8' } });
  storage[key] = otherPageData;
  elements.req_0_9.value = '6';
  vm.runInContext('saveFormState()', context);
  assert.equal(storage[key], otherPageData);
  assert.equal(elements.formStorageWarning.hidden, false);
});
