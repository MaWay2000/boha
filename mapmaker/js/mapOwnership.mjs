import {mapPlayerIndex} from './archiveImport.js';
// Slot 10 is editor-internal. Warzone maps require the scavenger label.
export function mapExportOwner(entry, owner=entry?.player ?? entry?.startpos) {
 const result={...entry}, player=mapPlayerIndex(owner);
 if(player===10){result.player='scavenger';delete result.startpos;}
 else if(result.player!==undefined){result.player=player;delete result.startpos;}
 else{result.startpos=player;delete result.player;}
 return result;
}
