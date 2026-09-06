import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainSim } from '../src/terrain-sim.mjs';

const settle = (sim, ticks=500) => {
  for(let i=0;i<ticks;i++) sim.waterField.stepFlow(.05,{heightAt:sim.heightAt,maxCells:256});
};

test('equal water volumes settle higher in a narrow basin than a wide basin', () => {
  function basin(width) {
    const sim=createTerrainSim({terrainHeight:()=>5,waterLevel:-10});
    for(let x=0;x<width;x++) sim.sandField.addAtCell(x,0,-5);
    sim.waterField.addDepth(.125,.125,.4);
    settle(sim);
    return sim;
  }
  const narrow=basin(1), wide=basin(4);
  assert.ok(Math.abs(narrow.waterField.totalVolume()-wide.waterField.totalVolume())<1e-7);
  assert.ok(narrow.waterDepthAt(.125,.125)>wide.waterDepthAt(.125,.125)*3.8);
  for(let x=0;x<4;x++) assert.ok(Math.abs(wide.waterDepthAt(x*.25+.125,.125)-.1)<.002);
});

test('the displayed water level does not interpolate upward into dry banks', () => {
  const sim=createTerrainSim({terrainHeight:()=>2,waterLevel:-10});
  sim.sandField.addAtCell(0,0,-2);
  sim.waterField.addDepth(.125,.125,.2);
  const middle=sim.waterField.surfaceHeightAt(.125,.125,sim.heightAt);
  const edge=sim.waterField.surfaceHeightAt(.22,.125,sim.heightAt);
  assert.ok(Math.abs(middle-.2)<1e-6);
  assert.ok(Math.abs(edge-middle)<1e-6,'dry bank heights must not lift the fluid surface');
});

test('digging beside settled water wakes it and conserves volume as it fills the lower cut', () => {
  const sim=createTerrainSim({terrainHeight:()=>1,waterLevel:-10});
  sim.sandField.addAtCell(0,0,-1);
  sim.waterField.addDepth(.125,.125,.2);
  settle(sim);
  const volume=sim.waterField.totalVolume();
  assert.equal(sim.waterDepthAt(.375,.125),0);
  for(let i=0;i<7;i++) sim.stampDig({x:.375,z:.125,forwardX:0,forwardZ:1});
  settle(sim);
  assert.ok(sim.waterDepthAt(.375,.125)>.05,'water enters new excavation without another pour');
  assert.ok(sim.waterDepthAt(.125,.125)<.2,'original pond level falls');
  assert.ok(Math.abs(sim.waterField.totalVolume()-volume)<1e-6);
});

test('water runs downhill while higher ground remains dry', () => {
  const sim=createTerrainSim({terrainHeight:(x,z)=>Math.abs(z-.125)>.12?5:1-x,waterLevel:-10});
  sim.waterField.addDepth(.125,.125,.2);
  settle(sim,80);
  assert.ok(sim.waterDepthAt(.375,.125)>0);
  assert.equal(sim.waterDepthAt(-.125,.125),0);
});

test('natural shore water supplies a connected excavated channel', () => {
  const sim=createTerrainSim({terrainHeight:(x,z)=>x>=.5?-.2:.5,waterLevel:0});
  sim.sandField.addAtCell(2,0,0,.1);
  for(let x=-2;x<=1;x++) for(let z=-2;z<=2;z++) sim.sandField.addAtCell(x,z,-1.2);
  for(let i=0;i<160;i++) sim.update(.05,{maxCells:1024});
  assert.ok(sim.waterDepthAt(.625,.125)>.05,'sea reservoir fills');
  assert.ok(sim.waterDepthAt(.375,.125)>.01,'water enters the lower channel beside the sea');
});
