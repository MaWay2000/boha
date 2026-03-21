import playerPublicKeys from './player-public-keys.json?v=7de35fa9961b2795' with {type: 'json'};
import {gather, calculate} from './calculate.js?v=f722ac7f80b811c5';
import {leaderboards, filterGame, present} from './leaderboards.js?v=949c335634fe3446';

let leaderboard = leaderboards[0];
let data = {format: 0, results: []};
let playerLimit = 100, gameLimit = 100;

async function compress(str) {
	const compressedStream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
	const chunks = [];
	for await (const chunk of compressedStream) chunks.push(chunk);
	return await concatUint8Arrays(chunks);
}

async function decompress(uint8array) {
	const decompressedStream = new Blob([uint8array]).stream().pipeThrough(new DecompressionStream('gzip'));
	const chunks = [];
	for await (const chunk of decompressedStream) chunks.push(chunk);
	return new TextDecoder().decode(await concatUint8Arrays(chunks));
}

async function concatUint8Arrays(uint8arrays) { return new Uint8Array(await new Blob(uint8arrays).arrayBuffer()); }

async function load() {
	if (!await navigator.storage.persisted())
		try { await navigator.storage.persist(); }
		catch (e) { console.trace(e); }
	const opfsRoot = await navigator.storage.getDirectory();
	let fileHandle;
	try {
		fileHandle = await opfsRoot.getFileHandle('results.json.gz');
	} catch (e) {
		if (false) { // silly Opera browser does not declare NotFoundError but throws it anyway... doesn't make sense
			if (e instanceof NotFoundError || e instanceof NotAllowedError) return;
			else throw e;
		} else {
			return;
		}
	}
	const bytes = new Uint8Array(await (await fileHandle.getFile()).arrayBuffer());
	if (!bytes.length) return;
	try {
		data = JSON.parse(await decompress(bytes));
	} catch (e) {
		console.trace(e);
		await opfsRoot.removeEntry('results.json.gz');
		return;
	}
}

async function save() {
	const opfsRoot = await navigator.storage.getDirectory();
	const fileHandle = await opfsRoot.getFileHandle('results.json.gz', {create: true});
	const file = await fileHandle.createWritable();
	try { await file.write(await compress(JSON.stringify(data))); }
	finally { await file.close(); }
}

function display() {
	if (!data.results.length || !resultsDiv) return;
	const {accounts, games} = gather(data.results, playerPublicKeys, function*(games) { for(const game of games) if (filterGame(leaderboard, game)) yield game; });
	calculate(games);
	const lines = [];
	present(leaderboard, accounts, games, (s) => { lines.push(s); }, playerLimit, gameLimit);
	resultsDiv.innerHTML = lines.join('\n');
}

for(const leaderboard of leaderboards) {
	const button = document.createElement('button');
	button.type = 'button';
	button.innerText = leaderboard;
	resultsLeaderboardButtonsDiv.appendChild(button);
}
resultsLeaderboardButtonsDiv.querySelector('button').classList.add('pressed');
resultsLeaderboardButtonsDiv.addEventListener('click', (event) => {
	for(const button of resultsLeaderboardButtonsDiv.querySelectorAll('button')) button.classList.remove('pressed');
	event.target.classList.add('pressed');
	leaderboard = event.target.innerText;
	display();
});

for(const limit of [100, 500, +Infinity]) {
	const button = document.createElement('button');
	button.type = 'button';
	button.innerText = `Show ${limit < +Infinity ? limit : 'All'} Players`;
	resultsPlayerLimitButtonsDiv.appendChild(button);
	button.addEventListener('click', (event) => {
		for(const button of resultsPlayerLimitButtonsDiv.querySelectorAll('button')) button.classList.remove('pressed');
		event.target.classList.add('pressed');
		playerLimit = limit;
		display();
	});
}
resultsPlayerLimitButtonsDiv.querySelector('button').classList.add('pressed');

for(const limit of [100, 500, +Infinity]) {
	const button = document.createElement('button');
	button.type = 'button';
	button.innerText = `Show ${limit < +Infinity ? limit : 'All'} Games`;
	resultsGameLimitButtonsDiv.appendChild(button);
	button.addEventListener('click', (event) => {
		for(const button of resultsGameLimitButtonsDiv.querySelectorAll('button')) button.classList.remove('pressed');
		event.target.classList.add('pressed');
		gameLimit = limit;
		display();
	});
}
resultsGameLimitButtonsDiv.querySelector('button').classList.add('pressed');

await load();
let needSave = false;
let eventSource;
function createEventSource() {
	eventSource = new EventSource(`results.http-event-stream.json?id=${data.format} ${data.results.length} ${data.results.length ? data.results[data.results.length - 1].endDate : 0}`);
	eventSource.addEventListener('reset', (event) => {
		data.format = Number(event.data);
		data.results.length = 0;
	});
	eventSource.onmessage = (event) => {
		data.results.push(JSON.parse(event.data));
		needSave = true;
	};
	eventSource.addEventListener('synced', (event) => {
		display();
		if(needSave) {
			needSave = false;
			save();
		}
	});
	eventSource.onerror = (event) => {
		if (eventSource.readyState !== EventSource.CLOSED) return;
		eventSource.close();
		setTimeout(createEventSource, 60_000);
	};
}
createEventSource();
addEventListener('beforeunload', (event) => { eventSource.close(); });
