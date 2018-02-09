const Gdax = require('gdax');
const licenses = require('./licenses.js');

const authedClient = new Gdax.AuthenticatedClient(
  licenses.key,
  licenses.secret,
  licenses.passphrase,
  licenses.URL
);


// var now = new Date(Date.now());
// var then = new Date(now.getTime() - (60 * 60000));
// authedClient.getProductHistoricRates("BTC-USD", 
// 	{
// 		granularity: 60,//seconds = 5 minutes
// 		start: now.toISOString(),
// 		end: then.toISOString()
// 	},//60 seconds, 1 minute candles 
// 	(error, response, book) => {
// 		console.log(book);
// 	}
// );


authedClient.getTime(
	(error, response, book) => {
		var nowDate = new Date(book.iso);
		var end = new Date(nowDate.getTime() - 5000);
		var minutes = 10;
		var start = new Date(end.getTime() - (minutes * 60000));
		console.log(end.getTime());
		console.log(start.getTime());
		authedClient.getProductHistoricRates("BTC-USD", 
			{
				start: start.toISOString(),
				end: end.toISOString(),	
				granularity: 60,//seconds = 5 minutes
			},//60 seconds, 1 minute candles 
			(error, response, book) => {
				console.log(book);
			}
		);
	}
);


