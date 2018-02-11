const Gdax = require('gdax');
const licenses = require('./licenses.js');

const authedClient = new Gdax.AuthenticatedClient(
  licenses.key,
  licenses.secret,
  licenses.passphrase,
  licenses.URL
);

//***********************************
//Define supported exchanges object and the arbitrager object
supportedExchanges = new SupportedExchanges(['BTC-USD', 'BCH-BTC', 'BCH-USD', 'ETH-BTC', 'ETH-USD', 'LTC-BTC', 'LTC-USD']);

arbitrager = new GDAXTriangularArbitrager(authedClient);


//****************************************************************************************************
// Creating this object is asynchronous, since it pulls account data
// Shouldn't be a problem, though, because enough time passes when another call to
// getProducts() happens.

function GDAXTriangularArbitrager(gdaxAuthedClient) {
    this.gdaxAuthedClient = gdaxAuthedClient;
    this.pathResults = [];
    // this.accountCoin;
    // this.accountValue;
    // this.pathFinder;   
    this.calculatePriceExchanges = function () {
        // CALCULATE THE PRICE EXCHANGE
        var runningValue = this.accountValue;  
        var runningCurrency = this.accountCoin;  
        for (var i = 0; i < this.pathFinder.completedPaths.length; i++) {
            for (var j = 0; j < this.pathFinder.completedPaths[i].length; j++) {
                var xName = this.pathFinder.completedPaths[i][j].name;
                var xWithBidAsk = supportedExchanges.getExchangeFromName(xName);
                var returnArray = xWithBidAsk.exchangeCurrency(runningCurrency, runningValue);
                runningCurrency = returnArray[0];
                runningValue = returnArray[1];
                // [runningCurrency, runningValue]
            }
            this.pathResults.push(runningValue);
            runningValue = this.accountValue;
            runningCurrency = this.accountCoin;
        }    
        // PRINT YOUR RESULTS    
        for (var i = 0; i < this.pathResults.length; i++) {
            console.log("**********");
            var path = this.pathFinder.completedPaths[i];
            var pathArray = [];
            for (var j = 0; j < path.length; j++) {
                pathArray.push(path[j].name);
            }
            console.log("path -> ", pathArray);
            console.log("path result ", i, " is ", this.pathResults[i]);
            console.log("difference is ", this.pathResults[i] - this.accountValue);
        }
    }
    this.pullCoinDataFromGDAX = function () {
        this.gdaxAuthedClient.getProducts(
            (error, response, book) => {
                for (i = 0; i < supportedExchanges.exchanges.length; i++) {
                    this.gdaxAuthedClient.getProductOrderBook(
                        supportedExchanges.exchanges[i].name,
                        (error, response, book) => {
                            var exchange = getExchangeFromResponse(response, supportedExchanges.exchanges);
                            supportedExchanges.insertBidAndAsk(exchange, book.bids[0][0], book.asks[0][0]);
                            if(supportedExchanges.checkIfComplete())
                                this.calculatePriceExchanges();
                        }                        
                    );
                }    
            }
        ); 
    }
    this.gdaxAuthedClient.getAccounts(
        (error, response, book) => {
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
            this.pathFinder = new PathFinder(this.accountCoin, "USD");
            // this.pathFinder.printFullPaths();    
            this.pullCoinDataFromGDAX();        
        }
    );    
}

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

function Exchange(name, parentLink = 0) {
    this.name = name;
    this.baseCoin = getFirstCoinOfExchange(name);
    this.quoteCoin = getSecondCoinOfExchange(name);    
    // this.bid;
    // this.ask;
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
            return [this.baseCoin, newValue / rate];
        } else //currency == this.baseCoin
        {
            var rate = this.ask;
            var otherValue = value * rate;
            var truncatedOtherValue = floorPrecision(otherValue, this.quoteMinIncrement);
            //Adjust value now
            value = truncatedOtherValue / rate;
            // console.log(exchangeName, ": selling ",  value, currency, " for ", truncatedOtherValue, " ", this.quoteCoin, " at a rate of ", rate, ". (buy rate is ", this.bid, ")."); 
            // console.log("... lost dust = ", otherValue - truncatedOtherValue);
            return [this.quoteCoin, truncatedOtherValue];        
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
                var tempX = new Exchange(this.exchanges[i].name, this.exchanges[i].link.parent);
                returnArray.push(tempX);           
            }
        }
        return returnArray;
    }
    this.getExchangeFromName = function(name) {
        for (var i = 0; i < this.exchanges.length; i++) {
            if(this.exchanges[i].name == name)
                return this.exchanges[i];
        }
    }
}


//Helper Functions
function floorPrecision(value, precision)
{
    return Math.floor(value / precision) * precision;
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

//****************************************************************************************************


// authedClient.getProductOrderBook(
//   'BTC-USD',
//   (error, response, book) => {
//     console.log("GET PRODUCT ORDER BOOK for btc usd");
//     // console.log(error);
//     console.log(response.socket._httpMessage.path);
//     console.log(getExchangeFromResponse(response, supportedExchanges));
//     // console.log(obj);
//     // console.log(book);
//   }
// );

// const myCallback = (err, response, data) => {
//   console.log(data);
// };
// const result = authedClient.getProducts(myCallback);


// const publicClient = new Gdax.PublicClient('https://api.gdax.com');

// publicClient.getProductOrderBook(
//   'ETH-USD',
//   (error, response, book) => {
//     console.log(book);
//   }
// );


// const myCallback = (err, response, data) => {
//   console.log(data);
// };
// const result = publicClient.getProducts(myCallback);

// const myCallback = (err, response, data) => {
//   console.log(data);
// };
// const result = publicClient.getCurrencies(myCallback);
