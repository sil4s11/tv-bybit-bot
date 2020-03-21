# tv-bybit-bot
Trading bot based on Trading View Webhooks

You can run this bot in your computer expoxing the localhost using ngrok or run it in a VPS using this [guide](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04)

This bot operates with the ccxt library and the Bybit API, but you can modify it to work with other exchange.

It works with TradingView Webhooks so basically you have to set alarms for the indicators you want to use, you can send the alarms every minute or every candle close, and send it to your VPS or computer (using ther URL ngrok provides you), and the end poing would be /webhook so it would be http://xxx.xxx.xxx.xxx/webhook

You have you fill the paramenters in the .env file with your info, the PIN_TOKEN is a random string that would be used to only allow the request that matches with the token generated.

When you run the daemon for the first time it would generate a token.txt with the token you need to add in your description's alarm, so the description of your alarm should be something like this

**{"side": "1short-ema-21", "key": "xxxxxxxxxxxxxxxxxxxxxx_this_is_the_generated_tokenxxxxxx"}**

The number at the begining is the id of the alarm so you should set the oppositte of each of this

**{"side": "1buy-ema-21", "key": "xxxxxxxxxxxxxxxxxxxxxx_this_is_the_generated_tokenxxxxxx"}**

It works with a volatility indicator to avoid choppiness, a confirmation indicator, and some execution indicators to execute the trade when all conditions are met 

The description for the volatility indicator would be

**{"side": "",  "canTrade": false, "key": "xxxxxxxxxxxxx"}**

**{"side": "",  "canTrade": true, "key": "xxxxxxxxxxxxx"}**

And for the confirmation indicator

**{"side": "",  "canShort": true, "canLong": false, "key": "xxxxxxx"}**

**{"side": "",  "canShort": false, "canLong": true, "key": "xxxxxxx"}**
