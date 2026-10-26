# Taco Night 🌮

An 8-bit night-time taco truck game that runs in the browser. You're the bearded chef in the red cap, working the window while customers walk up out of the dark.

## How to play

- Read the order bubble above the customer at your window.
- Click the ingredients to build the taco (click again to take one off), then hit **SERVE**.
- Every taco you serve uses up 1 of each ingredient in it. The number on each button is how many you have left.
- Faster service earns bigger tips. If a customer gives up waiting, they walk off and it costs you $5.
- Pause any time with the button in the top-left corner (or **P** / **Esc**).

### The market

Scroll right with the mouse wheel (or drag, or use the arrows on the sides) to reach the corner market. Click it to go inside, then click a shelf to buy a pack of 10 of that ingredient for $4. Customers' timers stop while you're in the market.

### Growing the business

Everything is clicked right in the world:

- **Click any truck** to see your workers. Hire cooks ($100 each, 8 to choose from) and use the **ASSIGNED** picker to move them between trucks. Cooks in your truck work behind you and serve customers on their own.
- **Leo the store runner ($100)** hangs out by your truck. Click him to choose what to buy and how many packs. He walks to the market, pays with your money and brings the stock back. Turn on auto-restock and he goes whenever something gets low.
- **Click the FOR SALE lot** down the street to buy another truck ($250). It needs a cook before it can sell.

Workers work for 1 minute, then take a 2-minute break. While a truck's cook is on break, scroll over and serve its customers yourself, or they'll walk off and cost you $5.

Your money, stock, trucks and workers are saved in your browser. New players start with 20 of each ingredient.

## Run it

It's plain HTML, CSS and JavaScript with no build step. Open `index.html` through any static web server, or play it on GitHub Pages.

## How it's built

The scene renders at 256×144 and is scaled up with pixelated edges. Each frame is drawn in layers:

- **Sky**: stars, moon, clouds and hills, not affected by lighting.
- **Base**: gravel, trucks, the market and characters, lit by a per-pixel light map from the bulbs, windows, grills, neon signs and fireflies.
- **Emit**: glowing things like bulbs, neon, embers and coins, added on top along with soft halos.
- **UI**: order bubbles and floating text.

The final image is dithered with a 4×4 Bayer pattern, so the light fades smoothly into the dark while keeping a retro palette.
