# Taco Night 🌮

An 8-bit night-time taco truck game that runs in the browser. You're the bearded chef in the red cap, working the window while customers walk up out of the dark.

## How to play

- Read the order bubble above the customer at your window.
- Click the ingredients to build the taco (click again to take one off), then hit **SERVE**.
- Every taco you serve uses up 1 of each ingredient in it. The number on each button is how many you have left.
- Faster service earns bigger tips. If a customer gives up waiting, they walk off and it costs you $5.
- Pause any time with the button in the top-left corner (or **P** / **Esc**). The pause menu has **NEW GAME**, which saves the game you are playing and starts a fresh one, and a list of your saved games to **LOAD** any of them back (the one you were playing gets saved first).

### The market

Scroll right with the mouse wheel (or drag, or use the arrows on the sides) to reach the corner market. Click it to go inside, then click a shelf to buy a pack of 10 of that ingredient for $4. Customers' timers stop while you're in the market.

### Growing the business

Everything is clicked right in the world:

- **Click any truck** to see your workers. The pop-up has two tabs: **TRUCK WORKERS** and **STREET WORKERS**. Hire cooks ($100 each, 1,758 to choose from, as many per truck as you like; the list shows 50 at a time) and use the **ASSIGNED** picker to move them between trucks. Cooks in your truck work behind you and serve customers on their own.
- **Store runners ($100 each): Leo plus LEO 2 to LEO 10** hang out in a row by your truck. Click any of them to give that runner a shopping list. Auto-restock is shared, and one runner at a time handles it. Click him to choose what to buy and how many packs. He walks to the market, pays with your money and brings the stock back. Turn on auto-restock and whenever any ingredient drops below 20 he sprints to the market by himself and buys enough of every ingredient to get it above 50, so you never run out (as long as you have the money). Every trip, auto or not, is paid for with your money (you see the cost pop up over him).
- **Promoters ($100, 1,720 to choose from, on the STREET WORKERS tab)** walk off down the street with a TACOS sign and bring people back. Every promoter you hire makes customers show up 30% more often at all your trucks, and lines have no limit. Only the first 8 people in a line are drawn, and the longer the line, the faster people hurry in.
- **Click the FOR SALE lot** down the street to buy another truck ($250), up to 9 trucks. It needs a cook before it can sell.

Workers never take breaks. The more cooks you put in a truck, the faster each taco gets made: one cook takes 2.5 seconds, two take 1.25, and a full crew gets it down to about half a second.

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
