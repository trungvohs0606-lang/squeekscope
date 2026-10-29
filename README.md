# Squeekscope

A daily hamster tarot reading for any wallet, drawn by Squeektoshi's onchain work, and verifiable by anyone.

Squeektoshi is a real hamster whose wheel mines blocks on Squeekchain, a proof-of-work toychain that settles to Ethereum Sepolia. Squeekscope turns that work into a deck of cards. Give it an address and a UTC day and it cuts the Wheel Arcana, a 22-card deck drawn for this project, at the last stretch of wheel work SqueekCore settled before the day began. You get a card (upright or reversed), an omen, a lucky round, a lucky colour and a "wheel energy" level. Nobody picks the card, including us: change the address, the day or the hamster's history and you get a different one; keep them the same and everyone gets the same one.

Under the reading sits your week: the seven cards for the UTC days ending on the one you picked, each cut by the same rule from its own anchor round. Tap a day to open it. "Save image" prints the card as a 1080 × 1350 PNG (art, name, way up, a one-line reading, the day, the lucky round and colour), and "Post on X" drafts a post with a short line and the permalink. Add a second wallet and the deck reads the pair: how far apart your two cards sit on the wheel, a compatibility score and a ten-minute round to run together.

Open the site with no address and the hamster goes first: the landing turns over Squeektoshi's own card for today, read in full, and a "Now draw yours" button unfolds the form. "The deck" in the header (or `/?deck`) lays out all 22 plates as a gallery, each with its art, its name and the one-line reading for both ways up.

It is a static site. No backend, no build, no keys. The only wallet call is `eth_requestAccounts`, to fill in your address. It never asks for a signature or a transaction, and the image is drawn in your browser and never uploaded.

## How a card is drawn

```
dayKey      = UTC date, "YYYY-MM-DD"
firstRound  = floor((dayStart - genesisTimestamp) / roundDuration) + 1      // 600 s rounds
anchor      = the last ACTIVE round (work > 0) with roundId < firstRound
seed        = keccak256(abi.encodePacked(bytes32 anchor.dataHash, address subject, string dayKey))

card        = seed mod 22
reversed    = seed >> 255                         (the top bit)
luckyRound  = firstRound + ((seed >> 64) mod 144)  (a ten-minute slot of that day)
colour      = (seed >> 128) mod 12
energy      = total work in rounds [firstRound - 144, firstRound - 1], the 24 hours before the day began

week        = the same draw for each of the 7 UTC days ending on dayKey, each with its own anchor
landing     = with no address in the link, the same draw for subject = SqueekCore's own address, today

pair (a second address, same day, same anchor):
distance    = min(|cardA - cardB|, 22 - |cardA - cardB|)          0 = same card, 11 = opposite sides
score       = (11 - distance) * 8 + (same way up ? 12 : 0)        0 to 100
pairSeed    = keccak256(abi.encodePacked(bytes32 lower seed, bytes32 higher seed))
sharedRound = firstRound + ((pairSeed >> 64) mod 144)
```

The anchor is work that was already done before the day started, so a day's cards are fixed once SqueekCore has certified every round before midnight UTC. Settlements land about every ten minutes and trail the wheel by 10 to 20 minutes, so for the first few minutes of a UTC day the page may mark a card **provisional**: it has used the latest round it can see, and if the hamster ran in a round that is not certified yet, the card can still change. The page says so, re-checks on its own, and switches to **sealed** when the frontier passes midnight. On the genesis day (26 Oct 2026) there was no earlier work, so the deck **borrows** the first active round on record (round 45). Days before that have no card, and future days show "the wheel hasn't spoken yet".

The week strip is seven single draws side by side, so a day in the strip is always the card you get by picking that day on its own. Days before 26 Oct 2026 lie face down ("before the wheel"), and if SqueekCore had no settled work at all every day would stay face down with "nothing yet". A provisional day gets a dashed edge. The strip reuses the round list the page already holds, so it costs no extra requests.

The landing card is the "Squeektoshi's own card" draw, made before you ask: the subject is the core address the API names (or the fallback in `js/config.js`) and the day is today in UTC. The address bar stays bare, so a reload or a shared bare link always opens on that day's card. Drawing your own, the button in the form or a day in his week strip turn it into a normal `?a=&d=` reading; changing the date while the form is open keeps it his card, for that date.

The gallery is the same 22 plates as the small deck at the foot of the reading page, laid out as a ruled sheet: numeral and art, the name, then the one-line reading for upright and for reversed (the lines the saved image and the post use). Tap a plate, or tab to it and press Enter, for its full reading and omen; "Draw your card" leads back. The plates are the deck's own constants. The only chain data on that page is the ring around the card currently drawn, with a note saying whose it is (Squeektoshi's, if you came straight to `?deck`).

The pair reading takes the second address's card for the same day and anchor. Distance is counted the short way round the 22-card wheel and falls into five bands, from "Twin spin" (same card) to "Opposite spokes". The pair seed sorts the two seeds first, so it does not matter whose address goes first.

The "How this card was drawn" panel under every reading lists each input: the day and its first round, the anchor round, its `dataHash`, the settlement transaction on sepolia.etherscan.io, the subject address, the seed and the arithmetic for every derived value. With a second wallet it adds that wallet's seed and card, the distance, the score and the shared round. It also prints a node snippet with the card's exact values filled in.

## What it reads from the chain

Everything is read in the browser, straight from public sources:

- **`GET https://api.squeekchain.com/v1/core`** names the live SqueekCore (`identities.core`) and its deployment block. If the API is down, `js/config.js` falls back to `0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44` and block 11998937. (The address in the older docs belongs to a retired deployment.)
- **`eth_getLogs` for `RoundRecorded`** on that core, from the deployment block to the head in 45,000-block chunks. This gives every active round with its work, `cumulativeWork`, `dataHash` and the transaction that settled it. The result is kept in memory and topped up every 90 seconds.
- **`state()`**, read at the same block as the logs (head minus 3, so a lagging RPC node can't hand back half a picture). Its `settledThroughRound` decides sealed versus provisional, and its `cumulativeWork` must equal the last logged round's, or the gap is filled from `roundPage`.
- **`roundPage(afterRound, throughRound, 16)`** is the fallback when log queries fail: it walks the certified history a day at a time and rebuilds the same round list, with per-round work taken from `cumulativeWork` differences. In that mode the settlement transaction comes from one targeted log query on the round's indexed `roundId`.
- **`configuration()`** supplies `genesisTimestamp` and `roundDuration`, so the round maths matches the contract rather than a constant.
- **`GET https://api.squeekchain.com/v1/status`** (polled every 15 s with `If-None-Match`) feeds "Tonight's moon": awake or asleep from `coreStatus`, rpm, km on the wheel today and feed freshness. It is mood only and never changes a card.

The Sepolia RPC is `https://ethereum-sepolia-rpc.publicnode.com`, which allows browser CORS and wide log ranges. Change it in `js/config.js`.

## Check a card yourself

You need node 18 or newer and viem. Save this as `recompute.mjs`. The repo copy, `scripts/recompute.mjs`, is the same code with one addition: run with no arguments it checks the page's own code against this one (see below).

```js
// recompute.mjs: redraw any Squeekscope card, and the week that ends on it, from Sepolia with nothing but viem.
//   npm i viem@2.21.55 && node scripts/recompute.mjs <address> [YYYY-MM-DD]
import { createPublicClient, encodePacked, getAddress, http, keccak256, parseAbiItem } from 'viem';

const CORE = '0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44'; // live SqueekCore proxy (Sepolia)
const GENESIS = 1793022600n; // configuration().genesisTimestamp
const ROUND = 600n; // configuration().roundDuration
const FROM_BLOCK = 11998937n; // core deployment block
const DECK = ['The Hamster', 'The Wheel', 'The Seed', 'The Burrow', 'The Night Shift', 'The Reporter', 'The Magnet', 'The Sprint', 'The Difficulty', 'The Postman', 'The Odometer', 'The Settlement', 'The Nap', 'The Empty Wheel', 'The Water Bottle', 'The Cheek Pouch', 'The Cage Door', 'The Guardian', 'The Midnight Lap', 'The Sunflower', 'The Block', 'The Hoard'];

const client = createPublicClient({ transport: http('https://ethereum-sepolia-rpc.publicnode.com') });
const event = parseAbiItem('event RoundRecorded(uint64 indexed roundId, uint64 work, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)');

async function readRounds(head) {
  const rounds = [];
  for (let from = FROM_BLOCK; from <= head; from += 45000n) {
    const to = from + 44999n < head ? from + 44999n : head;
    const logs = await client.getLogs({ address: CORE, event, fromBlock: from, toBlock: to });
    rounds.push(...logs.map((log) => log.args));
  }
  return rounds.sort((a, b) => (a.roundId < b.roundId ? -1 : 1));
}

function draw(rounds, who, day) {
  const start = BigInt(Date.parse(`${day}T00:00:00Z`) / 1000);
  if (start + 86400n <= GENESIS) return { day, card: 'none: before the wheel' };
  if (start * 1000n > BigInt(Date.now())) return { day, card: 'none: not cut yet' };
  const first = (start - GENESIS) / ROUND + 1n; // first round of the UTC day
  const anchor = rounds.filter((r) => r.roundId < first).at(-1) ?? rounds[0]; // genesis day borrows round one
  if (!anchor) return { day, card: 'none: nothing settled yet' };
  const seed = BigInt(keccak256(encodePacked(['bytes32', 'address', 'string'], [anchor.dataHash, getAddress(who.toLowerCase()), day])));
  const energy = rounds.filter((r) => r.roundId >= first - 144n && r.roundId < first).reduce((sum, r) => sum + r.work, 0n);
  return {
    day,
    anchorRound: anchor.roundId,
    dataHash: anchor.dataHash,
    seed: `0x${seed.toString(16).padStart(64, '0')}`,
    card: `${seed % 22n} ${DECK[Number(seed % 22n)]}`,
    reversed: seed >> 255n === 1n,
    luckyRound: first + ((seed >> 64n) % 144n),
    colour: (seed >> 128n) % 12n,
    energyWork: energy,
  };
}

// The week strip: the same draw for each of the 7 UTC days ending on `day`, each from its own anchor round.
const week = (rounds, who, day) =>
  [6, 5, 4, 3, 2, 1, 0].map((back) => draw(rounds, who, new Date(Date.parse(`${day}T00:00:00Z`) - back * 86400000).toISOString().slice(0, 10)));

const [who, day = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const rounds = await readRounds(await client.getBlockNumber());
console.log(draw(rounds, who, day));
console.table(week(rounds, who, day).map((c) => ({ day: c.day, anchor: c.anchorRound === undefined ? '' : String(c.anchorRound), card: c.card, reversed: c.reversed ?? '' })));
```

```sh
npm i viem@2.21.55
node scripts/recompute.mjs 0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44 2026-10-28
```

For that example (Squeektoshi's own card for 28 Oct 2026) you should see anchor round 197, card `20 The Block`, reversed, lucky round 215, colour 8 (Seed-Stripe Charcoal) and 7548 work. The week under it shows 22 to 25 Oct as "before the wheel", then `4 The Night Shift` from round 45 (the genesis day's borrowed anchor), `0 The Hamster` reversed from round 61, and the same `20 The Block` from round 197. The script reads whatever is settled when you run it, so during the provisional minutes after midnight UTC it can disagree with a card the page has since sealed, and the other way round.

### The self-check

```sh
node scripts/recompute.mjs        # no arguments
```

With no arguments the repo copy checks the page instead of drawing a card. It reads the round history three ways (raw logs as above, then `js/ledger.js` through logs and through its `roundPage()` fallback) and compares them round by round. Then it runs the page's `js/oracle.js` against `draw()` and `week()` for a dozen wallets on every day from three days before genesis to tomorrow: every single card, every slot of every week strip, and every pair reading both ways round. It also checks four rounds you can look up on Etherscan, the example above, and two states the live chain rarely shows (a reporter lagging past midnight, and no settled work at all). Then the gallery (22 plates in deck order, each with two different one-line readings, no line printed twice) and the landing (the core the page resolves through the API is the one this script reads, and the card it shows with no address is `draw()` for that core today). It prints a count per section and exits with code 1 on any mismatch. On 29 Oct 2026 it printed `1092/1092 checks match`; the count grows as days pass.

## Running it

There is nothing to build. Serve the folder with any static file server:

```sh
node scripts/serve.mjs            # http://localhost:5101, no dependencies
# or: npx serve .   /   python -m http.server 5101
```

Opening `index.html` straight from disk will not work, because browsers refuse ES modules over `file://`. The page needs network access to esm.sh (viem, pinned to 2.21.55), Google Fonts, the Sepolia RPC and api.squeekchain.com.

Permalinks look like `/?a=0x…&d=2026-10-28`, with `&b=0x…` added when a second wallet is read. All of them are optional: without `d` you get today (UTC), and without `a` the page opens on Squeektoshi's own card for that day, with the form folded under "Now draw yours". `/?deck` opens the gallery. "Post on X" always shares the single-card link.

## Hosting

It is plain static files, so any static host works.

- **Vercel**: import the repo, framework preset "Other", leave the build command empty and the output directory as the repository root. Vercel will install the one dev dependency (viem, used only by `scripts/recompute.mjs`); the site itself does not need it.
- **GitHub Pages**: Settings, Pages, deploy from a branch, folder `/ (root)`. Relative paths mean it also works from a project subpath like `user.github.io/squeekscope/`.

## Files

```
index.html          markup, the import map that pins viem, the card back, and a few inline lines that pick
                    the layout (gallery or landing) before first paint, so nothing jumps while modules load
css/squeekscope.css the look: ivory stock, ink, oxblood, one flat gold
js/config.js        RPC URL, API base, fallback core address and block, timings
js/oracle.js        the draw: round maths, anchor choice, seed and what it decides, the week, the pair (pure, no network)
js/ledger.js        Sepolia reads: RoundRecorded logs, state(), roundPage() fallback, settlement lookups
js/wire.js          /v1/status polling with ETags, turned into a "moon phase"
js/arcana.js        the 22 cards: words, one-line readings and line art as path data, lucky colours, energy and pair names
js/ink.js           draws a card's art as inline SVG or onto a canvas
js/printer.js       prints the reading onto a 1080 x 1350 canvas for "Save image"
js/app.js           the page, the landing spotlight, the week strip, the pair reading and the ?deck gallery
scripts/serve.mjs   tiny local static server
scripts/recompute.mjs  the stand-alone check above, plus the self-check
```

`js/oracle.js` has no DOM or network code, so node can import it and get exactly the numbers the page shows. That is what the self-check does.

## Caveats

- A card for "today" can be provisional for roughly the first 20 minutes after 00:00 UTC, while the night's last settlements land. The page says so; the snippet above does not.
- The core address comes from the Squeekchain API with a hardcoded fallback. If Squeekchain ever redeploys SqueekCore and the API names the new one, old permalinks would be redrawn against the new history. Fork it and pin `coreFallback` if you want permanence.
- Logs are read 3 blocks behind the head. A deeper Sepolia reorg could briefly change a provisional card; sealed cards depend on rounds settled long before.
- `seed mod 22` and `mod 12` are very slightly uneven (2^256 is not a multiple of 22). The bias is around 10^-76. You will not notice.
- The wheel-energy bands (still, stirring, trotting, running, galloping, full tilt) are our own cut-offs, picked from what a busy night looks like (10,000 to 11,000 work, about 9.7 km of wheel).
- Only injected browser wallets (`window.ethereum`) are supported, and ENS names are not resolved. Pasting an address works everywhere.
- X's post intent carries text and a link, never a file, so "Post on X" can't attach the image. Save it first and add it to the post yourself. Nothing is uploaded: the PNG is drawn on a canvas in your browser and handed straight to your downloads.
- The saved image names the site by the address you opened it from. On a local preview it prints a tagline instead of `localhost`.
- The week strip reads the same in-memory history as the card, so while today is provisional its last card can change too (it has a dashed edge until it is sealed).
- The pair score and its bands are a game we made up on top of the two cards; SqueekCore knows nothing about pairs.
- A bare link always leads with the hamster's card, so a first visit costs the same chain reads as any reading. The card lies face down until the round history arrives (about a second on a good connection, longer when the RPC is slow).
- `?deck` is its own address. Back returns to the reading you came from, but reloading `?deck`, or opening a shared gallery link, starts fresh with Squeektoshi's card behind it.
- It depends on publicnode, esm.sh, Google Fonts and api.squeekchain.com being up. If the live feed is down the reading still works; if the RPC is down, nothing can be drawn and the page says why.
- Sepolia only. SQK on Sepolia is a test token. These cards are a joke with receipts, not financial advice.

## License

MIT. See `LICENSE`.
