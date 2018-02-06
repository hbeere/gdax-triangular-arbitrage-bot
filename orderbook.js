function OrderObject(buyOrSell, price, size, exchange) {
    this.done = false,
	this.getFirstCoinOfExchange = function(exchange)
	{
	    return exchange.substr(0,3);
	},
	this.getSecondCoinOfExchange = function(exchange)
	{
	    return exchange.substr(4,3);
	},
	this.printOrder = function()
	{
		console.log("*----Order Object----*");
		for (var key in this) {
			if(typeof this[key] != "function")
				console.log(key, ": ", this[key]);
		}		
		console.log("......................");
	},
	this.generateClientID = function () 
	{
	    var id = "trex" + Math.random();
	    console.log("Generating id ", id);
	    return id;		
	},    
	this.clientID = this.generateClientID(),
	this.side = buyOrSell,
	this.product_id = exchange,
	this.priceCoin = this.getSecondCoinOfExchange(exchange),
	this.price = price.toString(),
	this.sizeCoin = this.getFirstCoinOfExchange(exchange),
	this.size = size.toString()
};


function OrderBook() {
	this.book = [],
	this.checkIfIDExists = function (id) {
		for (var i = 0; i < this.book.length; i++) {
			if(this.book[i].clientID == id)
				return true;
		}
		return false;
	},
	this.createOrderAndGetID = function (buyOrSell, price, size, exchange) {
		var newOrder = new OrderObject(buyOrSell, price, size, exchange);
		this.book.push(newOrder);
		return newOrder.clientID;
	},
	this.markOrderComplete = function (id) {
		for (var i = 0; i < this.book.length; i++) {
			if(this.book[i].clientID == id)
			{
				this.book[i].done = true;
				return true;
			}
		}
		return false;	
	},
	this.printOrderBook = function()
	{
		for (var i = 0; i < this.book.length; i++) {
			this.book[i].printOrder();
		}
	}
}





function testOrderBook()
{
	var myOrderBook = new OrderBook();
	for (var i = 0; i < 5; i++) {
		var buyOrSell = Math.random() < 0.5 ? 'buy' : 'sell';
		var price = Math.floor((Math.random() * 10) / 0.01) * 0.01;
		var size = Math.floor((Math.random() * 10) / 0.01) * 0.01;
		var exchange = Math.random() < 0.5 ? 'BTC-USD' : 'ETH-LTC';
		myOrderBook.createOrderAndGetID(buyOrSell, price, size, exchange);
	}
	myOrderBook.printOrderBook();
}

testOrderBook();




