const Gdax = require('gdax');
const licenses = require('./licenses.js');

supportedExchanges = new SupportedExchanges(['BTC-USD']);
globalOrders = [];
globalData = [];

// The FEED
const websocket = new Gdax.WebsocketClient(
  ['BTC-USD'],
  licenses.sandbox_ws_feed,
  {
    key: licenses.sandbox_key,
    secret: licenses.sandbox_secret,
    passphrase: licenses.sandbox_passphrase,
  },
  { channels: ['user'] }
);


// websocket.unsubscribe({ channels: ['heartbeat'] });
// const websocket = new Gdax.WebsocketClient(['BTC-USD', 'ETH-USD']);


websocket.on('error', err => {
    console.log("error received");
});
websocket.on('close', () => {
    console.log("close received");
});


const authedClient = new Gdax.AuthenticatedClient(
  licenses.sandbox_key,
  licenses.sandbox_secret,
  licenses.sandbox_passphrase,
  licenses.sandbox_URL
);

// function uuidv4() {
//   return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
//     var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
//     return v.toString(16);
//   });
// }

function OrderMaker(authedClient) {
    this.gdaxAuthedClient = authedClient;
    this.placeOrder = function (orderParams, orderCallback) {
        // console.log("orderParams: ", orderParams);
        // console.log("orderCallback: ", orderCallback);
        this.gdaxAuthedClient.placeOrder(orderParams, orderCallback);
    }
    //Pull data from GDAX about the exchange rates of all coins
    this.initializeGDAXOrder = function (trade) {
        supportedExchanges.markIncomplete();
        this.gdaxAuthedClient.getProducts(
            (error, response, book) => {
                for (i = 0; i < supportedExchanges.exchanges.length; i++) {
                    this.gdaxAuthedClient.getProductOrderBook(
                        supportedExchanges.exchanges[i].name,
                        (error, response, book) => {
                            if(error)
                                console.log("Got an error: ", error);
                            if(!book.bids || !book.asks)
                            {
                                supportedExchanges.markIncomplete();
                                globalData["initializeNewTrade"] = true;                          
                                return;
                            }                            
                            var exchange = getExchangeFromResponse(response, supportedExchanges.exchanges);
                            supportedExchanges.insertBidAndAsk(exchange, book.bids[0][0], book.asks[0][0]);
                            console.log('. . . . b: ', book.bids[0][0], " — a: ", book.asks[0][0]);
                            // console.log("globalData ", globalData);
                            // console.log("globalOrders ", globalOrders);
                            if(supportedExchanges.checkIfComplete() && trade)
                            {
                                console.log("Logging trade!");
                                this.tradeAccounts();
                            }
                        }                        
                    );
                }    
            }
        ); 
    }
    //Pull data from GDAX about my user account    
    this.tradeAccounts = function () {
        this.gdaxAuthedClient.getAccounts(
            (error, response, book) => {
                // for (var i = 0; i < book.length; i++) {
                //     var val = book[i].available;
                //     var coin = book[i].currency;
                //     this.account[coin] = val;
                // }

                var maxVal = -1, maxCoin;
                for (var i = 0; i < book.length; i++) {
                    if(maxVal < book[i].available)
                    {
                        maxVal = book[i].available;
                        maxCoin = book[i].currency;
                    }
                }
                this.accountCoin = maxCoin;
                this.accountValue = maxVal;
                
                var x = "BTC-USD";                
                var xObj = supportedExchanges.getExchangeFromName(x);
                this.endCoin = xObj.getPairedCoin(this.accountCoin);

                console.log("endCoin: ", this.endCoin);
                var side;
                if(getFirstCoinOfExchange(x) == this.accountCoin)
                    side = "sell";
                else
                    side = "buy";
                
                var price = side == "buy" ? xObj.bid : xObj.ask;
                var size;
                if(this.accountCoin == xObj.baseCoin)
                {
                    var rate = xObj.ask;                    
                    size = this.accountValue;
                }
                else
                {
                    var rate = xObj.bid;                 
                    size = floorPrecision(this.accountValue / price, 0.00000001);
                }
                

                var orderParams = {
                    side: side,
                    price: price.toString(),
                    size: size.toString(),
                    product_id: x,
                    post_only: 'true',
                    // client_oid: uuidv4()
                };

                // Both of these things are necessary to trigger a real trade
                globalOrders.unshift(orderParams);
                globalData["sendNewTradeToGDAX"] = true;
            }
        );        
    }
} 


var orderCallback = function(err, response, data){
    console.log("Order callback: ", data);
    if(data.status != "rejected" && data.id != undefined)
        globalData["orderCallbackData"] = data;
    else
        globalData["initializeNewTrade"] = true;
};
var completeOrder = function() {
    console.log("ORDER PARAMS: ", globalOrders[0]);
    testOrderer.placeOrder(globalOrders[0], orderCallback)
};


// ************************************************************************//
// ******************   This gets everything started   ********************//
// ************************************************************************//
testOrderer = new OrderMaker(authedClient);
globalData["initializeNewTrade"] = true;
// ************************************************************************//
// ************************************************************************//


orderTimer = setInterval(function () {
    if(globalData["cancelOrder"])
    {
        globalData["cancelOrder"] = false;
        var orderID = globalData["orderCallbackData"].id;
        globalData = [];        
        testOrderer.gdaxAuthedClient.cancelOrder(orderID, function (err, response, data) {
            console.log("CANCELED");
            console.log("Canceled data: ", data);
            globalData["initializeNewTrade"] = true;
        });
    }

    if(globalData["sendNewTradeToGDAX"])
    {
        globalData["sendNewTradeToGDAX"] = false;
        // clearInterval(orderTimer);
        completeOrder();    
        globalData["order"] = globalOrders[0];    
    } else if(globalData["initializeNewTrade"])
    {
        globalOrders = [];
        globalData = [];
        globalData["initializeNewTrade"] = false;   
        setTimeout( function () {
            testOrderer.initializeGDAXOrder(true); //true = trade after pulling data
        }, 200);
    } else {
        bidAskFunc();
    }
}, 1000);


bidAskFunc = function () {
    testOrderer.initializeGDAXOrder(false);
    var price, side, x;
    if(globalData["order"]) // this is order data sent back from GDAX
    {
        side = globalData["order"].side;
        price = globalData["order"].price;
        x = globalData["order"].product_id;
        x = supportedExchanges.getExchangeFromName(x);
    }
    if(globalData["open"]) // my open order, as reported by GDAX
    {
        var slippage = false;
        var triedToCancel = false;
        // console.log("open time: ", Date.now() - globalData["openTime"].getTime());
        //Gather data so I can see if the bid or ask has slipped away from my order
        if(price && x && side)
        {
            // var bidOrAsk;
            if(side == "buy")
            {
                // bidOrAsk = "bid";
                if(x.bid > Number(price))
                    slippage = true;
                // console.log("price: ", price, " and bid: ", x.bid);                
            }
            else
            {
                // bidOrAsk = "ask";
                if(x.ask < Number(price))
                    slippage = true;
                // console.log("price: ", price, " and ask: ", x.ask);                
            }
        }
        if(slippage && !triedToCancel)
        {
            triedToCancel = true;
            console.log("WHOA WHOA WHOA!!! Slippage my man. Slippage.")
            globalData["cancelOrder"] = true;
        }
    }
    if(globalData["done"]) // GDAX has reported that my order is complete
    {
        globalData["initializeNewTrade"] = true;
        // price, side, x = undefined;
        // globalData = [];
    }
    // if(globalData.length == 0)
    // {
    //     //Trade again!
    //     setTimeout( function () {
    //         console.log("Trying to order again.");
            // testOrderer.initializeGDAXOrder(true); //true = trade after pulling data
    //     }, 1500);        
    // }
};



websocket.on('message', data => {   
    if(data.type != "heartbeat") 
    {
        console.log("message received ", data);
        globalData[data.type] = true
        if(data.type == "open")
            globalData["openTime"] = new Date(data.time);
    }

});















//**********************************************************************************
//SELL
//************************************************************************************

function PathFinder(startCoin, endCoin) {
    this.startCoin = startCoin;
    this.endCoin = endCoin;
    this.pathLevels = [];
    this.completedPaths = [];
    this.doIt = function () {
        this.initializePathLevels();
        this.constructPathLevels();
        this.calculateFullPaths();
    }    
    this.initializePathLevels = function () {
        this.pathLevels = [];
        this.pathLevels.push(supportedExchanges.getExchangeObjectsWithCoin(startCoin));
    }
    this.constructPathLevels = function () {
        //Get the most recent level (an array of exchanges at that step in the path)
        var lastIndex = this.pathLevels.length - 1;
        var currentLevel = this.pathLevels[lastIndex];
        //Iterate through all of the exchanges, set parent and child exchanges
        var allNextLevelXs = [];
        for (var i = 0; i < currentLevel.length; i++) {
            var x = currentLevel[i];
            var currentCoin = x.tracePathForCurrentCoin(this.startCoin);
            //I have the current coin. Get the "paired" coin on the exchange
            var pairedCoin = x.getPairedCoin(currentCoin, x);
            if(pairedCoin != endCoin)
            {
                //Find all potential child exchanges
                var potentialNextLevelXs = supportedExchanges.getExchangeObjectsWithCoin(pairedCoin);
                var validatedNextLevelXs = [];
                //Loop deletes any Xs that immediately backtrack
                for (var j = 0; j < potentialNextLevelXs.length; j++) {
                    var thisChild = potentialNextLevelXs[j]; 
                    if(x.name != thisChild.name)
                    {
                        thisChild.setParent(x); //This is how I track the paths among the nested arrays
                        validatedNextLevelXs.push(thisChild);
                    }
                }
                allNextLevelXs = allNextLevelXs.concat(validatedNextLevelXs);                
            }
        }
        if(allNextLevelXs.length > 0)
        {
            this.pathLevels.push(allNextLevelXs);
            this.constructPathLevels();
        }
    }
    this.printPathLevels = function () {
        for (var h = 0; h < this.pathLevels.length; h++) {
            console.log("********** Level ", h, " ************");
            for (var i = 0; i < this.pathLevels[h].length; i++) {
                var x = this.pathLevels[h][i];
                var parent = x.link.parent.name;
                var children = [];
                for (var j = 0; j < x.link.children.length; j++) {
                    children.push(x.link.children[j].name);
                }
                console.log(parent, "<==== ", this.pathLevels[h][i].name, " =====> ", children);
            }
        }
    }
    this.printFullPaths = function () {
        for (var f = 0; f < this.completedPaths.length; f++) {
            var tempPath = [];
            for (var i = 0; i < this.completedPaths[f].length; i++) {
                 tempPath.push(this.completedPaths[f][i].name);
            }
            console.log(tempPath);
        }
    }
    this.calculateFullPaths = function () {
        // work backwards, finding all exchanges with no children
        var noChildrenXs = [];
        for (var h = this.pathLevels.length - 1; h >= 0; h--) {
            for (var j = 0; j < this.pathLevels[h].length; j++) {
                if(this.pathLevels[h][j].link.children.length == 0)
                    noChildrenXs.push(this.pathLevels[h][j]);
            }
        }
        for (var i = 0; i < noChildrenXs.length; i++) {
            var x = noChildrenXs[i];
            var runningPath = [];
            while(x)
            {
                runningPath.unshift(x);
                x = x.link.parent;
            }
            this.completedPaths.push(runningPath);
        }
    }
    this.doIt();
}

function PathLinks(parentObject) {
    this.parent = parentObject;
    this.children = [];
}

function Exchange(name, parentLink = 0, bid = 0, ask = 0) {
    this.name = name;
    this.baseCoin = getFirstCoinOfExchange(name);
    this.quoteCoin = getSecondCoinOfExchange(name);    
    this.bid = bid;
    this.ask = ask;
    switch(this.quoteCoin) 
    {
    case "BTC":
        this.quoteMinIncrement = 0.00001;
        break;
    case "USD":
    default:
        this.quoteMinIncrement = 0.01;    
        break;
    }
    switch(this.baseCoin) 
    {
    case "BTC":
    case "BCH":
        this.takerFee = 0.0025;
        break;
    case "ETH":
    case "LTC":
    default:
        this.takerFee = 0.0030;
        break;
    }    
    // Link data to facilitate create paths later
    this.link = new PathLinks(parentLink);
    this.getPairedCoin = function (currentCoin)
    {
        if(this.baseCoin == currentCoin)
            return this.quoteCoin;
        else if(this.quoteCoin == currentCoin)
            return this.baseCoin;
        else
            return false;
    }
    this.tracePathForCurrentCoin = function (startCoin)
    {
        // Go all the way to the original parent, caching the path
        var path = [];
        path.push(this);
        var tempMe = this;
        var tempParent = tempMe.link.parent;
        while (tempParent) 
        {
            tempMe = tempParent;
            tempParent = tempMe.link.parent;
            path.unshift(tempMe);
        }
        var runningCurrentCoin = startCoin;
        for (var i = 0; i < path.length - 1; i++) {
            runningCurrentCoin = path[i].getPairedCoin(runningCurrentCoin);
        }
        return runningCurrentCoin;
    }
    this.setParent = function (parent)
    {
        this.link.parent = parent;
        parent.setChildAfterCheckingForDupes(this);
    }
    this.setChildAfterCheckingForDupes = function(child)
    {
        var duplicates = false;
        for (var i = 0; i < this.link.children.length; i++)
        {
            if(this.link.children[i].name == child.name)
            {
                duplicates = true;
                break;
            }
        }
        if(!duplicates)
            this.link.children.push(child);
    } 
    this.exchangeCurrency = function(currency, value)
    {
        var exchangeName = this.name;
        if(currency == this.quoteCoin)
        {
            //quote coin == currency
            var newValue = floorPrecision(value, this.quoteMinIncrement);
            var rate = this.bid;
            // console.log(exchangeName, ": buying ", newValue / rate, " ", this.baseCoin, " with ", newValue, currency, " at a rate of " , rate, ". (Ask rate is ", this.ask, ").");        
            // console.log("... lost dust = ", value - newValue);        
            return [this.baseCoin, (newValue / rate) * (1 - this.takerFee)];
        } else //currency == this.baseCoin
        {
            var rate = this.ask;
            var otherValue = value * rate;
            var truncatedOtherValue = floorPrecision(otherValue, this.quoteMinIncrement);
            //Adjust value now
            value = truncatedOtherValue / rate;
            // console.log(exchangeName, ": selling ",  value, currency, " for ", truncatedOtherValue, " ", this.quoteCoin, " at a rate of ", rate, ". (buy rate is ", this.bid, ")."); 
            // console.log("... lost dust = ", otherValue - truncatedOtherValue);
            return [this.quoteCoin, truncatedOtherValue * (1 - this.takerFee)];        
        }
    };
}

function SupportedExchanges(supportedExchangesArray) {
    this.exchanges = [];
    this.exchangesUpdated = [];
    for (var i = 0; i < supportedExchangesArray.length; i++) {
        var ex = new Exchange(supportedExchangesArray[i]);
        this.exchanges.push(ex);
    };
    this.insertBidAndAsk = function (exchange, bid, ask) {
        for (var i = 0; i < this.exchanges.length; i++) {
            if (this.exchanges[i].name == exchange.name) 
            {
                this.exchanges[i].bid = bid;
                this.exchanges[i].ask = ask;
            }
        }
        this.exchangesUpdated.push(i);
    },
    this.markIncomplete = function () {
        this.exchangesUpdated = [];
    },
    this.checkIfComplete = function () {
        if(this.exchangesUpdated.length == this.exchanges.length)
            return true;
        return false;
    },    
    this.getExchangeObjectsWithCoin = function(coin) {
        var returnArray = [];
        for (var i = 0; i < this.exchanges.length; i++) {
            if(this.exchanges[i].name.includes(coin))
            {
                var thisX = this.exchanges[i];
                var tempX = new Exchange(thisX.name, thisX.link.parent, thisX.bid, thisX.ask);
                returnArray.push(tempX);           
            }
        }
        return returnArray;
    }
    this.getExchangeObjectWithTwoCoins = function (coin1, coin2) {
        for (var i = 0; i < this.exchanges.length; i++) {
            if(this.exchanges[i].name.includes(coin1) && this.exchanges[i].name.includes(coin2))
            {
                var thisX = this.exchanges[i];
                var tempX = new Exchange(thisX.name, thisX.link.parent, thisX.bid, thisX.ask);
                return tempX;
            }
        }
        return false;        
    }
    this.getExchangeFromName = function(name) {
        for (var i = 0; i < this.exchanges.length; i++) {
            if(this.exchanges[i].name == name)
                return this.exchanges[i];
        }
    }
    this.exchangeCoinForCoin = function (value, startCoin, goalCoin)
    {
        var x = this.getExchangeObjectWithTwoCoins(startCoin, goalCoin);
        // console.log(x, startCoin, goalCoin);
        return x.exchangeCurrency(startCoin, value)[1];
    }    
}


//Helper Functions
function floorPrecision(value, precision)
{
    return Math.floor(value / precision) * precision;
}

function ceilPrecision(value, precision)
{
    return Math.ceil(value / precision) * precision;
}

function getFirstCoinOfExchange(exchange)
{
    return exchange.substr(0,3);
}

function getSecondCoinOfExchange(exchange)
{
    return exchange.substr(4,3);
}

function getExchangeFromResponse(response, exchanges)
{
    // console.log(response.socket._httpMessage.path);
    var pathOfGdaxExchange = response.socket._httpMessage.path;
    for (var i = 0; i < exchanges.length; i++) {
        if(pathOfGdaxExchange.includes(exchanges[i].name))
            return exchanges[i];
    }
    return "ERROR - couldn't grab exchange from GDAX api response";
}


// // LIMIT ORDERS
// const params = {
//   side: 'sell',
//   price: '96.66', // USD
//   size: '0.1', // BTC
//   product_id: 'BTC-USD',
//   post_only: 'true',
//   client_oid: ''
// };
// authedClient.placeOrder(params, orderCallback);

// MARKET ORDERS
// Buy 1 BTC @ 100 USD
// const buyParams = {
//   price: '100.00', // USD
//   size: '1', // BTC
//   product_id: 'BTC-USD',
// };
// authedClient.buy(buyParams, orderCallback);

// Sell 1 BTC @ 110 USD
// const sellParams = {
//   price: '110.00', // USD
//   size: '1', // BTC
//   product_id: 'BTC-USD',
//   post_only: 'true',
// };
// authedClient.sell(sellParams, orderCallback);
