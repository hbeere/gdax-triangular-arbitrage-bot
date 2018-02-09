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

authedClient.getProducts(
    (error, response, book) => {
        // console.log("GETTING PRODUCTS");
        // console.log(book);
        for (i = 0; i < supportedExchanges.exchanges.length; i++) {
            authedClient.getProductOrderBook(
                supportedExchanges.exchanges[i],
                (error, response, book) => {
                    var exchange = getExchangeFromResponse(response, supportedExchanges.exchanges);
                    console.log("ProductOrderBook -> ", book);
                    supportedExchanges.insertBidAndAsk(exchange, book.bids[0][0], book.asks[0][0]);
                    if(supportedExchanges.checkIfComplete())
                        arbitrager.calculatePaths();
                }                        
            );
        }    
    }
); 


function GDAXTriangularArbitrager(gdaxAuthedClient) {
    this.gdaxAuthedClient = gdaxAuthedClient;
    this.gdaxAuthedClient.getAccounts(
        (error, response, book) => {
            var maxVal = -1, maxCoin;
            // console.log("ACCOUNTS -> ", book);
            for (var i = 0; i < book.length; i++) {
                // console.log(book[i].currency);
                if(maxVal < book[i].available)
                {
                    maxVal = book[i].available;
                    maxCoin = book[i].currency;
                }
            }
            this.accountCoin = maxCoin;
            this.accountValue = maxVal;
        }
    );    
    this.pathsToUSD = []; //Array of subarrays that are sequences of exchange names that lead to USD
    this.calculatePaths = function () {
        this.pathFinder = new PathFinder();
    };
}





function PathFinder(startCoin, endCoin) {
    this.startCoin = startCoin;
    this.endCoin = endCoin;
    this.findPaths = function (arrayOfPathArrays, currentCoin, endCoin, recurseLevel) {
        for (var h = 0; h < arrayOfPathArrays.length; h++) {
            var currentPath = arrayOfPathArrays[h];
            var lastIndex = currentPath.length - 1;
            var currentExchange = currentPath[lastIndex];
            if(currentExchange.isArray())
            {
                var tempArrayOfPaths = [];
                currentPath.pop();
                for (var i = 0; i < currentExchange.length; i++) {
                     currentExchange[i]
                }
            }
            var x = supportedExchanges.getExchangeFromName(currentExchange);
            var otherCoin = x.baseCoin == currentCoin ? x.quoteCoin : x.baseCoin;
            if((recurseLevel == 0 && currentCoin == endCoin) || //currentCoin will never be endCoin, except recurseLevel==0
                (otherCoin != endCoin))
            {
                var forks = supportedExchanges.getExchangesWithCoini(otherCoin);
                for (var j = 0; j < currentPath.length; j++) {
                    var index = forks.indexOf(currentPath[j]);
                    if(index != -1) //duplicate exchange found, don't allow backtracking
                        forks.splice(index, 1);
                }
                currentPath.push(forks);
                arrayOfPathArrays[h] = currentPath; // update the original array of arrays
                this.findPaths(arrayOfPathArrays, otherCoin, endCoin, recurseLevel + 1);
            } else if(otherCoin == "USD")
            {
                // We're done, do nothing
            }
        }
    }
    var connectingExchanges = supportedExchanges.getExchangObjectsWithCoin(this.startCoin);
    this.paths = this.findPaths(connectingExchanges, this.startCoin, this.endCoin);
}

function PathMarker(thisIndex, parentObject) {
    this.index = thisIndex;
    if(parentObject)
        this.parent = parentObject;
    else
        this.parent = new PathMarker(-1); //Original has no parent. And no bellybutton.
}

function Exchange(name) {
    this.name = name;
    this.baseCoin = getFirstCoinOfExchange(name);
    this.quoteCoin = getSecondCoinOfExchange(name);    
    switch(quoteCoin) {
    case "BTC":
        this.quoteMinIncrement = 0.00001;
        break;
    case "USD":
    default:
        this.quoteMinIncrement = 0.01;    
        break;
    }
    // This stuff is to facilitate caching their position inside of a tangle of paths
    this.pathMarker = new PathMarker(0); // I guess all Exchanges are "original" by default 
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
            if (this.exchanges[i].name == exchange) 
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
    this.getExchangObjectsWithCoin = function(coin) {
        var returnArray = [];
        for (var i = 0; i < this.exchanges.length; i++) {
            if(this.exchanges[i].name.includes(coin))
                returnArray.push(this.exchanges[i]);           
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


// Original path calculator
// The method is flawed, but works like this:
// It assumes you own USD, and it calculates all paths away and back to USD through the exchanges.
// It then determines the USD value change over each path.
//
// The flaw is this: each trade will take time, and volitile markets can invalidate paths
// before all trades are complete.
//
// Solution: The trader should calculate all paths from current position to USD,
// (and not assume one is holding USD). Once the first step is taken on the highest
// yielding path, all paths should be reconsidered to account for changing markets.
//****************************************************************************************************
// authedClient.getAccounts(
//     (error, response, book) => {
//         var maxVal = -1, maxCoin;
//         // console.log("ACCOUNTS -> ", book);
//         for (var i = 0; i < book.length; i++) {
//             // console.log(book[i].currency);
//             if(maxVal < book[i].available)
//             {
//                 maxVal = book[i].available;
//                 maxCoin = book[i].currency;
//             }
//         }
//         var pathCalculator = new GDAXPathCalculator(maxCoin, maxVal);
//         authedClient.getProducts(
//             (error, response, book) => {
//                 // console.log("GETTING PRODUCTS");
//                 // console.log(book);
//                 for (i = 0; i < pathCalculator.supportedExchanges.length; i++) {
//                     authedClient.getProductOrderBook(
//                         pathCalculator.supportedExchanges[i],
//                         (error, response, book) => {
//                             var exchange = getExchangeFromResponse(response, pathCalculator.supportedExchanges);
//                             console.log("ProductOrderBook -> ", book);
//                             pathCalculator.supportedExchangesObject.insertBidAndAsk(exchange, book.bids[0][0], book.asks[0][0]);
//                             if(pathCalculator.supportedExchangesObject.checkIfComplete())
//                                 pathCalculator.calculatePaths();
//                         }                        
//                     );
//                 }    
//             }
//         );            
//     }
// );



function GDAXPathCalculator(maxCoin, maxVal) {
    this.baseCoin = "USD";
    this.cash = 0; 
    this.accountCoin = maxCoin;
    this.accountValue = maxVal;
    this.pathResults = [];    
    this.calculatePaths = function () {
        if(this.supportedExchangesObject.checkIfComplete())
        {
            // console.log(this.supportedExchanges);
            // console.log(exchangeBidAsks);

            //Level 1
            var baseExchanges = [];
            var secondarySymbols = [];
            for (var i = 0; i < this.supportedExchanges.length; i++) {
                if(this.supportedExchanges[i].includes(this.baseCoin))
                {
                    baseExchanges.push(this.supportedExchanges[i]);
                    var nonUSCoin = getFirstCoinOfExchange(this.supportedExchanges[i]);
                    if(nonUSCoin == "USD")
                        nonUSCoin = getSecondCoinOfExchange(this.supportedExchanges[i]);
                    // console.log(nonUSCoin);
                    secondarySymbols.push(nonUSCoin);
                }
            }
            //Level 2
            var secondaryExchanges = [];
            for (var i = 0; i < secondarySymbols.length; i++) {
                var secondarySubGroup = [];
                for (var j = 0; j < this.supportedExchanges.length; j++) {
                    if(this.supportedExchanges[j].includes(secondarySymbols[i]))
                    {
                        if(!(this.supportedExchanges[j].includes("USD")))
                        {
                            secondarySubGroup.push(this.supportedExchanges[j]);
                        }
                    }
                }
                secondaryExchanges.push(secondarySubGroup);
            }
            // for (var i = 0; i < secondaryExchanges.length; i++) {
            //     console.log("i = ", i);
            //     for (var j = 0; j < secondaryExchanges[i].length; j++) {
            //         console.log(secondaryExchanges[i][j]);
            //     }
            // }   
            //BEFORE WE MOVE ON, MAKE SURE I HAVE USD AND NOT SOMETHING ELSE
            if(this.accountCoin != this.baseCoin) {
                var x;
                for (var i = 0; i < baseExchanges.length; i++) {
                    console.log(baseExchanges[i]);
                    if(baseExchanges[i].includes(this.accountCoin))
                        x = baseExchanges[i];
                }
                var returnArray = this.exchangeCurrency(this.accountCoin, this.accountValue, x);
                // this.baseCoin = returnArray[0];
                console.log(returnArray);
                this.cash = returnArray[1];            
                console.log("PRE EXCHANGE, this.cash = ", this.cash);
            } else {
                this.cash = this.accountValue;
            }
            //FIND KEYSTONE CONNECTORS
            var keystoneConnectors = [];
            for (var i = 0; i < secondaryExchanges.length; i++) {
                for (var j = i + 1; j < secondaryExchanges.length; j++) {
                    var firstArray = secondaryExchanges[i];
                    var secondArray = secondaryExchanges[j];
                    for (var k = 0; k < firstArray.length; k++) {
                        if(secondArray.includes(firstArray[k]))
                        {
                            keystoneConnectors.push(firstArray[k]);
                        }
                    }                
                }
            }         
            //CONSTRUCT PATH USING KEYSTONES
            //paths will be an array of exchanges
            //so validPaths will be an array of arrays
            validPaths = [];
            for (var i = 0; i < keystoneConnectors.length; i++) {
                //path1 and 2 are just reverse of each other
                var path1 = [];
                var path2 = [];
                path1.push(keystoneConnectors[i]);
                path2.push(keystoneConnectors[i]);
                var coin1 = getFirstCoinOfExchange(keystoneConnectors[i]);
                var coin2 = getSecondCoinOfExchange(keystoneConnectors[i]);
                var exchange1, exchange2;
                for (var j = 0; j < baseExchanges.length; j++) {
                    if(baseExchanges[j].includes(coin1))
                        exchange1 = baseExchanges[j];
                    if(baseExchanges[j].includes(coin2))
                        exchange2 = baseExchanges[j];                
                }
                path1.unshift(exchange1);
                path1.push(exchange2);

                path2.unshift(exchange2);
                path2.push(exchange1);

                validPaths.push(path1);
                validPaths.push(path2);
            }
            // for (var i = 0; i < validPaths.length; i++) {
            //     // console.log("**************PATH ", i);
            //     for (var j = 0; j < validPaths[i].length; j++) {
            //         console.log(validPaths[i][j]);
            //     }
            // }
            // CALCULATE THE PRICE EXCHANGE
            var runningValue = this.cash;  
            var runningCurrency = this.baseCoin;  
            for (var i = 0; i < validPaths.length; i++) {
                // console.log("**************PATH ", i);
                for (var j = 0; j < validPaths[i].length; j++) {
                    // console.log("*");
                    // console.log("coin, value, exchange: ", runningCurrency, runningValue, validPaths[i][j]);
                    var returnArray = this.exchangeCurrency(runningCurrency, runningValue, validPaths[i][j]);
                    runningCurrency = returnArray[0];
                    runningValue = returnArray[1];
                    // [runningCurrency, runningValue]
                }
                this.pathResults.push(runningValue);
                runningValue = this.cash;
                runningCurrency = this.baseCoin;
            }    
            // PRINT YOUR RESULTS    
            for (var i = 0; i < this.pathResults.length; i++) {
                console.log("**********");
                console.log("path -> ", validPaths[i]);
                console.log("path result ", i, " is ", this.pathResults[i]);
                console.log("difference is ", this.pathResults[i] - this.cash);
            }

        }
    };
    this.exchangeCurrency = function(currency, value, exchange)
    {
        var coin1 = getFirstCoinOfExchange(exchange);
        var coin2 = getSecondCoinOfExchange(exchange);
        // var bidAsksIndex = this.supportedExchanges.indexOf(exchange);
        // var bidAsks = exchangeBidAsks[bidAsksIndex];
        var bid = this.supportedExchangesObject[exchange].bid;
        var ask = this.supportedExchangesObject[exchange].ask;
        if(currency == coin2)
        {
            //quote coin == currency
            var newValue = value;
            if(this.supportedExchangesObject[exchange].quoteCoin == currency)
                newValue = floorPrecision(newValue, this.supportedExchangesObject[exchange].quoteMinIncrement);
            var rate = bid;
            console.log(exchange, ": buying ", value / rate, " ", coin1, " with ", value, " ", currency, " at a rate of " , rate, ". (Ask rate is ", ask, ").");        
            console.log("... lost dust = ", value - newValue);        
            return [coin1, value / rate];
        } else //currency == coin1
        {
            var rate = ask;
            var otherValue = value * rate;
            var truncatedOtherValue;
            if(this.supportedExchangesObject[exchange].quoteCoin == coin2)
                truncatedOtherValue = floorPrecision(otherValue, this.supportedExchangesObject[exchange].quoteMinIncrement);
            //Adjust value now
            value = truncatedOtherValue / rate;
            console.log(exchange, ": selling ",  value, " ", currency, " for ", truncatedOtherValue, " ", coin2, " at a rate of ", rate, ". (buy rate is ", bid, ")."); 
            console.log("... lost dust = ", otherValue - truncatedOtherValue);
            return [coin2, truncatedOtherValue];        
        }
    };
    this.supportedExchanges = ['BTC-USD', 'BCH-BTC', 'BCH-USD', 'ETH-BTC', 'ETH-USD', 'LTC-BTC', 'LTC-USD'];
    this.supportedExchangesObject = {
        "BTC-USD": {
            baseCoin: "BTC",
            quoteCoin: "USD",
            quoteMinIncrement: 0.01 
        },
        "BCH-BTC": {
            baseCoin: "BCH",
            quoteCoin: "BTC",
            quoteMinIncrement: 0.00001 
        },
        "BCH-USD": {
            baseCoin: "BCH",
            quoteCoin: "USD",
            quoteMinIncrement: 0.01 
        },
        "ETH-BTC": {
            baseCoin: "ETH",
            quoteCoin: "BTC",
            quoteMinIncrement: 0.00001 
        },
        "ETH-USD": {
            baseCoin: "ETH",
            quoteCoin: "USD",
            quoteMinIncrement: 0.01 
        },
        "LTC-BTC": {
            baseCoin: "LTC",
            quoteCoin: "BTC",
            quoteMinIncrement: 0.00001 
        },
        "LTC-USD": {
            baseCoin: "LTC",
            quoteCoin: "USD",
            quoteMinIncrement: 0.01 
        },
        numberOfExchanges: 7,
        counter: 0,
        insertBidAndAsk: function (exchange, bid, ask) {
            this[exchange].bid = bid;
            this[exchange].ask = ask;
        },
        checkIfComplete: function () {
            //Call this after updating every exchange
            this.counter++;
            if(this.counter >= this.numberOfExchanges)
                return true;
            return false;
        }
    };
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
    var pathOfGdaxExchange = response.socket._httpMessage.path;
    for (var i = 0; i < exchanges.length; i++) {
        if(pathOfGdaxExchange.includes(exchanges[i]))
            return exchanges[i];
    }
    return "";
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
