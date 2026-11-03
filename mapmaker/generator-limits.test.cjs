const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
  const generator=await import('./js/mapGenerator.js');
  const {getTileCount}=await import('./js/tileset.js');
  const {getGeneratorLimits,getGeneratorDependencies}=await import('./js/generatorLimits.js');
  const ui=fs.readFileSync(__dirname+'/js/mapGeneratorUI.js','utf8');
  const groups=vm.runInNewContext(ui.slice(ui.indexOf('const groups='),ui.indexOf('export function generateEditorMap'))+';groups',{...generator,getTileCount});
  const ranges=Object.fromEntries(groups.flatMap(([,fields])=>fields.map(field=>field.split('|')).filter(parts=>parts[2]==='number').map(([key,,,min,max])=>[key,[Number(min),Number(max)]])));
  const limits=getGeneratorLimits(generator.generatorDefaults,ranges);
  assert.equal(Object.keys(limits).length,Object.keys(ranges).length,'every numeric field has bounds');
  assert.equal(limits.width.min,63);assert.equal(limits.edge.max,17);
  assert.equal(limits.players.max,4);assert.equal(limits.teams.max,4);
  assert.equal(limits.baseRadius.max,13);assert.equal(limits.minHeight.max,175);assert.equal(limits.maxHeight.min,0);
  assert.equal(limits.trucks.max,15);assert.equal(limits.baseOil.max,40);
  assert.equal(getGeneratorLimits({...generator.generatorDefaults,tileset:1},ranges).groundTile.max,80);
  assert.equal(generator.normalizeGeneratorOptions({tileset:1,groundTile:80}).groundTile,80,'engine respects the current tileset bound');
  assert.equal(getGeneratorLimits({...generator.generatorDefaults,tileset:2},ranges).textureVariety.max,80);
  const raised=getGeneratorLimits({...generator.generatorDefaults,minHeight:100,maxHeight:200},ranges);
  assert.equal(raised.minHeight.max,200);assert.equal(raised.maxHeight.min,100);
  for(const layout of ['teams','circle','corners','edges','opposite'])for(const players of [2,4,6,10]){
    const o={...generator.generatorDefaults,width:192,height:192,layout,players,teams:2};
    const constraints=getGeneratorLimits(o,ranges);
    for(const key of ['width','height','players','teams','baseRadius']){
      const bound=constraints[key];assert(bound.min<=bound.max,key+' nonempty range');
      for(const value of bound.allowed||[]){
        const candidate={...o,[key]:value};if(key==='players')candidate.teams=Math.min(candidate.teams,value);
        const starts=generator.getGeneratorStarts(candidate);
        for(let i=0;i<starts.length;i++)for(let j=0;j<i;j++)assert(Math.hypot(starts[i].x-starts[j].x,starts[i].y-starts[j].y)>=2*candidate.baseRadius+6,key+' preserves spacing');
      }
    }
  }
  const defaults=getGeneratorDependencies(generator.generatorDefaults);
  for(const key of ['riverWidth','crossings','tankWeapon','defenseType','scavCamps','scavUnits'])assert(defaults[key],key+' explains prerequisite');
  const active=getGeneratorDependencies({...generator.generatorDefaults,water:20,waterStyle:'river',tanks:1,defenses:1,scavengers:true});
  for(const key of ['riverWidth','crossings','tankWeapon','defenseType','scavCamps','scavUnits'])assert.equal(active[key],undefined,key+' becomes available');
  assert(getGeneratorDependencies({...generator.generatorDefaults,connected:false}).roads);
  assert.equal(getGeneratorDependencies({...generator.generatorDefaults,connected:false,water:20,waterStyle:'river'}).routeWidth,undefined,'river crossings still use route width');
  assert(getGeneratorDependencies({...generator.generatorDefaults,layout:'circle'}).teams);
  console.log('PASS: all numeric bounds, geometry capacities, height/texture ranges and dependency explanations.');
})().catch(error=>{console.error(error);process.exitCode=1;});
