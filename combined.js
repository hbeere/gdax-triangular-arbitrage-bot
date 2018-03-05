const Gdax = require('gdax');
const licenses = require('./licenses.js');
const useSandbox = false;

if(!useSandbox)
{
    licenseKey = licenses.key;
    licenseSecret = licenses.secret;
    licensePassphrase = licenses.passphrase;
    licenseURL = licenses.URL;   
    wsFeed = licenses.ws_feed;
} else
{
    licenseKey = licenses.sandbox_key;
    licenseSecret = licenses.sandbox_secret;
    licensePassphrase = licenses.sandbox_passphrase;
    licenseURL = licenses.sandbox_URL;  
    wsFeed = licenses.sandbox_ws_feed;
}

// **************************************************************************************//
// ***************************   This gets everything started   *************************//
// **************************************************************************************//
// ***************************//
// ****  Global Variables  ***//
// ***************************//

// Authorize the API client
const authedClient = new Gdax.AuthenticatedClient(
    licenseKey,
    licenseSecret,
    licensePassphrase,
    licenseURL  
);

// Create the object storing info about the supported exchanges
if(useSandbox)
    supportedExchanges = new SupportedExchanges(['BTC-USD', 'ETH-USD', 'ETH-BTC', 'LTC-USD'], authedClient);
else {
    supportedExchanges = new SupportedExchanges(['BTC-USD', 'BCH-BTC', 'BCH-USD', 'ETH-BTC', 'ETH-USD', 'LTC-BTC', 'LTC-USD'], authedClient);
}

// Global object storing the one order that should exist at a time
// When empty, another order can be made
globalOrders = [];

// Global object storing all sorts of relevant data about the current global order
// This data object is regularly cleared, so never expect data to persist
globalCurrentStatus = [];

// ***********************************//
// ******   Makes actual trades  *****//
// ***********************************//

// This object executes orders over the authorized API client
makerOfOrders = new OrderMaker(authedClient, true); //true = simulated trades
// Fake a different currency for testing
makerOfOrders.accountCoin = "USD";
makerOfOrders.accountValue = 20;


// This object creates and stores the PathFinder object, and manages choosing and traversing the path
arbitrager = new GDAXTriangularArbitrager(makerOfOrders);

// Event loop watches for this flag to start pulling data and making trades
globalCurrentStatus["checkExchangesToTrade"] = false;


// **********************//
// *****   the FEED  ****//
// **********************//
const websocket = new Gdax.WebsocketClient(
  supportedExchanges.exchangesAsTextArray,
  wsFeed,
  {
    key: licenseKey,
    secret: licenseSecret,
    passphrase: licensePassphrase,    
  },
  { channels: ['user', 'ticker'] }
);

websocket.on('message', data => {   
    if(data.type == "ticker")
    {
        // console.log("ticker received");
        // console.log(data.product_id, " bid: ", data.best_bid, " and ask: ", data.best_ask);
        supportedExchanges.insertBidAndAsk(data.product_id, Number(data.best_bid), Number(data.best_ask));
    } else if (data.type == "heartbeat")
    {
        // console.log("heartbeat is ", data);
    } else
    {
        console.log("message received ", data);
        globalCurrentStatus[data.type] = true
        if(data.type == "open")
            globalCurrentStatus["openTime"] = new Date(data.time);
    }

});





var orderCallback = function(err, response, data){
    console.log("Order callback: ", data);
    if(data.status != "rejected" && data.id != undefined)
        globalData["orderCallbackData"] = data;
    else
        globalData["initializeNewTrade"] = true;
};

// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————- Main Event Loop -———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
timerCounter = -1;
orderTimer = setInterval(function () {
    // console.log("supportedExchanges.checkIfComplete() ", supportedExchanges.checkIfComplete());
    process.stdout.write(" *_* ");
    timerCounter++;
    if(globalCurrentStatus["cancelOrder"])
    {
        globalCurrentStatus["cancelOrder"] = false;
        var orderID = globalCurrentStatus["orderCallbackData"].id;
        globalCurrentStatus = [];        
        makerOfOrders.gdaxAuthedClient.cancelOrder(orderID, function (err, response, data) {
            console.log("CANCELED");
            console.log("Canceled data: ", data);
            // After cancelling order, create a new trade immediately
            globalCurrentStatus["checkExchangesToTrade"] = true;
        });
    }

    if(globalCurrentStatus["sendNewTradeToGDAX"])
    {
        globalCurrentStatus["sendNewTradeToGDAX"] = false;
        globalCurrentStatus["order"] = globalOrders[0];  
        console.log("ORDER PARAMS: ", globalOrders[0]);
        makerOfOrders.placeOrder(globalOrders[0], orderCallback);   
    } else if(globalCurrentStatus["checkExchangesToTrade"])
    {
        globalOrders = [];
        globalCurrentStatus = [];
        globalCurrentStatus["checkExchangesToTrade"] = false;   
        setTimeout( function () {
            makerOfOrders.checkExchangesToTrade();
        }, 200);
    } else {
        // This asynchronously updates all Exchanges, too
        checkOrderStatus();
        if(globalCurrentStatus['pullPersonalAccountData'])
        {
            globalCurrentStatus['pullPersonalAccountData'] = false;
            if(globalCurrentStatus['pullPersonalAccountInProgress'] != true)
                makerOfOrders.pullPersonalAccountData(); //
        } else {
            if(timerCounter % 5 == 0 && supportedExchanges.checkIfComplete())
            {
                arbitrager.createPaths();
            }
        }
    }
}, 500);
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//
// ———————————————--———————————————--———————————————--———————————————--———————————————--—//



// Order status so far includes (1) slippage and (2) if it's done
checkOrderStatus = function () {
    // console.log("checkOrderStatus() called");
    var price, side, x;
    if(globalCurrentStatus["order"]) // this is order data sent back from GDAX
    {
        side = globalCurrentStatus["order"].side;
        price = globalCurrentStatus["order"].price;
        x = globalCurrentStatus["order"].product_id;
        x = supportedExchanges.getExchangeFromName(x);
    }
    if(globalCurrentStatus["open"]) // my open order, as reported by GDAX
    {
        var slippage = false;
        var triedToCancel = false;
        // console.log("open time: ", Date.now() - globalCurrentStatus["openTime"].getTime());
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
            globalCurrentStatus["cancelOrder"] = true;
        }
    }
    if(globalCurrentStatus["done"]) // GDAX has reported that my order is complete
    {
        globalCurrentStatus["done"] = false;
        globalCurrentStatus["checkExchangesToTrade"] = true;
    }
};


function GDAXTriangularArbitrager(orderMakerObj) {
    this.orderMakerObj = orderMakerObj;
    this.pathResults = [];
    // this.pathFinder; // This is declared in createPaths()

    this.createPaths = function () {
        if(this.orderMakerObj.accountCoin && this.orderMakerObj.accountValue)
        {
            if(this.pathFinder)
                this.pathFinder.doIt(this.orderMakerObj.accountCoin, "USD");
            else
                this.pathFinder = new PathFinder(this.orderMakerObj.accountCoin, "USD");
        } else
        {
            globalCurrentStatus['pullPersonalAccountData'] = true;
        }

        if(this.pathFinder)
        {
            this.calculatePathResults();
        }
    };

    //This happens last, after pulling all data from GDAX
    //It calculates the difference in price if the money is exchanged through the path
    this.calculatePathResults = function () {
        var runningValue = this.orderMakerObj.accountValue;  
        var runningCurrency = this.orderMakerObj.accountCoin;
        this.pathResults = [];
        for (var i = 0; i < this.pathFinder.completedPaths.length; i++) {
            for (var j = 0; j < this.pathFinder.completedPaths[i].length; j++) {
                var xName = this.pathFinder.completedPaths[i][j].name;
                // I need to do this because I copy the exchange objects out of the
                // "supportedExchanges" internal array, and so my exchange objects don't
                // have the bid/ask data.
                // Even if they did have that data, it would get outdated very quickly.
                // Therefore I reference the master supportedExchanges object to get that data
                var xWithBidAsk = supportedExchanges.getExchangeFromName(xName);
                var returnArray = xWithBidAsk.exchangeCurrency(runningCurrency, runningValue);
                runningCurrency = returnArray[0];
                runningValue = returnArray[1];
                // console.log("[runningCurrency, runningValue] = ", [runningCurrency, runningValue]);
            }
            this.pathResults.push(runningValue);
            runningValue = this.orderMakerObj.accountValue;
            runningCurrency = this.orderMakerObj.accountCoin;
        }  

        //I've calculated the paths in terms of endCoin. 
        //Now convert what I HAVE already into terms of endCoin.
        this.orderMakerObj.accountValueInTermsOfEndCoin = this.orderMakerObj.accountValue;
        if(this.orderMakerObj.accountCoin != this.pathFinder.endCoin)
            this.orderMakerObj.accountValueInTermsOfEndCoin = supportedExchanges.exchangeCoinForCoin(this.orderMakerObj.accountValue, this.orderMakerObj.accountCoin, this.pathFinder.endCoin);

        // console.log(this.orderMakerObj.accountValue);
        // console.log(this.orderMakerObj.accountCoin);
        // console.log(this.pathFinder.endCoin);
        // console.log(this.orderMakerObj.accountValueInTermsOfEndCoin);
        // PRINT YOUR RESULTS    
        console.log("**********");
        for (var i = 0; i < this.pathResults.length; i++) {
            var path = this.pathFinder.completedPaths[i];
            var pathArray = [];
            for (var j = 0; j < path.length; j++) {
                pathArray.push(path[j].name);
            }
            var delta = this.pathResults[i] - this.orderMakerObj.accountValueInTermsOfEndCoin
            console.log(delta, " -> ", pathArray);
            // console.log("path result ", i, " is ", this.pathResults[i]);
        }
    }
}





function OrderMaker(authedClient, simulateTrades) {
    this.gdaxAuthedClient = authedClient;
    this.simulateTrades = simulateTrades;
    this.placeOrder = function (orderParams, orderCallback) {
        if(this.simulateTrades)
        {
            // var orderParams = {
            //     side: side,
            //     price: price.toString(),
            //     size: size.toString(),
            //     product_id: x,
            //     post_only: 'true',
            // };           
            console.log("_______________________");
            console.log("Simulated Trade Result:");
            console.log("Used to have ", this.accountValue, " of ", this.accountCoin);

            var xObj = supportedExchanges.getExchangeFromName(orderParams.x);
            var pairedCoin = xObj.getPairedCoin(this.accountCoin);
            this.accountValue = supportedExchanges.exchangeCoinForCoin(Number(orderParams.size), this.accountCoin, pairedCoin);
            this.accountCoin = pairedCoin;
            setTimeout(function () {
                // globalCurrentStatus["checkExchangesToTrade"] = true;
                console.log("************************");
                console.log("SIMULATED TRADE COMPLETE");
                console.log("Shall we trade again?");
                console.log("************************");
            }, 1000);

            console.log("I now have ", this.accountValue, " of ", this.accountCoin);
            console.log("_______________________");
        } else {
            var orderCallback = function(err, response, data){
                console.log("Order callback: ", data);
                if(data.status != "rejected" && data.id != undefined)
                    globalCurrentStatus["orderCallbackData"] = data;
                else
                    globalCurrentStatus["checkExchangesToTrade"] = true;
            };                    
            this.gdaxAuthedClient.placeOrder(orderParams, orderCallback);    
        }
        // console.log("orderParams: ", orderParams);
        // console.log("orderCallback: ", orderCallback);
    }
    //Pull data from GDAX about the exchange rates of all coins
    this.checkExchangesToTrade = function () {
        if(trade && supportedExchanges.checkIfComplete())
        {
            console.log("Logging trade!");
            this.tradeAccounts();
        }
    }
    this.pullPersonalAccountData = function () {
        globalCurrentStatus['pullPersonalAccountInProgress'] = true;
        // console.log("**********pulling personal account data");
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

                this.realAccountCoin = maxCoin;
                this.realAccountValue = maxVal;

                if(!this.accountCoin || !this.simulateTrades)
                {
                    this.accountCoin = this.realAccountCoin;
                    this.accountValue = this.realAccountValue;
                }
                // console.log("this.accountCoin: ", this.accountCoin);
                // console.log("this.accountValue: ", this.accountValue);
                // globalCurrentStatus = [];
            }
        );
    }
    //Trade after pulling data from my GDAX user account    
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

                this.realAccountCoin = maxCoin;
                this.realAccountValue = maxVal;

                if(!this.accountCoin || !this.simulateTrades)
                {
                    this.accountCoin = this.realAccountCoin;
                    this.accountValue = this.realAccountValue;
                }

                // this.accountValueInTermsOfEndCoin can't be set yet. Wait until supportedExchanges is complete

                // FIXME This exchange info needs to be dynamic
                var x = "BTC-USD";                
                var xObj = supportedExchanges.getExchangeFromName(x);
                var pairedCoin = xObj.getPairedCoin(this.accountCoin);

                // console.log("pairedCoin: ", this.pairedCoin);
                var side;
                if(getFirstCoinOfExchange(x) == this.accountCoin)
                    side = "sell";
                else
                    side = "buy";
                
                var price = side == "buy" ? xObj.bid : xObj.ask;
                var size;
                if(this.accountCoin == xObj.baseCoin)
                    size = this.accountValue;
                else
                    size = floorPrecision(this.accountValue / price, 0.00000001);
                
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
                globalCurrentStatus["sendNewTradeToGDAX"] = true;
            }
        );        
    }
} 













//**********************************************************************************
//SELL
//************************************************************************************

function PathFinder(startCoin, endCoin) {
    this.startCoin = startCoin;
    this.endCoin = endCoin;
    this.pathLevels = [];
    this.completedPaths = [];
    this.doIt = function (startCoin, endCoin) {
        this.startCoin = startCoin;
        this.endCoin = endCoin;
        // console.log("this.startCoin: ", this.startCoin);
        // console.log("this.endCoin: ", this.endCoin);
        this.initializePathLevels();
        this.constructPathLevels();
        this.calculateFullPaths();
        // this.printFullPaths();
    }    
    this.initializePathLevels = function () {
        this.completedPaths = [];
        this.pathLevels = [];
        this.pathLevels.push(supportedExchanges.getExchangeObjectsWithCoin(startCoin));
        // console.log("initialize: ... pathLevels are ", this.pathLevels);
    }
    this.constructPathLevels = function () {
        //Get the most recent level (an array of exchanges at that step in the path)
        var lastIndex = this.pathLevels.length - 1;
        var currentLevel = this.pathLevels[lastIndex];
        // this.printPathLevels();
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
            console.log("tempPath ", f, ": ", tempPath);
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
        // I have all exchanges with no children, which means each is an endpoint goal of a path
        // Follow links backwards through parents
        // constructing the paths by tacking them on to the front with unshift()
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
    this.doIt(this.startCoin, this.endCoin);
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
        this.takerFee = 0;//0.0025;
        break;
    case "ETH":
    case "LTC":
    default:
        this.takerFee = 0;//0.0030;
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

function SupportedExchanges(supportedExchangesArray, authedClient) {
    this.gdaxAuthedClient = authedClient;
    this.exchangesAsTextArray = supportedExchangesArray;
    this.exchanges = [];
    for (var i = 0; i < supportedExchangesArray.length; i++) {
        var ex = new Exchange(supportedExchangesArray[i]);
        this.exchanges.push(ex);
    };
    this.insertBidAndAsk = function (exchange, bid, ask) {
        if(typeof(exchange) != "string")
            exchange = exchange.name;
        for (var i = 0; i < this.exchanges.length; i++) {
            if (this.exchanges[i].name == exchange) 
            {
                if(bid > 0)
                    this.exchanges[i].bid = bid;
                if(ask > 0)
                    this.exchanges[i].ask = ask;
                break;
            }
        }
    },
    this.checkIfComplete = function () {
        for (var i = 0; i < this.exchanges.length; i++) {
            if (this.exchanges[i].bid <= 0 || this.exchanges[i].ask <= 0) 
                return false;
        }
        return true;
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
    this.pullCoinDataFromGDAX = function () {
        this.gdaxAuthedClient.getProducts(
            (error, response, book) => {
                for (i = 0; i < this.exchanges.length; i++) {
                    var delayedFunc = function (supportedExchangeOBJECT, xName) {
                        supportedExchangeOBJECT.gdaxAuthedClient.getProductOrderBook(
                            xName,
                            (error, response, book) => {
                                if(error)
                                    console.log("Got an error: ", error);
                                var exchange = getExchangeFromResponse(response, supportedExchanges.exchanges);
                                // console.log("pullCoinDataFromGDAX book: ", book);
                                supportedExchangeOBJECT.insertBidAndAsk(exchange, book.bids[0][0], book.asks[0][0]);
                            }                        
                        );
                    }
                    // delay each iteration because GDAX doesn't like too many requests too quickly
                    setTimeout(delayedFunc, (i + 1) * 250, this, this.exchanges[i].name);
                }    
            }
        ); 
    }
    this.pullCoinDataFromGDAX();   
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
