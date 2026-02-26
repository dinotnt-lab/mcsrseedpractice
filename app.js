var pages = 15;
var count = 100;
var min_elo = 1500;
var max_elo = 3000;
var min_time = 0 * 1000 * 60;
var max_time = 10 * 1000 * 60;
var require_vod = true;

function advsettog() {
    const advsetdiv = document.getElementsByClassName("advanced-input")[0];
    if (advsetdiv.style.display === "none") {
        advsetdiv.style.display = "block";
    } else {
        advsetdiv.style.display = "none";
    }
}

function updateSettings() {
    pages = parseInt(document.getElementById("pages").value);
    count = parseInt(document.getElementById("count").value);
    min_elo = parseInt(document.getElementById("min_elo").value);
    max_elo = parseInt(document.getElementById("max_elo").value);
    min_time = parseInt(document.getElementById("min_time").value) * 1000 * 60;
    max_time = parseInt(document.getElementById("max_time").value) * 1000 * 60;
    require_vod = document.getElementById("require_vod").checked;
}

function search() {
    const statusDiv = document.getElementById("status");
    let lid = 99999999;
    const good_matches = [];

    (async () => {
    for (let page = 0; page < pages; page++) {
        statusDiv.innerText = `Fetching page ${page}...`;
        const res = await fetch(`https://api.mcsrranked.com/matches?type=2&count=${count}&page=${page}&before=${lid}`);
        const data = await res.json();
        const matches = data.data;
        for (const match of matches) {
        if (match.id <= lid) {
            lid = match.id;
        }
        if (match.vod.length !== 0 && require_vod) {
            if (
            match.players[0].eloRate >= min_elo &&
            match.players[0].eloRate <= max_elo &&
            match.result.time >= min_time &&
            match.result.time <= max_time
            ) {
            good_matches.push(match);
            // console.log(`Match ID: ${match.id}, Elo: ${match.players[0].eloRate}, Time: ${match.result.time / 1000 / 60} minutes, Vod: ${match.vod[0].url}`);
            }
        }
        }
    }

    statusDiv.innerText = `Found ${good_matches.length} good matches`;
    // for (const match of good_matches) {
    //     console.log(`Match ID: ${match.id}, Elo: ${match.players[0].eloRate}, Time: ${match.result.time / 1000 / 60} minutes, Vod: ${match.vod[0].url}`);
    // }
    const chosenMatchNum = Math.floor(Math.random() * good_matches.length);
    statusDiv.innerText = `Chosen match ${chosenMatchNum + 1} out of ${good_matches.length}`;
    const chosenMatch = good_matches[chosenMatchNum];
    const seeddiv = document.getElementById("seed");
    seeddiv.innerText = `Seed: ${chosenMatch.seed}`;
    })();
}