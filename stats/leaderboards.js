import { eloThreshold } from './calculate.js?v=f722ac7f80b811c5';

export const leaderboards = [
	'Global',
	'1v1', '1v1 High Oil', '1v1 Classic',
	'FFA', '2v2v2v2', '3v3v3',
	'2v2', '3v3', '4v4',
	'5v5', 'Shtorm', 'Matrix',
	'NTW >= 6 Players', 'Team Shared Research', 'Longer than 45 minutes'
];

export function filterGame(leaderboard, game) {
	switch (leaderboard) {
		case '1v1': return game.players.length === 2;
		case '1v1 High Oil': return game.players.length === 2 && ['RO_1v1Full', 'RB_RQNTW_1v1'].includes(game.mapName);
		case '1v1 Classic': return game.players.length === 2 && ['Calamity', 'Vertigo', 'OutskirtsM', 'Sunlight', 'Roughness-1-03', 'Snowbridge2b'].includes(game.mapName);
		case '2v2': return game.alliancesType >= 2 && game.players.length === 4 && game.teams.every(team => team.players.length === 2);
		case '3v3': return game.alliancesType >= 2 && game.players.length === 6 && game.teams.every(team => team.players.length === 3);
		case '4v4': return game.alliancesType >= 2 && game.players.length === 8 && game.teams.every(team => team.players.length === 4);
		case 'FFA': return game.players.length >= 3 && (game.alliancesType <= 1 || game.teams.every(team => team.players.length === 1));
		case '2v2v2v2': return game.alliancesType >= 2 && game.players.length === 8 && game.teams.every(team => team.players.length === 2);
		case '3v3v3': return game.alliancesType >= 2 && game.players.length === 9 && game.teams.every(team => team.players.length === 3);
		case '5v5': return game.alliancesType >= 2 && game.players.length === 10 && game.teams.every(team => team.players.length === 5);
		case 'Shtorm': return game.mapName.toLowerCase().includes('shtorm');
		case 'Matrix': return game.mapName.toLowerCase().includes('matrix');
		case 'NTW >= 6 Players': return game.mapName.toLowerCase().includes('ntw') && game.players.length >= 6;
		case 'Team Shared Research': return game.alliancesType === 2 && game.players.length > 2 && game.teams.every(team => team.players.length > 1);
		case 'Longer than 45 minutes': return game.duration > 45 * 60 * 1000;
		default: case 'Global': return true;
	}
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').at(-1);

export function present(accounts, games, out, playerLimit = +Infinity, gameLimit = +Infinity) {
	function escape(s) { return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;'); }
	function escapeAttribute(s) { return escape(s).replaceAll("'", '&apos;').replaceAll('"', '&quot;'); }
	out(`
			<table class='results'>
				<tr>
					<th class='side-head'><span>${accounts.size} RANKS</span></th>
					<td>
						<table class='results-inner sticky-head' style='max-height: 30em'>
							<thead>
								<tr>
									<th>Player name</th>
									<th>Rank</th>
									<th>Elo</th>
									<th title='Number of matches played'>#</th>
									<th title='Win'>W</th>
									<th title='Lose'>L</th>
									<th title='Draw'>D</th>
									<th title='Invalid either because players agreed to enable debug mode (Cheated),
or because the setup was invalid, e.g.:
- teams are unevenly sized,
- all winners/contenders or losers have less than the threshold of matches ${eloThreshold}) so their Elo is not counted yet,
- all players lose after idling for too long, host quit, or recording spectator kicked,
- there&apos;s a winner but no loser (e.g. everyone joined the same alliance, or a player is alone against an empty-slot),
- a spectator wins (wrong game setup).
'
										>Inv<small class='dimmed'><sup>(*)</sup></small></th>
									<th>Player names</th>
									<th>Public keys</th>
								</tr>
							</thead>
							<tbody>
	`);
	const accountsArray = Array.from(accounts.values());
	function sortKey(account) { return !account.discounted ? account.elo : -1_000_000_000 + account.games.length; }
	accountsArray.sort((a, b) => sortKey(b) - sortKey(a));
	for(const [rank, account] of accountsArray.entries()) {
		if (playerLimit < +Infinity && (rank >= playerLimit || account.discounted && account.games.length < 2)) break;
		let name = escape(account.name);
		function fixName(n) {
			return {
				'⁤': '+',
				'⠀': '࿕',
				'kracker': 'Fr🤮nch — kracker',
				'vaut ΣΑ [GN]': 'Only bohan can be that stupid — vaut ΣΑ [GN]',
				'cronos': 'I like to wall my team mates — cronos'
			}[n] ?? n;
		}
		let names;
		if (account.names.size === 1) names = fixName(name);
		else {
			const namesArray = Array.from(account.names.entries());
			namesArray.sort((a , b) => b[1] - a[1]);
			function formatName(name, count) { return `<span class='player-names'>${escape(fixName(name))}<small class='dimmed'> <sup>${count}</sup></small></span>`; }
			const frequentNames = namesArray.filter(kv => kv[1] >= 10).map(kv => formatName(...kv));
			const infrequentNames = namesArray.filter(kv => kv[1] < 10 && kv[1] > 1).map(kv => `<span style='font-size: 0.95em'>${formatName(...kv)}`);
			const infrequentNamesClose = namesArray.filter(kv => kv[1] < 10 && kv[1] > 1).map(kv => '</span>');
			const onceNames = namesArray.filter(kv => kv[1] === 1).map(kv => formatName(...kv));
			names = [...frequentNames, ...infrequentNames, ...onceNames, ...infrequentNamesClose].join('&nbsp;&nbsp; ');
		}
		out(`
								<tr class='alternate'>
									<td class='player-name${account.discounted ? ' player-discounted' : ''}'>${account.bot ? "<span class='bot'>bot</span> " : ''}${name}</td>
									<td class='number${account.discounted ? ' player-discounted' : ''}'>${rank + 1}</td>
									<td class='number'>${!account.discounted ? account.elo.toFixed(2) : ''}</td>
									<td class='number'>${account.games.length}</td>
									<td class='number player-winner'>${account.winCount}</td>
									<td class='number player-loser'>${account.loseCount}</td>
									<td class='number player-contender'>${account.drawCount}</td>
									<td class='number player-discounted'>${account.games.length - account.winCount - account.loseCount - account.drawCount}</td>
									<td class='player-names${account.discounted ? ' player-discounted' : ''}'>${account.bot ? "<span class='bot'>bot</span> " : ''}${names}</td>
									<td class='key'>${account.publicKeys.size ? Array.from(account.publicKeys).map(publicKey => escape(publicKey)).join('<br/>') : name}</td>
								</tr>
		`);
	}
	out(`
							</tbody>
						</table>
					</td>
				</tr>
			</table>
			<table class='results'>
				<tr>
					<th class='side-head'><span>${games.length} MATCHES</span></th>
					<td>
						<table class='results-inner sticky-head' style='${gameLimit < +Infinity ? 'max-height: 44em; ' : ''}zoom: 85%'>
							<thead>
								<tr>
									<th>Date (${timeZone})</th>
									<th>Map</th>
									<th>Alliances</th>
									<th>Dur°</th>
									<th>Outcome</th>
									<th>Elo</th>
									<th>Replay</th>
									<th>Version</th>
								</tr>
							</thead>
							<tbody>
	`);
	games.reverse();
	const maxGamePlayersLength = games.reduce((max, game) => Math.max(max, game.players.length), -Infinity);
	for (const game of games.slice(0, gameLimit)) {
		let alliance;
		if (game.players.length === 2)
			alliance = '1v1';
		else if (game.teams.every(team => team.players.length === 1))
			alliance = 'FFA';
		else switch (game.alliancesType) {
			case 0: alliance = 'FFA'; break;
			case 1: alliance = 'Allow'; break;
			case 2: alliance = 'Shared'; break;
			case 3: alliance = 'Nonshared'; break;
			default: alliance = '?'
		}
		let oneLine = false;
		switch (alliance) { case '1v1': case 'FFA': case 'Allow': oneLine = true; }
		const maxTeamSlotsLength = game.teams.reduce((max, team) => Math.max(max, team.slots.length), -Infinity);
		const maxTeamPlayersLength = game.teams.reduce((max, team) => Math.max(max, team.players.length), -Infinity);
		const nbCols = oneLine ? game.slots.length : maxTeamPlayersLength ? maxTeamPlayersLength : maxTeamSlotsLength;
		const date = new Date(game.endDate);
		out(`
								<tr class='alternate'>
									<td class='date'><time>${date.getFullYear()} ${monthNames[date.getMonth()]} ${('0' + date.getDate()).slice(-2)}&nbsp;&nbsp;<span class='time'>${('0' + date.getHours()).slice(-2)}:${('0' + date.getMinutes()).slice(-2)}</span></time></td>
									<td class='map'>
										<img loading='lazy' src='images/maps/${escapeAttribute(game.mapName)}.png' alt=''/>
										${escape(game.mapName)}
										${game.mods ? `<br/><span class='mods' title='${escapeAttribute(game.mods)}'>Mod ${escape(game.mods.slice(0, 20))}</span>` : ''}
									</td>
									<td class='lov'>${alliance}</td>
									<td class='duration'>${Math.trunc(game.duration / 1000 / 60 / 60)}:${('0' + Math.trunc((game.duration % (1000 * 60 * 60)) / 1000 / 60)).slice(-2)}</td>
									<td class='player-container'>
										<table class='team'>
		`);
		function sortKey(team) { switch(team.userType) { case 'winner': case 'contender': return 0; }; return 1; }
		game.teams.sort((a, b) => sortKey(a) - sortKey(b) );
		if (oneLine)
			out(`
											<tr><td class='team'>&nbsp;</td></tr>
			`);
		else for(const team of game.teams)
			out(`
											<tr><td class='team'>${team.name}</td></tr>
			`);
		out(`
										</table>
										<table
											class='player'
											style='width: ${100 * nbCols / (
												maxGamePlayersLength <= 2 ? 2 :
												maxGamePlayersLength <= 6 ? 3 :
												maxGamePlayersLength <= 8 ? 4 :
												nbCols <= 5 ? 5 : 10
											)}%'
										>
		`);
		if (oneLine)
			out(`
											<tr>
			`);
		for (const team of game.teams) {
			if (!oneLine)
				out(`
											<tr>
				`);
			for (let x = 0; x < (oneLine ? team.slots.length : maxTeamSlotsLength); ++x) {
				const slot = x < team.slots.length ? team.slots[x] : null;
				let classes = ['player'];
				if (!slot) classes.push('player-closed-slot');
				else {
					classes.push(slot.userType ? 'player-' + slot.userType : 'player-empty-slot');
					if (slot.account.discounted) classes.push('player-discounted');
				}
				out(`
												<td style='width: ${100 / nbCols}%'>
				`);
				if (slot)
					out(`
													<div class='${classes.join(' ')}'>
														${slot.account.bot ? "<span class='bot'>bot</span>" : ''}
														<span>${escape(slot.account.name.slice(0, 25))}</span>
														<span class='elo'>
															${slot.eloDelta !== null ? `${slot.elo.toFixed()}${slot.eloDelta >= 0 ? '+' : ''}${slot.eloDelta.toFixed(2)}` : ''}
														</span>
													</div>
					`);
				out(`
												</td>
				`);
			}
			if (!oneLine)
				out(`
											</tr>
				`);
		}
		if (oneLine)
			out(`
											</tr>
			`);
		out(`
										</table>
									</td>
									<td class='lov'>${game.cheated ? 'Cheated' : game.eloDelta !== null ? `<span class=number>${game.eloDelta.toFixed(2)}</span>` : 'Invalid'}</td>
									<td class='lov'><a target='_blank' href='${escapeAttribute(game.replayUrl)}'>Replay</a></td>
									<td class='number'>${escape(game.version)}</td>
								</tr>
		`);
	}
	out(`
							</tbody>
						</table>
					</td>
				</tr>
			</table>
	`);
}
