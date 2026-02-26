import requests

pages = 5
count = 100
min_elo = 1500
max_elo = 3000
min_time = 0 * 1000 * 60
max_time = 15 * 1000 * 60
require_vod = True

lid = 9999999
good_matches = []

for page in range(pages):
    print(f"Fetching page {page}...")
    res = requests.get(f'https://api.mcsrranked.com/matches?type=2&count={count}&page={page}&before={lid}')
    data = res.json()
    matches = data['data']
    for match in matches:
        if match['id'] <= lid:
            lid = match['id']
        if (match['vod'] != []) and require_vod:
            if (min_elo <= match['players'][0]['eloRate'] <= max_elo) and (min_time <= match['result']['time'] <= max_time):
                good_matches.append(match)
                # print(f"Match ID: {match['id']}, Elo: {match['players'][0]['eloRate']}, Time: {match['result']['time']/1000/60} minutes, Vod: {match['vod'][0]['url']}")

print(f"Found {len(good_matches)} good matches:")
for match in good_matches:
    print(f"Match ID: {match['id']}, Elo: {match['players'][0]['eloRate']}, Time: {match['result']['time']/1000/60} minutes, Vod: {match['vod'][0]['url']}")