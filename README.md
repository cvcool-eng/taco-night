# Taco Night 🌮

An 8-bit night-time taco truck game that runs in the browser. You're the bearded chef in the red cap, working the window while customers walk up out of the dark.

## How to play

- Read the order bubble above the customer at your window.
- Click the ingredients to build the taco (click again to take one off), then hit **SERVE**.
- Every taco you serve uses up 1 of each ingredient in it. The number on each button is how many you have left.
- Faster service earns bigger tips. If a customer gives up waiting, they walk off and it costs you $5.
- Pause any time with the button in the top-left corner (or **P** / **Esc**).

### The market

Scroll right with the mouse wheel (or drag, or use the arrows on the sides) to reach the corner market. Click it to go inside, then click a shelf to buy a pack of 10 of that ingredient for $2. Customers' timers stop while you're in the market.

### Growing the business

Open **BUSINESS** to spend your money:

- **Cook ($100):** serves customers at a truck by themself, using your stock.
- **Store runner ($100):** tell them what to buy and how many packs. They walk to the market, pay with your money and bring the stock back. Turn on auto-restock and they'll go whenever something gets low.
- **New truck ($250):** opens further down the street. Hire it a cook to start selling there.

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
