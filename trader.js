const Gdax = require('gdax');
const licenses = require('./licenses.js');

const authedClient = new Gdax.AuthenticatedClient(
  licenses.key,
  licenses.secret,
  licenses.passphrase,
  licenses.URL
);


const supportedExchangesObject = {
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
    checkIfComplete: function () {
        //Call this after updating every exchange
        this.counter++;
        if(this.counter >= this.numberOfExchanges)
            return true;
        return false;
    }
}

const supportedExchanges = ['BTC-USD', 'BCH-BTC', 'BCH-USD', 'ETH-BTC', 'ETH-USD', 'LTC-BTC', 'LTC-USD'];
// const exchangeBidAsks = [[],[],[],[],[],[],[]];
// var dataComplete = false;

var baseCoin = "USD";
var cash = 18.5;
var maxVal = -1;
var maxCoin;
var pathResults = [];

//****************************************************************************************************
authedClient.getAccounts(
    (error, response, book) => {
        // console.log("ACCOUNTS -> ", book);
        for (var i = 0; i < book.length; i++) {
            // console.log(book[i].currency);
            if(maxVal < book[i].available)
            {
                maxVal = book[i].available;
                maxCoin = book[i].currency;
            }
        }
        // console.log("maxVal is ", maxVal);
        // console.log("maxCoin is ", maxCoin);
        authedClient.getProducts(
            (error, response, book) => {
                // console.log("GETTING PRODUCTS");
                // console.log(book);
                for (i = 0; i < supportedExchanges.length; i++) {
                    authedClient.getProductOrderBook(
                        supportedExchanges[i],
                        (error, response, book) => {
                            var exchange = getExchangeFromResponse(response, supportedExchanges);
                            var index = supportedExchanges.indexOf(exchange);
                            // console.log(book);
                            // console.log("IN LOOP -> ", exchange);
                            // console.log("ask -> ", book.asks[0]);
                            // console.log("bid -> ", book.bids[0]);
                            var bid = book.bids[0][0];
                            var ask = book.asks[0][0];
                            // console.log("BID -> ", book.bids[0][0]);
                            // console.log("ASK -> ", book.asks[0][0]);
                            supportedExchangesObject[exchange].bid = bid;
                            supportedExchangesObject[exchange].ask = ask;
                            // exchangeBidAsks[index] = [bid, ask];
                            calculatePaths();
                            // if(index == supportedExchanges.length - 1)
                                dataComplete = true;                            
                        }                        
                    );
                }    
            }
        );            
    }
);

function calculatePaths()
{
    if(supportedExchangesObject.checkIfComplete())
    {
        // console.log(supportedExchanges);
        // console.log(exchangeBidAsks);

        //Level 1
        var baseExchanges = [];
        var secondarySymbols = [];
        for (var i = 0; i < supportedExchanges.length; i++) {
            if(supportedExchanges[i].includes(baseCoin))
            {
                baseExchanges.push(supportedExchanges[i]);
                var nonUSCoin = getFirstCoinOfExchange(supportedExchanges[i]);
                if(nonUSCoin == "USD")
                    nonUSCoin = getSecondCoinOfExchange(supportedExchanges[i]);
                // console.log(nonUSCoin);
                secondarySymbols.push(nonUSCoin);
            }
        }
        //Level 2
        var secondaryExchanges = [];
        for (var i = 0; i < secondarySymbols.length; i++) {
            var secondarySubGroup = [];
            for (var j = 0; j < supportedExchanges.length; j++) {
                if(supportedExchanges[j].includes(secondarySymbols[i]))
                {
                    if(!(supportedExchanges[j].includes("USD")))
                    {
                        secondarySubGroup.push(supportedExchanges[j]);
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
        if(maxCoin != baseCoin) {
            var x;
            for (var i = 0; i < baseExchanges.length; i++) {
                console.log(baseExchanges[i]);
                if(baseExchanges[i].includes(maxCoin))
                    x = baseExchanges[i];
            }
            var returnArray = exchangeCurrency(maxCoin, maxVal, x);
            // baseCoin = returnArray[0];
            // console.log(returnArray);
            cash = returnArray[1];            
            // console.log("PRE EXCHANGE, cash = ", cash);
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
        var runningValue = cash;  
        var runningCurrency = baseCoin;  
        for (var i = 0; i < validPaths.length; i++) {
            // console.log("**************PATH ", i);
            for (var j = 0; j < validPaths[i].length; j++) {
                // console.log("*");
                // console.log("coin, value, exchange: ", runningCurrency, runningValue, validPaths[i][j]);
                var returnArray = exchangeCurrency(runningCurrency, runningValue, validPaths[i][j]);
                runningCurrency = returnArray[0];
                runningValue = returnArray[1];
                // [runningCurrency, runningValue]
            }
            pathResults.push(runningValue);
            runningValue = cash;
            runningCurrency = baseCoin;
        }    
        // PRINT YOUR RESULTS    
        for (var i = 0; i < pathResults.length; i++) {
            console.log("**********");
            console.log("path -> ", validPaths[i]);
            console.log("path result ", i, " is ", pathResults[i]);
            console.log("difference is ", pathResults[i] - cash);
        }

    }
}

function exchangeCurrency(currency, value, exchange)
{
    var coin1 = getFirstCoinOfExchange(exchange);
    var coin2 = getSecondCoinOfExchange(exchange);
    // var bidAsksIndex = supportedExchanges.indexOf(exchange);
    // var bidAsks = exchangeBidAsks[bidAsksIndex];
    var bid = supportedExchangesObject[exchange].bid;
    var ask = supportedExchangesObject[exchange].ask;
    if(currency == coin2)
    {
        //quote coin == currency
        var newValue = value;
        if(supportedExchangesObject[exchange].quoteCoin == currency)
            newValue = floorPrecision(newValue, supportedExchangesObject[exchange].quoteMinIncrement);
        var rate = bid;
        console.log(exchange, ": buying ", value / rate, " ", coin1, " with ", value, " ", currency, " at a rate of " , rate, ". (Ask rate is ", ask, ").");        
        console.log("... lost dust = ", value - newValue);        
        return [coin1, value / rate];
    } else //currency == coin1
    {
        var rate = ask;
        var otherValue = value * rate;
        var truncatedOtherValue;
        if(supportedExchangesObject[exchange].quoteCoin == coin2)
            truncatedOtherValue = floorPrecision(otherValue, supportedExchangesObject[exchange].quoteMinIncrement);
        //Adjust value now
        value = truncatedOtherValue / rate;
        console.log(exchange, ": selling ",  value, " ", currency, " for ", truncatedOtherValue, " ", coin2, " at a rate of ", rate, ". (buy rate is ", bid, ")."); 
        console.log("... lost dust = ", otherValue - truncatedOtherValue);
        return [coin2, truncatedOtherValue];        
    }
}

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



// [ { id: 'BCH-BTC',
//     base_currency: 'BCH',
//     quote_currency: 'BTC',
//     base_min_size: '0.01',
//     base_max_size: '200',
//     quote_increment: '0.00001',
//     display_name: 'BCH/BTC',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '0.001',
//     max_market_funds: '30',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'BCH-USD',
//     base_currency: 'BCH',
//     quote_currency: 'USD',
//     base_min_size: '0.01',
//     base_max_size: '350',
//     quote_increment: '0.01',
//     display_name: 'BCH/USD',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '10',
//     max_market_funds: '1000000',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   {},
//   {},
//   { id: 'BTC-USD',
//     base_currency: 'BTC',
//     quote_currency: 'USD',
//     base_min_size: '0.001',
//     base_max_size: '70',
//     quote_increment: '0.01',
//     display_name: 'BTC/USD',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '10',
//     max_market_funds: '1000000',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'ETH-BTC',
//     base_currency: 'ETH',
//     quote_currency: 'BTC',
//     base_min_size: '0.01',
//     base_max_size: '600',
//     quote_increment: '0.00001',
//     display_name: 'ETH/BTC',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '0.001',
//     max_market_funds: '50',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'ETH-EUR',
//     base_currency: 'ETH',
//     quote_currency: 'EUR',
//     base_min_size: '0.01',
//     base_max_size: '400',
//     quote_increment: '0.01',
//     display_name: 'ETH/EUR',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '10',
//     max_market_funds: '400000',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'ETH-USD',
//     base_currency: 'ETH',
//     quote_currency: 'USD',
//     base_min_size: '0.01',
//     base_max_size: '700',
//     quote_increment: '0.01',
//     display_name: 'ETH/USD',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '10',
//     max_market_funds: '1000000',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'LTC-BTC',
//     base_currency: 'LTC',
//     quote_currency: 'BTC',
//     base_min_size: '0.1',
//     base_max_size: '2000',
//     quote_increment: '0.00001',
//     display_name: 'LTC/BTC',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '0.001',
//     max_market_funds: '30',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'LTC-EUR',
//     base_currency: 'LTC',
//     quote_currency: 'EUR',
//     base_min_size: '0.1',
//     base_max_size: '1000',
//     quote_increment: '0.01',
//     display_name: 'LTC/EUR',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '10',
//     max_market_funds: '200000',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'LTC-USD',
//     base_currency: 'LTC',
//     quote_currency: 'USD',
//     base_min_size: '0.1',
//     base_max_size: '4000',
//     quote_increment: '0.01',
//     display_name: 'LTC/USD',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '10',
//     max_market_funds: '1000000',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false },
//   { id: 'BCH-EUR',
//     base_currency: 'BCH',
//     quote_currency: 'EUR',
//     base_min_size: '0.01',
//     base_max_size: '120',
//     quote_increment: '0.01',
//     display_name: 'BCH/EUR',
//     status: 'online',
//     margin_enabled: false,
//     status_message: null,
//     min_market_funds: '10',
//     max_market_funds: '200000',
//     post_only: false,
//     limit_only: false,
//     cancel_only: false } ]

