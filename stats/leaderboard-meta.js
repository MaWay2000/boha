export const leaderboards = [
  "Global",
  "1v1",
  "1v1 High Oil",
  "1v1 Classic",
  "FFA",
  "2v2v2v2",
  "3v3v3",
  "2v2",
  "3v3",
  "4v4",
  "5v5",
  "Shtorm",
  "Matrix",
  "NTW >= 6 Players",
  "Team Shared Research",
  "Longer than 45 minutes"
];

export function filterGame(leaderboard, game) {
  switch (leaderboard) {
    case "1v1":
      return game.players.length === 2;
    case "1v1 High Oil":
      return game.players.length === 2 && ["RO_1v1Full", "RB_RQNTW_1v1"].includes(game.mapName);
    case "1v1 Classic":
      return game.players.length === 2 && ["Calamity", "Vertigo", "OutskirtsM", "Sunlight", "Roughness-1-03", "Snowbridge2b"].includes(game.mapName);
    case "2v2":
      return game.alliancesType >= 2 && game.players.length === 4 && game.teams.every((team) => team.players.length === 2);
    case "3v3":
      return game.alliancesType >= 2 && game.players.length === 6 && game.teams.every((team) => team.players.length === 3);
    case "4v4":
      return game.alliancesType >= 2 && game.players.length === 8 && game.teams.every((team) => team.players.length === 4);
    case "FFA":
      return game.players.length >= 3 && (game.alliancesType <= 1 || game.teams.every((team) => team.players.length === 1));
    case "2v2v2v2":
      return game.alliancesType >= 2 && game.players.length === 8 && game.teams.every((team) => team.players.length === 2);
    case "3v3v3":
      return game.alliancesType >= 2 && game.players.length === 9 && game.teams.every((team) => team.players.length === 3);
    case "5v5":
      return game.alliancesType >= 2 && game.players.length === 10 && game.teams.every((team) => team.players.length === 5);
    case "Shtorm":
      return game.mapName.toLowerCase().includes("shtorm");
    case "Matrix":
      return game.mapName.toLowerCase().includes("matrix");
    case "NTW >= 6 Players":
      return game.mapName.toLowerCase().includes("ntw") && game.players.length >= 6;
    case "Team Shared Research":
      return game.alliancesType === 2 && game.players.length > 2 && game.teams.every((team) => team.players.length > 1);
    case "Longer than 45 minutes":
      return game.duration > 45 * 60 * 1000;
    case "Global":
    default:
      return true;
  }
}
