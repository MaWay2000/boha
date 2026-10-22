const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const previousGlobal = globalThis.Prism;
  const {highlightJavaScript} = await import('./js/vendor/prism-javascript.js');
  const {getScriptLineNumbers,mountScriptEditor} = await import('./js/scriptEditor.js');
  assert.equal(globalThis.Prism,previousGlobal,'Highlighter does not create a global or scan other panels');
  function plain(html) {
    return html.replace(/<span class="[^"]*">/g,'').replace(/<\/span>/g,'')
      .replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  }
  const samples = [
    'const n = 0xFF + 1.25e-3; let active = true; // note\n',
    '/* multiple\nlines */\nfunction build(x) { return "string"; }',
    'const pattern = /a\\/[b-d]+/gi; const ratio = total / count;',
    'const text = \x60hello $'+'{player + 1}: $'+'{gameRand(4)}\x60;',
    'let s = "escaped \\"quote\\"";\n// <script>alert(1)</script>',
    'const payload = "</code><img src=x onerror=alert(1)>";',
    '\t// a tab\n\n',
    ''
  ];
  for(const source of samples) {
    const html=highlightJavaScript(source);
    assert.equal(plain(html),source,'Highlighting preserves every source character');
    assert(!/<(?:img|script|svg|iframe)\b/i.test(html),'Code cannot inject HTML');
  }
  const colored=highlightJavaScript(samples[0]);
  for(const token of ['keyword','number','boolean','comment','operator'])
    assert(colored.includes('token '+token),'JavaScript token: '+token);
  assert.match(highlightJavaScript(samples[2]),/token regex/);
  assert.match(highlightJavaScript(samples[3]),/token interpolation/);
  assert.equal(getScriptLineNumbers(''),'1');
  assert.equal(getScriptLineNumbers('x'),'1');
  assert.equal(getScriptLineNumbers('x\r\n\r\ny\r\n'),'1\n2\n3\n4');

  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'js/jszip.min.js'),'utf8'),{
    module:mod,exports:mod.exports,require,Buffer,setTimeout,clearTimeout,
    setImmediate,clearImmediate,Uint8Array,ArrayBuffer,DataView
  });
  const filename='10c-Gladiator-test6-48dfeff712235e2959b2f876bc485b8efd45abb477a039cd6908d295173a163c.wz';
  const zip=await mod.exports.loadAsync(fs.readFileSync(path.join(__dirname,'maps',filename)));
  const scriptName=Object.keys(zip.files).find(n=>n.endsWith('/game.js'));
  const script=await zip.file(scriptName).async('string');
  assert.equal(plain(highlightJavaScript(script)),script,'Full Gladiator script preserved');
  assert.equal(getScriptLineNumbers(script).split('\n').length,script.split('\n').length);

  // The resize observer keeps overlays aligned after widening/resizing the panel.
  const previousObserver=globalThis.ResizeObserver;
  let resized,observed;
  globalThis.ResizeObserver=class {
    constructor(callback){resized=callback;}
    observe(target){observed=target;}
  };
  const controls=new Map();
  const panel={innerHTML:'',addEventListener(){},querySelector:selector=>{
    if(!controls.has(selector)) controls.set(selector,{
      value:'',style:{},scrollTop:0,scrollLeft:0,clientWidth:700,clientHeight:400,
      addEventListener(){},classList:{toggle(){}}
    });
    return controls.get(selector);
  }};
  try {
    const editor=mountScriptEditor(panel,{onChange(){},onRun(){}});
    editor.setScript({filename:scriptName,source:script});
    assert.equal(observed,controls.get('#mapScriptSource'));
    observed.clientWidth=950;observed.clientHeight=550;observed.scrollTop=120;
    resized();
    assert.equal(controls.get('[data-script-highlight]').style.width,'950px');
    assert.equal(controls.get('[data-script-highlight]').style.height,'550px');
    assert.equal(controls.get('[data-script-line-numbers]').style.height,'550px');
    assert.equal(controls.get('[data-script-highlight]').scrollTop,120);
  } finally {
    if(previousObserver===undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver=previousObserver;
  }
  console.log('PASS: JavaScript tokens, regex/templates/comments, safe escaping, exact source preservation, full Gladiator line numbering and resize alignment.');
})().catch(error=>{console.error(error);process.exitCode=1;});
