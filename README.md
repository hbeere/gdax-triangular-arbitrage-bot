# gdax-triangular-arbitrage-bot
My gdax experiments creating a bot that can perform triangular arbitrage, hoping to place all orders as a "maker" in order to avoid fees and make the small profits possible.

To run:

(1) create your own private licenses.js and add your gdax api codes and site URLs like this:
exports.passphrase = "pass"
exports.secret = "garbageAF093N8PVAIW4O8FNU3Q3RTQJ9823PF"
exports.key = "GARBAGEadsjfklasdf"
exports.URL = "https://api.gdax.com"
exports.ws_feed = "wss://ws-feed.gdax.com"

put this file in the same folder as trader.js

(2) type "node trader.js" to run in Terminal

All this does right now is calculate triangular arbitrage paths in gdax and print out the monetary results of all paths. All paths lead from USD back to USD. 

The code now is in development, and is hard-coded for use by me, in my current situation. Since I only have $15 in crypto on gdax, I need to trade my entire account in order to be comfortably above the minimum trade limits. So the first thing this code does (as of now, 2-4-2018), is pull the user's account information, and look for which coin has the highest value (whether USD, or BTC or ETH, etc). The reason is that, in my case, that coin will hold the entirety of my account value.

If it finds that my account is entirely in BTC, it will calculate the current value in USD and then proceed to look for paths that increase the USD value.

The bot does not currently make trades.




This project depends on gdax-node, found here: https://github.com/coinbase/gdax-node