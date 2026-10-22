const assert = require('node:assert/strict');
(async () => {
  const {findScriptMatches,replaceScriptMatches,highlightScriptSearch}=await import('./js/scriptSearch.js');
  const {mountScriptEditor}=await import('./js/scriptEditor.js');
  const positions=matches=>matches.map(m=>[m.start,m.end]);
  assert.deepEqual(positions(findScriptMatches('Cat cat CAT','cat')),[[0,3],[4,7],[8,11]]);
  assert.deepEqual(positions(findScriptMatches('Cat cat CAT','cat',true)),[[4,7]]);
  assert.deepEqual(findScriptMatches('abc',''),[]);
  assert.deepEqual(positions(findScriptMatches('abc .*[]$\\ xyz .*[]$\\','.*[]$\\')),[[4,10],[15,21]]);
  assert.deepEqual(positions(findScriptMatches('İ 🙂🙂','🙂')),[[2,4],[4,6]],'UTF-16 positions match native selections');
  assert.equal(replaceScriptMatches('aa aa',findScriptMatches('aa aa','aa'),'aaaa'),'aaaa aaaa','Replacement is not searched recursively');
  assert.equal(replaceScriptMatches('x x',findScriptMatches('x x','x'),'$& $$'),'$& $$ $& $$','Replacement is literal');
  assert.equal(replaceScriptMatches('x x',findScriptMatches('x x','x'),''),' ');
  function plain(html) {
    return html.replace(/<(?:span|mark) class="[^"]*">/g,'').replace(/<\/(?:span|mark)>/g,'')
      .replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  }
  for(const [text,query] of [
    ['const value = "<&"; // token','const value'],
    ['const value = "&lt;"; // 🙂🙂','&lt;'],
    ['const value = "</code><img src=x onerror=alert(1)>";','<img'],
    ['const value = "<&"; // 🙂🙂','🙂']
  ]) {
    const html=highlightScriptSearch(text,findScriptMatches(text,query),0);
    assert.equal(plain(html),text,'Search decoration preserves source and Prism token markup');
    assert.equal((html.match(/<mark /g)||[]).length,(html.match(/<\/mark>/g)||[]).length);
    assert(html.includes('is-current'));assert(!/<img\b/i.test(html),'HTML-like matches remain escaped');
  }
  assert(!highlightScriptSearch('const x=1;',findScriptMatches('const x=1;','token'),0).includes('<mark'),'Never search generated token attributes');

  function harness({native=true,emitInput=true}={}) {
    const controls=new Map(), changes=[],runs=[],listeners={};
    const doc={activeElement:null,undo:[],commands:[]};
    function control(selector) {
      const classes=new Set();
      const item={
        value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,checked:false,style:{},
        listeners:{},scrollTop:0,scrollLeft:0,clientWidth:600,clientHeight:120,
        selectionStart:0,selectionEnd:0,ownerDocument:doc,
        addEventListener(type,handler){this.listeners[type]=handler;},
        focus(){doc.activeElement=this;},
        select(){this.selectionStart=0;this.selectionEnd=this.value.length;},
        setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
        setRangeText(text,start,end){
          this.value=this.value.slice(0,start)+text+this.value.slice(end);
          this.selectionStart=this.selectionEnd=start+text.length;
        },
        classList:{toggle:(n,on)=>on?classes.add(n):classes.delete(n),contains:n=>classes.has(n)},
        getBoundingClientRect:()=>({top:100,left:200})
      };
      if(selector==='[data-script-search]') Object.defineProperty(item,'offsetHeight',{
        get:()=>item.hidden?0:(controls.get('[data-script-replace-row]')?.hidden?36:70)
      });
      if(selector==='[data-script-highlight-code]') item.querySelector=()=>{
        if(!item.innerHTML.includes('is-current')) return null;
        const editor=controls.get('#mapScriptSource');
        const prefix=editor.value.slice(0,editor.selectionStart), rows=prefix.split('\n');
        const top=108+(rows.length-1)*20-editor.scrollTop;
        const left=208+rows[rows.length-1].length*8-editor.scrollLeft;
        return {getBoundingClientRect:()=>({top,bottom:top+20,left,right:left+Math.max(1,editor.selectionEnd-editor.selectionStart)*8})};
      };
      return item;
    }
    const css={};
    const panel={
      innerHTML:'',style:{setProperty:(key,value)=>{css[key]=value;}},
      querySelector:selector=>{
        if(!controls.has(selector)) controls.set(selector,control(selector));
        return controls.get(selector);
      },
      addEventListener:(type,handler)=>{listeners[type]=handler;}
    };
    doc.execCommand=(command,_ui,text)=>{
      if(!native) return false;
      doc.commands.push(command);
      const area=doc.activeElement;
      if(command==='undo') {
        const before=doc.undo.pop();if(!before)return false;
        area.value=before.value;area.setSelectionRange(before.start,before.end);
      } else {
        doc.undo.push({value:area.value,start:area.selectionStart,end:area.selectionEnd});
        area.setRangeText(command==='delete'?'':text,area.selectionStart,area.selectionEnd);
      }
      if(emitInput)area.listeners.input();
      return true;
    };
    const ui=mountScriptEditor(panel,{
      onChange:value=>changes.push(value),
      onRun:async value=>{runs.push(value);return 'Map updated';}
    });
    const c=selector=>controls.get(selector);
    const area=c('#mapScriptSource'),find=c('#mapScriptFind'),replace=c('#mapScriptReplace');
    const key=(name,target=area,options={})=>{
      let prevented=false,stopped=false;
      listeners.keydown({key:name,target,...options,
        preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
      return {prevented,stopped};
    };
    const setSource=value=>{ui.setScript({filename:'game.js',source:value,pendingChanges:false});area.setSelectionRange(0,0);};
    const query=value=>{find.value=value;find.listeners.input();};
    return {ui,c,area,find,replace,key,setSource,query,changes,runs,doc,css,listeners};
  }
  const h=harness();
  h.ui.setScript(null);
  assert.equal(h.key('f',h.area,{ctrlKey:true}).prevented,false,'Empty editor leaves browser shortcut alone');
  h.setSource('Cat cat CAT');
  const opened=h.key('f',h.area,{ctrlKey:true});
  assert(opened.prevented&&opened.stopped);
  assert.equal(h.c('[data-script-search]').hidden,false);
  assert.equal(h.c('[data-script-replace-row]').hidden,true);
  assert.equal(h.doc.activeElement,h.find);
  h.query('cat');
  assert.equal(h.c('[data-script-find-count]').textContent,'1 of 3');
  assert.equal(h.area.selectionStart,0);assert.equal(h.area.selectionEnd,3);
  h.key('Enter',h.find);assert.equal(h.area.selectionStart,4);
  h.key('Enter',h.find,{shiftKey:true});assert.equal(h.area.selectionStart,0);
  h.c('[data-script-find-prev]').listeners.click();assert.equal(h.area.selectionStart,8,'Previous wraps to last');
  h.c('[data-script-find-next]').listeners.click();assert.equal(h.area.selectionStart,0,'Next wraps to first');
  assert.equal(h.changes.length,0);assert.equal(h.runs.length,0,'Finding never edits or runs the map');
  const narrowHeight=Number.parseInt(h.css['--script-search-height']);
  h.key('h',h.find,{ctrlKey:true});
  assert.equal(h.c('[data-script-replace-row]').hidden,false);
  assert(Number.parseInt(h.css['--script-search-height'])>narrowHeight,'Search bar reduces editor height rather than covering source');
  h.c('[data-script-find-case]').checked=true;h.c('[data-script-find-case]').listeners.change();
  assert.equal(h.c('[data-script-find-count]').textContent,'1 of 1');
  h.query('not present');
  assert.equal(h.c('[data-script-find-count]').textContent,'0 matches');
  assert(h.c('[data-script-replace-one]').disabled&&h.c('[data-script-replace-all]').disabled);
  h.key('Escape',h.find);
  assert(h.c('[data-script-search]').hidden);
  assert.equal(h.css['--script-search-height'],'0px');
  assert.equal(h.doc.activeElement,h.area);

  h.c('[data-script-find-case]').checked=false;
  h.setSource('cat Cat cat');
  h.key('h',h.area,{ctrlKey:true});h.query('cat');
  h.key('Enter',h.find);
  h.replace.value='DOG';h.c('[data-script-replace-one]').listeners.click();
  assert.equal(h.area.value,'cat DOG cat');
  assert.equal(h.changes.length,1,'Native input and replacement produce one change notification');
  assert.equal(h.area.selectionStart,8,'Advance past the replacement to the next match');
  assert.equal(h.runs.length,0,'Replacing never runs script');
  h.replace.value='';h.c('[data-script-replace-all]').listeners.click();
  assert.equal(h.area.value,' DOG ');assert.equal(h.changes.length,2);
  assert.match(h.c('[data-script-status]').textContent,/Replaced 2 matches/);
  assert.equal(h.doc.commands.filter(command=>command==='insertText').length,2,'Replace all uses one native insertion');
  h.area.focus();h.doc.execCommand('undo');
  assert.equal(h.area.value,'cat DOG cat','Replace all uses a single native edit');
  assert.equal(h.changes.length,3,'Undo updates draft, highlighting and search');
  assert.equal(h.c('[data-script-find-count]').textContent,'1 of 2');
  assert(h.c('[data-script-highlight-code]').innerHTML.includes('<mark'));

  h.setSource(Array.from({length:30},(_,i)=>i===28?' '.repeat(100)+'target':'line').join('\n'));
  h.key('f',h.area,{ctrlKey:true});h.query('target');
  assert(h.area.scrollTop>0&&h.area.scrollLeft>0,'Offscreen match is scrolled into view');
  assert.equal(h.c('[data-script-highlight]').scrollTop,h.area.scrollTop);
  assert.equal(h.c('[data-script-line-numbers]').scrollTop,h.area.scrollTop);
  assert.equal(h.c('[data-script-highlight]').scrollLeft,h.area.scrollLeft);
  const selectedStart=h.area.value.indexOf('target');
  h.area.setSelectionRange(selectedStart,selectedStart+6);
  h.key('f',h.area,{ctrlKey:true});
  assert.equal(h.find.value,'target','Selected text seeds search');

  const deleting=harness();
  deleting.setSource('x');deleting.key('h',deleting.area,{ctrlKey:true});deleting.query('x');
  deleting.replace.value='';deleting.c('[data-script-replace-one]').listeners.click();
  assert.equal(deleting.area.value,'');
  assert(deleting.doc.commands.includes('delete'),'Empty single replacement uses native undoable deletion');

  for(const options of [{native:false},{native:true,emitInput:false}]) {
    const editor=harness(options);
    editor.setSource('aa aa');editor.key('h',editor.area,{ctrlKey:true});editor.query('aa');
    editor.replace.value='aaaa';editor.c('[data-script-replace-all]').listeners.click();
    assert.equal(editor.area.value,'aaaa aaaa');assert.equal(editor.changes.length,1);
    assert.equal(editor.runs.length,0);
  }
  const outside=h.key('f',h.area,{ctrlKey:false});
  assert(!outside.prevented,'Plain typing is not intercepted');
  assert.deepEqual(Object.keys(h.listeners),['keydown'],'Keyboard handler is attached to editor panel only');
  console.log('PASS: scoped Ctrl+F/Ctrl+H/Escape, match counts/case/highlighting, wraparound, offscreen scrolling, literal replace/all, native undo and fallback, no implicit script execution.');
})().catch(error=>{console.error(error);process.exitCode=1;});
