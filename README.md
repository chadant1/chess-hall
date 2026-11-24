# Game Hall

A family games room for laptops, tablets and phones: Chess, Checkers, Mancala, Reversi, Wild Cards (with No Mercy rules), Five Dice and Word Tiles. It runs in the browser with nothing to install, and you can add it to a home screen.

**Play it:** https://chadant1.github.io/chess-hall/

Every game has a computer opponent, pass & play on one device, and online play by link or code with no accounts. Each game also has a hints switch, and the other players can always see whether your hints are on and how often you used them.

## Chess

### Ways to play

- **Computer**: the Stockfish engine, with 8 strength levels from Beginner to Grandmaster.
- **Pass & play**: two people on one device, with an option to turn the board after each move.
- **Online**: tap *New game → Online → Create online game* and send the link or code. No accounts or sign-ups. Both players keep the game open while they play, on Wi-Fi or mobile data.

### Move hints you can switch on and off

Each player has a **Move hints** switch on their player card. When it's on, picking up a piece shows the squares it can legally move to. The other player can always see:

- whether your hints are on right now
- how many of your moves were played with hints on (for example "3/12 moves with hints")
- which moves those were: a gold dot in the move list

### Also included

Clocks (1 to 30 minutes, with optional extra time per move), drag or tap to move, every chess rule enforced (castling, en passant, promotion, and all draw rules), animated moves, sounds, 6 board styles, captured pieces with the material score, opening names, stepping back through past moves, undo, takeback and draw offers, rematch with colours swapped, chat, a "best move" suggestion (counts as a hint), an optional bar showing who the computer thinks is winning, arrows and circles drawn with right-click, and copying the game as PGN.

## How online play works

The person who creates a game hosts it. Their browser keeps the game and sends it to the other player over a direct, encrypted browser-to-browser (WebRTC) connection. PeerJS's free public service only introduces the two browsers to each other. No game data is stored on a server.

- If either player closes the page, the game is saved. Opening the same link again picks it up where it left off.
- A few mobile networks block direct connections. If a game won't connect over mobile data, try Wi-Fi.
- To run your own introduction server, start a [PeerJS server](https://github.com/peers/peerjs-server) and open the game with `?broker=yourhost:port`.

## Credits and licences

- Word Tiles word list: [word-list](https://github.com/sindresorhus/word-list) by Sindre Sorhus (MIT), with common bad words removed
- Wild Cards, Five Dice and Word Tiles use original names, artwork, board layout and letter values with classic game rules

- Piece artwork: Colin M.L. Burnett (cburnett), CC BY-SA 3.0 / GPLv2+ / GFDL
- Engine: [Stockfish.js](https://github.com/nmrugg/stockfish.js) 10.0.2 (GPL), source at that link
- Rules: [chess.js](https://github.com/jhlywa/chess.js) 0.13.4 (BSD-2-Clause)
- Connections: [PeerJS](https://github.com/peers/peerjs) 1.5.5 (MIT)
