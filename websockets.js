const Gdax = require('gdax');
const licenses = require('./licenses.js');

// The FEED


const websocket = new Gdax.WebsocketClient(
  ['BTC-USD', 'ETH-USD'],
  licenses.sandbox_ws_feed,
  {
    key: licenses.sandbox_key,
    secret: licenses.sandbox_secret,
    passphrase: licenses.sandbox_passphrase,
  },
  { channels: ['full', 'full'] }
);


// websocket.unsubscribe({ channels: ['heartbeat'] });

// const websocket = new Gdax.WebsocketClient(['BTC-USD', 'ETH-USD']);

websocket.on('message', data => {
    if(data.type != "heartbeat")
        console.log("message received ", data);
});
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


const orderCallback = (err, response, data) => {
    console.log("Order callback: ", data);
};

// LIMIT ORDERS
const params = {
  side: 'sell',
  price: '96.66', // USD
  size: '0.1', // BTC
  product_id: 'BTC-USD',
  post_only: 'true',
  client_oid: ''
};
authedClient.placeOrder(params, orderCallback);

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
